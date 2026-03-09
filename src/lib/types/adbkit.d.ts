declare module 'adbkit-apkreader' {
    export type ApkManifest = {
        package?: string;
        versionName?: string;
        application?: {
            label?: string | Record<string, string>;
        };
    };

    export interface ApkReaderInstance {
        readManifest(): Promise<ApkManifest>;
    }

    const ApkReader: {
        open(apkPath: string): Promise<ApkReaderInstance>;
    };

    export default ApkReader;
}