import {
  DynamicDrawUsage,
  FrontSide,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Scene as ThreeScene,
  ShaderMaterial,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import heartVertex from './shaders/heart.vert';
import heartFragment from './shaders/heart.frag';

// Max hearts alive at once. Instances beyond this are simply not spawned until a
// slot frees up, so a frantic clicker can't grow the buffer unbounded.
const CAPACITY = 36;

/**
 * A blob base distorted into a heart: start from a smooth icosphere and remap
 * every vertex so each horizontal slice becomes a scaled heart cross-section,
 * fullest at the equator and rounding off toward the front/back. The result is a
 * plump, organic heart with sphere-smooth normals — no mesh seams or slab edges.
 * (The shader adds a live noise wobble on top for the liquid distortion.)
 */
function buildHeartGeometry() {
  // IcosahedronGeometry is non-indexed (every triangle owns its vertices), which
  // makes computeVertexNormals produce FLAT per-face normals — a faceted look.
  // Weld coincident vertices first so we get smooth, blob-like normals.
  const geo = mergeVertices(new IcosahedronGeometry(1, 5));
  const pos = geo.attributes.position;
  const v = pos.array;

  for (let i = 0; i < v.length; i += 3) {
    const x = v[i];
    const y = v[i + 1];
    const z = v[i + 2];
    const len = Math.hypot(x, y, z) || 1;
    const dx = x / len;
    const dy = y / len;
    const dz = z / len;

    // Heart cross-section in the XY plane, from the classic parametric curve.
    const phi = Math.atan2(dx, dy); // angle around, 0 at the top (+Y)
    const s = Math.sin(phi);
    const hx = 16 * s * s * s;
    const hy =
      13 * Math.cos(phi) -
      5 * Math.cos(2 * phi) -
      2 * Math.cos(3 * phi) -
      Math.cos(4 * phi);
    const k = 1 / 17; // normalise the ~±17 curve toward unit size

    // Fuller near the equator, rounding toward the poles → plump 3D volume.
    const w = Math.pow(Math.max(0, 1 - dz * dz), 0.4);
    v[i] = hx * k * w;
    v[i + 1] = hy * k * w;
    v[i + 2] = dz * 0.62;
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.center();
  geo.computeBoundingBox();
  const height = geo.boundingBox.max.y - geo.boundingBox.min.y;
  geo.scale(1 / height, 1 / height, 1 / height); // normalise to ~unit height
  return geo;
}

/**
 * A pool of instanced heart bubbles that rise from below the viewport to above
 * it, swaying and slowly spinning, fading in at the bottom and out near the top.
 * Owns its own perspective camera + scene; Scene renders it as a second pass
 * over the gradient (shared renderer, shared loop).
 */
export default class Hearts {
  constructor() {
    this.scene = new ThreeScene();
    this.camera = new PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.z = 6;

    this.geometry = buildHeartGeometry();
    this.material = new ShaderMaterial({
      vertexShader: heartVertex,
      fragmentShader: heartFragment,
      transparent: true,
      depthWrite: false,
      // Solid rounded blobs — front faces are enough and avoid transparency
      // double-up. uTime drives the organic wobble.
      side: FrontSide,
      uniforms: {
        uTime: { value: 0 },
      },
    });

    this.mesh = new InstancedMesh(this.geometry, this.material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false; // instances move; skip per-object culling
    this.scene.add(this.mesh);

    // Per-instance fade level and iridescence phase.
    this.opacity = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
    this.seed = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
    this.opacity.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aOpacity', this.opacity);
    this.geometry.setAttribute('aSeed', this.seed);

    this.dummy = new Object3D();
    this.particles = Array.from({ length: CAPACITY }, () => ({ active: false }));
    this.activeCount = 0;
    this.halfW = 1;
    this.halfH = 1;

    for (let i = 0; i < CAPACITY; i++) this._hide(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Recompute the visible world bounds at the hearts' z = 0 plane. */
  setSize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.halfH = Math.tan(MathUtils.degToRad(this.camera.fov) / 2) * this.camera.position.z;
    this.halfW = this.halfH * this.camera.aspect;
  }

  /** True while any bubble is alive — Scene uses this to skip the pass when idle. */
  get active() {
    return this.activeCount > 0;
  }

  /** Spawn up to `count` hearts (capped by free slots), staggered below the view. */
  release(count = 22) {
    for (let n = 0; n < count; n++) {
      const i = this.particles.findIndex((p) => !p.active);
      if (i === -1) break; // pool full

      const p = this.particles[i];
      p.active = true;
      p.baseX = MathUtils.randFloatSpread(this.halfW * 1.8);
      p.y = -this.halfH - MathUtils.randFloat(0.3, 3.2); // staggered start heights
      p.z = MathUtils.randFloatSpread(1.5);
      p.scale = MathUtils.randFloat(0.32, 0.8);
      p.vy = MathUtils.randFloat(0.5, 1.1);
      p.swayAmp = MathUtils.randFloat(0.1, 0.5);
      p.swayFreq = MathUtils.randFloat(0.5, 1.3);
      p.phase = Math.random() * Math.PI * 2;

      // Gentle 3D tumble: X/Y rock back and forth (revealing the extruded depth
      // without ever turning fully edge-on), while Z drifts slowly.
      p.rotZ = MathUtils.randFloatSpread(0.5);
      p.rotZSpeed = MathUtils.randFloatSpread(0.4);
      // Gentle rock only — they're flat pillow cards, so keep them mostly
      // face-on (larger tilts foreshorten the card and read as folded).
      p.tumbleAmpX = MathUtils.randFloat(0.07, 0.18);
      p.tumbleAmpY = MathUtils.randFloat(0.1, 0.26);
      p.tumbleFreqX = MathUtils.randFloat(0.4, 0.9);
      p.tumbleFreqY = MathUtils.randFloat(0.35, 0.8);
      p.tumblePhaseX = Math.random() * Math.PI * 2;
      p.tumblePhaseY = Math.random() * Math.PI * 2;
      p.age = 0;

      this.seed.setX(i, Math.random());
      this.activeCount++;
    }
    this.seed.needsUpdate = true;
  }

  /** Advance every live bubble. dt = frame delta, elapsed = total time (sway phase). */
  update(dt, elapsed) {
    this.material.uniforms.uTime.value = elapsed; // organic wobble runs always
    if (this.activeCount === 0) return;

    const topExit = this.halfH + 1.0;
    const fadeStart = this.halfH * 0.55;

    for (let i = 0; i < CAPACITY; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.age += dt;
      p.y += p.vy * dt;
      p.rotZ += p.rotZSpeed * dt;

      if (p.y > topExit) {
        p.active = false;
        this.activeCount--;
        this._hide(i);
        continue;
      }

      const x = p.baseX + Math.sin(p.phase + elapsed * p.swayFreq) * p.swayAmp;
      const rotX = Math.sin(p.tumblePhaseX + elapsed * p.tumbleFreqX) * p.tumbleAmpX;
      const rotY = Math.sin(p.tumblePhaseY + elapsed * p.tumbleFreqY) * p.tumbleAmpY;
      const fadeIn = Math.min(p.age / 0.7, 1);
      const fadeOut = 1 - Math.max(0, (p.y - fadeStart) / (topExit - fadeStart));

      this.dummy.position.set(x, p.y, p.z);
      this.dummy.rotation.set(rotX, rotY, p.rotZ);
      this.dummy.scale.setScalar(p.scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.opacity.setX(i, Math.max(0, fadeIn * fadeOut));
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.opacity.needsUpdate = true;
  }

  /** Collapse an instance to zero scale so it renders nothing. */
  _hide(i) {
    this.dummy.position.set(0, 0, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.opacity.setX(i, 0);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
