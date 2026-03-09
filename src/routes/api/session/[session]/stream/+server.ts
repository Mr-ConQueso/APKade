import fs from 'fs';
import path from 'path';
import { json, type RequestHandler } from '@sveltejs/kit';

type AndroidSession = {
	session: string;
	containerId?: string;
	containerName: string;
	adbPort: number;
	gameId: string;
	packageName: string;
	startedAt: string;
};

const sessionsDir = path.resolve('data/containers');

function readSession(sessionId: string): AndroidSession | null {
	try {
		const sessionFile = path.join(sessionsDir, `${sessionId}.json`);
		return JSON.parse(fs.readFileSync(sessionFile, 'utf-8')) as AndroidSession;
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ params, request, fetch }) => {
	try {
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

		const body = await request.json();
		const offer = body?.offer;

		if (!offer) {
			return json(
				{
					ok: false,
					error: 'WebRTC offer is required.'
				},
				{ status: 400 }
			);
		}

		const streamerUrl = process.env.STREAMER_URL || "http://localhost:8080";

		if (!streamerUrl) {
			return json(
				{
					ok: false,
					error: 'STREAMER_URL is not configured.'
				},
				{ status: 500 }
			);
		}

		const upstream = await fetch(`${streamerUrl}/stream`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				sessionId: session.session,
				adbPort: session.adbPort,
				offer
			})
		});

		const text = await upstream.text();
		let result: unknown = null;

		try {
			result = JSON.parse(text);
		} catch {
			return json(
				{
					ok: false,
					error: `Streamer returned non-JSON response: ${text.slice(0, 200)}`
				},
				{ status: 502 }
			);
		}

		return json(result, {
			status: upstream.status
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to start stream.';

		return json(
			{
				ok: false,
				error: message
			},
			{ status: 500 }
		);
	}
};