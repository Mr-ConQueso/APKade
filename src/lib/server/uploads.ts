import fs from 'fs';
import os from 'os';
import path from 'path';
import { readApkMetadata } from '$lib/server/apkMetadata';

export type GameRecord = {
    id: string;
    name: string;
    package: string;
    apk: string;
    image?: string;
    uploadedAt: string;
};

type CreateGameInput = {
    image?: string;
    apkFile: File;
};

type GameMetadata = {
    id: string;
    name: string;
    package: string;
    version: string;
    installed: boolean;
    image?: string;
    apk: string;
    uploadedAt: string;
};

const gamesFile = path.resolve('data/games.json');
const apksRootDir = path.resolve('data/apks');

export function readGames(): GameRecord[] {
    try {
        const data = fs.readFileSync(gamesFile, 'utf-8');
        return JSON.parse(data) as GameRecord[];
    } catch {
        return [];
    }
}

export function writeGames(games: GameRecord[]) {
    fs.mkdirSync(path.dirname(gamesFile), { recursive: true });
    fs.writeFileSync(gamesFile, JSON.stringify(games, null, 2) + '\n', 'utf-8');
}

export function ensureUploadStorage() {
    fs.mkdirSync(apksRootDir, { recursive: true });
}

export function validatePackageName(packageName: string) {
    const packagePattern = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/;

    return packagePattern.test(packageName);
}

export function slugify(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

export function ensureUniqueId(baseId: string, games: GameRecord[]) {
    const fallbackId = baseId || 'game';
    let candidate = fallbackId;
    let counter = 2;

    while (games.some((game) => game.id === candidate)) {
        candidate = `${fallbackId}-${counter}`;
        counter += 1;
    }

    return candidate;
}

export function sanitizeImage(image: string) {
    return image.trim() || '/images/placeholder.jpg';
}

function getPackageTail(packageName: string) {
    const parts = packageName.split('.').filter(Boolean);
    return parts[parts.length - 1] || 'game';
}

function getGameStorageDir(gameId: string) {
    return path.join(apksRootDir, gameId);
}

function ensureGameStorageDir(gameId: string) {
    fs.mkdirSync(getGameStorageDir(gameId), { recursive: true });
}

function writeMetadataFile(gameId: string, metadata: GameMetadata) {
    const metadataPath = path.join(getGameStorageDir(gameId), 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
}

async function writeTempApkFile(apkFile: File) {
    const tempFileName = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.apk`;
    const tempApkPath = path.join(os.tmpdir(), tempFileName);
    const fileBuffer = Buffer.from(await apkFile.arrayBuffer());

    fs.writeFileSync(tempApkPath, fileBuffer);

    return tempApkPath;
}

export async function saveApkFile(gameId: string, apkFile: File) {
    ensureGameStorageDir(gameId);

    const fileBuffer = Buffer.from(await apkFile.arrayBuffer());
    const apkFileName = `${gameId}.apk`;
    const apkPath = path.join(getGameStorageDir(gameId), apkFileName);

    fs.writeFileSync(apkPath, fileBuffer);

    return `${gameId}/${apkFileName}`;
}

export async function createUploadedGame(input: CreateGameInput): Promise<GameRecord> {
    const image = sanitizeImage(input.image ?? '');

    if (!input.apkFile || input.apkFile.size === 0) {
        throw new Error('APK file is required.');
    }

    if (!input.apkFile.name.toLowerCase().endsWith('.apk')) {
        throw new Error('Only .apk files are allowed.');
    }

    const maxApkSizeBytes = 250 * 1024 * 1024;

    if (input.apkFile.size > maxApkSizeBytes) {
        throw new Error('APK file is too large. Maximum size is 250 MB.');
    }

    ensureUploadStorage();

    const games = readGames();
    const tempApkPath = await writeTempApkFile(input.apkFile);

    try {
        const apkInfo = await readApkMetadata(tempApkPath);
        const name = apkInfo.name;
        const packageName = apkInfo.packageName;
        const version = apkInfo.version;

        if (!name) {
            throw new Error('Could not determine APK name.');
        }

        if (!packageName) {
            throw new Error('Could not determine APK package name.');
        }

        if (!validatePackageName(packageName)) {
            throw new Error('APK package name is invalid.');
        }

        if (games.some((game) => game.package === packageName)) {
            throw new Error('A game with this package name already exists.');
        }

        const baseId = slugify(getPackageTail(packageName));
        const gameId = ensureUniqueId(baseId, games);
        const uploadedAt = new Date().toISOString();
        const apkFileName = await saveApkFile(gameId, input.apkFile);

        const game: GameRecord = {
            id: gameId,
            name,
            package: packageName,
            apk: apkFileName,
            image,
            uploadedAt
        };

        writeMetadataFile(gameId, {
            id: gameId,
            name,
            package: packageName,
            version,
            installed: false,
            image,
            apk: apkFileName,
            uploadedAt
        });

        games.push(game);
        writeGames(games);

        return game;
    } finally {
        try {
            fs.unlinkSync(tempApkPath);
        } catch {
            // best-effort cleanup
        }
    }
}