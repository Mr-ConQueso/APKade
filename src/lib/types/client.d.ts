export type AndroidSession = {
    session: string;
    containerId?: string;
    containerName: string;
    adbPort: number;
    websocketPort: number;
    websocketSocketName: string;
    gameId: string;
    packageName: string;
    startedAt: string;
};

export type AndroidSessionSummary = {
    session: string;
    adb_port: number;
    websocket_port: number;
    websocket_socket_name: string;
};

export type AndroidSessionDetails = {
    session: string;
    container_id: string | null;
    container_name: string;
    adb_port: number;
    websocket_port: number | null;
    websocket_socket_name: string | null;
    game_id: string;
    package_name: string;
    started_at: string;
};