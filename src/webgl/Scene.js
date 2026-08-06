import {
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene as ThreeScene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import vertexShader from './shaders/background.vert';
import fragmentShader from './shaders/background.frag';
import { paletteColors, paletteNames, palettes } from './palettes.js';

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

// Glass panel defaults.
const GLASS = {
  bend: 2.8, // gather distance at the rim, as a multiple of the bevel width
  bevel: 0.48, // thickness of the bevelled edge, as a fraction of the panel's
  // half-thickness: 1.0 is a fully domed panel, 0.2 a thin lip
  aberration: 3, // per-channel spread — 0 disables the extra samples
  frost: 0.06, // milkiness; anything much higher hides the refraction
  rim: 0.36, // specular highlight strength
  rimWidth: 0.02, // highlight reach, in uv units (1.0 = viewport height)
  wobble: 0.06, // bubble-wobble amplitude, in local units (half-height is 0.552)
  wobbleRate: 0.8, // how fast the outline breathes, radians per second
};

// Heart slots. Must match HEART_COUNT in background.frag. Kept tight — every
// slot costs an SDF test per pixel.
const HEART_COUNT = 5;

// Half-height of the heart shape in its own local space — a heart's true half
// height is this times its size. Used to park a new one just out of sight.
const HEART_HALF_H = 0.552;

// Floaters: all lengths in uv units, where 1.0 is the viewport height.
const FLOAT = {
  size: [0.22, 0.38], // scale factor; heart height is ~1.1× this, in uv units
  rise: [0.07, 0.16], // upward speed per second — a drift, not a launch
  stagger: 0.3, // extra depth below the edge, so they don't enter in a row
  jitter: 0.7, // how far a heart may stray within its band, as a fraction of it
  swayAmp: [0.01, 0.05],
  swayFreq: [0.25, 0.7],
  grow: 0.7, // seconds to swell to full size, so nothing pops in
  fadeFrom: 0.75, // uv height where they start shrinking away
  exit: 1.15, // uv height at which the slot frees
};

// The pointer's poke. Nothing is drawn at the pointer — the shader pushes a
// heart's own surface outward near it, so a heart the pointer is over bulges
// under it, and where there is no heart there is nothing to push.
const POKE = {
  radius: 0.2, // how far from the pointer the swelling reaches, in uv units
  amount: 0.02, // how far the surface is pushed out, same units
  pull: 13, // how hard the poke is drawn toward the pointer, per second
  fade: 0.28, // seconds to swell in once the pointer first moves
};

// Palette transition: a wavefront (driven by the shader's uMix) that expands
// outward from the channel centres, so the new palette flows out from the core
// through the field. PALETTE_FADE is how long that outward flow takes.
const PALETTE_FADE = 3.6; // seconds for the front to sweep the whole field

// Scale/speed changes (opening a project page tightens and calms the field) ease
// over this long. Shorter than the palette sweep — it reads as a response to the
// click, but slow enough that neither value visibly steps.
const TWEEN_FADE = 1.8; // seconds

// On load the field sits pulled well back — small, dense cells — and stays there
// until the first click, which eases it in to the page's normal scale. The
// pattern blooms outward from the centre of the screen (where the shader anchors
// the zoom), so the site lands on a deliberate gesture rather than on a timer.
// Slower than a normal tween: this one is the arrival, not a reaction to a click.
const INTRO_SCALE = 5.5; // vs 1.55 default
const INTRO_FADE = 3.4; // seconds

/**
 * Full-screen animated gooey gradient background rendered with a Three.js
 * ShaderMaterial. All visual logic lives in background.frag; this class only sets
 * uniforms, handles resize, swaps palettes, and runs the loop.
 */
export default class Scene {
  constructor(canvas) {
    this.canvas = canvas;

    // Manual time source (rather than THREE.Clock) so we can pause on tab-hide
    // and resume without the shader time jumping forward by the hidden span.
    this.time = 0; // real seconds, fed to uTime (grain shimmer)
    this.phase = 0; // morph phase, fed to uPhase — integral of speed over time
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
        uPhase: { value: 0 },
        uResolution: { value: new Vector2() },
        // Read by tick() to advance uPhase — the shader never sees it. Kept in
        // uniforms so the ?debug slider can drive it like any other knob.
        uSpeed: { value: DEFAULTS.speed },
        // Starts pulled back; the intro tween kicked off below eases it in.
        uScale: { value: INTRO_SCALE },
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
        // Glass hearts — all slots start empty (size 0), so nothing is drawn.
        uHearts: {
          value: Array.from({ length: HEART_COUNT }, () => new Vector3()),
        },
        uGlassBend: { value: GLASS.bend },
        uGlassBevel: { value: GLASS.bevel },
        uGlassAberration: { value: GLASS.aberration },
        uGlassFrost: { value: GLASS.frost },
        uGlassRim: { value: GLASS.rim },
        uGlassRimWidth: { value: GLASS.rimWidth },
        uWobble: { value: GLASS.wobble },
        uWobbleRate: { value: GLASS.wobbleRate },
        uPointer: { value: new Vector2() },
        uPoke: { value: 0 },
        uPokeRadius: { value: POKE.radius },
        uPokeAmount: { value: POKE.amount },
      },
    });

    this.paletteMix = null;
    // The intro is still waiting on its click, and where it should land when it
    // gets one. setScale() keeps scaleTarget current meanwhile, so a page that
    // wants a different scale (a project page) lands on that instead.
    this.introPending = true;
    this.scaleTarget = DEFAULTS.scale;
    this.tweens = new Map(); // uniform name → { from, to, start, duration }
    // Floater state, one entry per floater slot.
    this.floaters = Array.from({ length: HEART_COUNT }, () => null);
    this.aspect = 1;

    // Poke: where it currently sits, the pointer it chases, and how far it has
    // swelled in. `pointer` stays null until the pointer first moves, so it does
    // nothing before then (and never on a touch device that only taps).
    this.poke = { x: 0, y: 0 };
    this.pointer = null;
    this.pokeAmount = 0;

    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.scene.add(this.mesh);

    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onFirstClick = this.onFirstClick.bind(this);

    window.addEventListener('resize', this.resize);
    // pointerdown rather than click: it fires on touch too, and it lands the
    // field on the press instead of waiting for the release.
    window.addEventListener('pointerdown', this.onFirstClick);
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    // On window, not the canvas: the canvas sits at z-index -1 with the page
    // content above it, so it never sees a pointer event itself.
    window.addEventListener('pointermove', this.onPointerMove);
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

  /**
   * Ease a scalar uniform toward a new value over `duration` seconds. tick()
   * advances it; a call mid-tween re-aims from wherever the value currently
   * sits, so it never snaps.
   */
  tweenTo(name, target, duration = TWEEN_FADE) {
    // Already there, or already heading there (setupPage() re-runs on every
    // swup view, so the same target can arrive twice). Leaving the running
    // tween alone is also what protects the slow intro from being restarted at
    // the normal duration by setupPage()'s setScale() on first load.
    const running = this.tweens.get(name);
    if (running?.to === target) return;
    const from = this.material.uniforms[name].value;
    if (!running && target === from) return;

    this.tweens.set(name, { from, to: target, start: this.realTime, duration });
  }

  /**
   * Cell/channel density — a higher target packs the field into more, smaller
   * cells. No argument returns to the default.
   *
   * Before the intro click this only records where to land: the field has to
   * stay pulled back until the click, and setupPage() asks for the page's scale
   * as soon as the page loads.
   */
  setScale(target = DEFAULTS.scale) {
    this.scaleTarget = target;
    if (this.introPending) return;
    this.tweenTo('uScale', target);
  }

  /**
   * The arrival. The first click anywhere eases the opening scale in to whatever
   * the current page asked for, over the longer INTRO_FADE — after that the
   * listener is gone and scale changes go back to being ordinary tweens.
   */
  onFirstClick() {
    if (!this.introPending) return;
    this.introPending = false;
    window.removeEventListener('pointerdown', this.onFirstClick);
    this.tweenTo('uScale', this.scaleTarget, INTRO_FADE);
  }

  /**
   * Morph speed — how fast the cells reshape. No argument returns to the
   * default. Safe to change at any time: tick() accumulates the phase, so the
   * field only changes pace, it never jumps.
   */
  setSpeed(target = DEFAULTS.speed) {
    this.tweenTo('uSpeed', target);
  }

  /**
   * Send up a drift of glass hearts from below the viewport. They use the same
   * Slots already in use are left alone, so calling this again mid-flight tops
   * the drift up rather than restarting it.
   */
  releaseHearts(count = 4) {
    const rand = (range) => range[0] + Math.random() * (range[1] - range[0]);

    for (let n = 0; n < count; n++) {
      const slot = this.floaters.indexOf(null);
      if (slot === -1) break; // all slots busy

      const size = rand(FLOAT.size);
      // Spread across the width in bands rather than independently at random:
      // four random x's cluster together surprisingly often, and hearts landing
      // on each other read as one blob instead of a drift. The jitter keeps it
      // from looking measured out, while the band keeps them from ever stacking.
      const band = this.aspect / count;
      const x = band * (n + 0.5 + (Math.random() - 0.5) * FLOAT.jitter);

      this.floaters[slot] = {
        size,
        x,
        // Parked just below the edge — its own half-height clears it, whatever
        // its size — plus a little stagger so they arrive as a loose stream
        // rather than a row. Anything deeper is time spent climbing unseen.
        y: -HEART_HALF_H * size - Math.random() * FLOAT.stagger,
        rise: rand(FLOAT.rise),
        swayAmp: rand(FLOAT.swayAmp),
        swayFreq: rand(FLOAT.swayFreq),
        phase: Math.random() * Math.PI * 2,
        age: 0,
      };
    }
  }

  /**
   * Pointer position in the shader's uv units: both axes are scaled by the
   * viewport height (uv.x runs 0..aspect), and uv.y counts up from the bottom.
   */
  onPointerMove(event) {
    const x = event.clientX / window.innerHeight;
    const y = 1 - event.clientY / window.innerHeight;

    // First sighting: drop the poke on the pointer rather than letting it sweep
    // in from the corner, deforming every heart on the way.
    if (!this.pointer) {
      this.poke.x = x;
      this.poke.y = y;
    }
    this.pointer = { x, y };
  }

  /** Drag the poke along behind the pointer and hand it to the shader. */
  updatePoke(dt) {
    // Exponential easing rather than a fixed step per frame, so the lag feels
    // the same on a 60Hz and a 120Hz display. The lag is what gives the bulge
    // its viscosity — it trails the pointer instead of tracking it rigidly.
    const pull = 1 - Math.exp(-POKE.pull * dt);
    const fade = 1 - Math.exp(-dt / POKE.fade);

    this.pokeAmount += ((this.pointer ? 1 : 0) - this.pokeAmount) * fade;

    if (this.pointer) {
      this.poke.x += (this.pointer.x - this.poke.x) * pull;
      this.poke.y += (this.pointer.y - this.poke.y) * pull;
    }

    const u = this.material.uniforms;
    u.uPointer.value.set(this.poke.x, this.poke.y);
    u.uPoke.value = this.pokeAmount;
  }

  /** Advance the floaters and write every slot into uHearts. */
  updateHearts(dt) {
    const slots = this.material.uniforms.uHearts.value;

    for (let i = 0; i < HEART_COUNT; i++) {
      const f = this.floaters[i];
      if (!f) continue;

      f.age += dt;
      f.y += f.rise * dt;

      if (f.y > FLOAT.exit) {
        this.floaters[i] = null;
        slots[i].set(0, 0, 0); // free the slot: size 0 means "skip me"
        continue;
      }

      // Size carries the fade: swelling in at the bottom and shrinking away near
      // the top means they never pop, and it costs no extra uniform.
      const grow = Math.min(f.age / FLOAT.grow, 1);
      const shrink = 1 - Math.max(0, (f.y - FLOAT.fadeFrom) / (FLOAT.exit - FLOAT.fadeFrom));
      const sway = Math.sin(f.phase + f.age * f.swayFreq) * f.swayAmp;

      slots[i].set(f.x + sway, f.y, f.size * grow * Math.max(shrink, 0));
    }
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
    this.aspect = w / h; // uv.x spans 0..aspect — the floaters' horizontal range
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

    // Real seconds — drives the grain shimmer only.
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

    // Uniform tweens — ease-out so values settle rather than arriving flat.
    // Runs before the phase step so a speed change takes effect this frame.
    for (const [name, { from, to, start, duration }] of this.tweens) {
      const t = Math.min((this.realTime - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.material.uniforms[name].value = from + (to - from) * eased;
      if (t >= 1) this.tweens.delete(name);
    }

    // Morph phase — integrating the (possibly tweening) speed keeps the slice
    // continuous, so slowing down eases the field's pace instead of jumping it.
    this.phase += dt * this.material.uniforms.uSpeed.value;

    this.updateHearts(dt);
    this.updatePoke(dt);

    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uPhase.value = this.phase;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointerdown', this.onFirstClick);
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
