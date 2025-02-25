export class Vector2 {
    x: number;
    y: number;

    constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }

    clone() {
        return new Vector2(this.x, this.y);
    }

    add(obj: number | Vector2) {
        if (obj instanceof Vector2) {
            this.x += obj.x;
            this.y += obj.y;
        } else {
            this.x += obj;
            this.y += obj;
        }
        return this;
    }

    sub(obj: number | Vector2) {
        if (obj instanceof Vector2) {
            this.x -= obj.x;
            this.y -= obj.y;
        } else {
            this.x -= obj;
            this.y -= obj;
        }
        return this;
    }

    mul(obj: number) {
        this.x *= obj;
        this.y *= obj;
        return this;
    }

    div(obj: number) {
        this.x /= obj;
        this.y /= obj;
        return this;
    }

    // compatible to THREE.js
    divideScalar(obj: number) {
        return this.div(obj);
    }

    dot(vec: Vector2) {
        return this.x * vec.x + this.y * vec.y;
    }

    cross(vec: Vector2) {
        return this.x * vec.y - this.y * vec.x;
    }

    lengthSq() {
        return this.x ** 2 + this.y ** 2;
    }

    distanceTo(vec: Vector2) {
        const v = vec.clone().sub(this);
        return Math.sqrt(v.lengthSq());
    }

    angleTo(vec: Vector2) {
        const denominator = Math.sqrt(this.lengthSq() * vec.lengthSq());

        if (denominator === 0) throw new Error("angleTo() can't handle zero length vectors.");

        let theta = this.dot(vec) / denominator;
        if (theta < -1) theta = -1;
        if (theta > 1) theta = 1;

        return Math.acos(theta);
    }

    translate(x: number, y: number) {
        this.x += x;
        this.y += y;
        return this;
    }

    rotate(rad: number) {
        const x = Math.cos(rad) * this.x - Math.sin(rad) * this.y;
        const y = Math.sin(rad) * this.x + Math.cos(rad) * this.y;
        this.x = x;
        this.y = y;
        return this;
    }
}

// add vector3
function add(dst: number[], src: number[]) {
    dst[0] += src[0];
    dst[1] += src[1];
    dst[2] += src[2];
}

// normalize vector3
export function normalize(arr: number[]) {
    const length = Math.sqrt(arr[0] * arr[0] + arr[1] * arr[1] + arr[2] * arr[2]);
    if (length === 0) {
        return [0, 0, 0];
    }

    return [arr[0] / length, arr[1] / length, arr[2] / length];
}

// calculate cross vector3
export function faceNormal(v0: number[], v1: number[], v2: number[]) {
    const n: number[] = [];

    const vec1: number[] = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const vec2: number[] = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

    // cross
    n[0] = vec1[1] * vec2[2] - vec1[2] * vec2[1];
    n[1] = vec1[2] * vec2[0] - vec1[0] * vec2[2];
    n[2] = vec1[0] * vec2[1] - vec1[1] * vec2[0];

    return normalize(n);
}

// calcurate normals by CPU
export function makeVertexNormalArray(verts: number[][], indices: number[][]): number[][] {
    const normals: number[][] = [...Array(verts.length).fill([0, 0, 0])];

    for (let i = 0; i < indices.length; i++) {
        const j0 = indices[i][0];
        const j1 = indices[i][1];
        const j2 = indices[i][2];
        const fn = faceNormal(verts[j2], verts[j0], verts[j1]);
        add(normals[j0], fn);
        add(normals[j1], fn);
        add(normals[j2], fn);
        normals[j0] = normalize(normals[j0]);
        normals[j1] = normalize(normals[j1]);
        normals[j2] = normalize(normals[j2]);
    }

    return normals;
}
