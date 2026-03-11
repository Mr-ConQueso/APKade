export type PoolConfig = {
    min: number;
    max: number;
    idleTimeoutMs: number;
    image: string;
    portStart: number;
};

export type PoolContainer = {
    id: string;
    name: string;
    adbPort: number;
    busy: boolean;
    createdAt: number;
    lastUsedAt: number;
};

export type StoredSession = {
    session: string;
    containerId?: string;
    containerName: string;
    adbPort: number;
    websocketPort?: number;
    websocketSocketName?: string;
    gameId: string;
    packageName: string;
    startedAt: string;
};