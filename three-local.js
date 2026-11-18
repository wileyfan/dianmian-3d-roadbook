/**
 * 零外网依赖、兼容原生 Three.js 核心 API 的轻量级 WebGL 3D 地形沙盘引擎 (three-local.js)
 * 完全脱机运行，彻底解决内网/受限网络下 CDN 超时导致页面脚本阻断的问题。
 * 暴露全局 window.THREE、window.OrbitControls、window.CSS2DRenderer、window.CSS2DObject。
 */
(function (global) {
  'use strict';

  // ========== 1. 基础数学库 (Vector2, Vector3, Color, Matrix4, Ray) ==========
  class Vector2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    set(x, y) {
      this.x = x;
      this.y = y;
      return this;
    }
  }

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    add(v) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
    sub(v) {
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      return this;
    }
    subVectors(a, b) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      this.z = a.z - b.z;
      return this;
    }
    addScaledVector(v, s) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    }
    multiplyScalar(s) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }
    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    crossVectors(a, b) {
      const ax = a.x, ay = a.y, az = a.z;
      const bx = b.x, by = b.y, bz = b.z;
      this.x = ay * bz - az * by;
      this.y = az * bx - ax * bz;
      this.z = ax * by - ay * bx;
      return this;
    }
    lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z;
    }
    length() {
      return Math.sqrt(this.lengthSq());
    }
    distanceTo(v) {
      return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
    }
    normalize() {
      const len = this.length();
      if (len > 1e-10) {
        this.x /= len;
        this.y /= len;
        this.z /= len;
      }
      return this;
    }
    lerp(v, t) {
      this.x += (v.x - this.x) * t;
      this.y += (v.y - this.y) * t;
      this.z += (v.z - this.z) * t;
      return this;
    }
    lerpVectors(a, b, t) {
      this.x = a.x + (b.x - a.x) * t;
      this.y = a.y + (b.y - a.y) * t;
      this.z = a.z + (b.z - a.z) * t;
      return this;
    }
    applyMatrix4(m) {
      const e = m.elements;
      const x = this.x, y = this.y, z = this.z;
      const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15] || 1);
      this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
      this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      return this;
    }
  }

  class Color {
    constructor(val) {
      this.r = 1;
      this.g = 1;
      this.b = 1;
      if (val !== undefined) this.set(val);
    }
    set(val) {
      if (val instanceof Color) {
        this.r = val.r;
        this.g = val.g;
        this.b = val.b;
        return this;
      }
      if (typeof val === 'number') {
        this.r = ((val >> 16) & 255) / 255;
        this.g = ((val >> 8) & 255) / 255;
        this.b = (val & 255) / 255;
        return this;
      }
      if (typeof val === 'string') {
        const s = val.trim();
        if (s.startsWith('#')) {
          const hex = s.length === 4
            ? parseInt(s[1] + s[1] + s[2] + s[2] + s[3] + s[3], 16)
            : parseInt(s.slice(1), 16);
          return this.set(hex);
        }
      }
      return this;
    }
    toArray() {
      return [this.r, this.g, this.b];
    }
  }

  class Matrix4 {
    constructor() {
      this.elements = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]);
    }
    identity() {
      const e = this.elements;
      e.fill(0);
      e[0] = e[5] = e[10] = e[15] = 1;
      return this;
    }
    copy(m) {
      this.elements.set(m.elements);
      return this;
    }
    clone() {
      return new Matrix4().copy(this);
    }
    multiplyMatrices(a, b) {
      const ae = a.elements, be = b.elements, te = this.elements;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          te[col * 4 + row] =
            ae[0 * 4 + row] * be[col * 4 + 0] +
            ae[1 * 4 + row] * be[col * 4 + 1] +
            ae[2 * 4 + row] * be[col * 4 + 2] +
            ae[3 * 4 + row] * be[col * 4 + 3];
        }
      }
      return this;
    }
    makePerspective(fovDeg, aspect, near, far) {
      const e = this.elements;
      const f = 1.0 / Math.tan((fovDeg * Math.PI) / 360);
      const nf = 1 / (near - far);
      e[0] = f / aspect; e[4] = 0; e[8] = 0; e[12] = 0;
      e[1] = 0; e[5] = f; e[9] = 0; e[13] = 0;
      e[2] = 0; e[6] = 0; e[10] = (far + near) * nf; e[14] = 2 * far * near * nf;
      e[3] = 0; e[7] = 0; e[11] = -1; e[15] = 0;
      return this;
    }
    lookAt(eye, target, up) {
      const z = new Vector3().subVectors(eye, target);
      if (z.lengthSq() === 0) z.z = 1;
      z.normalize();
      const x = new Vector3().crossVectors(up, z);
      if (x.lengthSq() === 0) {
        z.z += 0.0001;
        x.crossVectors(up, z);
      }
      x.normalize();
      const y = new Vector3().crossVectors(z, x);

      const e = this.elements;
      e[0] = x.x; e[4] = y.x; e[8] = z.x; e[12] = 0;
      e[1] = x.y; e[5] = y.y; e[9] = z.y; e[13] = 0;
      e[2] = x.z; e[6] = y.z; e[10] = z.z; e[14] = 0;
      e[3] = 0;   e[7] = 0;   e[11] = 0;   e[15] = 1;
      return this;
    }
    invert() {
      const m = this.elements;
      const out = new Float32Array(16);
      out[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
      out[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
      out[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
      out[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
      out[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
      out[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
      out[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
      out[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
      out[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
      out[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
      out[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
      out[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
      out[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
      out[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
      out[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
      out[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
      let det = m[0] * out[0] + m[1] * out[4] + m[2] * out[8] + m[3] * out[12];
      if (!det) return this.identity();
      det = 1 / det;
      for (let i = 0; i < 16; i++) m[i] = out[i] * det;
      return this;
    }
    compose(pos, rotMat, scale) {
      const e = this.elements;
      const re = rotMat.elements;
      e[0] = re[0] * scale.x; e[1] = re[1] * scale.x; e[2] = re[2] * scale.x; e[3] = 0;
      e[4] = re[4] * scale.y; e[5] = re[5] * scale.y; e[6] = re[6] * scale.y; e[7] = 0;
      e[8] = re[8] * scale.z; e[9] = re[9] * scale.z; e[10] = re[10] * scale.z; e[11] = 0;
      e[12] = pos.x; e[13] = pos.y; e[14] = pos.z; e[15] = 1;
      return this;
    }
  }

  // ========== 2. 三次样条曲线 (CatmullRomCurve3) ==========
  class CatmullRomCurve3 {
    constructor(points = [], closed = false, curveType = 'catmullrom', tension = 0.5) {
      this.points = points;
      this.closed = closed;
      this.curveType = curveType;
      this.tension = tension;
    }
    getPoint(t) {
      const pts = this.points;
      const l = pts.length;
      if (l === 0) return new Vector3();
      if (l === 1) return pts[0].clone();
      const p = (l - 1) * Math.max(0, Math.min(1, t));
      const intPoint = Math.floor(p);
      const weight = p - intPoint;
      const p0 = pts[Math.max(0, intPoint - 1)];
      const p1 = pts[intPoint];
      const p2 = pts[Math.min(l - 1, intPoint + 1)];
      const p3 = pts[Math.min(l - 1, intPoint + 2)];

      const t2 = weight * weight;
      const t3 = t2 * weight;
      const s = this.tension;

      const interp = (a, b, c, d) => {
        const m1 = (c - a) * s;
        const m2 = (d - b) * s;
        return (
          (2 * t3 - 3 * t2 + 1) * b +
          (t3 - 2 * t2 + weight) * m1 +
          (-2 * t3 + 3 * t2) * c +
          (t3 - t2) * m2
        );
      };
      return new Vector3(
        interp(p0.x, p1.x, p2.x, p3.x),
        interp(p0.y, p1.y, p2.y, p3.y),
        interp(p0.z, p1.z, p2.z, p3.z)
      );
    }
    getPoints(divisions = 50) {
      const pts = [];
      for (let i = 0; i <= divisions; i++) {
        pts.push(this.getPoint(i / divisions));
      }
      return pts;
    }
    getTangent(t) {
      const delta = 0.0005;
      const t1 = Math.max(0, t - delta);
      const t2 = Math.min(1, t + delta);
      const pt1 = this.getPoint(t1);
      const pt2 = this.getPoint(t2);
      return pt2.sub(pt1).normalize();
    }
  }

  // ========== 3. 属性与几何体生成 (BufferGeometry & 常用立体几何) ==========
  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = Math.floor(array.length / itemSize);
      this.needsUpdate = true;
    }
    getX(i) { return this.array[i * this.itemSize]; }
    getY(i) { return this.array[i * this.itemSize + 1]; }
    getZ(i) { return this.array[i * this.itemSize + 2]; }
    setY(i, v) { this.array[i * this.itemSize + 1] = v; }
    setXYZ(i, x, y, z) {
      const o = i * this.itemSize;
      this.array[o] = x;
      this.array[o + 1] = y;
      this.array[o + 2] = z;
    }
  }

  class BufferGeometry {
    constructor() {
      this.attributes = {};
      this.index = null;
      this.boundingRadius = 1;
      this._glBuffers = null;
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
      this._updateBounds();
      return this;
    }
    setIndex(idxArray) {
      this.index = Array.isArray(idxArray)
        ? new BufferAttribute(idxArray.length > 65535 ? new Uint32Array(idxArray) : new Uint16Array(idxArray), 1)
        : idxArray;
      return this;
    }
    _updateBounds() {
      const pos = this.attributes.position;
      if (!pos) return;
      let maxR2 = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const r2 = x * x + y * y + z * z;
        if (r2 > maxR2) maxR2 = r2;
      }
      this.boundingRadius = Math.sqrt(maxR2) || 1;
    }
    rotateX(angle) {
      const c = Math.cos(angle), s = Math.sin(angle);
      const pos = this.attributes.position;
      if (pos) {
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i), z = pos.getZ(i);
          pos.setXYZ(i, pos.getX(i), y * c - z * s, y * s + z * c);
        }
        pos.needsUpdate = true;
      }
      const norm = this.attributes.normal;
      if (norm) {
        for (let i = 0; i < norm.count; i++) {
          const y = norm.getY(i), z = norm.getZ(i);
          norm.setXYZ(i, norm.getX(i), y * c - z * s, y * s + z * c);
        }
        norm.needsUpdate = true;
      }
      this._updateBounds();
      return this;
    }
    setFromPoints(pts) {
      const arr = new Float32Array(pts.length * 3);
      for (let i = 0; i < pts.length; i++) {
        arr[i * 3] = pts[i].x;
        arr[i * 3 + 1] = pts[i].y;
        arr[i * 3 + 2] = pts[i].z;
      }
      this.setAttribute('position', new BufferAttribute(arr, 3));
      const dist = new Float32Array(pts.length);
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        acc += pts[i].distanceTo(pts[i - 1]);
        dist[i] = acc;
      }
      this.setAttribute('lineDistance', new BufferAttribute(dist, 1));
      return this;
    }
    computeVertexNormals() {
      const pos = this.attributes.position;
      if (!pos) return;
      const norms = new Float32Array(pos.count * 3);
      const a = new Vector3(), b = new Vector3(), c = new Vector3();
      const cb = new Vector3(), ab = new Vector3();
      const addTri = (ia, ib, ic) => {
        a.set(pos.getX(ia), pos.getY(ia), pos.getZ(ia));
        b.set(pos.getX(ib), pos.getY(ib), pos.getZ(ib));
        c.set(pos.getX(ic), pos.getY(ic), pos.getZ(ic));
        cb.subVectors(c, b);
        ab.subVectors(a, b);
        cb.crossVectors(cb, ab);
        norms[ia * 3] += cb.x; norms[ia * 3 + 1] += cb.y; norms[ia * 3 + 2] += cb.z;
        norms[ib * 3] += cb.x; norms[ib * 3 + 1] += cb.y; norms[ib * 3 + 2] += cb.z;
        norms[ic * 3] += cb.x; norms[ic * 3 + 1] += cb.y; norms[ic * 3 + 2] += cb.z;
      };
      if (this.index) {
        const idx = this.index.array;
        for (let i = 0; i < idx.length; i += 3) addTri(idx[i], idx[i + 1], idx[i + 2]);
      } else {
        for (let i = 0; i < pos.count; i += 3) addTri(i, i + 1, i + 2);
      }
      for (let i = 0; i < pos.count; i++) {
        const x = norms[i * 3], y = norms[i * 3 + 1], z = norms[i * 3 + 2];
        const l = Math.hypot(x, y, z) || 1;
        norms[i * 3] = x / l; norms[i * 3 + 1] = y / l; norms[i * 3 + 2] = z / l;
      }
      this.setAttribute('normal', new BufferAttribute(norms, 3));
    }
    dispose() {
      this._glBuffers = null;
    }
  }

  class PlaneGeometry extends BufferGeometry {
    constructor(width = 1, height = 1, widthSegments = 1, heightSegments = 1) {
      super();
      const gridX = Math.floor(widthSegments);
      const gridY = Math.floor(heightSegments);
      const gridX1 = gridX + 1;
      const gridY1 = gridY + 1;
      const segW = width / gridX;
      const segH = height / gridY;

      const positions = new Float32Array(gridX1 * gridY1 * 3);
      const normals = new Float32Array(gridX1 * gridY1 * 3);
      const uvs = new Float32Array(gridX1 * gridY1 * 2);
      const indices = [];

      let k = 0, uvK = 0;
      for (let iy = 0; iy < gridY1; iy++) {
        const y = iy * segH - height / 2;
        for (let ix = 0; ix < gridX1; ix++) {
          const x = ix * segW - width / 2;
          positions[k] = x;
          positions[k + 1] = -y; // rotateX(-PI/2) 后 -y 变为 -z（北），+y 变为 +z（南），与 DEM 矩阵 row=0 北方严格匹配
          positions[k + 2] = 0;
          normals[k] = 0; normals[k + 1] = 0; normals[k + 2] = 1;
          uvs[uvK] = ix / gridX;
          uvs[uvK + 1] = 1 - iy / gridY; // v=1 为北，v=0 为南
          k += 3;
          uvK += 2;
        }
      }
      for (let iy = 0; iy < gridY; iy++) {
        for (let ix = 0; ix < gridX; ix++) {
          const a = ix + gridX1 * iy;
          const b = ix + gridX1 * (iy + 1);
          const c = ix + 1 + gridX1 * (iy + 1);
          const d = ix + 1 + gridX1 * iy;
          indices.push(a, b, d, b, c, d);
        }
      }
      this.setAttribute('position', new BufferAttribute(positions, 3));
      this.setAttribute('normal', new BufferAttribute(normals, 3));
      this.setAttribute('uv', new BufferAttribute(uvs, 2));
      this.setIndex(indices);
    }
  }

  class BoxGeometry extends BufferGeometry {
    constructor(w = 1, h = 1, d = 1) {
      super();
      const hw = w / 2, hh = h / 2, hd = d / 2;
      const faces = [
        { n: [0, 0, 1],  v: [[-hw,-hh, hd],[ hw,-hh, hd],[ hw, hh, hd],[-hw, hh, hd]] },
        { n: [0, 0,-1],  v: [[ hw,-hh,-hd],[-hw,-hh,-hd],[-hw, hh,-hd],[ hw, hh,-hd]] },
        { n: [0, 1, 0],  v: [[-hw, hh, hd],[ hw, hh, hd],[ hw, hh,-hd],[-hw, hh,-hd]] },
        { n: [0,-1, 0],  v: [[-hw,-hh,-hd],[ hw,-hh,-hd],[ hw,-hh, hd],[-hw,-hh, hd]] },
        { n: [1, 0, 0],  v: [[ hw,-hh, hd],[ hw,-hh,-hd],[ hw, hh,-hd],[ hw, hh, hd]] },
        { n: [-1,0, 0],  v: [[-hw,-hh,-hd],[-hw,-hh, hd],[-hw, hh, hd],[-hw, hh,-hd]] }
      ];
      const pos = [], norm = [], uv = [], idx = [];
      faces.forEach((f, fi) => {
        const base = fi * 4;
        f.v.forEach((p, pi) => {
          pos.push(p[0], p[1], p[2]);
          norm.push(f.n[0], f.n[1], f.n[2]);
          uv.push(pi === 1 || pi === 2 ? 1 : 0, pi >= 2 ? 1 : 0);
        });
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
      this.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      this.setAttribute('normal', new BufferAttribute(new Float32Array(norm), 3));
      this.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
      this.setIndex(idx);
    }
  }

  class CylinderGeometry extends BufferGeometry {
    constructor(rTop = 1, rBot = 1, height = 1, radialSegs = 12) {
      super();
      const pos = [], norm = [], idx = [];
      const segs = Math.max(3, radialSegs);
      const hh = height / 2;
      for (let yIdx = 0; yIdx <= 1; yIdx++) {
        const y = yIdx === 0 ? hh : -hh;
        const r = yIdx === 0 ? rTop : rBot;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          pos.push(r * ca, y, r * sa);
          norm.push(ca, 0.15, sa);
        }
      }
      const stride = segs + 1;
      for (let i = 0; i < segs; i++) {
        const a = i, b = i + stride, c = i + 1 + stride, d = i + 1;
        idx.push(a, b, d, b, c, d);
      }
      this.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      this.setAttribute('normal', new BufferAttribute(new Float32Array(norm), 3));
      this.setIndex(idx);
    }
  }

  class ConeGeometry extends CylinderGeometry {
    constructor(radius = 1, height = 1, radialSegs = 8) {
      super(0.01, radius, height, radialSegs);
    }
  }

  class SphereGeometry extends BufferGeometry {
    constructor(radius = 1, widthSegs = 14, heightSegs = 10) {
      super();
      const wS = Math.max(4, widthSegs), hS = Math.max(4, heightSegs);
      const pos = [], norm = [], idx = [];
      for (let iy = 0; iy <= hS; iy++) {
        const v = iy / hS;
        const phi = v * Math.PI;
        for (let ix = 0; ix <= wS; ix++) {
          const u = ix / wS;
          const theta = u * Math.PI * 2;
          const nx = -Math.cos(theta) * Math.sin(phi);
          const ny = Math.cos(phi);
          const nz = Math.sin(theta) * Math.sin(phi);
          pos.push(radius * nx, radius * ny, radius * nz);
          norm.push(nx, ny, nz);
        }
      }
      for (let iy = 0; iy < hS; iy++) {
        for (let ix = 0; ix < wS; ix++) {
          const a = ix + (wS + 1) * iy;
          const b = ix + (wS + 1) * (iy + 1);
          const c = ix + 1 + (wS + 1) * (iy + 1);
          const d = ix + 1 + (wS + 1) * iy;
          idx.push(a, b, d, b, c, d);
        }
      }
      this.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      this.setAttribute('normal', new BufferAttribute(new Float32Array(norm), 3));
      this.setIndex(idx);
    }
  }

  class OctahedronGeometry extends SphereGeometry {
    constructor(radius = 1) {
      super(radius, 4, 2);
    }
  }

  class RingGeometry extends BufferGeometry {
    constructor(innerR = 0.5, outerR = 1, thetaSegs = 24) {
      super();
      const pos = [], norm = [], idx = [];
      const segs = Math.max(6, thetaSegs);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        pos.push(innerR * ca, innerR * sa, 0);
        norm.push(0, 0, 1);
        pos.push(outerR * ca, outerR * sa, 0);
        norm.push(0, 0, 1);
      }
      for (let i = 0; i < segs; i++) {
        const b = i * 2;
        idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
      }
      this.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      this.setAttribute('normal', new BufferAttribute(new Float32Array(norm), 3));
      this.setIndex(idx);
    }
  }

  class TubeGeometry extends BufferGeometry {
    constructor(curve, tubularSegs = 64, radius = 0.2, radialSegs = 8) {
      super();
      const pos = [], norm = [], idx = [];
      const tS = Math.max(8, tubularSegs);
      const rS = Math.max(4, radialSegs);
      const upRef = new Vector3(0, 1, 0);
      for (let i = 0; i <= tS; i++) {
        const t = i / tS;
        const p = curve.getPoint(t);
        const tangent = curve.getTangent(t);
        let normal = new Vector3().crossVectors(upRef, tangent);
        if (normal.lengthSq() < 1e-6) normal.set(1, 0, 0);
        normal.normalize();
        const binormal = new Vector3().crossVectors(tangent, normal).normalize();

        for (let j = 0; j <= rS; j++) {
          const v = (j / rS) * Math.PI * 2;
          const sin = Math.sin(v), cos = -Math.cos(v);
          const nx = cos * normal.x + sin * binormal.x;
          const ny = cos * normal.y + sin * binormal.y;
          const nz = cos * normal.z + sin * binormal.z;
          pos.push(p.x + radius * nx, p.y + radius * ny, p.z + radius * nz);
          norm.push(nx, ny, nz);
        }
      }
      const stride = rS + 1;
      for (let i = 0; i < tS; i++) {
        for (let j = 0; j < rS; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + j + 1;
          const d = i * stride + j + 1;
          idx.push(a, b, d, b, c, d);
        }
      }
      this.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      this.setAttribute('normal', new BufferAttribute(new Float32Array(norm), 3));
      this.setIndex(idx);
    }
  }

  // ========== 4. 材质与纹理 ==========
  class CanvasTexture {
    constructor(canvas) {
      this.image = canvas;
      this.colorSpace = 'srgb';
      this.anisotropy = 1;
      this.needsUpdate = true;
      this._glTex = null;
      this.userData = {};
    }
  }

  class Material {
    constructor(params = {}) {
      this.color = new Color(params.color !== undefined ? params.color : 0xffffff);
      this.emissive = new Color(params.emissive !== undefined ? params.emissive : 0x000000);
      this.emissiveIntensity = params.emissiveIntensity ?? 1.0;
      this.map = params.map || null;
      this.transparent = Boolean(params.transparent);
      this.opacity = params.opacity ?? 1.0;
      this.visible = params.visible !== undefined ? params.visible : true;
      this.side = params.side || 0;
      this.dashSize = params.dashSize ?? 0.7;
      this.gapSize = params.gapSize ?? 0.45;
      this.isBasic = false;
      this.isDashed = false;
      this.needsUpdate = false;
    }
    dispose() {}
  }

  class MeshStandardMaterial extends Material {}
  class MeshBasicMaterial extends Material {
    constructor(params = {}) {
      super(params);
      this.isBasic = true;
    }
  }
  class LineDashedMaterial extends Material {
    constructor(params = {}) {
      super(params);
      this.isDashed = true;
    }
  }

  // ========== 5. 场景图与相机 ==========
  class Object3D {
    constructor() {
      this.children = [];
      this.parent = null;
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this._rotMatrix = new Matrix4();
      this.scale = {
        x: 1, y: 1, z: 1,
        set: (x, y, z) => { this.scale.x = x; this.scale.y = y; this.scale.z = z; },
        setScalar: (s) => { this.scale.x = s; this.scale.y = s; this.scale.z = s; }
      };
      this.matrixWorld = new Matrix4();
      this.visible = true;
      this.userData = {};
    }
    add(child) {
      if (child.parent) child.parent.remove(child);
      child.parent = this;
      this.children.push(child);
      return this;
    }
    remove(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parent = null;
      }
      return this;
    }
    traverse(cb) {
      cb(this);
      for (let i = 0; i < this.children.length; i++) {
        this.children[i].traverse(cb);
      }
    }
    lookAt(x, y, z) {
      const target = x instanceof Vector3 ? x : new Vector3(x, y, z);
      const up = new Vector3(0, 1, 0);
      const fwd = new Vector3().subVectors(target, this.position).normalize();
      if (fwd.lengthSq() > 1e-6) {
        this.rotation.y = Math.atan2(fwd.x, fwd.z);
      }
    }
    updateMatrixWorld(force = false) {
      const rx = this.rotation.x, ry = this.rotation.y, rz = this.rotation.z;
      const cx = Math.cos(rx), sx = Math.sin(rx);
      const cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);
      const e = this._rotMatrix.elements;
      // Rz * Ry * Rx
      e[0] = cy * cz;  e[4] = sx * sy * cz - cx * sz; e[8] = cx * sy * cz + sx * sz; e[12] = 0;
      e[1] = cy * sz;  e[5] = sx * sy * sz + cx * cz; e[9] = cx * sy * sz - sx * cz; e[13] = 0;
      e[2] = -sy;      e[6] = sx * cy;                e[10] = cx * cy;               e[14] = 0;
      e[3] = 0;        e[7] = 0;                      e[11] = 0;                     e[15] = 1;

      const localMat = new Matrix4().compose(this.position, this._rotMatrix, this.scale);
      if (this.parent && this.parent.matrixWorld) {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, localMat);
      } else {
        this.matrixWorld.copy(localMat);
      }
      for (let i = 0; i < this.children.length; i++) {
        this.children[i].updateMatrixWorld(force);
      }
    }
  }

  class Group extends Object3D {}
  class Scene extends Object3D {
    constructor() {
      super();
      this.background = new Color(0x000000);
      this.fog = null;
    }
  }

  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
      this.isMesh = true;
    }
  }

  class Line extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
      this.isLine = true;
    }
    computeLineDistances() {}
  }

  class HemisphereLight extends Object3D {
    constructor(skyColor, groundColor, intensity = 1) {
      super();
      this.skyColor = new Color(skyColor);
      this.groundColor = new Color(groundColor);
      this.intensity = intensity;
      this.isHemiLight = true;
    }
  }

  class DirectionalLight extends Object3D {
    constructor(color, intensity = 1) {
      super();
      this.color = new Color(color);
      this.intensity = intensity;
      this.isDirLight = true;
    }
  }

  class FogExp2 {
    constructor(color, density = 0.002) {
      this.color = new Color(color);
      this.density = density;
    }
  }

  class PerspectiveCamera extends Object3D {
    constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
      super();
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
      this.projectionMatrix = new Matrix4();
      this.matrixWorldInverse = new Matrix4();
      this.updateProjectionMatrix();
    }
    updateProjectionMatrix() {
      this.projectionMatrix.makePerspective(this.fov, this.aspect, this.near, this.far);
    }
    lookAt(target) {
      const t = target instanceof Vector3 ? target : new Vector3(target.x || 0, target.y || 0, target.z || 0);
      const m = new Matrix4().lookAt(this.position, t, new Vector3(0, 1, 0));
      const e = m.elements;
      e[12] = this.position.x;
      e[13] = this.position.y;
      e[14] = this.position.z;
      this.matrixWorld.copy(m);
      this.matrixWorldInverse.copy(m).invert();
    }
  }

  // ========== 6. 射线拾取 (Raycaster) ==========
  class Raycaster {
    constructor() {
      this.origin = new Vector3();
      this.direction = new Vector3();
    }
    setFromCamera(coords, camera) {
      this.origin.copy(camera.position);
      const invProj = camera.projectionMatrix.clone().invert();
      const pt = new Vector3(coords.x, coords.y, 0.5).applyMatrix4(invProj);
      pt.applyMatrix4(camera.matrixWorld);
      this.direction.subVectors(pt, this.origin).normalize();
    }
    intersectObjects(objects) {
      const hits = [];
      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj.geometry) continue;
        // 计算世界中心与世界半径包围球交点
        const center = new Vector3(0, 0, 0).applyMatrix4(obj.matrixWorld);
        const r = (obj.geometry.boundingRadius || 1) * Math.max(obj.scale.x, obj.scale.y, obj.scale.z);
        const oc = new Vector3().subVectors(center, this.origin);
        const tProj = oc.dot(this.direction);
        if (tProj < 0) continue;
        const d2 = oc.lengthSq() - tProj * tProj;
        if (d2 <= r * r) {
          const dist = tProj - Math.sqrt(Math.max(0, r * r - d2));
          hits.push({ distance: dist, object: obj });
        }
      }
      hits.sort((a, b) => a.distance - b.distance);
      return hits;
    }
  }

  // ========== 7. WebGLRenderer (硬件加速着色器管线) ==========
  class WebGLRenderer {
    constructor(opts = {}) {
      this.domElement = document.createElement('canvas');
      this.domElement.style.display = 'block';
      this.pixelRatio = 1;
      this.toneMappingExposure = 1.0;

      const gl = this.domElement.getContext('webgl', {
        antialias: opts.antialias !== false,
        alpha: false,
        powerPreference: opts.powerPreference || 'default'
      }) || this.domElement.getContext('experimental-webgl');

      this.gl = (gl && typeof gl.createShader === 'function') ? gl : null;
      this.capabilities = {
        getMaxAnisotropy: () => 4
      };

      if (this.gl) {
        if (typeof this.gl.getExtension === 'function') this.gl.getExtension('OES_element_index_uint');
        this._initShaders();
      }
    }

    _initShaders() {
      const gl = this.gl;
      const vs = `
        attribute vec3 aPos;
        attribute vec3 aNorm;
        attribute vec2 aUv;
        attribute float aLineDist;
        uniform mat4 uModel;
        uniform mat4 uViewProj;
        varying vec3 vWorldPos;
        varying vec3 vNorm;
        varying vec2 vUv;
        varying float vLineDist;
        void main() {
          vec4 wp = uModel * vec4(aPos, 1.0);
          vWorldPos = wp.xyz;
          vNorm = normalize(mat3(uModel) * aNorm);
          vUv = aUv;
          vLineDist = aLineDist;
          gl_Position = uViewProj * wp;
        }
      `;
      const fs = `
        precision mediump float;
        uniform vec3 uColor;
        uniform vec3 uEmissive;
        uniform float uEmissiveIntensity;
        uniform float uOpacity;
        uniform int uHasMap;
        uniform int uIsBasic;
        uniform int uIsDashed;
        uniform float uDashSize;
        uniform float uGapSize;
        uniform sampler2D uMap;
        uniform vec3 uCamPos;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uHemiSky;
        uniform vec3 uHemiGround;
        varying vec3 vWorldPos;
        varying vec3 vNorm;
        varying vec2 vUv;
        varying float vLineDist;

        void main() {
          if (uIsDashed == 1) {
            float period = uDashSize + uGapSize;
            if (mod(vLineDist, period) > uDashSize) discard;
          }
          vec3 base = uColor;
          if (uHasMap == 1) {
            vec4 tex = texture2D(uMap, vUv);
            base = tex.rgb * uColor;
          }
          vec3 lit;
          if (uIsBasic == 1 || uIsDashed == 1) {
            lit = base + uEmissive * uEmissiveIntensity;
          } else {
            vec3 n = normalize(vNorm);
            float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 ambient = mix(uHemiGround, uHemiSky, hemi) * 0.65;
            float diff = max(dot(n, normalize(uSunDir)), 0.0);
            vec3 diffuse = uSunColor * diff * 0.92;
            lit = base * (ambient + diffuse) + uEmissive * (uEmissiveIntensity * 0.72);
          }
          // 轻微 ACES 曲线增强立体感与暗部层次
          lit = (lit * (2.51 * lit + 0.03)) / (lit * (2.43 * lit + 0.59) + 0.14);
          // 指数雾效
          float dist = length(vWorldPos - uCamPos);
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          vec3 finalCol = mix(lit, uFogColor, clamp(fogFactor, 0.0, 1.0));
          gl_FragColor = vec4(finalCol, uOpacity);
        }
      `;

      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      this._prog = prog;
      this._loc = {
        aPos: gl.getAttribLocation(prog, 'aPos'),
        aNorm: gl.getAttribLocation(prog, 'aNorm'),
        aUv: gl.getAttribLocation(prog, 'aUv'),
        aLineDist: gl.getAttribLocation(prog, 'aLineDist'),
        uModel: gl.getUniformLocation(prog, 'uModel'),
        uViewProj: gl.getUniformLocation(prog, 'uViewProj'),
        uColor: gl.getUniformLocation(prog, 'uColor'),
        uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
        uEmissiveIntensity: gl.getUniformLocation(prog, 'uEmissiveIntensity'),
        uOpacity: gl.getUniformLocation(prog, 'uOpacity'),
        uHasMap: gl.getUniformLocation(prog, 'uHasMap'),
        uIsBasic: gl.getUniformLocation(prog, 'uIsBasic'),
        uIsDashed: gl.getUniformLocation(prog, 'uIsDashed'),
        uDashSize: gl.getUniformLocation(prog, 'uDashSize'),
        uGapSize: gl.getUniformLocation(prog, 'uGapSize'),
        uMap: gl.getUniformLocation(prog, 'uMap'),
        uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
        uFogColor: gl.getUniformLocation(prog, 'uFogColor'),
        uFogDensity: gl.getUniformLocation(prog, 'uFogDensity'),
        uSunDir: gl.getUniformLocation(prog, 'uSunDir'),
        uSunColor: gl.getUniformLocation(prog, 'uSunColor'),
        uHemiSky: gl.getUniformLocation(prog, 'uHemiSky'),
        uHemiGround: gl.getUniformLocation(prog, 'uHemiGround')
      };

      // 缺省 1x1 占位属性缓冲区
      this._dummyBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._dummyBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 0]), gl.STATIC_DRAW);
    }

    setPixelRatio(r) { this.pixelRatio = r; }
    setSize(w, h) {
      const cw = Math.floor(w * this.pixelRatio);
      const ch = Math.floor(h * this.pixelRatio);
      this.domElement.width = cw;
      this.domElement.height = ch;
      this.domElement.style.width = `${w}px`;
      this.domElement.style.height = `${h}px`;
      if (this.gl) this.gl.viewport(0, 0, cw, ch);
    }

    _syncGeometry(geo) {
      const gl = this.gl;
      if (!geo._glBuffers) geo._glBuffers = {};
      const b = geo._glBuffers;
      const syncAttr = (attr, key) => {
        if (!attr) return;
        if (!b[key]) b[key] = gl.createBuffer();
        if (attr.needsUpdate) {
          gl.bindBuffer(gl.ARRAY_BUFFER, b[key]);
          gl.bufferData(gl.ARRAY_BUFFER, attr.array, gl.STATIC_DRAW);
          attr.needsUpdate = false;
        }
      };
      syncAttr(geo.attributes.position, 'pos');
      syncAttr(geo.attributes.normal, 'norm');
      syncAttr(geo.attributes.uv, 'uv');
      syncAttr(geo.attributes.lineDistance, 'lineDist');
      if (geo.index) {
        if (!b.idx) b.idx = gl.createBuffer();
        if (geo.index.needsUpdate) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.index.array, gl.STATIC_DRAW);
          geo.index.needsUpdate = false;
        }
      }
      return b;
    }

    _syncTexture(tex) {
      const gl = this.gl;
      if (!tex._glTex) tex._glTex = gl.createTexture();
      if (tex.needsUpdate) {
        gl.bindTexture(gl.TEXTURE_2D, tex._glTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex.image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        tex.needsUpdate = false;
      }
      return tex._glTex;
    }

    render(scene, camera) {
      const gl = this.gl;
      if (!gl) return;

      scene.updateMatrixWorld(true);
      const bg = scene.background || new Color(0x080d0b);
      gl.clearColor(bg.r, bg.g, bg.b, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const viewProj = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const loc = this._loc;
      gl.uniformMatrix4fv(loc.uViewProj, false, viewProj.elements);
      gl.uniform3f(loc.uCamPos, camera.position.x, camera.position.y, camera.position.z);

      const fogCol = scene.fog ? scene.fog.color : bg;
      gl.uniform3f(loc.uFogColor, fogCol.r, fogCol.g, fogCol.b);
      gl.uniform1f(loc.uFogDensity, scene.fog ? scene.fog.density : 0.0);

      // 读取灯光
      let sunDir = new Vector3(-45, 72, -38).normalize();
      let sunColor = new Color(0xfff5e4);
      let hemiSky = new Color(0xdbeafe);
      let hemiGround = new Color(0x1a2e22);
      scene.children.forEach((c) => {
        if (c.isDirLight && c.intensity > 1.0) {
          sunDir = c.position.clone().normalize();
          sunColor = c.color;
        }
        if (c.isHemiLight) {
          hemiSky = c.skyColor;
          hemiGround = c.groundColor;
        }
      });
      gl.uniform3f(loc.uSunDir, sunDir.x, sunDir.y, sunDir.z);
      gl.uniform3f(loc.uSunColor, sunColor.r, sunColor.g, sunColor.b);
      gl.uniform3f(loc.uHemiSky, hemiSky.r, hemiSky.g, hemiSky.b);
      gl.uniform3f(loc.uHemiGround, hemiGround.r, hemiGround.g, hemiGround.b);

      const opaqueList = [];
      const transList = [];
      scene.traverse((obj) => {
        // 检查祖先可见性
        let cur = obj;
        while (cur) {
          if (!cur.visible) return;
          cur = cur.parent;
        }
        if ((obj.isMesh || obj.isLine) && obj.material && obj.material.visible) {
          if (obj.material.transparent && obj.material.opacity < 0.99) transList.push(obj);
          else opaqueList.push(obj);
        }
      });

      const drawObj = (obj) => {
        const geo = obj.geometry;
        const mat = obj.material;
        const b = this._syncGeometry(geo);

        gl.uniformMatrix4fv(loc.uModel, false, obj.matrixWorld.elements);
        gl.uniform3f(loc.uColor, mat.color.r, mat.color.g, mat.color.b);
        gl.uniform3f(loc.uEmissive, mat.emissive.r, mat.emissive.g, mat.emissive.b);
        gl.uniform1f(loc.uEmissiveIntensity, mat.emissiveIntensity);
        gl.uniform1f(loc.uOpacity, mat.opacity);
        gl.uniform1i(loc.uIsBasic, mat.isBasic ? 1 : 0);
        gl.uniform1i(loc.uIsDashed, mat.isDashed ? 1 : 0);
        gl.uniform1f(loc.uDashSize, mat.dashSize);
        gl.uniform1f(loc.uGapSize, mat.gapSize);

        if (mat.map && mat.map.image) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this._syncTexture(mat.map));
          gl.uniform1i(loc.uMap, 0);
          gl.uniform1i(loc.uHasMap, 1);
        } else {
          gl.uniform1i(loc.uHasMap, 0);
        }

        // Pos
        gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
        gl.enableVertexAttribArray(loc.aPos);
        gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);

        // Norm
        if (loc.aNorm >= 0) {
          if (b.norm) {
            gl.bindBuffer(gl.ARRAY_BUFFER, b.norm);
            gl.enableVertexAttribArray(loc.aNorm);
            gl.vertexAttribPointer(loc.aNorm, 3, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(loc.aNorm);
            gl.vertexAttrib3f(loc.aNorm, 0, 1, 0);
          }
        }
        // UV
        if (loc.aUv >= 0) {
          if (b.uv) {
            gl.bindBuffer(gl.ARRAY_BUFFER, b.uv);
            gl.enableVertexAttribArray(loc.aUv);
            gl.vertexAttribPointer(loc.aUv, 2, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(loc.aUv);
            gl.vertexAttrib2f(loc.aUv, 0, 0);
          }
        }
        // LineDist
        if (loc.aLineDist >= 0) {
          if (b.lineDist) {
            gl.bindBuffer(gl.ARRAY_BUFFER, b.lineDist);
            gl.enableVertexAttribArray(loc.aLineDist);
            gl.vertexAttribPointer(loc.aLineDist, 1, gl.FLOAT, false, 0, 0);
          } else {
            gl.disableVertexAttribArray(loc.aLineDist);
            gl.vertexAttrib1f(loc.aLineDist, 0);
          }
        }

        if (obj.isLine) {
          gl.drawArrays(gl.LINE_STRIP, 0, geo.attributes.position.count);
        } else if (geo.index) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
          const idxType = geo.index.array instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
          gl.drawElements(gl.TRIANGLES, geo.index.array.length, idxType, 0);
        } else {
          gl.drawArrays(gl.TRIANGLES, 0, geo.attributes.position.count);
        }
      };

      opaqueList.forEach(drawObj);
      gl.depthMask(false);
      transList.forEach(drawObj);
      gl.depthMask(true);
    }
  }

  // ========== 8. OrbitControls (球坐标阻尼交互控制) ==========
  class OrbitControls {
    constructor(camera, domElement) {
      this.camera = camera;
      this.domElement = domElement;
      this.target = new Vector3(0, 0, 0);
      this.enableDamping = true;
      this.dampingFactor = 0.08;
      this.maxPolarAngle = Math.PI * 0.48;
      this.minDistance = 4;
      this.maxDistance = 180;

      // 从初始相机位置推算球坐标
      this._spherical = { radius: 75, phi: 0.78, theta: 0.25 };
      this._dTheta = 0;
      this._dPhi = 0;
      this._dRadius = 0;
      this._panOffset = new Vector3();

      this._syncFromCamera();
      this._bindEvents();
    }

    _syncFromCamera() {
      const off = new Vector3().subVectors(this.camera.position, this.target);
      const r = Math.max(this.minDistance, off.length());
      this._spherical.radius = r;
      this._spherical.phi = Math.acos(Math.max(-0.99, Math.min(0.99, off.y / r)));
      this._spherical.theta = Math.atan2(off.x, off.z);
    }

    _bindEvents() {
      let mode = 0; // 1=orbit, 2=pan, 3=pinch
      let prevX = 0, prevY = 0;
      let prevPinchDist = 0, prevMidX = 0, prevMidY = 0;
      const activePointers = new Map();
      const el = this.domElement;

      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('pointerdown', (e) => {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activePointers.size === 1) {
          prevX = e.clientX;
          prevY = e.clientY;
          mode = (e.button === 2 || e.shiftKey) ? 2 : 1;
        } else if (activePointers.size >= 2) {
          const pts = Array.from(activePointers.values());
          prevPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          prevMidX = (pts[0].x + pts[1].x) * 0.5;
          prevMidY = (pts[0].y + pts[1].y) * 0.5;
          mode = 3;
        }
      });
      window.addEventListener('pointermove', (e) => {
        if (!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activePointers.size === 1 && (mode === 1 || mode === 2)) {
          const dx = e.clientX - prevX;
          const dy = e.clientY - prevY;
          prevX = e.clientX;
          prevY = e.clientY;
          if (mode === 1) {
            this._dTheta -= dx * 0.0055;
            this._dPhi -= dy * 0.0055;
          } else {
            const factor = this._spherical.radius * 0.0014;
            const sinT = Math.sin(this._spherical.theta);
            const cosT = Math.cos(this._spherical.theta);
            this._panOffset.x -= (dx * cosT + dy * sinT) * factor;
            this._panOffset.z -= (-dx * sinT + dy * cosT) * factor;
          }
        } else if (activePointers.size >= 2) {
          const pts = Array.from(activePointers.values());
          const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          const midX = (pts[0].x + pts[1].x) * 0.5;
          const midY = (pts[0].y + pts[1].y) * 0.5;
          this._dRadius -= (dist - prevPinchDist) * 0.18;
          const dx = midX - prevMidX;
          const dy = midY - prevMidY;
          const factor = this._spherical.radius * 0.0012;
          const sinT = Math.sin(this._spherical.theta);
          const cosT = Math.cos(this._spherical.theta);
          this._panOffset.x -= (dx * cosT + dy * sinT) * factor;
          this._panOffset.z -= (-dx * sinT + dy * cosT) * factor;
          prevPinchDist = dist;
          prevMidX = midX;
          prevMidY = midY;
        }
      });
      const onPointerEnd = (e) => {
        activePointers.delete(e.pointerId);
        if (activePointers.size === 0) {
          mode = 0;
        } else if (activePointers.size === 1) {
          const rem = activePointers.values().next().value;
          prevX = rem.x;
          prevY = rem.y;
          mode = 1;
        }
      };
      window.addEventListener('pointerup', onPointerEnd);
      window.addEventListener('pointercancel', onPointerEnd);
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this._dRadius += e.deltaY * 0.045;
      }, { passive: false });
    }

    update() {
      // 如果外部动画直接改写了 camera.position（例如飞跃动画），重新同步球坐标基准
      const curOff = new Vector3().subVectors(this.camera.position, this.target);
      const curR = curOff.length();
      if (Math.abs(curR - this._spherical.radius) > 0.05 && Math.abs(this._dRadius) < 0.01) {
        this._syncFromCamera();
      }

      this.target.add(this._panOffset);
      this._spherical.theta += this._dTheta;
      this._spherical.phi = Math.max(0.12, Math.min(this.maxPolarAngle, this._spherical.phi + this._dPhi));
      this._spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this._spherical.radius + this._dRadius));

      const damp = this.enableDamping ? 1 - this.dampingFactor : 0;
      this._dTheta *= damp;
      this._dPhi *= damp;
      this._dRadius *= damp;
      this._panOffset.multiplyScalar(damp);

      const { radius, phi, theta } = this._spherical;
      const sinP = Math.sin(phi);
      this.camera.position.set(
        this.target.x + radius * sinP * Math.sin(theta),
        this.target.y + radius * Math.cos(phi),
        this.target.z + radius * sinP * Math.cos(theta)
      );
      this.camera.lookAt(this.target);
    }
  }

  // ========== 9. CSS2DRenderer & CSS2DObject ==========
  class CSS2DObject extends Object3D {
    constructor(element) {
      super();
      this.element = element;
      this.element.style.position = 'absolute';
      this.isCSS2DObject = true;
    }
  }

  class CSS2DRenderer {
    constructor() {
      this.domElement = document.createElement('div');
      this.domElement.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
      this._width = window.innerWidth;
      this._height = window.innerHeight;
    }
    setSize(w, h) {
      this._width = w;
      this._height = h;
      this.domElement.style.width = `${w}px`;
      this.domElement.style.height = `${h}px`;
    }
    render(scene, camera) {
      const viewProj = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      scene.traverse((obj) => {
        if (!obj.isCSS2DObject) return;
        if (!obj.element.parentNode) this.domElement.appendChild(obj.element);
        const wp = new Vector3(0, 0, 0).applyMatrix4(obj.matrixWorld);
        // 用手算 NDC 与深度检查避免 applyMatrix4 的透视除法丢失 w
        const e = viewProj.elements;
        const clipW = e[3] * wp.x + e[7] * wp.y + e[11] * wp.z + e[15];
        if (clipW <= 0.05) {
          obj.element.style.display = 'none';
          return;
        }
        const ndcX = (e[0] * wp.x + e[4] * wp.y + e[8] * wp.z + e[12]) / clipW;
        const ndcY = (e[1] * wp.x + e[5] * wp.y + e[9] * wp.z + e[13]) / clipW;
        if (Math.abs(ndcX) > 1.25 || Math.abs(ndcY) > 1.25) {
          obj.element.style.display = 'none';
          return;
        }
        obj.element.style.display = 'inline-flex';
        const sx = (ndcX * 0.5 + 0.5) * this._width;
        const sy = (-ndcY * 0.5 + 0.5) * this._height;
        obj.element.style.left = `${sx.toFixed(1)}px`;
        obj.element.style.top = `${sy.toFixed(1)}px`;
      });
    }
  }

  global.THREE = {
    Vector2,
    Vector3,
    Color,
    Matrix4,
    CatmullRomCurve3,
    BufferAttribute,
    BufferGeometry,
    PlaneGeometry,
    BoxGeometry,
    CylinderGeometry,
    ConeGeometry,
    SphereGeometry,
    OctahedronGeometry,
    RingGeometry,
    TubeGeometry,
    CanvasTexture,
    MeshStandardMaterial,
    MeshBasicMaterial,
    LineDashedMaterial,
    Object3D,
    Group,
    Scene,
    Mesh,
    Line,
    HemisphereLight,
    DirectionalLight,
    FogExp2,
    PerspectiveCamera,
    Raycaster,
    WebGLRenderer,
    DoubleSide: 2,
    SRGBColorSpace: 'srgb',
    ACESFilmicToneMapping: 4
  };
  global.OrbitControls = OrbitControls;
  global.CSS2DRenderer = CSS2DRenderer;
  global.CSS2DObject = CSS2DObject;
})(window);
