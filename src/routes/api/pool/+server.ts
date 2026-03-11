import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/pool/poolInstance';

export async function GET() {
    return json(pool.stats());
}