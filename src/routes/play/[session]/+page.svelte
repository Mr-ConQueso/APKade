<script lang="ts">
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let status = 'Connecting to session...';
	let error = '';
	const sessionId = $page.params.session;

	let video: HTMLVideoElement;
	let pc: RTCPeerConnection | null = null;
	let remoteStream: MediaStream | null = null;

	async function leaveGame() {
		await goto('/');
	}

	onMount(async () => {
		try {
			await startStream();
			status = `Streaming session: ${sessionId}`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to start stream.';
			status = 'Stream failed to start';
		}
	});

	onDestroy(() => {
		if (pc) {
			pc.close();
			pc = null;
		}
	});

	async function startStream() {
		pc = new RTCPeerConnection({
			iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
		});

		remoteStream = new MediaStream();
		video.srcObject = remoteStream;

		pc.addTransceiver('video', { direction: 'recvonly' });

		pc.ontrack = async (event) => {
			console.log('ontrack', {
				kind: event.track.kind,
				streamCount: event.streams.length,
				trackId: event.track.id
			});

			if (!remoteStream) {
				remoteStream = new MediaStream();
				video.srcObject = remoteStream;
			}

			remoteStream.addTrack(event.track);

			try {
				await video.play();
				status = `Streaming session: ${sessionId}`;
			} catch (playError) {
				console.error('video.play() failed', playError);
			}
		};

		pc.onconnectionstatechange = () => {
			console.log('connectionState', pc?.connectionState);
			if (pc?.connectionState === 'failed') {
				error = 'Peer connection failed.';
			}
		};

		pc.oniceconnectionstatechange = () => {
			console.log('iceConnectionState', pc?.iceConnectionState);
		};

		pc.onicegatheringstatechange = () => {
			console.log('iceGatheringState', pc?.iceGatheringState);
		};

		video.onloadedmetadata = () => {
			console.log('video metadata loaded', {
				width: video.videoWidth,
				height: video.videoHeight
			});
		};

		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);

		const res = await fetch(`/api/session/${sessionId}/stream`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				offer: pc.localDescription
			})
		});

		const data = await res.json();

		console.log('stream negotiation response', data);

		if (!res.ok || !data.ok) {
			throw new Error(data?.error ?? 'Failed to negotiate stream.');
		}

		if (!data.answer) {
			throw new Error('Streamer did not return an SDP answer.');
		}

		await pc.setRemoteDescription(data.answer);
		status = 'Waiting for remote video track...';
	}
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
		<video bind:this={video} class="android-screen" autoplay playsinline muted></video>

		{#if error}
			<div class="error-banner">{error}</div>
		{/if}

		<div class="controls-overlay">
			<div class="dpad"></div>
			<div class="action-buttons"></div>
		</div>
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
		font-weight: bold;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		background: rgba(239, 68, 68, 0.1);
	}

	.status {
		font-size: 0.9rem;
		color: #9ca3af;
	}

	.stream-container {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #000;
	}

	.android-screen {
		max-width: 100%;
		max-height: 100%;
		aspect-ratio: 9 / 16;
		background: #1f2937;
		object-fit: contain;
		box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
	}

	.error-banner {
		position: absolute;
		top: 1rem;
		left: 1rem;
		right: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: #7f1d1d;
		color: #fff;
		z-index: 20;
	}

	.controls-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		padding: 2rem;
	}
</style>