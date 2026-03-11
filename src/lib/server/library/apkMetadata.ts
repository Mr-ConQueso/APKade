import ApkReader from 'adbkit-apkreader';
import type {ApkMetadata, ManifestInfo} from "$lib/server/library/games";

function sanitizeAppName(value: string) {
    return value.replace(/\s+/g, ' ').trim();
}

function pickApplicationLabel(label?: string | Record<string, string>) {
    if (!label) return '';

    if (typeof label === 'string') {
        return label;
    }

    return (
        label[''] ||
        label.en ||
        label['en-US'] ||
        Object.values(label).find((value) => typeof value === 'string') ||
        ''
    );
}

function getPackageTail(packageName: string) {
    const parts = packageName.split('.').filter(Boolean);
    return parts[parts.length - 1] || 'game';
}

function isResourceStyleLabel(value: string) {
    const normalized = value.trim().toLowerCase();

    return (
        normalized.startsWith('resourceid:') ||
        normalized.startsWith('@string/') ||
        normalized.startsWith('@0x') ||
        /^0x[0-9a-f]+$/i.test(normalized)
    );
}

function humanizePackageTail(value: string) {
    return value
        .replace(/[_\-.]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function readApkMetadata(apkPath: string): Promise<ApkMetadata> {
    let manifest: ManifestInfo;

    try {
        const reader = await ApkReader.open(apkPath);
        manifest = (await reader.readManifest()) as ManifestInfo;
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to read APK metadata from manifest.';
        throw new Error(`Could not inspect APK metadata. ${message}`);
    }

    const packageName = manifest.package?.trim() || '';
    const version = manifest.versionName?.trim() || 'unknown';
    const applicationLabel = pickApplicationLabel(manifest.application?.label);

    if (!packageName) {
        throw new Error('Could not determine APK package name.');
    }

    const packageTail = getPackageTail(packageName);
    const rawLabel = pickApplicationLabel(manifest.application?.label);
    const safeLabel = rawLabel && !isResourceStyleLabel(rawLabel) ? rawLabel : '';
    const name = sanitizeAppName(safeLabel || humanizePackageTail(packageTail));

    return {
        name,
        packageName,
        version
    };
}