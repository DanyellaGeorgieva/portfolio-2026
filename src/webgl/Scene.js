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

// Default look — slow and languid, low-frequency two-tone field (see spec:
// "Motion feel — this matters most").
const DEFAULTS = {
  speed: 0.15, // morph speed — how fast the cells reshape
  scale: 1.7, // cell/channel density (low = big cells)
  thick: 0.09, // channel (bright core) width
  glow: 3.0, // warm-glow spread beyond the core
  smoke: 0.12, // wispy turbulence in the glow
  grain: 0.05, // subtle film grain
  palette: 'pinkCream',
};

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
    this.time = 0; // seconds of animation elapsed, fed to uTime
    this.lastTime = performance.now();

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
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
      },
    });

    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.scene.add(this.mesh);

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

  /** Swap the active palette at runtime without recompiling the shader. */
  setPalette(name) {
    if (!palettes[name]) return;
    this.paletteName = name;
    const [colorA, colorB, colorC, colorD, colorE] = paletteColors(name);
    this.material.uniforms.uColorA.value.copy(colorA);
    this.material.uniforms.uColorB.value.copy(colorB);
    this.material.uniforms.uColorC.value.copy(colorC);
    this.material.uniforms.uColorD.value.copy(colorD);
    this.material.uniforms.uColorE.value.copy(colorE);
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
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

    // Render every frame (full display refresh rate), advancing animation time
    // continuously so motion speed stays correct across a pause/resume.
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
