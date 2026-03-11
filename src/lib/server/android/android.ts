import fs from 'fs';
import path from 'path';
import { type ChildProcess, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { getGame } from '$lib/server/library/games';
import { pool } from '$lib/server/pool/poolInstance';
import type { AndroidSession } from '$lib/types/client';

const execFileAsync = promisify(execFile);

const sessionsDir = path.resolve('data/containers');
const apkSearchDirs = [path.resolve('storage/apks'), path.resolve('data/apks')];
const customScrcpyJarCandidates = [
    path.resolve('vendor/Genymobile/scrcpy/scrcpy-server.jar'),
    path.resolve('vendor/scrcpy-server.jar'),
    path.resolve('dist/scrcpy-server.jar')
];
const deviceScrcpyServerJarPath = '/data/local/tmp/apkade-scrcpy-server.jar';
const wsScrcpyDevicePort = 8886;
const wsScrcpyServerVersion = '1.19-ws7';
const wsScrcpyServerType = 'web';
const wsScrcpyLogLevel = 'ERROR';
const wsScrcpyListenOnAllInterfaces = 'false';
const wsScrcpyStartupTimeoutMs = 15000;

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

function findCustomScrcpyJarPath() {
    const configuredPath = process.env.SCRCPY_SERVER_JAR?.trim();

    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }

    for (const candidate of customScrcpyJarCandidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        'Could not find the custom ws-scrcpy server jar. Set SCRCPY_SERVER_JAR or place it under /vendor.'
    );
}

function websocketForwardPortForAdbPort(adbPort: number) {
    return 30000 + adbPort;
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

async function pushCustomScrcpyServer(adbPort: number, serverJarPath: string) {
    const target = `localhost:${adbPort}`;

    await runCommand('adb', ['-s', target, 'push', serverJarPath, deviceScrcpyServerJarPath]);
}

async function removeAdbForward(adbPort: number, forwardPort: number) {
    const target = `localhost:${adbPort}`;

    await runCommand('adb', ['-s', target, 'forward', '--remove', `tcp:${forwardPort}`]).catch(
        () => undefined
    );
}

async function waitForWsScrcpyServer(adbPort: number, child: ChildProcess, timeoutMs: number) {
    const target = `localhost:${adbPort}`;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        if (child.exitCode !== null) {
            throw new Error(`ws-scrcpy server exited before startup completed on ${target}.`);
        }

        const result = await runCommand('adb', [
            '-s',
            target,
            'shell',
            'netstat',
            '-an'
        ]).catch(() => ({ stdout: '' }));

        if (result.stdout.includes(`:${wsScrcpyDevicePort}`)) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    throw new Error(
        `ws-scrcpy server did not open tcp:${wsScrcpyDevicePort} on device ${target}.`
    );
}

async function startCustomScrcpyServer(adbPort: number): Promise<ChildProcess> {
    const target = `localhost:${adbPort}`;

    const args = [
        '-s',
        target,
        'shell',
        `CLASSPATH=${deviceScrcpyServerJarPath}`,
        'app_process',
        '/',
        'com.genymobile.scrcpy.Server',
        wsScrcpyServerVersion,
        wsScrcpyServerType,
        wsScrcpyLogLevel,
        String(wsScrcpyDevicePort),
        wsScrcpyListenOnAllInterfaces
    ];

    const child = spawn('adb', args, {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout?.on('data', (chunk) => {
        console.info(`[android:scrcpy:${adbPort}] stdout ${chunk.toString().trim()}`);
    });

    child.stderr?.on('data', (chunk) => {
        console.info(`[android:scrcpy:${adbPort}] stderr ${chunk.toString().trim()}`);
    });

    child.on('exit', (code, signal) => {
        console.info(
            `[android:scrcpy:${adbPort}] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`
        );
    });

    return child;
}

async function ensureAdbForwardToCustomScrcpyPort(adbPort: number, forwardPort: number) {
    const target = `localhost:${adbPort}`;

    await removeAdbForward(adbPort, forwardPort);

    await runCommand('adb', [
        '-s',
        target,
        'forward',
        `tcp:${forwardPort}`,
        `tcp:${wsScrcpyDevicePort}`
    ]);
}

async function prepareScrcpyWebsocketBridge(adbPort: number) {
    const serverJarPath = findCustomScrcpyJarPath();
    const websocketPort = websocketForwardPortForAdbPort(adbPort);

    await pushCustomScrcpyServer(adbPort, serverJarPath);

    const serverProcess = await startCustomScrcpyServer(adbPort);

    try {
        await waitForWsScrcpyServer(adbPort, serverProcess, wsScrcpyStartupTimeoutMs);
        await ensureAdbForwardToCustomScrcpyPort(adbPort, websocketPort);
    } catch (error) {
        serverProcess.kill('SIGTERM');
        throw error;
    }

    return {
        websocketPort,
        websocketSocketName: `tcp:${wsScrcpyDevicePort}`
    };
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

        const scrcpyBridge = await prepareScrcpyWebsocketBridge(adbPort);

        const session: AndroidSession = {
            session: sessionId,
            containerId: container.id,
            containerName,
            adbPort,
            websocketPort: scrcpyBridge.websocketPort,
            websocketSocketName: scrcpyBridge.websocketSocketName,
            gameId: game.id,
            packageName: game.package,
            startedAt: new Date().toISOString()
        };

        saveSession(session);

        return {
            session: session.session,
            adb_port: session.adbPort,
            websocket_port: session.websocketPort,
            websocket_socket_name: session.websocketSocketName
        };
    } catch (error) {
        await pool.release(container.id);
        throw error;
    }
}