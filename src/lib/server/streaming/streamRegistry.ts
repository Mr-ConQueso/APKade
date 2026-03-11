import {SessionStream} from './sessionStream';
import type {SessionStreamOptions} from "$lib/types/stream";

const streams = new Map<string, SessionStream>();

export function getOrCreateSessionStream(options: SessionStreamOptions): SessionStream {
    const existing = streams.get(options.sessionId);

    if (existing) {
        return existing;
    }

    const stream = new SessionStream(options);
    streams.set(options.sessionId, stream);

    stream.on('stopped', () => {
        const active = streams.get(options.sessionId);

        if (active === stream) {
            streams.delete(options.sessionId);
        }
    });

    return stream;
}

export function getSessionStream(sessionId: string): SessionStream | undefined {
    return streams.get(sessionId);
}

export async function ensureSessionStream(options: SessionStreamOptions): Promise<SessionStream> {
    const stream = getOrCreateSessionStream(options);
    await stream.start();
    return stream;
}

export async function removeSessionStream(sessionId: string) {
    const stream = streams.get(sessionId);

    if (!stream) {
        return;
    }

    streams.delete(sessionId);
    await stream.stop();
}

export async function stopAllSessionStreams() {
    const activeStreams = [...streams.values()];
    streams.clear();

    await Promise.all(
        activeStreams.map((stream) => stream.stop().catch(() => undefined))
    );
}