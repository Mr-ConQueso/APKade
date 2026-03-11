export type Size = {
    width: number;
    height: number;
};

export type Rect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

export type VideoSettingsData = {
    crop?: Rect | null;
    bitrate: number;
    bounds?: Size | null;
    maxFps: number;
    iFrameInterval: number;
    sendFrameMeta?: boolean;
    lockedVideoOrientation?: number;
    displayId?: number;
    codecOptions?: string;
    encoderName?: string;
};

function encodeUtf8(value: string) {
    return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array) {
    return new TextDecoder().decode(bytes);
}

function writeInt32BE(view: DataView, offset: number, value: number) {
    view.setInt32(offset, value, false);
    return offset + 4;
}

function writeInt16BE(view: DataView, offset: number, value: number) {
    view.setInt16(offset, value, false);
    return offset + 2;
}

function writeInt8(view: DataView, offset: number, value: number) {
    view.setInt8(offset, value);
    return offset + 1;
}

function readInt32BE(view: DataView, offset: number) {
    return view.getInt32(offset, false);
}

function readInt16BE(view: DataView, offset: number) {
    return view.getInt16(offset, false);
}

function readInt8(view: DataView, offset: number) {
    return view.getInt8(offset);
}

export default class VideoSettings {
    public static readonly BASE_BUFFER_LENGTH = 35;
    public static readonly CONTROL_MESSAGE_TYPE_CHANGE_STREAM_PARAMETERS = 101;

    public readonly crop: Rect | null = null;
    public readonly bitrate: number = 0;
    public readonly bounds: Size | null = null;
    public readonly maxFps: number = 0;
    public readonly iFrameInterval: number = 0;
    public readonly sendFrameMeta: boolean = false;
    public readonly lockedVideoOrientation: number = -1;
    public readonly displayId: number = 0;
    public readonly codecOptions?: string;
    public readonly encoderName?: string;

    constructor(
        data?: VideoSettingsData,
        public readonly bytesLength: number = VideoSettings.BASE_BUFFER_LENGTH
    ) {
        if (!data) {
            return;
        }

        this.crop = data.crop ?? null;
        this.bitrate = data.bitrate;
        this.bounds = data.bounds ?? null;
        this.maxFps = data.maxFps;
        this.iFrameInterval = data.iFrameInterval;
        this.sendFrameMeta = data.sendFrameMeta ?? false;
        this.lockedVideoOrientation = data.lockedVideoOrientation ?? -1;
        this.displayId =
            typeof data.displayId === 'number' && !Number.isNaN(data.displayId) && data.displayId >= 0
                ? data.displayId
                : 0;
        this.codecOptions = data.codecOptions?.trim() || undefined;
        this.encoderName = data.encoderName?.trim() || undefined;
    }

    static fromBytes(bytes: Uint8Array) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        let offset = 0;
        const bitrate = readInt32BE(view, offset);
        offset += 4;

        const maxFps = readInt32BE(view, offset);
        offset += 4;

        const iFrameInterval = readInt8(view, offset);
        offset += 1;

        const width = readInt16BE(view, offset);
        offset += 2;

        const height = readInt16BE(view, offset);
        offset += 2;

        const left = readInt16BE(view, offset);
        offset += 2;

        const top = readInt16BE(view, offset);
        offset += 2;

        const right = readInt16BE(view, offset);
        offset += 2;

        const bottom = readInt16BE(view, offset);
        offset += 2;

        const sendFrameMeta = !!readInt8(view, offset);
        offset += 1;

        const lockedVideoOrientation = readInt8(view, offset);
        offset += 1;

        const displayId = readInt32BE(view, offset);
        offset += 4;

        let bounds: Size | null = null;
        let crop: Rect | null = null;

        if (width !== 0 && height !== 0) {
            bounds = { width, height };
        }

        if (left || top || right || bottom) {
            crop = { left, top, right, bottom };
        }

        let codecOptions: string | undefined;
        let encoderName: string | undefined;

        const codecOptionsLength = readInt32BE(view, offset);
        offset += 4;

        if (codecOptionsLength > 0) {
            codecOptions = decodeUtf8(bytes.subarray(offset, offset + codecOptionsLength));
            offset += codecOptionsLength;
        }

        const encoderNameLength = readInt32BE(view, offset);
        offset += 4;

        if (encoderNameLength > 0) {
            encoderName = decodeUtf8(bytes.subarray(offset, offset + encoderNameLength));
            offset += encoderNameLength;
        }

        return new VideoSettings(
            {
                crop,
                bitrate,
                bounds,
                maxFps,
                iFrameInterval,
                sendFrameMeta,
                lockedVideoOrientation,
                displayId,
                codecOptions,
                encoderName
            },
            offset
        );
    }

    static copy(value: VideoSettings) {
        return new VideoSettings(
            {
                crop: value.crop ? { ...value.crop } : null,
                bitrate: value.bitrate,
                bounds: value.bounds ? { ...value.bounds } : null,
                maxFps: value.maxFps,
                iFrameInterval: value.iFrameInterval,
                sendFrameMeta: value.sendFrameMeta,
                lockedVideoOrientation: value.lockedVideoOrientation,
                displayId: value.displayId,
                codecOptions: value.codecOptions,
                encoderName: value.encoderName
            },
            value.bytesLength
        );
    }

    static createDefault(params?: {
        width?: number;
        height?: number;
        displayId?: number;
    }) {
        const width = params?.width && params.width > 0 ? params.width : 720;
        const height = params?.height && params.height > 0 ? params.height : 1280;

        return new VideoSettings({
            bitrate: 2_000_000,
            maxFps: 30,
            iFrameInterval: 5,
            bounds: { width, height },
            sendFrameMeta: false,
            lockedVideoOrientation: -1,
            displayId: params?.displayId ?? 0
        });
    }

    equals(other?: VideoSettings | null) {
        if (!other) {
            return false;
        }

        return (
            this.bitrate === other.bitrate &&
            this.maxFps === other.maxFps &&
            this.iFrameInterval === other.iFrameInterval &&
            this.sendFrameMeta === other.sendFrameMeta &&
            this.lockedVideoOrientation === other.lockedVideoOrientation &&
            this.displayId === other.displayId &&
            this.codecOptions === other.codecOptions &&
            this.encoderName === other.encoderName &&
            (this.bounds?.width ?? 0) === (other.bounds?.width ?? 0) &&
            (this.bounds?.height ?? 0) === (other.bounds?.height ?? 0) &&
            (this.crop?.left ?? 0) === (other.crop?.left ?? 0) &&
            (this.crop?.top ?? 0) === (other.crop?.top ?? 0) &&
            (this.crop?.right ?? 0) === (other.crop?.right ?? 0) &&
            (this.crop?.bottom ?? 0) === (other.crop?.bottom ?? 0)
        );
    }

    toBuffer() {
        const codecOptionsBytes = this.codecOptions ? encodeUtf8(this.codecOptions) : undefined;
        const encoderNameBytes = this.encoderName ? encodeUtf8(this.encoderName) : undefined;

        const additionalLength = (codecOptionsBytes?.length ?? 0) + (encoderNameBytes?.length ?? 0);
        const bytes = new Uint8Array(VideoSettings.BASE_BUFFER_LENGTH + additionalLength);
        const view = new DataView(bytes.buffer);

        const width = this.bounds?.width ?? 0;
        const height = this.bounds?.height ?? 0;
        const left = this.crop?.left ?? 0;
        const top = this.crop?.top ?? 0;
        const right = this.crop?.right ?? 0;
        const bottom = this.crop?.bottom ?? 0;

        let offset = 0;
        offset = writeInt32BE(view, offset, this.bitrate);
        offset = writeInt32BE(view, offset, this.maxFps);
        offset = writeInt8(view, offset, this.iFrameInterval);
        offset = writeInt16BE(view, offset, width);
        offset = writeInt16BE(view, offset, height);
        offset = writeInt16BE(view, offset, left);
        offset = writeInt16BE(view, offset, top);
        offset = writeInt16BE(view, offset, right);
        offset = writeInt16BE(view, offset, bottom);
        offset = writeInt8(view, offset, this.sendFrameMeta ? 1 : 0);
        offset = writeInt8(view, offset, this.lockedVideoOrientation);
        offset = writeInt32BE(view, offset, this.displayId);

        if (codecOptionsBytes) {
            offset = writeInt32BE(view, offset, codecOptionsBytes.length);
            bytes.set(codecOptionsBytes, offset);
            offset += codecOptionsBytes.length;
        } else {
            offset = writeInt32BE(view, offset, 0);
        }

        if (encoderNameBytes) {
            offset = writeInt32BE(view, offset, encoderNameBytes.length);
            bytes.set(encoderNameBytes, offset);
        } else {
            writeInt32BE(view, offset, 0);
        }

        return bytes;
    }

    toControlMessageBuffer() {
        const payload = this.toBuffer();
        const result = new Uint8Array(1 + payload.length);

        result[0] = VideoSettings.CONTROL_MESSAGE_TYPE_CHANGE_STREAM_PARAMETERS;
        result.set(payload, 1);

        return result;
    }

    toJSON(): VideoSettingsData {
        return {
            crop: this.crop ? { ...this.crop } : null,
            bitrate: this.bitrate,
            bounds: this.bounds ? { ...this.bounds } : null,
            maxFps: this.maxFps,
            iFrameInterval: this.iFrameInterval,
            sendFrameMeta: this.sendFrameMeta,
            lockedVideoOrientation: this.lockedVideoOrientation,
            displayId: this.displayId,
            codecOptions: this.codecOptions,
            encoderName: this.encoderName
        };
    }
}