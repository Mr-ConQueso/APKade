import { ContainerPool } from './pool';

export const pool = new ContainerPool({
    min: 3,
    max: 5,
    idleTimeoutMs: 5 * 60 * 1000,
    image: process.env.REDROID_IMAGE || 'redroid/redroid:12.0.0-latest',
    portStart: 5560
});

await pool.init();

let shuttingDown = false;

async function shutdownAndExit(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
        console.log(`Received ${signal}, shutting down Android container pool...`);
        await pool.shutdown();
    } catch (error) {
        console.error('Failed to shut down Android container pool cleanly:', error);
    } finally {
        process.exit(0);
    }
}

process.on('SIGTERM', () => {
    void shutdownAndExit('SIGTERM');
});

process.on('SIGINT', () => {
    void shutdownAndExit('SIGINT');
});