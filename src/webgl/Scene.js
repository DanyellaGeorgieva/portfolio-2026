import {
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene as ThreeScene,
  ShaderMaterial,
  NearestFilter,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

import vertexShader from './shaders/background.vert';
import fragmentShader from './shaders/background.frag';
import { paletteColors, paletteNames, palettes } from './palettes.js';

// Default look — slow and languid, low-frequency two-tone field (see spec:
// "Motion feel — this matters most").
const DEFAULTS = {
  speed: 0.18, // morph speed — how fast the cells reshape
  scale: 3.6, // cell/channel density (low = big cells)
  thick: 0.24, // channel (bright core) width
  glow: 4.2, // warm-glow spread beyond the core
  smoke: 0.26, // wispy turbulence in the glow
  grain: 0.12, // subtle film grain
  palette: 'skyOrchid',
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

// Half-width in the same local space — the edge the drift has to stop at, so a
// heart turns back rather than sliding out of frame. Must match the shader's
// HEART_HALF_W.
const HEART_HALF_W = 0.604;

// Floaters: all lengths in uv units, where 1.0 is the viewport height.
const FLOAT = {
  size: [0.22, 0.38], // scale factor; heart height is ~1.1× this, in uv units
  rise: [0.07, 0.16], // upward speed per second — a drift, not a launch
  // Sideways speed per second. Well under the rise, so the path leans without
  // ever stopping being a climb. Signed outward from the middle of the screen at
  // release, so the drift opens the group up instead of crossing them over each
  // other — and slow enough that most hearts leave through the top, not the side.
  drift: [0.012, 0.035],
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

// Longest step any single frame may advance the scene by, in seconds. Roughly
// three frames at 30fps: long enough that an ordinary hitch still plays through,
// short enough that a pause of any length resumes rather than jumps.
const MAX_STEP = 0.1;

/**
 * Full-screen animated gooey gradient background rendered with a Three.js
 * ShaderMaterial. All visual logic lives in background.frag; this class only sets
 * uniforms, handles resize, swaps palettes, and runs the loop.
 */
export default class Scene {
  /**
   * @param canvas the persistent canvas in the shell
   * @param onPalette called with the palette name whenever it changes — including
   *   the initial one and the number-key shortcuts, so anything outside the
   *   shader that follows the palette (the page's ink) can never fall out of step
   */
  constructor(canvas, { onPalette } = {}) {
    this.canvas = canvas;
    this.onPalette = onPalette;

    // Manual time source (rather than THREE.Clock) so we can pause on tab-hide
    // and resume without the shader time jumping forward by the hidden span.
    this.time = 0; // real seconds, fed to uTime (grain shimmer)
    this.phase = 0; // morph phase, fed to uPhase — integral of speed over time
    this.realTime = 0; // true elapsed seconds (drives palette-fade timing)
    this.lastTime = performance.now();

    // No antialias: the scene is a single full-screen quad with no polygon
    // edges, so MSAA buys nothing here and only adds fill-rate cost.
    this.renderer = new WebGLRenderer({ canvas, antialias: false });

    // --- Why there is no syncFrame() here any more -------------------------
    // There used to be a syncFrame() calling gl.finish() every frame, on the
    // theory that the seam is the compositor presenting a frame whose draw has
    // not finished. That theory still stands. The remedy never did: gl.finish()
    // DOES NOT BLOCK in Chrome's WebGL. Measured here, with ~114ms of field
    // renders deliberately queued up first:
    //
    //   gl.finish()   returned in   0.0ms   <- did not wait at all
    //   gl.flush()    returned in   0.2ms   <- non-blocking by spec
    //   readPixels()  returned in 147.9ms   <- genuinely waits
    //
    // So syncMode:'finish' — the default, and the thing that was supposed to be
    // the fix — was a no-op. That is the whole reason the seam watcher appeared
    // to cure the bug while the fix did nothing: the watcher calls readPixels,
    // and readPixels was the only one of the two that was ever a sync. Chrome's
    // command buffer treats finish as an ordering hint, not a stall.
    //
    // syncMode:'pixel' (readPixels) does suppress the artefact, but it stalls
    // the main thread for 50-150ms a frame, so it is a diagnostic, not an
    // option. It is worth keeping in mind as the one lever known to work.
    //
    // What this does NOT yet explain is the seam itself. The field pass costs
    // ~6.2ms at 1792x878 on this machine, plus ~0.3ms for the copy — inside a
    // 16.7ms budget, so the WebGL draw alone is not obviously missing the
    // deadline. The next thing to measure is the compositing on the real pages
    // (the SVG goo filters over a z-index -1 canvas), not the shader.
    // Set once, here, and never again. This is a fill-rate-bound full-screen
    // shader: every physical pixel runs the whole fragment program each frame,
    // so cost scales with pixelRatio². The gradient is soft with no hard edges,
    // so rendering at DPR 1 (instead of the display's native 2 on HiDPI) is ~4×
    // cheaper and near-indistinguishable. Bump toward 1.5 if it looks too soft.
    //
    // Not in applyResize, where it used to sit: three's setPixelRatio re-runs
    // setSize with the dimensions it already had, so calling it before the real
    // setSize allocated the buffer twice per resize — once at the stale size.
    // Starts at 1 and is set for real in applyResize, which knows the device
    // ratio. Only ever assigned when it actually changes: three's
    // setPixelRatio re-runs setSize with the dimensions it already has, so
    // calling it unconditionally before the real setSize would allocate the
    // buffer twice on every resize — once at the stale size.
    this.pixelRatio = 0;
    // Output raw shader values so the sampled palette hex renders faithfully
    // (no extra linear→sRGB encoding on top of the already-sRGB ramp).
    this.renderer.outputColorSpace = LinearSRGBColorSpace;

    this.scene = new ThreeScene();
    // Ortho camera so the plane maps 1:1 to the viewport.
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const params = new URLSearchParams(window.location.search);
    // Canvas resolution override — see applyResize for what this is testing.
    const dpr = Number(params.get('dpr'));
    this.ratioOverride = dpr > 0 ? Math.min(dpr, 2) : null;
    const requested = params.get('palette');
    this.paletteName =
      requested && palettes[requested] ? requested : DEFAULTS.palette;

    const [colorA, colorB, colorC, colorD, colorE] = paletteColors(this.paletteName);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      // The shader sizes its uHearts array from this, rather than carrying its
      // own #define that a comment asked to be kept in step. A mismatch used to
      // be silent: the array would size to the shader's number and the extra
      // slots written from here would go nowhere.
      defines: { HEART_COUNT },
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: 0 },
        uResolution: { value: new Vector2() },
        // Read by tick() to advance uPhase — the shader never sees it. Kept in
        // uniforms so the ?debug slider can drive it like any other knob.
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

    // Last size actually given to the renderer, and the pending coalesced
    // resize. Both start null so the first applyResize() always runs.
    this.width = null;
    this.height = null;
    this.resizePending = null;

    this.paletteMix = null;
    this.tweens = new Map(); // uniform name → { from, to, start }
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

    // --- Draw off-screen, then copy ----------------------------------------
    // The field is no longer drawn into the buffer that gets presented. It is
    // drawn into a texture of our own, and what reaches the screen is a copy.
    //
    // Why: the evidence says frames were reaching the screen before their draw
    // had finished, and the unfinished parts showed the previous frame — hard
    // rectangles that clear on the next good frame. The expensive, slow draw was
    // the one racing the compositor.
    //
    // Now that draw has no deadline: it renders into the target, and nothing can
    // show it until it is done. What races the compositor instead is a
    // full-screen texture copy — one sample per pixel, no noise, no loops, no
    // branches — which finishes in a fraction of a frame.
    //
    // It is also the version of "keep the broken frame off the screen" that
    // works. The seam cannot be moved out of view, because it sits at a fraction
    // of the canvas and moves with it; but an unfinished frame can be stopped
    // from being the thing that gets shown.
    this.target = null; // built in applyResize, which knows the size
    this.copyScene = new ThreeScene();
    this.copyMaterial = new ShaderMaterial({
      vertexShader,
      fragmentShader:
        'varying vec2 vUv;\n' +
        'uniform sampler2D uTex;\n' +
        'void main() { gl_FragColor = texture2D(uTex, vUv); }\n',
      uniforms: { uTex: { value: null } },
    });
    this.copyScene.add(new Mesh(new PlaneGeometry(2, 2), this.copyMaterial));

    this.resize = this.resize.bind(this);
    this.applyResize = this.applyResize.bind(this);
    this.tick = this.tick.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);

    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    // On window, not the canvas: the canvas sits at z-index -1 with the page
    // content above it, so it never sees a pointer event itself.
    window.addEventListener('pointermove', this.onPointerMove);
    this.applyResize(); // synchronously: there is no previous frame to keep

    // Dev only: watches the drawing buffer for the seam artefact, so the next
    // sighting tells us whether it is in what we drew or only in what was shown.
    if (import.meta.env.DEV) {
      import('./seamWatch.js').then(({ default: SeamWatch }) => {
        this.seamWatch = new SeamWatch(this.renderer, this.material);
        window.__seams = () => this.seamWatch.hits;
        // Turn the watcher off/on at runtime.
        //
        // This matters beyond convenience: readPixels forces a GPU sync — it
        // blocks until rendering has actually finished — so the act of watching
        // can suppress a race. If the seams stop while it is on and come back
        // when it is off, the fault is a synchronisation one, which is a finding
        // rather than an inconvenience.
        window.__seamWatch = (on = true) => {
          this.seamWatchOff = !on;
          return on ? 'watching (readPixels forces a GPU sync)' : 'OFF - no readPixels, no sync';
        };
        // Force a check right now, for verifying the watcher is alive.
        window.__seamCheck = () => {
          this.drawFrame();
          this.seamWatch.check();
          return this.seamWatch.hits.length ? 'SEAM FOUND — see __seams()' : 'buffer clean';
        };
        window.__seamStatus = () => ({
          checksRun: this.seamWatch.checks,
          hits: this.seamWatch.hits.length,
        });
        window.__seamImage = (i = 0) => {
          const hit = this.seamWatch.hits[i];
          if (!hit?.image) return 'no image for that hit';
          const img = new Image();
          img.src = hit.image;
          img.style.cssText =
            'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;object-fit:fill';
          img.onclick = () => img.remove();
          document.body.append(img);
          return 'click to dismiss';
        };
        // eslint-disable-next-line no-console
        console.info('[seam] watching the drawing buffer. __seamStatus() for a count.');
      });
    }

    // Flip the canvas resolution without reloading. __dpr(2) doubles the
    // frame's cost and makes the rectangles appear reliably — it is the only
    // known way to summon them on demand, so it stays as a test lever.
    window.__dpr = (n) => {
      this.ratioOverride = n > 0 ? Math.min(n, 2) : null;
      this.width = null; // force applyResize to act
      this.applyResize();
      return `canvas ${this.canvas.width}x${this.canvas.height} at ratio ${this.pixelRatio}`;
    };

    this.renderer.setAnimationLoop(this.tick);

    // Announce the starting palette now the scene is built, so the page's ink
    // matches the very first frame.
    this.onPalette?.(this.paletteName);

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
    this.onPalette?.(name);
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
   * Ease a scalar uniform toward a new value. tick() advances it; a call
   * mid-tween re-aims from wherever the value currently sits, so it never snaps.
   */
  tweenTo(name, target) {
    // Already there, or already heading there (setupPage() re-runs on every
    // swup view, so the same target can arrive twice).
    const running = this.tweens.get(name);
    if (running?.to === target) return;
    const from = this.material.uniforms[name].value;
    if (!running && target === from) return;

    this.tweens.set(name, { from, to: target, start: this.realTime });
  }

  /**
   * Cell/channel density — a higher target packs the field into more, smaller
   * cells. No argument returns to the default.
   */
  setScale(target = DEFAULTS.scale) {
    this.tweenTo('uScale', target);
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
        // Outward from the centre line, so the group fans apart as it climbs.
        drift: rand(FLOAT.drift) * (x < this.aspect / 2 ? -1 : 1),
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
      f.x += f.drift * dt; // the lean; sway still wobbles around it

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
      const size = f.size * grow * Math.max(shrink, 0);

      // Keep them in frame. A heart that reaches either edge turns its drift
      // around rather than stopping there, so it wanders back across instead of
      // pressing against the side for the rest of its climb. The bound is the
      // heart's own half-width, which is why it uses the drawn size and not the
      // slot's full size — a heart still swelling in may pass closer.
      const halfW = HEART_HALF_W * size;
      const limit = this.aspect - halfW;
      if (f.x < halfW) {
        f.x = halfW;
        f.drift = Math.abs(f.drift);
      } else if (f.x > limit) {
        f.x = limit;
        f.drift = -Math.abs(f.drift);
      }

      // The sway rides on top of the drift and can push past the bound on its
      // own, so the drawn position is clamped too.
      const x = Math.min(Math.max(f.x + sway, halfW), limit);

      slots[i].set(x, f.y, size);
    }
  }

  /** Number keys 1..N cycle through the named palettes. */
  onKeyDown(event) {
    const index = Number(event.key) - 1;
    if (index >= 0 && index < paletteNames.length) {
      this.setPalette(paletteNames[index]);
    }
  }

  /**
   * A resize event only *schedules* the work; applyResize does it.
   *
   * Resizing a WebGL drawing buffer throws its contents away — assigning
   * canvas.width reallocates it whatever value you assign — so between the
   * resize and the next render there is a canvas with nothing in it, and
   * whatever the compositor does in that gap is what reaches the screen.
   * Rectangles of stale or blank canvas are that gap being composited.
   *
   * The gap is normally one frame. It is unbounded whenever nothing is
   * rendering, and there are two ordinary ways to be in that state:
   *
   *   • the tab is hidden — onVisibilityChange stops the loop outright
   *   • the window is occluded or minimised — Chrome stops serving rAF without
   *     firing visibilitychange at all, so the loop is "running" and never called
   *
   * Deferring to rAF closes both, because rAF is exactly what is not being
   * serviced in either: the buffer is not touched until we are about to draw
   * into it, so it is never left empty. It also coalesces a drag-resize — dozens
   * of events per frame — into one reallocation per frame.
   */
  resize() {
    if (this.resizePending) return;
    this.resizePending = requestAnimationFrame(this.applyResize);
  }

  applyResize() {
    this.resizePending = null;
    const { innerWidth: w, innerHeight: h } = window;
    // --- Canvas resolution -------------------------------------------------
    // DPR 1, not the display's native 2. This is a fill-rate-bound full-screen
    // shader, so cost scales with ratio², and the gradient is soft enough that
    // half resolution is near-indistinguishable.
    //
    // It is also, measured, what keeps the artefact away. Raising the canvas to
    // the device ratio was tried: it removes the compositor's rescale of the
    // layer, which looked like the cause, but it takes the frame from ~6.5ms to
    // ~12.5ms (the copy has to fill four times the pixels) and the hard-edged
    // rectangles then appear RELIABLY, on a page where they otherwise do not.
    // Tested both ways on /work/, ten transitions each: rectangles at ratio 2,
    // none at ratio 1.
    //
    // So the artefact tracks how long the frame takes, not how the layer is
    // scaled. __dpr(2) is kept below because it is the one switch known to
    // reproduce it on demand — useful for checking whether any future change
    // has pushed the frame back over whatever the real budget is.
    const ratio = this.ratioOverride ?? 1;
    if (ratio !== this.pixelRatio) {
      this.pixelRatio = ratio;
      this.renderer.setPixelRatio(ratio);
      this.width = null; // force the size below to be applied at the new ratio
    }

    // A resize event is not proof of a resize: they fire during a window drag,
    // on a monitor change, and when browser UI shows or hides, often with the
    // CSS size unchanged. Since the reallocation happens whatever the value,
    // acting on one of those would throw a good frame away for nothing.
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;

    // updateStyle false: the stylesheet already sizes the canvas at 100%/100% of
    // a fixed, inset-0 box. Letting three write inline pixel sizes instead means
    // that in any moment the two disagree the canvas stops covering the
    // viewport; left to CSS, a disagreement only scales the image for a frame.
    this.renderer.setSize(w, h, false);
    // The target is at CSS resolution, the canvas at the device ratio, so the
    // copy magnifies. Linear rather than nearest: nearest would turn the
    // upscale into visible 2×2 blocks, and the field has no hard edges for
    // linear to soften.
    this.target?.dispose();
    // The target matches the canvas exactly at ratio 1, so the copy is 1:1 and
    // nearest keeps it an exact copy rather than a resample. (At ratio 2 it
    // magnifies, and linear would be wanted — but ratio 2 is a test mode.)
    this.target = new WebGLRenderTarget(w, h, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.copyMaterial.uniforms.uTex.value = this.target.texture;
    this.material.uniforms.uResolution.value.set(w, h);
    this.aspect = w / h; // uv.x spans 0..aspect — the floaters' horizontal range

    // Fill the new buffer in the same frame it was allocated, so there is no
    // moment in which an empty one can reach the screen.
    this.drawFrame();
  }

  /**
   * The field into our own texture, where nothing can show it half-drawn, then
   * the cheap copy into the buffer that is actually presented. Every draw goes
   * through here — the loop, a resize, and coming back from a hidden tab — so
   * none of them can quietly bypass the target.
   */
  drawFrame() {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.copyScene, this.camera);
  }

  /** Stop rendering entirely while the tab is backgrounded; resume on return. */
  onVisibilityChange() {
    if (document.hidden) {
      this.renderer.setAnimationLoop(null);
    } else {
      // Discard the hidden span so animation continues from where it paused.
      this.lastTime = performance.now();
      // Draw before resuming rather than waiting for the loop's first frame:
      // coming back is exactly when a stale buffer would be composited, and
      // setAnimationLoop only schedules — it does not draw.
      //
      // Through the render target, like every other draw. This used to render
      // the field directly at the canvas, which put the one expensive draw of
      // the whole scene into the presented buffer at precisely the moment the
      // off-screen target exists to protect it.
      this.drawFrame();
      this.renderer.setAnimationLoop(this.tick);
    }
  }

  tick() {
    const now = performance.now();
    // Capped, because a frame gap is not always a frame gap: a backgrounded or
    // occluded window can stop being served rAF without ever firing
    // visibilitychange, and the first frame back then carries the entire pause.
    // Uncapped, that one step teleports the floaters past their exit height and
    // frees every slot, so the hearts vanish the moment you come back to the tab.
    const dt = Math.min((now - this.lastTime) / 1000, MAX_STEP);
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
    for (const [name, { from, to, start }] of this.tweens) {
      const t = Math.min((this.realTime - start) / TWEEN_FADE, 1);
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
    this.drawFrame();
    if (!this.seamWatchOff) this.seamWatch?.tick(); // right after the draw: the
    // buffer is only readable before it has been presented
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    cancelAnimationFrame(this.resizePending);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.target?.dispose();
    // The copy quad's geometry too — it is a second PlaneGeometry, and disposing
    // only its material left the buffers on the GPU.
    this.copyScene.traverse((o) => o.geometry?.dispose());
    this.copyMaterial.dispose();
    this.renderer.dispose();
  }
}
