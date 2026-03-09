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