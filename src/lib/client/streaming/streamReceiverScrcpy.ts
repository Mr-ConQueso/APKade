import VideoSettings from '$lib/client/streaming/videoSettings';
import type {
    ScrcpyDisplayInfo,
    ScrcpyInitialMetadata,
    ScrcpyScreenInfo,
    StreamReceiverScrcpyEvents
} from '$lib/types/stream';

const DEVICE_NAME_FIELD_LENGTH = 64;
const MAGIC_INITIAL = new TextEncoder().encode('scrcpy_initial');
const MAGIC_MESSAGE = new TextEncoder().encode('scrcpy_message');
const DISPLAY_INFO_BUFFER_LENGTH = 24;

type ListenerMap = {
    [EventName in keyof StreamReceiverScrcpyEvents]: Set<StreamReceiverScrcpyEvents[EventName]>;
};

function createListenerMap(): ListenerMap {
    return {
        connected: new Set(),
        disconnected: new Set(),
        metadata: new Set(),
        deviceMessage: new Set(),
        video: new Set(),
        videoSettingsSent: new Set(),
        error: new Set()
    };
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
    if (a.length !== b.length) {
        return false;
    }

    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) {
            return false;
        }
    }

    return true;
}

function startsWithMagic(data: Uint8Array, magic: Uint8Array) {
    if (data.length < magic.length) {
        return false;
    }

    return equalBytes(data.subarray(0, magic.length), magic);
}

function decodeUtf8(data: Uint8Array) {
    return new TextDecoder().decode(data);
}

function trimTrailingNulls(value: string) {
    return value.replace(/\0+$/, '').trim();
}

function readInt32BE(bytes: Uint8Array, offset: number) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, false);
}

function readUInt8(bytes: Uint8Array, offset: number) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint8(offset);
}

function toUint8Array(data: Blob | ArrayBuffer | ArrayBufferView) {
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }

    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }

    throw new Error('Received unsupported websocket binary payload.');
}

function parseDisplayInfo(bytes: Uint8Array): ScrcpyDisplayInfo {
    return {
        displayId: readInt32BE(bytes, 0),
        width: readInt32BE(bytes, 4),
        height: readInt32BE(bytes, 8),
        rotation: readInt32BE(bytes, 12),
        layerStack: readInt32BE(bytes, 16),
        flags: readInt32BE(bytes, 20),
        connectionCount: 0
    };
}

function parseScreenInfo(bytes: Uint8Array): ScrcpyScreenInfo {
    return {
        contentRect: {
            left: readInt32BE(bytes, 0),
            top: readInt32BE(bytes, 4),
            right: readInt32BE(bytes, 8),
            bottom: readInt32BE(bytes, 12)
        },
        videoSize: {
            width: readInt32BE(bytes, 16),
            height: readInt32BE(bytes, 20)
        },
        deviceRotation: readUInt8(bytes, 24)
    };
}

function pickInitialVideoSettings(metadata: ScrcpyInitialMetadata) {
    const firstDisplay = metadata.displays[0];
    const firstScreenInfo = firstDisplay
        ? metadata.screenInfoByDisplayId[firstDisplay.displayId]
        : undefined;
    const firstExistingSettings = firstDisplay
        ? metadata.videoSettingsByDisplayId[firstDisplay.displayId]
        : undefined;

    if (firstExistingSettings) {
        return new VideoSettings(firstExistingSettings);
    }

    return VideoSettings.createDefault({
        width: firstScreenInfo?.videoSize.width ?? firstDisplay?.width ?? metadata.width,
        height: firstScreenInfo?.videoSize.height ?? firstDisplay?.height ?? metadata.height,
        displayId: firstDisplay?.displayId ?? 0
    });
}

export class StreamReceiverScrcpy {
    private readonly listeners = createListenerMap();
    private socket?: WebSocket;
    private metadata?: ScrcpyInitialMetadata;
    private pendingMessages: Uint8Array[] = [];
    private initialVideoSettingsSent = false;

    constructor(private readonly url: string) {}

    on<EventName extends keyof StreamReceiverScrcpyEvents>(
        event: EventName,
        listener: StreamReceiverScrcpyEvents[EventName]
    ) {
        this.listeners[event].add(listener);
        return () => this.off(event, listener);
    }

    off<EventName extends keyof StreamReceiverScrcpyEvents>(
        event: EventName,
        listener: StreamReceiverScrcpyEvents[EventName]
    ) {
        this.listeners[event].delete(listener);
    }

    getMetadata() {
        return this.metadata;
    }

    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return;
        }

        const socket = new WebSocket(this.url);
        socket.binaryType = 'arraybuffer';
        this.socket = socket;

        socket.addEventListener('open', () => {
            this.emit('connected');
            this.flushPendingMessages();
        });

        socket.addEventListener('message', async (event) => {
            try {
                const raw = event.data;

                if (raw instanceof Blob) {
                    const bytes = new Uint8Array(await raw.arrayBuffer());
                    this.handleBinaryMessage(bytes);
                    return;
                }

                const bytes = toUint8Array(raw);
                this.handleBinaryMessage(bytes);
            } catch (error) {
                this.emit(
                    'error',
                    error instanceof Error ? error : new Error('Failed to process websocket message.')
                );
            }
        });

        socket.addEventListener('error', () => {
            this.emit('error', new Error('WebSocket stream error.'));
        });

        socket.addEventListener('close', (event) => {
            this.emit('disconnected', event);
        });
    }

    disconnect() {
        if (!this.socket) {
            return;
        }

        this.socket.close();
        this.socket = undefined;
    }

    sendRaw(data: Uint8Array) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(data);
            return;
        }

        this.pendingMessages.push(data);
    }

    sendVideoSettings(videoSettings: VideoSettings) {
        this.sendRaw(videoSettings.toControlMessageBuffer());
        this.emit('videoSettingsSent', videoSettings);
    }

    private flushPendingMessages() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        for (const message of this.pendingMessages) {
            this.socket.send(message);
        }

        this.pendingMessages = [];
    }

    private handleBinaryMessage(data: Uint8Array) {
        console.info('[StreamReceiverScrcpy] binary message', {
            bytes: data.length,
            initial: startsWithMagic(data, MAGIC_INITIAL),
            deviceMessage: startsWithMagic(data, MAGIC_MESSAGE),
            firstBytes: Array.from(data.slice(0, 12))
        });

        if (data.length > MAGIC_INITIAL.length && startsWithMagic(data, MAGIC_INITIAL)) {
            this.handleInitialMessage(data);
            return;
        }

        if (data.length > MAGIC_MESSAGE.length && startsWithMagic(data, MAGIC_MESSAGE)) {
            this.handleDeviceMessage(data);
            return;
        }

        this.emit('video', data);

        console.info('[StreamReceiverScrcpy] video payload', {
            bytes: data.length,
            nalType: data.length > 4 ? (data[4] & 0x1f) : -1
        });
    }

    private handleInitialMessage(data: Uint8Array) {
        let offset = MAGIC_INITIAL.length;

        if (data.length < offset + DEVICE_NAME_FIELD_LENGTH + 4) {
            throw new Error('Invalid initial scrcpy message: missing required header fields.');
        }

        const deviceNameBytes = data.subarray(offset, offset + DEVICE_NAME_FIELD_LENGTH);
        const deviceName = trimTrailingNulls(decodeUtf8(deviceNameBytes));
        offset += DEVICE_NAME_FIELD_LENGTH;

        const displaysCount = readInt32BE(data, offset);
        offset += 4;

        const displays: ScrcpyDisplayInfo[] = [];
        const screenInfoByDisplayId: Record<number, ScrcpyScreenInfo> = {};
        const videoSettingsByDisplayId: Record<number, ReturnType<VideoSettings['toJSON']>> = {};

        for (let index = 0; index < displaysCount; index += 1) {
            const displayInfoBytes = data.subarray(offset, offset + DISPLAY_INFO_BUFFER_LENGTH);
            const displayInfo = parseDisplayInfo(displayInfoBytes);
            offset += DISPLAY_INFO_BUFFER_LENGTH;

            displayInfo.connectionCount = readInt32BE(data, offset);
            offset += 4;

            const screenInfoBytesCount = readInt32BE(data, offset);
            offset += 4;

            if (screenInfoBytesCount > 0) {
                const screenInfoBytes = data.subarray(offset, offset + screenInfoBytesCount);
                screenInfoByDisplayId[displayInfo.displayId] = parseScreenInfo(screenInfoBytes);
                offset += screenInfoBytesCount;
            }

            const videoSettingsBytesCount = readInt32BE(data, offset);
            offset += 4;

            if (videoSettingsBytesCount > 0) {
                const videoSettingsBytes = data.subarray(offset, offset + videoSettingsBytesCount);
                const videoSettings = VideoSettings.fromBytes(videoSettingsBytes);
                videoSettingsByDisplayId[displayInfo.displayId] = videoSettings.toJSON();
                offset += videoSettingsBytesCount;
            }

            displays.push(displayInfo);
        }

        const encoders: string[] = [];
        const encodersCount = readInt32BE(data, offset);
        offset += 4;

        for (let index = 0; index < encodersCount; index += 1) {
            const nameLength = readInt32BE(data, offset);
            offset += 4;

            const encoderNameBytes = data.subarray(offset, offset + nameLength);
            offset += nameLength;

            encoders.push(decodeUtf8(encoderNameBytes));
        }

        const clientId = readInt32BE(data, offset);

        const firstDisplay = displays[0];
        const firstScreenInfo = firstDisplay ? screenInfoByDisplayId[firstDisplay.displayId] : undefined;

        const width = firstScreenInfo?.videoSize.width ?? firstDisplay?.width ?? 0;
        const height = firstScreenInfo?.videoSize.height ?? firstDisplay?.height ?? 0;

        const metadata: ScrcpyInitialMetadata = {
            deviceName,
            clientId,
            width,
            height,
            displays,
            screenInfoByDisplayId,
            videoSettingsByDisplayId,
            encoders
        };

        this.metadata = metadata;
        this.emit('metadata', metadata);

        if (!this.initialVideoSettingsSent) {
            const videoSettings = pickInitialVideoSettings(metadata);
            this.sendVideoSettings(videoSettings);
            this.initialVideoSettingsSent = true;
        }
    }

    private handleDeviceMessage(data: Uint8Array) {
        const offset = MAGIC_MESSAGE.length;
        const payload = data.subarray(offset);
        const type = payload.length > 0 ? payload[0] : -1;

        this.emit('deviceMessage', {
            type,
            payload
        });
    }

    private emit<EventName extends keyof StreamReceiverScrcpyEvents>(
        event: EventName,
        ...args: Parameters<StreamReceiverScrcpyEvents[EventName]>
    ) {
        for (const listener of this.listeners[event]) {
            const typedListener = listener as (
                ...listenerArgs: Parameters<StreamReceiverScrcpyEvents[EventName]>
            ) => void;

            typedListener(...args);
        }
    }
}