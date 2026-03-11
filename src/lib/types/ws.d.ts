declare module 'ws' {
    import { EventEmitter } from 'node:events';

    export type RawData = Buffer | ArrayBuffer | Buffer[];

    type WebSocketEventMap = {
        open: () => void;
        message: (data: RawData, isBinary: boolean) => void;
        error: (error: Error) => void;
        close: (code: number, reason: Buffer) => void;
    };

    class WebSocket extends EventEmitter {
        static readonly CONNECTING: 0;
        static readonly OPEN: 1;
        static readonly CLOSING: 2;
        static readonly CLOSED: 3;

        readonly CONNECTING: 0;
        readonly OPEN: 1;
        readonly CLOSING: 2;
        readonly CLOSED: 3;

        readyState: number;

        constructor(address: string | URL, protocols?: string | string[]);

        on<EventName extends keyof WebSocketEventMap>(
            event: EventName,
            listener: WebSocketEventMap[EventName]
        ): this;

        once<EventName extends keyof WebSocketEventMap>(
            event: EventName,
            listener: WebSocketEventMap[EventName]
        ): this;

        off<EventName extends keyof WebSocketEventMap>(
            event: EventName,
            listener: WebSocketEventMap[EventName]
        ): this;

        removeAllListeners(event?: keyof WebSocketEventMap): this;

        send(data: string | Buffer | ArrayBuffer | Uint8Array): void;
        close(code?: number, data?: string | Buffer): void;
        terminate(): void;
    }

    export default WebSocket;
}