export type SessionStreamOptions = {
    sessionId: string;
    adbPort: number;
    websocketPort: number;
    host?: string;
};

export type SessionStreamClientParams = {
    ws: string;
    fitToScreen?: boolean;
    videoSettings?: ReturnType<VideoSettings['toJSON']>;
};

export type SessionStreamInfo = {
    sessionId: string;
    adbPort: number;
    websocketPort: number;
    host: string;
    wsUrl: string;
    params: SessionStreamClientParams;
};

export type SessionStreamEvents = {
    started: (info: SessionStreamInfo) => void;
    stopped: () => void;
};

export type ScrcpyDisplayInfo = {
    displayId: number;
    width: number;
    height: number;
    rotation: number;
    layerStack: number;
    flags: number;
    connectionCount: number;
};

export type ScrcpyScreenInfo = {
    contentRect: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    };
    videoSize: {
        width: number;
        height: number;
    };
    deviceRotation: number;
};

export type ScrcpyInitialMetadata = {
    deviceName: string;
    clientId: number;
    width: number;
    height: number;
    displays: ScrcpyDisplayInfo[];
    screenInfoByDisplayId: Record<number, ScrcpyScreenInfo>;
    videoSettingsByDisplayId: Record<number, ReturnType<VideoSettings['toJSON']>>;
    encoders: string[];
};

export type ScrcpyDeviceMessage = {
    type: number;
    payload: Uint8Array;
};

export type StreamReceiverScrcpyEvents = {
    connected: () => void;
    disconnected: (event: CloseEvent) => void;
    metadata: (metadata: ScrcpyInitialMetadata) => void;
    deviceMessage: (message: ScrcpyDeviceMessage) => void;
    video: (data: Uint8Array) => void;
    videoSettingsSent: (videoSettings: VideoSettings) => void;
    error: (error: Error) => void;
};

export type SessionStreamRouteResponse = {
    ok: boolean;
    error?: string;
    session?: {
        session: string;
        adb_port: number;
        websocket_port: number;
        websocket_socket_name: string;
        game_id: string;
        package_name: string;
        started_at: string;
    };
    stream?: {
        transport: 'websocket-direct';
        ws_url: string;
    };
};