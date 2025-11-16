import { Vector2 } from './vector.js';

type PointerInfo = {
    id: number;
    x: number;
    y: number;
    old?: {
        x: number;
        y: number;
    };
};

/*
 * PointerAction field values
 *
 *                     wheel      single             multi-touch
 *        field               normal  control     2fingers   3fingers
 *  -----------------------------------------------------------------------
 *     pointersNum        1       1       1            2          3
 *     pointers       <obj>   <obj>   <obj>        <obj>      <obj>
 *     center x           x       U      cx            x          x
 *            y           y       U      cy            y          y
 *     delta  x           0      dx       0           dx         dx
 *            y           0      dy       0           dy         dy
 *            z       wheel       0       0         zoom       zoom
 *            theta       0       0     rad            0        rad
 *            thetaX      0       0      dx            0          0
 *            thetaY      0       0      dy            0          0
 *    ------------------------------------------------------------------
 *        zoom            t                            t          t
 *        move                    t                    t          t
 *      rotate                            t                       t
 *
 *       U = undefined
 *       x = current x    y = current y
 *      cx = center x    cy = center y
 *      dx = delta x     dy = delta y
 *
 *        zoom: use center.x, center.y, delta.z
 *        move: use delta.x, delta.y
 *      rotate: use center.x, center.y, delta.theta
 */
export type PointerAction = {
    pointersNum: number; // touching fingers number
    pointers: Record<number, PointerInfo>; // pointers coordinate
    center?: {
        // center of rotation, zooming
        // if undefined, it means rotation at the center of container
        x: number;
        y: number;
    };
    delta: {
        // delta of moving, zooming, rotation
        x: number; // moving x
        y: number; // moving y
        z: number; // wheel: -1 or 1, zoom: nx or 1/nx
        theta: number; // radian of rotation
        thetaX: number; // moving x in rotation
        thetaY: number; // moving y in rotation
    };
};

type PointerEventHandler = (event: PointerEvent, pa: PointerAction) => void;
type WheelEventHandler = (event: WheelEvent, pa: PointerAction) => void;

export type PointerControlOptions = {
    container: HTMLElement;
    enabled: boolean;
    enableRotate?: boolean;
    enableZoom?: boolean;
    enableMoveBy2Fingers?: boolean;
    enableZoomBy3Fingers?: boolean;
    onPointerDown?: PointerEventHandler;
    onPointerUp?: PointerEventHandler;
    onGotPointerCapture?: PointerEventHandler;
    onLostPointerCapture?: PointerEventHandler;
    onPointerMove?: PointerEventHandler;
    onPointerCancel?: PointerEventHandler;
    onWheel?: WheelEventHandler;
};

export class PointerControl {
    enableRotate: boolean;
    enableZoom: boolean;
    enableMoveBy2Fingers: boolean;
    enableZoomBy3Fingers: boolean;

    _container: HTMLElement;

    _enabled: boolean;
    _isMoving: boolean;
    _pointers: Record<number, PointerInfo>;
    _pointerAction: PointerAction;

    _interval_wheel: number; // ホイールイベントの処理を間引く（例：ms単位で判定）
    _accumulatedDelta: number; // ホイールの累積値
    _accumulatedDeltaWeight: number; // 累積値のウェイト（調整用）
    _timer_wheel: number | null; // タイマー

    _onPointerDown?: PointerEventHandler;
    _onPointerUp?: PointerEventHandler;
    _onGotPointerCapture?: PointerEventHandler;
    _onLostPointerCapture?: PointerEventHandler;
    _onPointerMove?: PointerEventHandler;
    _onPointerCancel?: PointerEventHandler;
    _onWheel?: WheelEventHandler;

    constructor(options: Partial<PointerControlOptions>) {
        this.enableRotate = true;
        this.enableZoom = true;
        this.enableMoveBy2Fingers = true;
        this.enableZoomBy3Fingers = true;
        this._enabled = true;
        this._isMoving = false;

        this._pointers = {};
        this._pointerAction = {
            pointersNum: 0,
            pointers: this._pointers,
            delta: {
                x: 0,
                y: 0,
                z: 0,
                theta: 0,
                thetaX: 0,
                thetaY: 0,
            },
        };

        this._interval_wheel = 20;
        this._accumulatedDelta = 0;
        this._accumulatedDeltaWeight = 30;
        this._timer_wheel = null;

        // set option parameters
        if (options.container) {
            this._container = options.container;
        } else {
            throw new Error('Invalid container');
        }
        if (options.enabled != null) {
            this._enabled = options.enabled;
        }
        if (options.enableRotate != null) {
            this.enableRotate = options.enableRotate;
        }
        if (options.enableZoom != null) {
            this.enableZoom = options.enableZoom;
        }
        if (options.enableMoveBy2Fingers != null) {
            this.enableMoveBy2Fingers = options.enableMoveBy2Fingers;
        }
        if (options.enableZoomBy3Fingers != null) {
            this.enableZoomBy3Fingers = options.enableZoomBy3Fingers;
        }
        if (options.onPointerDown) {
            this._onPointerDown = options.onPointerDown;
        }
        if (options.onPointerUp) {
            this._onPointerUp = options.onPointerUp;
        }
        if (options.onGotPointerCapture) {
            this._onGotPointerCapture = options.onGotPointerCapture;
        }
        if (options.onLostPointerCapture) {
            this._onLostPointerCapture = options.onLostPointerCapture;
        }
        if (options.onPointerMove) {
            this._onPointerMove = options.onPointerMove;
        }
        if (options.onPointerCancel) {
            this._onPointerCancel = options.onPointerCancel;
        }
        if (options.onWheel) {
            this._onWheel = options.onWheel;
        }

        // disable pinch in-out by browser
        this._container.addEventListener('touchstart', (event) => {
            event.preventDefault();
        });
        // disable right-click menu
        this._container.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        // set pointer events
        this._container.addEventListener('pointerdown', this.handlerPointerDown());
        this._container.addEventListener('pointerup', this.handlerPointerUp());
        this._container.addEventListener('gotpointercapture', this.handlerGotPointerCapture());
        this._container.addEventListener('lostpointercapture', this.handlerLostPointerCapture());
        this._container.addEventListener('pointermove', this.handlerPointerMove());
        this._container.addEventListener('pointercancel', this.handlerPointerCancel());
        this._container.addEventListener('wheel', this.handlerWheel());
    }

    enable() {
        //this._isMoving = false;
        this._pointers = {};
        this._pointerAction = {
            pointersNum: 0,
            pointers: this._pointers,
            delta: {
                x: 0,
                y: 0,
                z: 0,
                theta: 0,
                thetaX: 0,
                thetaY: 0,
            },
        };

        this._enabled = true;
    }

    disable() {
        this._enabled = false;
    }

    actionPointerDown(e: PointerEvent) {
        const element = <HTMLElement>e.currentTarget;
        element.setPointerCapture(e.pointerId);

        this._pointers[e.pointerId] = {
            id: e.pointerId,
            x: e.offsetX,
            y: e.offsetY,
        };

        const pointers = Object.values(this._pointers);
        this._pointerAction.pointersNum = pointers.length;
        if (pointers.length === 1) {
            // 最初の指ならば移動開始
            this._isMoving = true;
        }
    }

    actionPointerUp(e: PointerEvent) {
        const element = <HTMLElement>e.currentTarget;
        element.releasePointerCapture(e.pointerId);

        delete this._pointers[e.pointerId];

        const pointers = Object.values(this._pointers);
        this._pointerAction.pointersNum = pointers.length;
        if (pointers.length === 0) {
            // 指がすべて離れた
            this._isMoving = false;
        }
    }

    handlerPointerDown() {
        return (e: PointerEvent) => {
            if (!this._enabled) return;

            this.actionPointerDown(e);
            this._onPointerDown?.(e, this._pointerAction);
        };
    }

    handlerPointerUp() {
        return (e: PointerEvent) => {
            //e.preventDefault();
            if (!this._enabled) return;

            this.actionPointerUp(e);
            this._onPointerUp?.(e, this._pointerAction);
        };
    }

    handlerGotPointerCapture() {
        return (e: PointerEvent) => {
            if (!this._enabled) return;
            this._onGotPointerCapture?.(e, this._pointerAction);
        };
    }

    handlerLostPointerCapture() {
        return (e: PointerEvent) => {
            if (!this._enabled) return;
            // pointerupイベントが呼ばれない場合もあるため、lostpointercaptureイベントでも
            // 念の為にup処理を行う。
            this.actionPointerUp(e);
            this._onLostPointerCapture?.(e, this._pointerAction);
        };
    }

    handlerPointerMove() {
        return (e: PointerEvent) => {
            if (!this._enabled) return;

            //e.preventDefault();

            if (!this._isMoving) return;

            // update pointers info
            if (e.pointerId in this._pointers) {
                const v = this._pointers[e.pointerId];
                v.old = {
                    x: v.x,
                    y: v.y,
                };
                v.x = e.offsetX;
                v.y = e.offsetY;
            } else {
                this._pointers[e.pointerId] = { id: e.pointerId, x: e.offsetX, y: e.offsetY };
            }

            // ポインタを古い順にソートして配列化
            const pointers = Object.values(this._pointers).sort((a, b) => a.id - b.id);
            this._pointerAction.pointersNum = pointers.length;
            if (pointers.length === 0) {
                return;
            }

            // １本目のタッチ情報
            const p0 = pointers[0];
            if (!p0.old) {
                return;
            }

            const [w, h] = [this._container.clientWidth, this._container.clientHeight];

            // １本目の移動量
            // Containerを右下にドラッグした場合、Containerの中心を左上に移動することと同じ。
            const d0 = new Vector2(p0.x - p0.old.x, p0.y - p0.old.y);

            if (pointers.length >= 2) {
                // multi-touch
                // ２本目のタッチ情報
                const p1 = pointers[1];
                if (!p1.old) {
                    return;
                }

                // ２本目の移動量
                const d1 = new Vector2(p1.x - p1.old.x, p1.y - p1.old.y);

                // 総移動量として１本目と２本目の移動量の平均を求める
                const dx = (d0.x + d1.x) / 2;
                const dy = (d0.y + d1.y) / 2;

                // ピンチイン・アウトの最終的な中心位置を求める
                const rx = (p0.x + p1.x) / 2;
                const ry = (p0.y + p1.y) / 2;

                this._pointerAction.center = { x: rx, y: ry };
                if (pointers.length !== 2 || this.enableMoveBy2Fingers) {
                    // 2本の時enableMoveBy2Fingersがtrueの場合は移動しない
                    this._pointerAction.delta.x = dx;
                    this._pointerAction.delta.y = dy;
                } else {
                    this._pointerAction.delta.x = 0;
                    this._pointerAction.delta.y = 0;
                }
                this._pointerAction.delta.theta = 0;
                this._pointerAction.delta.thetaX = 0;
                this._pointerAction.delta.thetaY = 0;

                // ２本のタッチ位置（移動前、移動後）を正規化する
                const v00 = new Vector2(p0.old.x / w - 0.5, p0.old.y / h - 0.5);
                const v01 = new Vector2(p0.x / w - 0.5, p0.y / h - 0.5);
                const v10 = new Vector2(p1.old.x / w - 0.5, p1.old.y / h - 0.5);
                const v11 = new Vector2(p1.x / w - 0.5, p1.y / h - 0.5);

                // ピンチイン・アウト
                // １本目と２本目の移動場所、移動量からズームの変化を計算する
                // 3本以上の時はenableZoomWhen3Fingersがtrueの時のみピンチイン・アウトを許可する。
                if (
                    this.enableZoom &&
                    (pointers.length === 2 || (pointers.length >= 3 && this.enableZoomBy3Fingers))
                ) {
                    const rb = Math.sqrt((p0.old.x - p1.old.x) ** 2 + (p0.old.y - p1.old.y) ** 2);
                    const ra = Math.sqrt((p0.x - p1.x) ** 2 + (p0.y - p1.y) ** 2);
                    this._pointerAction.delta.z = rb / ra;
                } else {
                    this._pointerAction.delta.z = 0;
                }
                /*
                 * ピンチイン・アウトによるズームを正負で表したい場合
                const dist0 = v00.distanceTo(v10);
                const dist1 = v01.distanceTo(v11);
                this._pointerAction.delta.z = dist0 - dist1;
                */

                if (this.enableRotate && pointers.length >= 3) {
                    // ３本以上のときのみ回転有効

                    // ２本指間の中間位置を求める
                    const c00 = v00.clone().add(v10).divideScalar(2);
                    const c01 = v01.clone().add(v11).divideScalar(2);

                    // 地図の中央を円の中心としたベクトルにする
                    v00.sub(c00);
                    v10.sub(c00);
                    v01.sub(c01);
                    v11.sub(c01);

                    // 各指の回転角を求め、合算を平均したものを地図の回転角とする
                    const delta0 = v00.angleTo(v01) * (v00.cross(v01) < 0 ? -1 : 1);
                    const delta1 = v10.angleTo(v11) * (v10.cross(v11) < 0 ? -1 : 1);
                    const deltaRad = (delta0 + delta1) / 2;

                    this._pointerAction.delta.theta = deltaRad;
                    this._pointerAction.delta.thetaX = 0;
                    this._pointerAction.delta.thetaY = 0;
                }
            } else {
                // dragging mouse or single touch
                this._pointerAction.delta.z = 0;

                if (this.enableRotate && e.ctrlKey) {
                    // Control + ドラッグでポインタの位置を中心とした回転
                    const v0 = new Vector2(p0.old.x / w - 0.5, p0.old.y / h - 0.5);
                    const v1 = new Vector2(p0.x / w - 0.5, p0.y / h - 0.5);
                    const sign = v0.cross(v1) < 0 ? -1 : 1;

                    this._pointerAction.center = { x: w / 2, y: h / 2 };
                    this._pointerAction.delta.x = 0;
                    this._pointerAction.delta.y = 0;
                    this._pointerAction.delta.theta = v0.angleTo(v1) * sign;
                    this._pointerAction.delta.thetaX = d0.x;
                    this._pointerAction.delta.thetaY = d0.y;
                } else {
                    // Container上の移動
                    this._pointerAction.center = undefined;
                    this._pointerAction.delta.x = d0.x;
                    this._pointerAction.delta.y = d0.y;
                    this._pointerAction.delta.theta = 0;
                    this._pointerAction.delta.thetaX = 0;
                    this._pointerAction.delta.thetaY = 0;
                }
            }

            this._onPointerMove?.(e, this._pointerAction);
        };
    }

    handlerPointerCancel() {
        return (e: PointerEvent) => {
            this._onPointerCancel?.(e, this._pointerAction);
        };
    }

    handlerWheel() {
        return (e: WheelEvent) => {
            if (!this._enabled) return;

            // disable wheel action by browser
            e.preventDefault();

            if (!this.enableZoom) return;

            // イベントのdeltaYを累積
            this._accumulatedDelta += e.deltaY;

            // タイマーがまだ動いていなければ起動
            if (this._timer_wheel === null) {
                this._timer_wheel = window.setTimeout(() => {
                    // 増分が正なら +1, 負なら -1
                    const wa = this._accumulatedDelta / this._accumulatedDeltaWeight;
                    const direction = wa > 1.0 ? 1 : wa < -1.0 ? -1 : 0;

                    if (direction !== 0) {
                        // ホイール操作開始位置を中心に拡大縮小する
                        const x = e.offsetX;
                        const y = e.offsetY;

                        this._pointerAction.center = { x, y };
                        this._pointerAction.delta.x = 0;
                        this._pointerAction.delta.y = 0;
                        this._pointerAction.delta.z = direction;
                        this._pointerAction.delta.theta = 0;
                        this._pointerAction.delta.thetaX = 0;
                        this._pointerAction.delta.thetaY = 0;

                        this._onWheel?.(e, this._pointerAction);
                    }

                    // 累積リセット
                    this._accumulatedDelta = 0;
                    this._timer_wheel = null;
                }, this._interval_wheel);
            }
        };
    }
}
