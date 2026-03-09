import { json } from '@sveltejs/kit';
import { getGames } from '$lib/server/games';

export async function GET() {
    return json(getGames());
}