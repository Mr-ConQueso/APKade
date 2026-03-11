import type { ScrcpyInitialMetadata, ScrcpyScreenInfo } from '$lib/types/stream';
import type { StreamReceiverScrcpy } from '$lib/client/streaming/streamReceiverScrcpy';
import {
    ANDROID_BUTTON_PRIMARY,
    createKeyCodeControlMessage,
    createScrollControlMessage,
    createTouchControlMessage,
    KEY_EVENT_ACTION_DOWN,
    KEY_EVENT_ACTION_UP,
    MOTION_EVENT_ACTION_DOWN,
    MOTION_EVENT_ACTION_MOVE,
    MOTION_EVENT_ACTION_UP
} from '$lib/client/interaction/scrcpyControlMessages';

const ANDROID_META_ALT_ON = 0x02;
const ANDROID_META_SHIFT_ON = 0x01;
const ANDROID_META_CTRL_ON = 0x1000;

const KEYCODE_MAP: Record<string, number> = {
    Enter: 66,
    Backspace: 67,
    Delete: 112,
    Tab: 61,
    Escape: 111,
    ArrowUp: 19,
    ArrowDown: 20,
    ArrowLeft: 21,
    ArrowRight: 22,
    Home: 3,
    End: 123,
    PageUp: 92,
    PageDown: 93,
    ' ': 62
};

function getPrimaryScreenInfo(metadata: ScrcpyInitialMetadata): ScrcpyScreenInfo | null {
    const firstDisplay = metadata.displays[0];
    if (!firstDisplay) {
        return null;
    }

    return metadata.screenInfoByDisplayId[firstDisplay.displayId] ?? null;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function buildMetaState(event: KeyboardEvent) {
    let metaState = 0;

    if (event.shiftKey) {
        metaState |= ANDROID_META_SHIFT_ON;
    }
    if (event.altKey) {
        metaState |= ANDROID_META_ALT_ON;
    }
    if (event.ctrlKey) {
        metaState |= ANDROID_META_CTRL_ON;
    }

    return metaState;
}

function mapKeyboardKeyToAndroidKeyCode(key: string) {
    if (key in KEYCODE_MAP) {
        return KEYCODE_MAP[key];
    }

    if (/^[a-z]$/i.test(key)) {
        return 29 + (key.toUpperCase().charCodeAt(0) - 65);
    }

    if (/^[0-9]$/.test(key)) {
        return 7 + Number(key);
    }

    return undefined;
}

export class ScrcpyUserControl {
    private isPointerDown = false;
    private lastPointerButtons = 0;

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly receiver: StreamReceiverScrcpy,
        private readonly getMetadata: () => ScrcpyInitialMetadata | null
    ) {
        this.canvas.tabIndex = 0;

        this.canvas.addEventListener('mousedown', this.onMouseDown);
        this.canvas.addEventListener('mousemove', this.onMouseMove);
        this.canvas.addEventListener('mouseup', this.onMouseUp);
        this.canvas.addEventListener('mouseleave', this.onMouseLeave);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
        this.canvas.addEventListener('keydown', this.onKeyDown);
        this.canvas.addEventListener('keyup', this.onKeyUp);
    }

    destroy() {
        this.canvas.removeEventListener('mousedown', this.onMouseDown);
        this.canvas.removeEventListener('mousemove', this.onMouseMove);
        this.canvas.removeEventListener('mouseup', this.onMouseUp);
        this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.canvas.removeEventListener('keydown', this.onKeyDown);
        this.canvas.removeEventListener('keyup', this.onKeyUp);
    }

    private getPositionFromMouseEvent(event: MouseEvent | WheelEvent) {
        const metadata = this.getMetadata();
        if (!metadata) {
            return null;
        }

        const screenInfo = getPrimaryScreenInfo(metadata);
        if (!screenInfo) {
            return null;
        }

        const rect = this.canvas.getBoundingClientRect();
        const clientWidth = rect.width;
        const clientHeight = rect.height;

        if (!clientWidth || !clientHeight) {
            return null;
        }

        const videoWidth = screenInfo.videoSize.width;
        const videoHeight = screenInfo.videoSize.height;

        const videoRatio = videoWidth / videoHeight;
        const clientRatio = clientWidth / clientHeight;

        let contentLeft = 0;
        let contentTop = 0;
        let contentWidth = clientWidth;
        let contentHeight = clientHeight;

        if (videoRatio > clientRatio) {
            contentHeight = clientWidth / videoRatio;
            contentTop = (clientHeight - contentHeight) / 2;
        } else if (videoRatio < clientRatio) {
            contentWidth = clientHeight * videoRatio;
            contentLeft = (clientWidth - contentWidth) / 2;
        }

        const xInContent = event.clientX - rect.left - contentLeft;
        const yInContent = event.clientY - rect.top - contentTop;

        const normalizedX = clamp(xInContent / contentWidth, 0, 1);
        const normalizedY = clamp(yInContent / contentHeight, 0, 1);

        return {
            point: {
                x: normalizedX * videoWidth,
                y: normalizedY * videoHeight
            },
            screenSize: {
                width: videoWidth,
                height: videoHeight
            }
        };
    }

    private sendTouch(action: number, event: MouseEvent, pressure: number) {
        const position = this.getPositionFromMouseEvent(event);
        if (!position) {
            return;
        }

        this.receiver.sendRaw(
            createTouchControlMessage({
                action,
                position,
                pressure,
                buttons: event.buttons || this.lastPointerButtons
            })
        );
    }

    private onMouseDown = (event: MouseEvent) => {
        if (event.button !== 0) {
            return;
        }

        this.canvas.focus();
        this.isPointerDown = true;
        this.lastPointerButtons = event.buttons || ANDROID_BUTTON_PRIMARY;

        this.sendTouch(MOTION_EVENT_ACTION_DOWN, event, 1);
        event.preventDefault();
        event.stopPropagation();
    };

    private onMouseMove = (event: MouseEvent) => {
        if (!this.isPointerDown) {
            return;
        }

        this.lastPointerButtons = event.buttons || this.lastPointerButtons || ANDROID_BUTTON_PRIMARY;
        this.sendTouch(MOTION_EVENT_ACTION_MOVE, event, 1);
        event.preventDefault();
        event.stopPropagation();
    };

    private onMouseUp = (event: MouseEvent) => {
        if (!this.isPointerDown) {
            return;
        }

        this.sendTouch(MOTION_EVENT_ACTION_UP, event, 0);
        this.isPointerDown = false;
        this.lastPointerButtons = 0;
        event.preventDefault();
        event.stopPropagation();
    };

    private onMouseLeave = (event: MouseEvent) => {
        if (!this.isPointerDown) {
            return;
        }

        this.sendTouch(MOTION_EVENT_ACTION_UP, event, 0);
        this.isPointerDown = false;
        this.lastPointerButtons = 0;
    };

    private onWheel = (event: WheelEvent) => {
        const position = this.getPositionFromMouseEvent(event);
        if (!position) {
            return;
        }

        const hScroll = event.deltaX > 0 ? -1 : event.deltaX < 0 ? 1 : 0;
        const vScroll = event.deltaY > 0 ? -1 : event.deltaY < 0 ? 1 : 0;

        this.receiver.sendRaw(
            createScrollControlMessage({
                position,
                hScroll,
                vScroll
            })
        );

        event.preventDefault();
        event.stopPropagation();
    };

    private onKeyDown = (event: KeyboardEvent) => {
        const keycode = mapKeyboardKeyToAndroidKeyCode(event.key);
        if (keycode === undefined) {
            return;
        }

        this.receiver.sendRaw(
            createKeyCodeControlMessage({
                action: KEY_EVENT_ACTION_DOWN,
                keycode,
                repeat: event.repeat ? 1 : 0,
                metaState: buildMetaState(event)
            })
        );

        event.preventDefault();
        event.stopPropagation();
    };

    private onKeyUp = (event: KeyboardEvent) => {
        const keycode = mapKeyboardKeyToAndroidKeyCode(event.key);
        if (keycode === undefined) {
            return;
        }

        this.receiver.sendRaw(
            createKeyCodeControlMessage({
                action: KEY_EVENT_ACTION_UP,
                keycode,
                repeat: 0,
                metaState: buildMetaState(event)
            })
        );

        event.preventDefault();
        event.stopPropagation();
    };
}