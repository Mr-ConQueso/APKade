import fs from 'fs';
import path from 'path';
import { json, type RequestHandler } from '@sveltejs/kit';
import type { AndroidSession } from '$lib/types/client';

const sessionsDir = path.resolve('data/containers');

function readSession(sessionId: string): AndroidSession | null {
	try {
		const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
		return JSON.parse(fs.readFileSync(sessionFile, 'utf-8')) as AndroidSession;
	} catch {
		return null;
	}
}

function buildDirectWebSocketUrl(requestUrl: URL, websocketPort: number) {
	const protocol = requestUrl.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${protocol}//${requestUrl.hostname}:${websocketPort}`;
}

export const GET: RequestHandler = async ({ params, url }) => {
	const sessionId = params.session;
	const session = sessionId ? readSession(sessionId) : null;

	if (!session) {
		return json(
			{
				ok: false,
				error: 'Session not found.'
			},
			{ status: 404 }
		);
	}

	return json({
		ok: true,
		session: {
			session: session.session,
			adb_port: session.adbPort,
			websocket_port: session.websocketPort,
			websocket_socket_name: session.websocketSocketName,
			game_id: session.gameId,
			package_name: session.packageName,
			started_at: session.startedAt
		},
		stream: {
			transport: 'websocket-direct',
			ws_url: buildDirectWebSocketUrl(url, session.websocketPort)
		}
	});
};