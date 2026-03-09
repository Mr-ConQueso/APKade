<script lang="ts">
    import { goto } from '$app/navigation';

    let image = '';
    let apkFile: File | null = null;

    let isSubmitting = false;
    let error = '';
    let success = '';

    function handleFileChange(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        apkFile = input.files?.[0] ?? null;
        error = '';
        success = '';
    }

    async function submitUpload() {
        error = '';
        success = '';

        if (!apkFile) {
            error = 'Please choose an APK file.';
            return;
        }

        isSubmitting = true;

        try {
            const formData = new FormData();
            formData.set('image', image);
            formData.set('apk', apkFile);

            const response = await fetch('/api/games/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok || !result.ok) {
                error = result.error ?? 'Upload failed.';
                return;
            }

            success = `Uploaded ${result.game.name} successfully.`;
            await goto(`/games/${result.game.id}`);
        } catch {
            error = 'Something went wrong while uploading the APK.';
        } finally {
            isSubmitting = false;
        }
    }
</script>

<svelte:head>
    <title>Upload Game</title>
</svelte:head>

<div class="upload-page">
    <h1>Upload a game</h1>
    <p>Choose an APK and the app metadata will be detected automatically.</p>

    <form class="upload-form" on:submit|preventDefault={submitUpload}>
        <label>
            <span>Cover image URL (optional)</span>
            <input
                type="url"
                bind:value={image}
                placeholder="/images/deadcells.jpg"
                disabled={isSubmitting}
            />
        </label>

        <label>
            <span>APK file</span>
            <input
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                on:change={handleFileChange}
                disabled={isSubmitting}
                required
            />
        </label>

        {#if apkFile}
            <p class="file-name">Selected file: {apkFile.name}</p>
        {/if}

        {#if error}
            <p class="message error">{error}</p>
        {/if}

        {#if success}
            <p class="message success">{success}</p>
        {/if}

        <button type="submit" disabled={isSubmitting}>
            {#if isSubmitting}
                Uploading...
            {:else}
                Upload APK
            {/if}
        </button>
    </form>
</div>

<style>
    .upload-page {
        max-width: 40rem;
        margin: 0 auto;
        padding: 2rem 1rem 4rem;
    }

    h1 {
        margin-bottom: 0.5rem;
    }

    p {
        margin-bottom: 1rem;
    }

    .upload-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        font-weight: 600;
    }

    input {
        padding: 0.75rem;
        border: 1px solid #ccc;
        border-radius: 0.5rem;
        font: inherit;
    }

    button {
        padding: 0.9rem 1.25rem;
        border: none;
        border-radius: 0.5rem;
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

    .file-name {
        font-size: 0.95rem;
        color: #374151;
    }

    .message {
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        margin: 0;
    }

    .error {
        background: #fee2e2;
        color: #991b1b;
    }

    .success {
        background: #dcfce7;
        color: #166534;
    }
</style>