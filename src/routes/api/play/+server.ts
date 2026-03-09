import { json } from "@sveltejs/kit";

export async function POST({ request }) {
    const body = await request.json();

    console.log("Launch game:", body.id);

    return json({
        status: "starting",
        stream: "/stream/session123"
    });
}