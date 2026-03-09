import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

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

type StoredSession = {
    session: string;
    containerId?: string;
    containerName: string;
    adbPort: number;
    gameId: string;
    packageName: string;
    startedAt: string;
};

const stateDir = path.resolve('data/pool');
const stateFile = path.join(stateDir, 'pool.json');
const sessionsDir = path.resolve('data/containers');

function ensureStateDir() {
    fs.mkdirSync(stateDir, { recursive: true });
}

function saveState(containers: PoolContainer[]) {
    ensureStateDir();
    fs.writeFileSync(stateFile, JSON.stringify(containers, null, 2));
}

function loadState(): PoolContainer[] {
    try {
        return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    } catch {
        return [];
    }
}

function findSessionForContainer(container: Pick<PoolContainer, 'id' | 'name' | 'adbPort'>): StoredSession | null {
    try {
        if (!fs.existsSync(sessionsDir)) return null;

        for (const fileName of fs.readdirSync(sessionsDir)) {
            if (!fileName.endsWith('.json')) continue;

            const filePath = path.join(sessionsDir, fileName);

            try {
                const session = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StoredSession;

                if (
                    session.containerId === container.id ||
                    session.containerName === container.name ||
                    session.adbPort === container.adbPort
                ) {
                    return session;
                }
            } catch {
                // ignore unreadable session files
            }
        }
    } catch {
        // best-effort lookup
    }

    return null;
}

function removeSessionFilesForContainer(container: Pick<PoolContainer, 'id' | 'name' | 'adbPort'>) {
    try {
        if (!fs.existsSync(sessionsDir)) return;

        for (const fileName of fs.readdirSync(sessionsDir)) {
            if (!fileName.endsWith('.json')) continue;

            const filePath = path.join(sessionsDir, fileName);

            try {
                const session = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StoredSession;

                if (
                    session.containerId === container.id ||
                    session.containerName === container.name ||
                    session.adbPort === container.adbPort
                ) {
                    fs.rmSync(filePath, { force: true });
                }
            } catch {
                // ignore unreadable session files
            }
        }
    } catch {
        // best-effort cleanup
    }
}

async function run(cmd: string, args: string[]) {
    await execFileAsync(cmd, args);
}

async function runText(cmd: string, args: string[]) {
    const { stdout } = await execFileAsync(cmd, args);
    return stdout.trim();
}

function randomId() {
    return Math.random().toString(36).slice(2, 10);
}

function containerName(id: string) {
    return `apkade-phone-${id}`;
}

function pickPort(start: number, used: number[]) {
    let port = start;
    while (used.includes(port)) port++;
    return port;
}

async function startContainer(name: string, port: number, image: string) {
    await run('docker', [
        'run',
        '-d',
        '--name',
        name,
        '--privileged',
        '-p',
        `${port}:5555`,
        image
    ]);
}

async function stopContainer(name: string) {
    try {
        await run('docker', ['rm', '-f', name]);
    } catch {}
}

async function resetContainerApps(container: Pick<PoolContainer, 'id' | 'name' | 'adbPort'>) {
    const session = findSessionForContainer(container);
    const target = `localhost:${container.adbPort}`;

    try {
        await run('adb', ['connect', target]);
        await run('adb', ['-s', target, 'wait-for-device']);
        await run('adb', ['-s', target, 'shell', 'input', 'keyevent', 'KEYCODE_HOME']);
    } catch {
        // best-effort
    }

    if (!session?.packageName) {
        return;
    }

    try {
        await run('adb', ['-s', target, 'shell', 'am', 'force-stop', session.packageName]);
    } catch {
        // best-effort
    }
}

async function listManagedContainerNames() {
    const output = await runText('docker', ['ps', '-a', '--format', '{{.Names}}']);

    return output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('apkade-phone-'));
}

async function containerExists(name: string) {
    const output = await runText('docker', ['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']);
    return output === name;
}

async function containerRunning(name: string) {
    const output = await runText('docker', ['inspect', '-f', '{{.State.Running}}', name]).catch(() => 'false');
    return output === 'true';
}

async function adbReady(adbPort: number) {
    const target = `localhost:${adbPort}`;

    try {
        await run('adb', ['connect', target]);
        await run('adb', ['-s', target, 'wait-for-device']);

        const bootCompleted = await runText('adb', [
            '-s',
            target,
            'shell',
            'getprop',
            'sys.boot_completed'
        ]).catch(() => '');

        if (bootCompleted.trim() !== '1') {
            return false;
        }

        await run('adb', ['-s', target, 'shell', 'pm', 'path', 'android']);
        return true;
    } catch {
        return false;
    }
}

export class ContainerPool {
    config: PoolConfig;
    containers: PoolContainer[] = [];
    cleanupTimer?: NodeJS.Timeout;
    reconcileInProgress = false;

    constructor(config: PoolConfig) {
        this.config = config;
        this.containers = loadState();
    }

    async spawn(): Promise<PoolContainer | undefined> {
        if (this.containers.length >= this.config.max) return undefined;

        const id = randomId();
        const name = containerName(id);

        const usedPorts = this.containers.map((c) => c.adbPort);
        const port = pickPort(this.config.portStart, usedPorts);

        await startContainer(name, port, this.config.image);

        const container: PoolContainer = {
            id,
            name,
            adbPort: port,
            busy: false,
            createdAt: Date.now(),
            lastUsedAt: Date.now()
        };

        this.containers.push(container);
        saveState(this.containers);

        return container;
    }

    async acquire(): Promise<PoolContainer> {
        let container = this.containers.find((c) => !c.busy);

        if (!container) {
            container = await this.spawn();
            if (!container) throw new Error('No containers available');
        }

        container.busy = true;
        container.lastUsedAt = Date.now();

        saveState(this.containers);

        return container;
    }

    async release(id: string) {
        const container = this.containers.find((c) => c.id === id);
        if (!container) return;

        await resetContainerApps(container);

        container.busy = false;
        container.lastUsedAt = Date.now();

        saveState(this.containers);
    }

    async releaseByName(name: string) {
        const container = this.containers.find((c) => c.name === name);
        if (!container) return;

        await resetContainerApps(container);

        container.busy = false;
        container.lastUsedAt = Date.now();

        saveState(this.containers);
    }

    async init() {
        await this.removeOrphans();
        await this.reconcile();
        this.startCleanupLoop();
    }

    async removeOrphans() {
        const actualNames = await listManagedContainerNames();
        const trackedNames = new Set(this.containers.map((container) => container.name));

        for (const name of actualNames) {
            if (!trackedNames.has(name)) {
                await stopContainer(name);
            }
        }

        for (const container of [...this.containers]) {
            if (!actualNames.includes(container.name)) {
                removeSessionFilesForContainer(container);
            }
        }

        this.containers = this.containers.filter((container) => actualNames.includes(container.name));
        saveState(this.containers);
    }

    async ensureMinimum() {
        const healthyCount = await this.countHealthyContainers();

        while (this.containers.length < this.config.min || (await this.countHealthyContainers()) < this.config.min) {
            const spawned = await this.spawn();
            if (!spawned) break;
        }

        if (healthyCount < this.config.min) {
            for (const container of this.containers) {
                if (await this.isHealthy(container)) {
                    continue;
                }
            }
        }
    }

    startCleanupLoop() {
        this.cleanupTimer = setInterval(() => {
            void this.reconcile();
        }, 30000);
    }

    async cleanupIdle() {
        const now = Date.now();

        for (const c of [...this.containers]) {
            if (
                !c.busy &&
                this.containers.length > this.config.min &&
                now - c.lastUsedAt > this.config.idleTimeoutMs
            ) {
                await stopContainer(c.name);
                removeSessionFilesForContainer(c);
                this.containers = this.containers.filter((x) => x.id !== c.id);
            }
        }

        saveState(this.containers);
    }

    async reconcile() {
        if (this.reconcileInProgress) return;
        this.reconcileInProgress = true;

        try {
            await this.removeOrphans();

            for (const container of [...this.containers]) {
                const exists = await containerExists(container.name);
                if (!exists) {
                    removeSessionFilesForContainer(container);
                    this.containers = this.containers.filter((x) => x.id !== container.id);
                    continue;
                }

                const healthy = await this.isHealthy(container);
                if (!healthy && !container.busy) {
                    await stopContainer(container.name);
                    removeSessionFilesForContainer(container);
                    this.containers = this.containers.filter((x) => x.id !== container.id);
                }
            }

            await this.cleanupIdle();

            while ((await this.countHealthyContainers()) < this.config.min && this.containers.length < this.config.max) {
                const container = await this.spawn();
                if (!container) break;
            }

            for (const container of this.containers) {
                if ((await this.countHealthyContainers()) >= this.config.min) {
                    break;
                }

                if (!(await this.isHealthy(container))) {
                    const healthy = await this.waitUntilHealthy(container, 60000);
                    if (!healthy && !container.busy) {
                        await stopContainer(container.name);
                        removeSessionFilesForContainer(container);
                        this.containers = this.containers.filter((x) => x.id !== container.id);
                    }
                }
            }

            while ((await this.countHealthyContainers()) < this.config.min && this.containers.length < this.config.max) {
                const container = await this.spawn();
                if (!container) break;

                const healthy = await this.waitUntilHealthy(container, 60000);
                if (!healthy) {
                    await stopContainer(container.name);
                    removeSessionFilesForContainer(container);
                    this.containers = this.containers.filter((x) => x.id !== container.id);
                }
            }

            saveState(this.containers);
        } finally {
            this.reconcileInProgress = false;
        }
    }

    async isHealthy(container: PoolContainer) {
        const running = await containerRunning(container.name);
        if (!running) return false;

        return adbReady(container.adbPort);
    }

    async waitUntilHealthy(container: PoolContainer, timeoutMs: number) {
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            if (await this.isHealthy(container)) {
                return true;
            }

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        return false;
    }

    async countHealthyContainers() {
        let count = 0;

        for (const container of this.containers) {
            if (await this.isHealthy(container)) {
                count += 1;
            }
        }

        return count;
    }

    async removeTrackedContainer(id: string) {
        const container = this.containers.find((c) => c.id === id);
        if (!container) return;

        await stopContainer(container.name);
        removeSessionFilesForContainer(container);
        this.containers = this.containers.filter((x) => x.id !== id);
        saveState(this.containers);
    }

    async shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }

        for (const container of [...this.containers]) {
            await stopContainer(container.name);
        }

        for (const container of [...this.containers]) {
            await stopContainer(container.name);
            removeSessionFilesForContainer(container);
        }

        this.containers = [];
        saveState(this.containers);
    }

    stats() {
        return {
            total: this.containers.length,
            busy: this.containers.filter((c) => c.busy).length,
            free: this.containers.filter((c) => !c.busy).length
        };
    }
}