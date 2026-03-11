export type Game = {
    id: string;
    name: string;
    package: string;
    apk: string;
    image?: string;
    uploadedAt?: string;
};

export type GameRecord = {
    id: string;
    name: string;
    package: string;
    apk: string;
    image?: string;
    uploadedAt: string;
};

export type CreateGameInput = {
    image?: string;
    apkFile: File;
};

export type GameMetadata = {
    id: string;
    name: string;
    package: string;
    version: string;
    installed: boolean;
    image?: string;
    apk: string;
    uploadedAt: string;
};