<script lang="ts">
	import {goto} from '$app/navigation';
	import {page} from '$app/stores';
	import {onDestroy, onMount} from 'svelte';
	import {StreamReceiverScrcpy} from '$lib/client/streaming/streamReceiverScrcpy';
	import {WebCodecsPlayer} from '$lib/client/streaming/webCodecsPlayer';
	import {ScrcpyUserControl} from '$lib/client/interaction/scrcpyUserControl';
	import type {ScrcpyInitialMetadata, SessionStreamRouteResponse} from "$lib/types/stream";

	const sessionId = $page.params.session;

	let canvas: HTMLCanvasElement | undefined;
	let status = 'Connecting to stream...';
	let error = '';
	let metadata: ScrcpyInitialMetadata | null = null;

	let receiver: StreamReceiverScrcpy | null = null;
	let player: WebCodecsPlayer | null = null;
	let control: ScrcpyUserControl | null = null;

	async function fetchStreamInfo() {
		const response = await fetch(`/api/session/${sessionId}/stream`, {
			method: 'GET',
			cache: 'no-store'
		});

		const result = (await response.json()) as SessionStreamRouteResponse;

		if (!response.ok || !result.ok || !result.stream?.ws_url) {
			throw new Error(result.error ?? 'Failed to resolve stream endpoint.');
		}

		return result.stream.ws_url;
	}

	async function startStream() {
		if (!canvas) {
			throw new Error('Canvas element was not initialized.');
		}

		if (!('VideoDecoder' in window)) {
			throw new Error('This browser does not support WebCodecs VideoDecoder.');
		}

		const wsUrl = await fetchStreamInfo();

		player = new WebCodecsPlayer({ canvas });
		receiver = new StreamReceiverScrcpy(wsUrl);
		control = new ScrcpyUserControl(canvas, receiver, () => metadata);

		receiver.on('connected', () => {
			status = 'Connected to Android stream...';
			console.info('[play] websocket connected', { wsUrl });
		});

		receiver.on('metadata', (nextMetadata) => {
			metadata = nextMetadata;
			status = `Streaming ${nextMetadata.deviceName || sessionId}`;
			console.info('[play] metadata', nextMetadata);
		});

		receiver.on('video', (data) => {
			player?.pushFrame(data);

			if (player?.isConfigured()) {
				status = `Streaming ${metadata?.deviceName || sessionId} · frames=${player.getFrameCount()}`;
			}
		});

		receiver.on('videoSettingsSent', (settings) => {
			console.info('[play] video settings sent', settings.toJSON());
		});

		receiver.on('deviceMessage', (message) => {
			console.info('[play] device message', message);
		});

		receiver.on('error', (streamError) => {
			console.error('[play] stream receiver error', streamError);
			error = streamError.message || 'Stream receiver failed.';
			status = 'Stream error';
		});

		receiver.on('disconnected', (event) => {
			console.info('[play] websocket disconnected', {
				code: event.code,
				reason: event.reason
			});

			if (!error) {
				status = 'Stream disconnected';
			}
		});

		receiver.connect();
	}

	async function leaveGame() {
		try {
			await fetch(`/api/session/${sessionId}`, {
				method: 'DELETE'
			});
		} catch (leaveError) {
			console.error('[play] failed to release session', leaveError);
		}

		await goto('/');
	}

	onMount(async () => {
		try {
			await startStream();
		} catch (streamError) {
			console.error('Stream startup failed', streamError);
			error =
				streamError instanceof Error ? streamError.message : 'Failed to start video stream.';
			status = 'Stream failed';
		}
	});

	onDestroy(async () => {
		try {
			control?.destroy();
		} catch {
			// best-effort
		}

		try {
			await player?.destroy();
		} catch {
			// best-effort
		}

		receiver = null;
		receiver = null;
		player = null;
	});
</script>

<svelte:head>
	<title>Playing - APKade</title>
</svelte:head>

<div class="play-layout">
	<div class="header">
		<a class="back-btn" href="/" on:click|preventDefault={leaveGame}>← Leave Game</a>
		<span class="status">{status}</span>
	</div>

	<div class="stream-container">
		<canvas bind:this={canvas} class="android-screen"></canvas>

		{#if metadata}
			<div class="meta-badge">
				<span>{metadata.deviceName || 'Android Device'}</span>
			</div>
		{/if}

		{#if error}
			<div class="error-banner">{error}</div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #000;
		color: #fff;
	}

	.play-layout {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100vw;
		overflow: hidden;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: #111;
		border-bottom: 1px solid #333;
		z-index: 10;
	}

	.back-btn {
		color: #ef4444;
		text-decoration: none;
		font-weight: 700;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		background: rgba(239, 68, 68, 0.12);
	}

	.status {
		font-size: 0.9rem;
		color: #9ca3af;
		text-align: right;
	}

	.stream-container {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background:
				radial-gradient(circle at center, rgba(31, 41, 55, 0.5), rgba(0, 0, 0, 0.95)),
				#000;
		padding: 1rem;
	}

	.android-screen {
		max-width: 100%;
		max-height: 100%;
		aspect-ratio: 9 / 16;
		background: #0f172a;
		object-fit: contain;
		box-shadow: 0 0 24px rgba(0, 0, 0, 0.6);
		border-radius: 1rem;
		outline: none;
		cursor: pointer;
	}

	.meta-badge {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		padding: 0.5rem 0.75rem;
		border-radius: 999px;
		background: rgba(17, 24, 39, 0.8);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #e5e7eb;
		font-size: 0.85rem;
	}

	.error-banner {
		position: absolute;
		top: 1rem;
		left: 1rem;
		right: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		background: #7f1d1d;
		color: #fff;
		z-index: 20;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
	}
</style>