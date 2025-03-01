import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import * as ARCCUBE from 'arcanumcube';
import { PointerControl, type PointerAction } from './pointer.js';
import { SolverMessage } from './solver.js';

export class PointerDelta {
    update!: boolean;
    x!: number;
    y!: number;
    z!: number;
    theta!: number;
    thetaX!: number;
    thetaY!: number;

    constructor() {
        this.clear();
    }

    clear() {
        this.update = false;
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.theta = 0;
        this.thetaX = 0;
        this.thetaY = 0;
    }
}

/** World options */
export type WorldConfig = {
    // basis
    debug: boolean;
    container: HTMLElement | undefined;
    enableRotate: boolean;
    enableZoom: boolean;
    zoomMin: number;
    zoomMax: number;
    zoomSpeed: number;
    rotateSpeed: number;

    // advanced
    clearColor: string;
    ambientLight: boolean;
    ambientColor: string;
    ambientIntensity: number;
    cameraFov: number; // fov: viewing angle
    cameraStartAngleX: number;
    cameraStartAngleY: number;
    cameraEndAngleX: number;
    cameraEndAngleY: number;
    sunLight: boolean;
    sunColor: string;
    sunIntensity: number;
    sunPosition: { x: number; y: number; z: number };
    spotLight: boolean;
    spotColor: string;
    spotIntensity: number;
    spotDistance: number;
    spotPosition: { x: number; y: number; z: number };
    spotHelper: boolean;

    // cube options
    cubeOptions: Partial<ARCCUBE.WebGLArcanumCubeConfig>;
};

/** World class */
export class World {
    private _config: WorldConfig;

    private _initialized: boolean;
    private _twisting: boolean;

    private _scale: number;
    private _lookAt: THREE.Vector3;
    private _zoom: number;
    private _zoomScale: number;

    private _canvas?: HTMLCanvasElement;
    private _renderer?: THREE.WebGLRenderer;
    private _scene?: THREE.Scene;
    private _camera?: THREE.PerspectiveCamera;
    private _loadManager: THREE.LoadingManager;

    private _arccube?: ARCCUBE.WebGLArcanumCube;
    private _arccubes: ARCCUBE.WebGLArcanumCube[];
    private _pointerControl?: PointerControl;
    private _raycaster: THREE.Raycaster;
    private _tweens: TWEEN.Group;
    private _shiftL: boolean;

    private _delta: PointerDelta;

    constructor(opts?: Partial<WorldConfig>) {
        this._initialized = false;
        this._twisting = false;

        this._loadManager = new THREE.LoadingManager();
        this._scale = 1.0;
        this._lookAt = new THREE.Vector3(0, 0, 0);
        this._zoom = 5;
        // 対象に対するカメラの距離調整係数（小さくすると近くなり、大きくすると遠くなる）
        this._zoomScale = 1.2;
        this._delta = new PointerDelta();
        this._raycaster = new THREE.Raycaster();
        this._arccubes = [];
        this._tweens = new TWEEN.Group();
        this._shiftL = false;

        this._config = {
            debug: false,
            container: undefined,
            enableRotate: true,
            enableZoom: true,
            zoomMin: 1.0,
            zoomMax: 8.0,
            zoomSpeed: 0.5,
            rotateSpeed: 1.0,

            clearColor: '#404040',
            ambientLight: true,
            ambientColor: '#ffffff',
            ambientIntensity: 0.1,
            cameraFov: 45,
            cameraStartAngleX: 0,
            cameraStartAngleY: -135,
            cameraEndAngleX: -45,
            cameraEndAngleY: 30,
            sunLight: true,
            sunColor: '#ffffff',
            sunIntensity: 1,
            sunPosition: { x: -16, y: 80, z: 48 },
            spotLight: true,
            spotColor: '#ffffff',
            spotIntensity: 4,
            spotDistance: 64,
            spotPosition: { x: 12, y: 12, z: 6 },
            spotHelper: false,

            cubeOptions: {},
        };

        this.setConfig(opts!);

        if (this._config.container) {
            this.bind(this._config.container);
        }
    }

    setConfig(opts: Partial<WorldConfig>) {
        if (opts) {
            // copy specified parameters
            Object.assign(this._config, opts);
        }
    }

    bind(container: HTMLElement) {
        if (!container) {
            throw new Error('Invalid container');
        }
        this._config.container = container;

        this.setup();
        this.initScene();
        this.resize();
    }

    getArcanumCube() {
        return this._arccube;
    }

    setup() {
        const config = this._config;
        const container = config.container;
        if (!container) return;

        // renderer
        if (!this._renderer) {
            // create renderer
            const r = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true, // enable transparent
            });

            const canvas = r.domElement;
            container.appendChild(canvas);
            canvas.tabIndex = 0; // enable receive key event on canvas element
            canvas.style.outline = 'none';
            canvas.focus();
            this._canvas = canvas;

            r.setClearColor(new THREE.Color(config.clearColor));
            r.shadowMap.enabled = true; // enable shadow
            this._renderer = r;

            window.addEventListener('resize', this.handlerResize());

            // key event
            canvas.addEventListener('keydown', (event) => this._onKeyDown(event));
            canvas.addEventListener('keyup', (event) => this._onKeyUp(event));
        }
    }

    resize() {
        if (!this._renderer) return;
        const r = this._renderer;

        const container = this._config.container;
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const dpr = window.devicePixelRatio;
        r.setSize(width, height);
        r.setPixelRatio(dpr);

        if (this._camera) {
            if (this._camera.constructor === THREE.PerspectiveCamera) {
                this._camera.aspect = width / height;
            }
        }

        this.setFov(this._zoom);
    }

    // 指定した画角でz=0に置かれたCanvasの高さyがちょうど収まる
    // カメラの距離を計算する
    _calcCameraDistance(fov: number, pixels: number): number {
        const rad = (fov / 2) * (Math.PI / 180);
        const distance = pixels / 2 / Math.tan(rad);
        return distance;
    }

    // 指定した画角・ズームレベル・Canvasの高さに合わせてカメラの位置を調整する。
    // カメラの向き、角度は変わらない。
    _calcCameraDistanceByZoom(fov: number, zoom: number, height: number): number {
        // 変更後ズームレベルにおける1pixelあたりのメートル
        const mpp = (this._zoomScale * this._scale) / 2 ** zoom;
        // Canvasの高さで表示可能なメートル
        const mh = height * mpp;
        // targetからのカメラの距離
        const distance = this._calcCameraDistance(fov, mh);

        return distance;
    }

    // カメラの画角を現在の画角設定に戻す。
    // zoomを指定すると、指定したzoomレベルでのCanvasの高さがぴったりカメラに
    // 収まるようにカメラの距離を調整する。
    setFov(zoom?: number) {
        if (!this._camera || this._camera.constructor !== THREE.PerspectiveCamera) {
            return;
        }

        const camera = this._camera;
        const fov = this._config.cameraFov;
        const target = this._lookAt;

        camera.fov = fov;
        camera.updateProjectionMatrix();

        if (zoom != null && zoom > 0 && this._config.container) {
            const eye = camera.position.clone().sub(target).normalize();
            const distance = this._calcCameraDistanceByZoom(
                fov,
                zoom,
                this._config.container.clientHeight,
            );
            eye.setLength(distance);

            camera.position.copy(target).add(eye);
            camera.lookAt(target);
        }
    }

    handlerResize() {
        return () => {
            this.resize();
        };
    }

    initScene() {
        const config = this._config;
        const scale = this._scale;

        // scene
        const scene = new THREE.Scene();
        // scene.background = new THREE.Color(this._clearColor);
        this._scene = scene;

        // camera
        const camera = new THREE.PerspectiveCamera(
            config.cameraFov, // viewing angle (degrees)
            1.0, // aspect ratio
            0.1 * scale, // the shortest distance visible to the camera
            1000 * scale, // the longest distance visible to the camera
        );
        this._camera = camera;
        this._lookAt.y = 0 * scale;
        this._camera.position.copy(this._lookAt).add(new THREE.Vector3(0, 0, 1 * scale));
        this._camera.lookAt(this._lookAt);
        this.setFov(this._zoom);

        // camera control as orbit
        this._pointerControl = new PointerControl({
            container: config.container!,
            enabled: false, // disable until opening tween completes
            enableRotate: config.enableRotate,
            enableZoom: config.enableZoom,
            enableMoveBy2Fingers: false,
            enableZoomBy3Fingers: false,
            onPointerStart: this.handlerPointerStart(),
            onPointerStop: this.handlerPointerStop(),
            onPointerMove: this.handlerPointerMove(),
            onMouseWheel: this.handlerMouseWheel(),
        });

        // ambient light
        if (this._config.ambientLight) {
            const light = new THREE.AmbientLight(config.ambientColor, config.ambientIntensity);
            light.visible = config.ambientLight;
            scene.add(light);
        }

        // sunlight (color, light intensity)
        if (this._config.sunLight) {
            const sunLight = new THREE.DirectionalLight(config.sunColor, config.sunIntensity);
            sunLight.position.set(
                config.sunPosition.x * scale,
                config.sunPosition.y * scale,
                config.sunPosition.z * scale,
            );
            sunLight.castShadow = true;
            scene.add(sunLight);
        }

        // spotlight (color, light intensity, distance, illumination angle, blur level, attenuation rate)
        // default：const spotLight = new THREE.SpotLight(0xffffff, 1, 0, Math.PI / 3, 0, 2);
        if (this._config.spotLight) {
            const spotLight = new THREE.SpotLight(
                config.spotColor,
                config.spotIntensity,
                config.spotDistance * scale,
                Math.PI / 6,
                0.8,
                0.01,
            );
            spotLight.position.set(
                config.spotPosition.x * scale,
                config.spotPosition.y * scale,
                config.spotPosition.z * scale,
            );
            spotLight.target.position.set(0, 0, 0);
            spotLight.castShadow = true; // use as a light source to cast shadows
            scene.add(spotLight);

            // spotlight helper
            if (this._config.spotHelper) {
                const spotLightHelper = new THREE.SpotLightHelper(spotLight);
                spotLightHelper.visible = true;
                scene.add(spotLightHelper);
            }
        }

        /**
        // floor
        const floor1_geometry = new THREE.PlaneGeometry(48 * this._scale, 48 * this._scale, 1, 1);
        const floor1_material = new THREE.MeshLambertMaterial({
            color: 0xc0c0c0,
            side: THREE.DoubleSide,
        });
        const floor1 = new THREE.Mesh(floor1_geometry, floor1_material);
        floor1.rotateX(Math.PI / 2);
        floor1.position.y -= 12;
        floor1.renderOrder = -2; // render first (default 0)
        floor1.receiveShadow = true; // receive a shadow
        scene.add(floor1);
        */

        // add Arcanum Cube object (meshes or groups)
        const envMapTextureEquirectangular = new THREE.TextureLoader(this._loadManager).load(
            'img/comfy_cafe_4k.png',
        );
        envMapTextureEquirectangular.mapping = THREE.EquirectangularReflectionMapping;
        envMapTextureEquirectangular.magFilter = THREE.LinearFilter;
        envMapTextureEquirectangular.minFilter = THREE.LinearMipMapLinearFilter;

        (async () => {
            const opts: Partial<ARCCUBE.WebGLArcanumCubeConfig> = Object.assign(
                {
                    debug: this._config.debug,
                    scale: scale,
                    enableShadow: true,
                    showSelectedCube: false,
                    showTwistGroup: false,
                    skin: ARCCUBE.DefaultSkin,
                    envMap: envMapTextureEquirectangular,
                    enableCoreLight: false,
                    wireframe: false,
                    twistOptions: {},
                },
                this._config.cubeOptions,
            );

            const arccube = new ARCCUBE.WebGLArcanumCube(opts);
            arccube.init().then(() => {
                const arccubeGroup = arccube.getGroup();
                arccubeGroup.position.copy(this._lookAt);
                scene.add(arccubeGroup);
                this._arccube = arccube;
                this._arccubes.push(arccube);
            });

            // load texture
            // const sleep = (time: number) => new Promise<void>((r) => setTimeout(r, time));
            this._loadManager.onLoad = () => {
                this._initialized = true;
            };
        })();
    }

    draw() {
        if (!this._renderer || !this._camera) return;
        const renderer = this._renderer;
        const camera = this._camera;
        const clock = new THREE.Clock();

        let opened = false;
        let delta;

        // prepare camera moving
        const distance = this._calcCameraDistanceByZoom(
            this._config.cameraFov,
            this._zoom,
            this._config.container!.clientHeight,
        );
        const origin = new THREE.Vector3().copy(camera.position);
        const qa = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
                (this._config.cameraStartAngleX * Math.PI) / 180,
                (this._config.cameraStartAngleY * Math.PI) / 180,
                0,
                'XYZ',
            ),
        );
        const qb = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
                (this._config.cameraEndAngleX * Math.PI) / 180,
                (this._config.cameraEndAngleY * Math.PI) / 180,
                0,
                'XYZ',
            ),
        );
        const params = { t: 0, distance: distance * 3 };

        const moveCamera = () => {
            const q = new THREE.Quaternion().slerpQuaternions(qa, qb, params.t);
            camera.position.copy(origin).sub(this._lookAt).normalize().setLength(params.distance);
            camera.position.applyQuaternion(q).add(this._lookAt);
            camera.lookAt(this._lookAt);
        };

        renderer.setAnimationLoop((time) => {
            if (!this._initialized) return;

            if (!opened) {
                opened = true;

                // set camera at inital position
                moveCamera();

                // オープニングイージング
                const tween = new TWEEN.Tween(params)
                    .to({ t: 1, distance }, 1500)
                    .easing(TWEEN.Easing.Quartic.Out) // graph: https://sbcode.net/threejs/tween/
                    .onUpdate(moveCamera)
                    .onComplete(() => {
                        if (this._pointerControl) {
                            this._pointerControl.enable();
                        }
                    })
                    .start();
                this._tweens.add(tween);
            }

            // update scene objects
            this.update();

            // tween
            this._tweens.update(time);
            for (const c of this._arccubes) {
                c.update();
            }

            // render
            renderer.render(this._scene!, camera);
        });
    }

    private _createMeshWithNewMaterials(
        mesh: THREE.Mesh,
        materials: Record<string, THREE.Material>,
    ) {
        const _setMeshData = (child: THREE.Object3D, parent?: THREE.Mesh) => {
            let m: THREE.Mesh | undefined = undefined;
            if (child instanceof THREE.Mesh) {
                const material =
                    child.name in materials ? materials[child.name] : materials['default'];
                const geometory = child.geometry;
                m = new THREE.Mesh(geometory, material);
                m.applyMatrix4(child.matrix);
                if (parent) {
                    parent.add(m);
                }

                for (const c of child.children) {
                    _setMeshData(c, m);
                }
            }
            return m;
        };

        return _setMeshData(mesh);
    }

    // ズーム倍率を設定する
    setZoom(zoom?: number) {
        if (zoom != null) {
            if (zoom < this._config.zoomMin) zoom = this._config.zoomMin;
            if (zoom > this._config.zoomMax) zoom = this._config.zoomMax;
            this._zoom = zoom;
        }
        return zoom;
    }

    update() {
        if (!this._config.container || !this._camera) return;
        const container = this._config.container;

        if (!this._delta.update) return;

        // select camera
        const camera = this._camera;
        const target = this._lookAt;

        if (!this._arccube) {
            // camera rotation
            const moving = new THREE.Vector2(
                (2 * Math.PI * this._delta.x) / container.clientWidth,
                (2 * Math.PI * this._delta.y) / container.clientHeight,
            );
            let angle = moving.length();
            let rad = this._delta.theta;

            // trackball
            const eye = camera.position.clone().sub(target);
            const quaternion = new THREE.Quaternion();
            const quaternionZ = new THREE.Quaternion();

            if (rad != 0) {
                // rotate the camera around the line of sight
                const axis = eye.clone().normalize();
                rad *= this._config.rotateSpeed * 2.0;
                quaternionZ.setFromAxisAngle(axis, rad);

                eye.applyQuaternion(quaternionZ);
                camera.up.applyQuaternion(quaternionZ);
            }
            if (angle > 0) {
                // rotate around x and y axis
                const eyeDirection = new THREE.Vector3().copy(eye).normalize();
                const objectUpDirection = camera.up.clone().normalize();
                const objectSidewaysDirection = new THREE.Vector3()
                    .crossVectors(objectUpDirection, eyeDirection)
                    .normalize();

                objectUpDirection.setLength(-moving.y);
                objectSidewaysDirection.setLength(moving.x);

                const moveDirection = new THREE.Vector3().copy(
                    objectUpDirection.add(objectSidewaysDirection),
                );

                const axis = new THREE.Vector3().crossVectors(moveDirection, eye).normalize();

                // update axis mesh objects
                //this._updateAxisObject(axis);

                angle *= this._config.rotateSpeed * 2.0;
                quaternion.setFromAxisAngle(axis, angle);

                eye.applyQuaternion(quaternion);
                camera.up.applyQuaternion(quaternion);
            }

            // camera zooming
            if (this._config.enableZoom) {
                this.setZoom(this._zoom + this._delta.z);
            }

            camera.position.copy(target).add(eye);
            camera.lookAt(target);
            this.setFov(this._zoom);

            this._delta.clear();
        } else if (!this._twisting) {
            if (!this._arccube) throw new Error('No selected cube.');
            const arccube = this._arccube;

            // selected cube rotation
            const moving = new THREE.Vector2(
                (2 * Math.PI * -this._delta.x) / container.clientWidth,
                (2 * Math.PI * -this._delta.y) / container.clientHeight,
            );
            let angle = moving.length();
            let rad = -this._delta.theta;

            // trackball
            const eye = camera.position.clone().sub(target);
            const quaternion = new THREE.Quaternion();
            const quaternionZ = new THREE.Quaternion();

            let cubeQuat = new THREE.Quaternion();

            if (rad != 0) {
                // rotate the cube around the line of sight
                const axis = eye.clone().normalize();
                rad *= this._config.rotateSpeed * 2.0;
                quaternionZ.setFromAxisAngle(axis, rad);

                cubeQuat = cubeQuat.multiply(quaternionZ);
            }
            if (angle > 0) {
                // rotate around x and y axis
                const eyeDirection = new THREE.Vector3().copy(eye).normalize();
                const objectUpDirection = camera.up.clone().normalize();
                const objectSidewaysDirection = new THREE.Vector3()
                    .crossVectors(objectUpDirection, eyeDirection)
                    .normalize();

                objectUpDirection.setLength(-moving.y);
                objectSidewaysDirection.setLength(moving.x);

                const moveDirection = new THREE.Vector3().copy(
                    objectUpDirection.add(objectSidewaysDirection),
                );

                const axis = new THREE.Vector3().crossVectors(moveDirection, eye).normalize();

                // update axis mesh objects
                //this._updateAxisObject(axis);

                angle *= this._config.rotateSpeed * 2.0;
                quaternion.setFromAxisAngle(axis, angle);

                cubeQuat = cubeQuat.multiply(quaternion);
            }

            // camera zooming
            if (this._config.enableZoom) {
                this.setZoom(this._zoom + this._delta.z);
            }

            arccube.getGroup().applyQuaternion(cubeQuat);
            this.setFov(this._zoom);

            this._delta.clear();
        }
    }

    handlerPointerStart() {
        return (event: PointerEvent, pointerAction: PointerAction) => {
            this._checkRaycast(event);
            this._drag(event, pointerAction);
        };
    }

    handlerPointerStop() {
        return (event: PointerEvent, pointerAction: PointerAction) => {
            if (this._pointerControl) this._pointerControl.enableRotate = true;
            this._arccube && this._arccube.deselectSticker();
            this._dragEnd(event, pointerAction);
        };
    }

    handlerPointerMove() {
        return (event: PointerEvent, pointerAction: PointerAction) => {
            this._calc(pointerAction, this._config.zoomSpeed);
            this._drag(event, pointerAction);
        };
    }

    handlerMouseWheel() {
        return (event: WheelEvent, pa: PointerAction) => {
            this._calc(pa, this._config.zoomSpeed);
        };
    }

    _calc(pa: PointerAction, speed: number) {
        // calcurate zoom
        if (this._config.enableZoom) {
            let z = this._delta.z;
            if (pa.pointersNum > 1) {
                // multi-touch
                if (pa.delta.z > 1) {
                    z += -0.1 * speed;
                    //if (z < this.zoomMin) z = this.zoomMin;
                    if (z < -2) z = -2;
                } else if (pa.delta.z < 1 && pa.delta.z > 0) {
                    z += 0.1 * speed;
                    //if (z > this.zoomMax) z = this.zoomMax;
                    if (z > 2) z = 2;
                }
            } else {
                // sigle-touch
                if (pa.delta.z > 0) {
                    z += -0.1 * speed;
                    //if (z < this.zoomMin) z = this.zoomMin;
                    if (z < -2) z = -2;
                } else if (pa.delta.z < 0) {
                    z += 0.1 * speed;
                    //if (z > this.zoomMax) z = this.zoomMax;
                    if (z > 2) z = 2;
                }
            }
            this._delta.z = z;
            this._delta.update = true;
        }

        if (pa.pointersNum !== 2) {
            // set rotate
            let theta = this._delta.theta + pa.delta.theta;
            if (theta > Math.PI * 2) theta = theta - Math.PI * 2;
            if (theta < -Math.PI * 2) theta = theta + Math.PI * 2;
            this._delta.theta = theta;
            this._delta.update = true;
        }
        if (pa.pointersNum !== 3) {
            // stack moving
            this._delta.x += pa.delta.x;
            this._delta.y += pa.delta.y;
            this._delta.update = true;
        }
    }

    private _checkRaycast(event: PointerEvent) {
        const element = <HTMLCanvasElement>event.currentTarget;
        const w = element.clientWidth;
        const h = element.clientHeight;
        const x = event.offsetX;
        const y = event.offsetY;

        const cursor = new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1);

        if (!this._camera) return;

        // select the front object among the objects pointed to by raycast.
        // Otherwise return to normal.
        this._raycaster.setFromCamera(cursor, this._camera);

        let arccube;
        const cubes = this._arccubes.map((c) => c.getGroup());
        const intersects = this._raycaster.intersectObjects(cubes, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;

            // search selected cube object
            while (true) {
                if (obj instanceof THREE.Mesh) {
                    obj = <THREE.Group>obj.parent;
                } else if (obj instanceof THREE.Group) {
                    if (obj.parent instanceof THREE.Scene) {
                        // loop end
                        break;
                    } else if (obj.parent instanceof THREE.Group) {
                        obj = obj.parent;
                    } else {
                        // other object
                        break;
                    }
                } else {
                    // not found group
                    break;
                }
            }

            if (!obj) throw new Error('No available object group');

            arccube = this._arccubes.find((c) => {
                return c.getGroup() === obj;
            });
        }

        // hide outlines previous selected cube
        if (this._arccube) {
            if (arccube) {
                // clear selection
                this._arccube.deselectCube();
                this._arccube.deselectSticker();
            }
        }

        // select new cube
        if (arccube) {
            // set new cube
            this._arccube = arccube;

            const cubeObjects = arccube.getCubeObjectList();
            const intersects = this._raycaster.intersectObjects(cubeObjects, true);

            if (intersects.length > 0) {
                const obj = intersects[0].object;
                // show outline of selected cube
                const cube = arccube.getCubeFromObject(obj);
                arccube.selectCube(cube);
                arccube.selectSticker(obj);
                this._twisting = true;
            }
        }
    }

    private _drag(event: PointerEvent, pointerAction: PointerAction) {
        if (!this._canvas || !this._camera || !this._pointerControl) return;

        // from here on, the twisting process
        if (!this._twisting) return;

        const pointer_list = Object.values(pointerAction.pointers);
        if (pointerAction.pointersNum === 1) {
            if (!this._arccube) return;
            const arccube = this._arccube;

            // dragging cube
            const movement = new THREE.Vector2(
                this._delta.x / this._canvas.clientWidth,
                -this._delta.y / this._canvas.clientHeight,
            );
            const m = movement.clone().normalize();

            const cube = arccube.selectedCube();
            if (!cube) return;
            const sticker = arccube.selectedSticker();
            if (!sticker) return;

            const { x, y, z } = cube.position;
            const list = arccube.getMovementList(sticker, [x, y, z]);

            let dir = undefined;
            let tmp = -1;
            for (const item of list) {
                const n = item.normal;
                // convert the rotation direction (position vector) to the movement seen from the camera.
                const v = new THREE.Vector3(n[0], n[1], n[2])
                    // add rotation to the cube itself
                    .applyQuaternion(arccube.getGroup().quaternion)
                    // bring the starting point of the vector to the center of the viewpoint for correct calculation later in project()
                    .add(this._lookAt)
                    // calculate the amount of movement on the screen from a vector
                    .project(this._camera);
                const v2 = new THREE.Vector2(v.x, v.y).normalize();
                const vdot = v2.dot(m); // calculate vector dot product
                if (tmp < vdot) {
                    dir = item;
                    tmp = vdot;
                }
            }

            // dragging
            if (dir) {
                const rad = movement.length() * 3; // adjust to your liking to dragging
                arccube.dragTwist(dir.twist, rad);
            }
        } else {
            // enable zooming and rotation
            this._twisting = false;
            this._pointerControl.enableRotate = true;
        }
    }

    private _dragEnd(event: PointerEvent, pointerAction: PointerAction) {
        this._arccube && this._arccube.dragTwistEnd();
        this._delta.clear();
        this._twisting = false;
    }

    private _deselect() {
        if (this._arccube) {
            this._arccube.deselectCube();
            this._arccube.deselectSticker();
        }
        this._arccube = undefined;
    }

    private _onKeyDown(event: KeyboardEvent) {
        const keyMap: Record<string, () => void> = {
            ShiftLeft: () => {
                this._shiftL = true;
            },
            KeyU: () => {
                const twist = this._shiftL ? ARCCUBE.TWIST.UR : ARCCUBE.TWIST.U;
                this._arccube && this._arccube.easingTwist(twist);
            },
            KeyD: () => {
                const twist = this._shiftL ? ARCCUBE.TWIST.DR : ARCCUBE.TWIST.D;
                this._arccube && this._arccube.easingTwist(twist);
            },
            KeyF: () => {
                const twist = this._shiftL ? ARCCUBE.TWIST.FR : ARCCUBE.TWIST.F;
                this._arccube && this._arccube.easingTwist(twist);
            },
            KeyB: () => {
                const twist = this._shiftL ? ARCCUBE.TWIST.BR : ARCCUBE.TWIST.B;
                this._arccube && this._arccube.easingTwist(twist);
            },
            KeyR: () => {
                const twist = this._shiftL ? ARCCUBE.TWIST.RR : ARCCUBE.TWIST.R;
                this._arccube && this._arccube.easingTwist(twist);
            },
            KeyL: () => {
                const twist = this._shiftL ? ARCCUBE.TWIST.LR : ARCCUBE.TWIST.L;
                this._arccube && this._arccube.easingTwist(twist);
            },
            KeyM: () => {
                const twist = this._shiftL ? ARCCUBE.TWIST.MR : ARCCUBE.TWIST.M;
                this._arccube && this._arccube.easingTwist(twist);
            },
            KeyE: () => {
                const twist = this._shiftL ? ARCCUBE.TWIST.ER : ARCCUBE.TWIST.E;
                this._arccube && this._arccube.easingTwist(twist);
            },
            KeyS: () => {
                const twist = this._shiftL ? ARCCUBE.TWIST.SR : ARCCUBE.TWIST.S;
                this._arccube && this._arccube.easingTwist(twist);
            },
            KeyZ: () => {
                this._arccube && this._arccube.undo();
            },
            Digit0: () => {
                this._arccube && this._arccube.reset();
            },
            Digit1: () => {
                this._arccube && this._arccube.scramble();
            },
            Digit2: () => {
                this._arccube && this._arccube.scramble(10);
            },
            Digit3: () => {
                this._arccube && this._arccube.scramble(20);
            },
            Digit4: () => {
                this._arccube && this._arccube.scramble(30);
            },
            Space: () => {
                this._upsideDownCamera();
            },
            Escape: () => {
                // this._deselect();
            },
        };

        // console.log(event.code);
        const func = keyMap[event.code];
        if (func) func();
    }

    private _onKeyUp(event: KeyboardEvent) {
        if (event.code === 'ShiftLeft') {
            this._shiftL = false;
            return;
        }
    }

    // put the camera upside down
    private _upsideDownCamera() {
        if (!this._camera) return;

        const camera = this._camera;

        const eye = this._camera.position.clone().sub(this._lookAt);
        eye.normalize();
        const qa = this._camera.quaternion.clone(); // start
        const qb = new THREE.Quaternion().setFromAxisAngle(eye, Math.PI).multiply(qa); // end

        const params = { t: 0 };
        const tween = new TWEEN.Tween(params)
            .to({ t: 1 }, 500)
            .easing(TWEEN.Easing.Quartic.Out)
            .onUpdate(() => {
                camera.quaternion.slerpQuaternions(qa, qb, params.t);
            })
            .onComplete(() => {
                // process when tween is finished
                // If you just rotate the camera, up will return to its
                // original state when lookAt() is executed, so use
                // negate() to reverse the up vector.
                camera.up.negate();
            })
            .start();
        this._tweens.add(tween);
    }

    // call a web worker to prevent the browser from freezing during solving.
    solve(opts: {
        onSolved: (answer: ARCCUBE.Twist[]) => void;
        onProgress?: (distance: number) => void;
        onError?: (error: ErrorEvent) => void;
    }) {
        if (!this._arccube || this._arccube.isTwisting()) return;
        const arccube = this._arccube;

        arccube.lockTwist(true);

        const solver = new Worker('solver.js');

        solver.postMessage({ stickers: arccube.getStickerColors() });
        solver.onmessage = function (event) {
            const msg = <SolverMessage>event.data;
            if (msg.distance === -1) {
                arccube.lockTwist(false);
                opts.onSolved(msg.answer || []);
            } else {
                opts.onProgress && opts.onProgress(msg.distance);
            }
        };

        // error handling
        solver.onerror = function (error) {
            arccube.lockTwist(false);
            opts.onError && opts.onError(error);
        };
    }
}
