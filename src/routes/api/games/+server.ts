import { json } from '@sveltejs/kit';
import { getGames } from '$lib/server/library/games';

export async function GET() {
    return json(getGames());
}