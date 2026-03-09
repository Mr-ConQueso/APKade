import fs from 'fs';
import path from 'path';
import {execFile} from 'child_process';
import {promisify} from 'util';

const execFileAsync = promisify(execFile);
const sessionsDir = path.resolve('data/containers');

type AndroidSession = {
    session: string;
    containerId?: string;
    containerName: string;
    adbPort: number;
    gameId: string;
    packageName: string;
    startedAt: string;
};

function readSession(sessionId: string): AndroidSession | null {
    try {
        const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
        return JSON.parse(fs.readFileSync(sessionFile, 'utf-8')) as AndroidSession;
    } catch {
        return null;
    }
}

export async function getScreenshot(sessionId: string): Promise<Buffer> {
    const session = readSession(sessionId);

    if (!session) {
        throw new Error('Session not found.');
    }

    const target = `localhost:${session.adbPort}`;

    const { stdout } = await execFileAsync(
        'adb',
        ['-s', target, 'exec-out', 'screencap', '-p'],
        {
            encoding: 'buffer',
            maxBuffer: 10 * 1024 * 1024
        }
    );

    return stdout;
}