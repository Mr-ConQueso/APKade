function findNalType(data: Uint8Array) {
    if (data.length < 5) {
        return 0;
    }

    return data[4] & 0x1f;
}

function concatBytes(parts: Uint8Array[]) {
    const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }

    return result;
}

function getAvcCodecStringFromSpsAnnexB(data: Uint8Array) {
    const offset = data[2] === 0x01 ? 3 : 4;
    const spsOffset = offset + 1;

    if (data.length < spsOffset + 3) {
        return 'avc1.42E01E';
    }

    const profileIdc = data[spsOffset].toString(16).padStart(2, '0').toUpperCase();
    const profileCompat = data[spsOffset + 1].toString(16).padStart(2, '0').toUpperCase();
    const levelIdc = data[spsOffset + 2].toString(16).padStart(2, '0').toUpperCase();

    return `avc1.${profileIdc}${profileCompat}${levelIdc}`;
}

export type WebCodecsPlayerOptions = {
    canvas: HTMLCanvasElement;
};

export class WebCodecsPlayer {
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly decoder: VideoDecoder;
    private bufferedParts: Uint8Array[] = [];
    private decodedFrames: VideoFrame[] = [];
    private animationFrameId?: number;
    private hadIdr = false;
    private bufferedSps = false;
    private bufferedPps = false;
    private configured = false;
    private receivedFirstFrame = false;
    private frameCount = 0;
    private lastWidth = 0;
    private lastHeight = 0;

    constructor(options: WebCodecsPlayerOptions) {
        this.canvas = options.canvas;

        const context = this.canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get 2D context from canvas.');
        }

        this.context = context;
        this.decoder = new VideoDecoder({
            output: (frame) => {
                this.onFrameDecoded(frame);
            },
            error: (error) => {
                console.error('[WebCodecsPlayer] decoder error', error);
            }
        });
    }

    isConfigured() {
        return this.configured;
    }

    getFrameCount() {
        return this.frameCount;
    }

    pushFrame(data: Uint8Array) {

        console.info('[WebCodecsPlayer] pushFrame', {
            bytes: data.length,
            nalType: data.length > 4 ? (data[4] & 0x1f) : -1
        });

        if (!data || data.length < 5) {
            return;
        }

        const nalType = findNalType(data);
        const isIdr = nalType === 5;

        if (nalType === 7) {
            const codec = getAvcCodecStringFromSpsAnnexB(data);

            if (this.decoder.state === 'configured') {
                this.decoder.close();
            }

            this.decoder.configure({
                codec,
                optimizeForLatency: true,
                hardwareAcceleration: 'prefer-hardware'
            });

            this.bufferedParts = [data.slice()];
            this.bufferedSps = true;
            this.bufferedPps = false;
            this.hadIdr = false;
            this.configured = true;

            console.info('[WebCodecsPlayer] configured decoder', { codec });
            return;
        }

        if (nalType === 8) {
            this.bufferedPps = true;
            this.bufferedParts.push(data.slice());
            return;
        }

        if (nalType === 6 && (!this.bufferedSps || !this.bufferedPps)) {
            return;
        }

        this.bufferedParts.push(data.slice());
        this.hadIdr = this.hadIdr || isIdr;

        if (!this.configured || this.decoder.state !== 'configured' || !this.hadIdr) {
            return;
        }

        const chunkBytes = concatBytes(this.bufferedParts);
        this.bufferedParts = [];
        this.bufferedSps = false;
        this.bufferedPps = false;

        try {
            this.decoder.decode(
                new EncodedVideoChunk({
                    type: 'key',
                    timestamp: 0,
                    data: chunkBytes
                })
            );
        } catch (error) {
            console.error('[WebCodecsPlayer] decode failed', error);
        }
    }

    async destroy() {
        if (this.animationFrameId !== undefined) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = undefined;
        }

        for (const frame of this.decodedFrames) {
            frame.close();
        }

        this.decodedFrames = [];

        try {
            if (this.decoder.state === 'configured') {
                await this.decoder.flush();
            }
        } catch {
            // best-effort
        }

        if (this.decoder.state !== 'closed') {
            this.decoder.close();
        }
    }

    private onFrameDecoded(frame: VideoFrame) {
        this.receivedFirstFrame = true;
        this.frameCount += 1;

        while (this.decodedFrames.length > 2) {
            const oldFrame = this.decodedFrames.shift();
            oldFrame?.close();
        }

        this.decodedFrames.push(frame);

        if (this.animationFrameId === undefined) {
            this.animationFrameId = requestAnimationFrame(this.drawDecoded);
        }
    }

    private drawDecoded = () => {
        const frame = this.decodedFrames.shift();

        if (frame) {
            const width = frame.displayWidth || frame.codedWidth;
            const height = frame.displayHeight || frame.codedHeight;

            if (width > 0 && height > 0 && (width !== this.lastWidth || height !== this.lastHeight)) {
                this.canvas.width = width;
                this.canvas.height = height;
                this.lastWidth = width;
                this.lastHeight = height;
            }

            this.context.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
            frame.close();
        }

        if (this.decodedFrames.length > 0) {
            this.animationFrameId = requestAnimationFrame(this.drawDecoded);
        } else {
            this.animationFrameId = undefined;
        }
    };
}