import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/poolInstance';

export async function GET() {
    return json(pool.stats());
}