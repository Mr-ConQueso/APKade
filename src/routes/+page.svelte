<script lang="ts">
	import { onMount } from 'svelte';
	import type { Game } from '$lib/types';

	const fallbackImage = '/images/placeholder.jpg';

	let games: Game[] = [];
	let isLoading = true;
	let error = '';

	onMount(async () => {
		try {
			const res = await fetch('/api/games');

			if (!res.ok) {
				throw new Error('Failed to load games.');
			}

			games = (await res.json()) as Game[];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load games.';
		} finally {
			isLoading = false;
		}
	});
</script>

<svelte:head>
	<title>APKade Library</title>
</svelte:head>

<div class="page">
	<div class="header">
		<div>
			<h1>APKade Library</h1>
			<p>Browse your uploaded Android games.</p>
		</div>

		<a class="upload-link" href="/upload">Upload Game</a>
	</div>

	{#if isLoading}
		<p>Loading games...</p>
	{:else if error}
		<p class="message error">{error}</p>
	{:else if games.length === 0}
		<div class="empty-state">
			<h2>No games yet</h2>
			<p>Upload your first APK to start building the library.</p>
			<a class="upload-link" href="/upload">Upload your first game</a>
		</div>
	{:else}
		<div class="grid">
			{#each games as game}
				<a class="card-link" href={`/games/${game.id}`}>
					<div class="card">
						<img
							src={game.image || fallbackImage}
							alt={game.name}
							on:error={(event) => {
								(event.currentTarget as HTMLImageElement).src = fallbackImage;
							}}
						/>
						<div class="card-body">
							<h2>{game.name}</h2>
							<p>{game.package}</p>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page {
		padding: 2rem 1rem 4rem;
		max-width: 1100px;
		margin: 0 auto;
	}

	.header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	h1 {
		margin: 0 0 0.5rem;
	}

	p {
		margin: 0;
	}

	.upload-link {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.85rem 1.1rem;
		border-radius: 0.65rem;
		background: #111827;
		color: white;
		text-decoration: none;
		font-weight: 700;
		white-space: nowrap;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1.25rem;
	}

	.card-link {
		text-decoration: none;
		color: inherit;
	}

	.card {
		background: #111;
		border-radius: 1rem;
		overflow: hidden;
		min-height: 100%;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
	}

	img {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		background: #1f2937;
	}

	.card-body {
		padding: 1rem;
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
	}

	.card-body p {
		color: #9ca3af;
		font-size: 0.95rem;
		word-break: break-word;
	}

	.empty-state {
		padding: 2rem;
		border: 1px dashed #374151;
		border-radius: 1rem;
		text-align: center;
	}

	.empty-state h2 {
		margin-bottom: 0.5rem;
	}

	.empty-state p {
		margin-bottom: 1rem;
		color: #6b7280;
	}

	.message {
		padding: 0.85rem 1rem;
		border-radius: 0.65rem;
	}

	.error {
		background: #fee2e2;
		color: #991b1b;
	}

	@media (max-width: 640px) {
		.header {
			flex-direction: column;
			align-items: stretch;
		}

		.upload-link {
			width: 100%;
		}
	}
</style>