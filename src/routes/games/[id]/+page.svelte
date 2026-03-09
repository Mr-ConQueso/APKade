<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import type { Game } from '$lib/types';

    const fallbackImage = '/images/placeholder.jpg';

    let game: Game | undefined;
    let isLoading = true;
    let error = '';
    let isStarting = false;
    let sessionInfo = '';

    onMount(async () => {
        try {
            const res = await fetch('/api/games');

            if (!res.ok) {
                throw new Error('Failed to load game.');
            }

            const games = (await res.json()) as Game[];
            game = games.find((entry) => entry.id === $page.params.id);

            if (!game) {
                error = 'Game not found.';
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to load game.';
        } finally {
            isLoading = false;
        }
    });

    async function play() {
        if (!game) {
            return;
        }

        error = '';
        sessionInfo = '';
        isStarting = true;

        try {
            const response = await fetch('/api/session/start', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ id: game.id })
            });

            const raw = await response.text();
            let result: any;

            try {
                result = JSON.parse(raw);
            } catch {
                throw new Error(`Server returned a non-JSON response (${response.status}).`);
            }

            if (!response.ok || !result.ok) {
                throw new Error(result.error ?? 'Failed to start Android session.');
            }

            sessionInfo = `Session ${result.session} started on ADB port ${result.adb_port}.`;
            goto('/play/' + result.session);

        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start Android session.';
        } finally {
            isStarting = false;
        }
    }

	function handleImageError(event: Event) {
		const img = event.currentTarget as HTMLImageElement;
		img.src = fallbackImage;
	}
</script>

<svelte:head>
	<title>{game ? `${game.name} · APKade` : 'Game · APKade'}</title>
</svelte:head>

<div class="page">
    <a class="back-link" href="/">← Back to library</a>

    {#if isLoading}
        <p>Loading game...</p>
    {:else if error && !game}
        <p class="message error">{error}</p>
    {:else if game}
        <div class="game-layout">
            <div class="image-panel">
                <img
					src={game.image || fallbackImage}
					alt={game.name}
					on:error={handleImageError}
				/>
            </div>

            <div class="info-panel">
                <h1>{game.name}</h1>
                <p class="package">{game.package}</p>

                <div class="meta">
                    <p><strong>APK:</strong> {game.apk}</p>

                    {#if game.uploadedAt}
                        <p>
                            <strong>Uploaded:</strong>
                            {new Date(game.uploadedAt).toLocaleString()}
                        </p>
                    {/if}
                </div>

                {#if error}
                    <p class="message error">{error}</p>
                {/if}

                {#if sessionInfo}
                    <p class="message success">{sessionInfo}</p>
                {/if}

                <button on:click={play} disabled={isStarting}>
                    {#if isStarting}
                        Starting Android...
                    {:else}
                        Play
                    {/if}
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .page {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem 1rem 4rem;
    }

    .back-link {
        display: inline-block;
        margin-bottom: 1.5rem;
        color: #2563eb;
        text-decoration: none;
    }

    .game-layout {
        display: grid;
        grid-template-columns: minmax(280px, 420px) 1fr;
        gap: 2rem;
        align-items: start;
    }

    .image-panel img {
        display: block;
        width: 100%;
        border-radius: 1rem;
        background: #1f2937;
        aspect-ratio: 16 / 9;
        object-fit: cover;
    }

    h1 {
        margin: 0 0 0.75rem;
    }

    .package {
        font-size: 1rem;
        color: #6b7280;
        margin-bottom: 1.5rem;
        word-break: break-word;
    }

    .meta {
        display: grid;
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    .meta p {
        margin: 0;
    }

    button {
        padding: 0.9rem 1.25rem;
        border: none;
        border-radius: 0.65rem;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        background: #111827;
        color: white;
    }

    button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .message {
        padding: 0.85rem 1rem;
        border-radius: 0.65rem;
        margin-bottom: 1rem;
    }

    .error {
        background: #fee2e2;
        color: #991b1b;
    }

    .success {
        background: #dcfce7;
        color: #166534;
    }

    @media (max-width: 800px) {
        .game-layout {
            grid-template-columns: 1fr;
        }
    }
</style>