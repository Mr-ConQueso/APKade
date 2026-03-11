import {EventEmitter} from 'node:events';
import type {SessionStreamEvents, SessionStreamInfo, SessionStreamOptions} from '$lib/types/stream';

function buildWsUrl(host: string, websocketPort: number) {
    return `ws://${host}:${websocketPort}`;
}

export class SessionStream extends EventEmitter {
    readonly sessionId: string;
    readonly adbPort: number;
    readonly websocketPort: number;
    readonly host: string;

    private started = false;

    constructor(options: SessionStreamOptions) {
        super();

        this.sessionId = options.sessionId;
        this.adbPort = options.adbPort;
        this.websocketPort = options.websocketPort;
        this.host = options.host ?? '127.0.0.1';
    }

    on<EventName extends keyof SessionStreamEvents>(
        event: EventName,
        listener: SessionStreamEvents[EventName]
    ): this {
        return super.on(event, listener);
    }

    emit<EventName extends keyof SessionStreamEvents>(
        event: EventName,
        ...args: Parameters<SessionStreamEvents[EventName]>
    ): boolean {
        return super.emit(event, ...args);
    }

    async start() {
        if (this.started) {
            return;
        }

        this.started = true;
        this.emit('started', this.getInfo());
    }

    async stop() {
        if (!this.started) {
            return;
        }

        this.started = false;
        this.emit('stopped');
    }

    isStarted() {
        return this.started;
    }

    getInfo(): SessionStreamInfo {
        const wsUrl = buildWsUrl(this.host, this.websocketPort);

        return {
            sessionId: this.sessionId,
            adbPort: this.adbPort,
            websocketPort: this.websocketPort,
            host: this.host,
            wsUrl,
            params: {
                ws: wsUrl,
                fitToScreen: false
            }
        };
    }
}