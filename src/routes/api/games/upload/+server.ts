import { json, type RequestHandler } from '@sveltejs/kit';
import { createUploadedGame } from '$lib/server/library/uploads';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();

        const image = formData.get('image');
        const apk = formData.get('apk');

        if (!(apk instanceof File)) {
            return json(
                {
                    ok: false,
                    error: 'APK file is required.'
                },
                { status: 400 }
            );
        }

        const game = await createUploadedGame({
            image: typeof image === 'string' ? image : '',
            apkFile: apk
        });

        return json({
            ok: true,
            game
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to upload game.';

        return json(
            {
				ok: false,
				error: message
			},
			{ status: 400 }
		);
	}
};