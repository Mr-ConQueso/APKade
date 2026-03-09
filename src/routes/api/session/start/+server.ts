import { json, type RequestHandler } from '@sveltejs/kit';
import { startAndroidSession } from '$lib/server/android';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const gameId = typeof body?.id === 'string' ? body.id : '';

        if (!gameId) {
            return json(
                {
                    ok: false,
                    error: 'Game id is required.'
                },
                { status: 400 }
            );
        }

        const result = await startAndroidSession(gameId);

        return json({
            ok: true,
            session: result.session,
            adb_port: result.adb_port
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start Android session.';

        return json(
            {
                ok: false,
                error: message
            },
            { status: 500 }
        );
    }
};