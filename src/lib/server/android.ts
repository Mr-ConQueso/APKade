import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getGame } from '$lib/server/games';
import { pool } from '$lib/server/poolInstance';

const execFileAsync = promisify(execFile);

export type AndroidSession = {
    session: string;
    containerId: string;
    containerName: string;
    adbPort: number;
    gameId: string;
    packageName: string;
    startedAt: string;
};

const sessionsDir = path.resolve('data/containers');
const apkSearchDirs = [path.resolve('storage/apks'), path.resolve('data/apks')];

function ensureSessionsDir() {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

function createSessionId() {
    return Math.random().toString(36).slice(2, 10);
}

function findApkPath(apkFileName: string) {
    for (const dir of apkSearchDirs) {
        const fullPath = path.join(dir, apkFileName);

        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
    }

    throw new Error(`APK file not found: ${apkFileName}`);
}

async function runCommand(command: string, args: string[]) {
    try {
        return await execFileAsync(command, args);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : `Command failed: ${command} ${args.join(' ')}`;

        throw new Error(message);
    }
}

async function waitForAdb(adbPort: number) {
    const target = `localhost:${adbPort}`;
    const attempts = 30;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await runCommand('adb', ['connect', target]);
            await runCommand('adb', ['-s', target, 'wait-for-device']);

            const { stdout: bootCompleted } = await runCommand('adb', [
                '-s',
                target,
                'shell',
                'getprop',
                'sys.boot_completed'
            ]);

            if (bootCompleted.trim() !== '1') {
                throw new Error('Android boot not completed yet.');
            }

            await runCommand('adb', ['-s', target, 'shell', 'pm', 'path', 'android']);
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    throw new Error(`Android container did not become ready on ${target}.`);
}

function saveSession(session: AndroidSession) {
    ensureSessionsDir();

    const sessionFile = path.join(sessionsDir, `${session.session}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2) + '\n', 'utf-8');
}

async function installApk(adbPort: number, apkPath: string) {
    const target = `localhost:${adbPort}`;
    await runCommand('adb', ['-s', target, 'install', '-r', '-g', apkPath]);
}

async function launchPackage(adbPort: number, packageName: string) {
    const target = `localhost:${adbPort}`;

    const { stdout } = await runCommand('adb', [
        '-s',
        target,
        'shell',
        'cmd',
        'package',
        'resolve-activity',
        '--brief',
        packageName
    ]);

    const activity = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.includes('/'))
        .at(-1);

    if (!activity) {
        throw new Error(`Could not resolve launch activity for package ${packageName}.`);
    }

    await runCommand('adb', ['-s', target, 'shell', 'am', 'start', '-n', activity]);
}

export async function startAndroidSession(gameId: string) {
    const game = getGame(gameId);

    if (!game) {
        throw new Error('Game not found.');
    }

    if (!game.package) {
        throw new Error('Game package name is missing.');
    }

    if (!game.apk) {
        throw new Error('Game APK filename is missing.');
    }

    const sessionId = createSessionId();
    const apkPath = findApkPath(game.apk);
    const container = await pool.acquire();

    const adbPort = container.adbPort;
    const containerName = container.name;

    try {
        await waitForAdb(adbPort);
        await installApk(adbPort, apkPath);
        await launchPackage(adbPort, game.package);

        const session: AndroidSession = {
            session: sessionId,
            containerId: container.id,
            containerName,
            adbPort,
            gameId: game.id,
            packageName: game.package,
            startedAt: new Date().toISOString()
        };

        saveSession(session);

        return {
            session: session.session,
            adb_port: session.adbPort
        };
    } catch (error) {
        await pool.release(container.id);
        throw error;
    }
}