export type AndroidSize = {
    width: number;
    height: number;
};

export type AndroidPoint = {
    x: number;
    y: number;
};

export type AndroidPosition = {
    point: AndroidPoint;
    screenSize: AndroidSize;
};

export const CONTROL_MESSAGE_TYPE_KEYCODE = 0;
export const CONTROL_MESSAGE_TYPE_TOUCH = 2;
export const CONTROL_MESSAGE_TYPE_SCROLL = 3;

export const MOTION_EVENT_ACTION_DOWN = 0;
export const MOTION_EVENT_ACTION_UP = 1;
export const MOTION_EVENT_ACTION_MOVE = 2;

export const KEY_EVENT_ACTION_DOWN = 0;
export const KEY_EVENT_ACTION_UP = 1;

export const ANDROID_BUTTON_PRIMARY = 1;
export const TOUCH_POINTER_ID_MOUSE = 0;
export const MAX_PRESSURE_VALUE = 0xffff;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function createTouchControlMessage(params: {
    action: number;
    pointerId?: number;
    position: AndroidPosition;
    pressure?: number;
    buttons?: number;
}) {
    const pointerId = params.pointerId ?? TOUCH_POINTER_ID_MOUSE;
    const pressure = clamp(params.pressure ?? 1, 0, 1);
    const buttons = params.buttons ?? 0;

    const buffer = new Uint8Array(29);
    const view = new DataView(buffer.buffer);

    let offset = 0;
    view.setUint8(offset, CONTROL_MESSAGE_TYPE_TOUCH);
    offset += 1;

    view.setUint8(offset, params.action);
    offset += 1;

    view.setUint32(offset, 0, false);
    offset += 4;

    view.setUint32(offset, pointerId, false);
    offset += 4;

    view.setUint32(offset, Math.round(params.position.point.x), false);
    offset += 4;

    view.setUint32(offset, Math.round(params.position.point.y), false);
    offset += 4;

    view.setUint16(offset, params.position.screenSize.width, false);
    offset += 2;

    view.setUint16(offset, params.position.screenSize.height, false);
    offset += 2;

    view.setUint16(offset, Math.round(pressure * MAX_PRESSURE_VALUE), false);
    offset += 2;

    view.setUint32(offset, buttons, false);

    return buffer;
}

export function createScrollControlMessage(params: {
    position: AndroidPosition;
    hScroll: number;
    vScroll: number;
}) {
    const buffer = new Uint8Array(21);
    const view = new DataView(buffer.buffer);

    let offset = 0;
    view.setUint8(offset, CONTROL_MESSAGE_TYPE_SCROLL);
    offset += 1;

    view.setUint32(offset, Math.round(params.position.point.x), false);
    offset += 4;

    view.setUint32(offset, Math.round(params.position.point.y), false);
    offset += 4;

    view.setUint16(offset, params.position.screenSize.width, false);
    offset += 2;

    view.setUint16(offset, params.position.screenSize.height, false);
    offset += 2;

    view.setInt32(offset, params.hScroll, false);
    offset += 4;

    view.setInt32(offset, params.vScroll, false);

    return buffer;
}

export function createKeyCodeControlMessage(params: {
    action: number;
    keycode: number;
    repeat?: number;
    metaState?: number;
}) {
    const buffer = new Uint8Array(14);
    const view = new DataView(buffer.buffer);

    let offset = 0;
    view.setUint8(offset, CONTROL_MESSAGE_TYPE_KEYCODE);
    offset += 1;

    view.setUint8(offset, params.action);
    offset += 1;

    view.setInt32(offset, params.keycode, false);
    offset += 4;

    view.setInt32(offset, params.repeat ?? 0, false);
    offset += 4;

    view.setInt32(offset, params.metaState ?? 0, false);

    return buffer;
}