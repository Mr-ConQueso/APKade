import fs from "fs";
import path from "path";

const file = path.resolve("data/games.json");

export function getGames() {
    const data = fs.readFileSync(file, "utf-8");
    return JSON.parse(data);
}

export function getGame(id: string) {
    const games = getGames();
    return games.find((g: any) => g.id === id);
}

export type ApkMetadata = {
    name: string;
    packageName: string;
    version: string;
};

export type ManifestApplication = {
    label?: string | Record<string, string>;
};

export type ManifestInfo = {
    package?: string;
    versionName?: string;
    application?: ManifestApplication;
};