import {
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene as ThreeScene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three';

import vertexShader from './shaders/plane.vert';
import fragmentShader from './shaders/plane.frag';
import { paletteColors, paletteNames, palettes } from './palettes.js';
import Hearts from './Hearts.js';

// Default look — slow and languid, low-frequency two-tone field (see spec:
// "Motion feel — this matters most").
const DEFAULTS = {
  speed: 0.18, // morph speed — how fast the cells reshape
  scale: 1.55, // cell/channel density (low = big cells)
  thick: 0.24, // channel (bright core) width
  glow: 4.2, // warm-glow spread beyond the core
  smoke: 0.26, // wispy turbulence in the glow
  grain: 0.12, // subtle film grain
  palette: 'periwinkle',
};

// Palette transition: a wavefront (driven by the shader's uMix) that expands
// outward from the channel centres, so the new palette flows out from the core
// through the field. PALETTE_FADE is how long that outward flow takes.
const PALETTE_FADE = 3.6; // seconds for the front to sweep the whole field

/**
 * Full-screen animated gooey gradient background rendered with a Three.js
 * ShaderMaterial. All visual logic lives in plane.frag; this class only sets
 * uniforms, handles resize, swaps palettes, and runs the loop.
 */
export default class Scene {
  constructor(canvas) {
    this.canvas = canvas;

    // Manual time source (rather than THREE.Clock) so we can pause on tab-hide
    // and resume without the shader time jumping forward by the hidden span.
    this.time = 0; // shader animation time, fed to uTime
    this.realTime = 0; // true elapsed seconds (drives palette-fade timing)
    this.lastTime = performance.now();

    // No antialias: the scene is a single full-screen quad with no polygon
    // edges, so MSAA buys nothing here and only adds fill-rate cost.
    this.renderer = new WebGLRenderer({ canvas, antialias: false });
    // Output raw shader values so the sampled palette hex renders faithfully
    // (no extra linear→sRGB encoding on top of the already-sRGB ramp).
    this.renderer.outputColorSpace = LinearSRGBColorSpace;

    this.scene = new ThreeScene();
    // Ortho camera so the plane maps 1:1 to the viewport.
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const params = new URLSearchParams(window.location.search);
    const requested = params.get('palette');
    this.paletteName =
      requested && palettes[requested] ? requested : DEFAULTS.palette;

    const [colorA, colorB, colorC, colorD, colorE] = paletteColors(this.paletteName);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Vector2() },
        uSpeed: { value: DEFAULTS.speed },
        uScale: { value: DEFAULTS.scale },
        uThick: { value: DEFAULTS.thick },
        uGlow: { value: DEFAULTS.glow },
        uSmoke: { value: DEFAULTS.smoke },
        uGrain: { value: DEFAULTS.grain },
        uColorA: { value: colorA },
        uColorB: { value: colorB },
        uColorC: { value: colorC },
        uColorD: { value: colorD },
        uColorE: { value: colorE },
        // Target palette + transition front (idle: target == current, uMix 0).
        uColorA2: { value: colorA.clone() },
        uColorB2: { value: colorB.clone() },
        uColorC2: { value: colorC.clone() },
        uColorD2: { value: colorD.clone() },
        uColorE2: { value: colorE.clone() },
        uMix: { value: 0 },
      },
    });

    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.scene.add(this.mesh);

    // Heart-bubble pass — its own scene + perspective camera, rendered over the
    // gradient in tick(). Created before resize() so it can be sized too.
    this.hearts = new Hearts();

    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);

    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);

    // Optional tweak panel behind ?debug (lazy-loaded, no cost otherwise).
    if (params.has('debug')) {
      import('./debug.js').then(({ createDebugPanel }) => {
        createDebugPanel(this);
      });
    }
  }

  /**
   * Swap the active palette at runtime. Sets the target-palette uniforms and
   * animates the shader's uMix 0 → 1, expanding a wavefront outward from the
   * channel centres so the new palette flows out from the core. tick() advances
   * uMix and commits the target as the new base when the front completes.
   */
  setPalette(name) {
    if (!palettes[name] || name === this.paletteName) return;

    const u = this.material.uniforms;
    // If a transition is still running, commit its target as the new base so
    // this one starts cleanly from the palette we were heading toward.
    if (this.paletteMix) this.commitPalette();

    this.paletteName = name;
    const [a, b, c, d, e] = paletteColors(name);
    u.uColorA2.value.copy(a);
    u.uColorB2.value.copy(b);
    u.uColorC2.value.copy(c);
    u.uColorD2.value.copy(d);
    u.uColorE2.value.copy(e);
    u.uMix.value = 0;
    this.paletteMix = { start: this.realTime };
  }

  /** Fold the target palette into the base colours and end the transition. */
  commitPalette() {
    const u = this.material.uniforms;
    u.uColorA.value.copy(u.uColorA2.value);
    u.uColorB.value.copy(u.uColorB2.value);
    u.uColorC.value.copy(u.uColorC2.value);
    u.uColorD.value.copy(u.uColorD2.value);
    u.uColorE.value.copy(u.uColorE2.value);
    u.uMix.value = 0;
    this.paletteMix = null;
  }

  /** Number keys 1..N cycle through the named palettes. */
  onKeyDown(event) {
    const index = Number(event.key) - 1;
    if (index >= 0 && index < paletteNames.length) {
      this.setPalette(paletteNames[index]);
    }
  }

  resize() {
    const { innerWidth: w, innerHeight: h } = window;
    // This is a fill-rate-bound full-screen shader: every physical pixel runs
    // the whole fragment program each frame, so cost scales with pixelRatio².
    // The gradient is soft with no hard edges, so rendering at DPR 1 (instead of
    // the display's native 2 on HiDPI) is ~4× cheaper and near-indistinguishable.
    // Bump toward 1.5 if it looks too soft on a fast GPU.
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
    this.hearts.setSize(w, h);
  }

  /** Release a drift of rising heart bubbles (wired to the "Say Hi" link). */
  releaseHearts(count = 8) {
    this.hearts.release(count);
  }

  /** Stop rendering entirely while the tab is backgrounded; resume on return. */
  onVisibilityChange() {
    if (document.hidden) {
      this.renderer.setAnimationLoop(null);
    } else {
      // Discard the hidden span so animation continues from where it paused.
      this.lastTime = performance.now();
      this.renderer.setAnimationLoop(this.tick);
    }
  }

  tick() {
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.realTime += dt;

    // Shader time advances at a constant rate.
    this.time += dt;

    // Palette wavefront: advance uMix so the shader's front sweeps outward. When
    // it reaches the edge, fold the target into the base colours.
    if (this.paletteMix) {
      const t = (this.realTime - this.paletteMix.start) / PALETTE_FADE;
      if (t >= 1) {
        this.commitPalette();
      } else {
        // Linear — the shader's FRONT_CURVE shapes how the front grows.
        this.material.uniforms.uMix.value = t;
      }
    }

    this.material.uniforms.uTime.value = this.time;
    this.hearts.update(dt, this.realTime);

    // Pass 1: the gradient (clears the frame).
    this.renderer.render(this.scene, this.camera);

    // Pass 2: heart bubbles composited on top. Keep the gradient's colour but
    // clear depth so the ortho plane doesn't occlude the perspective hearts.
    if (this.hearts.active) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.hearts.scene, this.hearts.camera);
      this.renderer.autoClear = true;
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.hearts.dispose();
    this.renderer.dispose();
  }
}
