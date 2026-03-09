import fs from 'fs';
import path from 'path';
import { json, type RequestHandler } from '@sveltejs/kit';
import { pool } from '$lib/server/poolInstance';

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

function getSessionFilePath(sessionId: string) {
	return path.join(sessionsDir, `${sessionId}.json`);
}

function readSession(sessionId: string): AndroidSession | null {
	try {
		return JSON.parse(fs.readFileSync(getSessionFilePath(sessionId), 'utf-8')) as AndroidSession;
	} catch {
		return null;
	}
}

export const DELETE: RequestHandler = async ({ params }) => {
	const sessionId = params.session;

	if (!sessionId) {
		return json(
			{
				ok: false,
				error: 'Session is required.'
			},
			{ status: 400 }
		);
	}

	const session = readSession(sessionId);

	if (!session) {
		return json(
			{
				ok: false,
				error: 'Session not found.'
			},
			{ status: 404 }
		);
	}

	if (session.containerId) {
		await pool.release(session.containerId);
	} else {
		await pool.releaseByName(session.containerName);
	}

	fs.rmSync(getSessionFilePath(sessionId), { force: true });

	return json({
		ok: true
	});
};