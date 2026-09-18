// Watches the drawing buffer for the seam artefact. Dev only.
//
// It answers one question: when the rectangles are on screen, are they in the
// buffer we DREW, or only in what the compositor SHOWED? It runs inside the
// render loop, right after the draw — the only moment the buffer is readable
// without preserveDrawingBuffer, and the reason it captures the frame itself
// rather than waiting for anyone to press a key.
//
// ============================================================================
// How it tells a seam from the artwork — and why the first version could not
// ============================================================================
// The first attempt averaged each row into 16px bins and looked for a large
// step between neighbouring bins. It was useless: measured, clean frames
// already contain bin-to-bin steps of ~35 wherever a channel edge crosses, so
// it fired on the artwork. Sweeping 240 phases produced 84 "seams".
//
// Two things separate a seam from anything the shader draws:
//
//   1. It is a DISCONTINUITY. Measured with the grain turned off, the largest
//      adjacent-pixel jump anywhere in a clean frame is 1.67 — the field is
//      smooth everywhere, including across its sharpest-looking edges, which
//      are gradients over ~20px. So adjacent pixels, not bins.
//
//   2. It is STRAIGHT. It lands at the same x in every row it crosses, whereas
//      a channel edge is curved and crosses each row somewhere else. So take
//      the MEDIAN across rows, which also disposes of the film grain: grain is
//      independent per pixel, so it cannot survive a median down a column.
//
// Calibrated on this hardware with the grain left on:
//
//   clean frames (phase and time both varied)   peak 19.7 – 23.3, at a random x
//   seam of magnitude 10 or 20                  not detected
//   seam of magnitude 30                        peak 25, at exactly the right x
//   seam of magnitude 40                        peak 35, at exactly the right x
//
// Hence a threshold of 28. The peak value is reported with every hit so a
// borderline reading can be told from an unmistakable one.

const LINES = 9; // rows and columns sampled per check
const THRESHOLD = 28; // median adjacent-pixel jump worth reporting
const EVERY = 45; // frames between checks

/** Median across lines of the adjacent-sample jump; returns {peak, at}. */
function scan(lines, n) {
  const count = lines.length;
  const col = new Float32Array(count);
  let peak = 0;
  let at = -1;
  for (let i = 1; i < n; i++) {
    for (let r = 0; r < count; r++) {
      const a = i * 4;
      const b = (i - 1) * 4;
      const line = lines[r];
      col[r] =
        (Math.abs(line[a] - line[b]) +
          Math.abs(line[a + 1] - line[b + 1]) +
          Math.abs(line[a + 2] - line[b + 2])) / 3;
    }
    const med = [...col].sort((x, y) => x - y)[count >> 1];
    if (med > peak) {
      peak = med;
      at = i;
    }
  }
  return { peak, at };
}

export default class SeamWatch {
  constructor(renderer, material) {
    this.gl = renderer.getContext();
    this.canvas = renderer.domElement;
    // Recorded with every hit. "It happens at an exact moment of the animation,
    // every time" means the fault is a function of these numbers — so capturing
    // them turns one sighting into an exact reproduction.
    this.material = material;
    this.frame = 0;
    this.checks = 0;
    this.hits = [];
    this.worst = 0; // highest peak seen, hit or not — shows the headroom
  }

  tick() {
    if (++this.frame % EVERY) return;
    this.check();
  }

  check() {
    const { gl } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return null;
    this.checks++;

    const rows = [];
    const cols = [];
    for (let i = 1; i <= LINES; i++) {
      const row = new Uint8Array(w * 4);
      gl.readPixels(0, Math.floor((h * i) / (LINES + 1)), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
      rows.push(row);
      const col = new Uint8Array(h * 4);
      gl.readPixels(Math.floor((w * i) / (LINES + 1)), 0, 1, h, gl.RGBA, gl.UNSIGNED_BYTE, col);
      cols.push(col);
    }

    const v = scan(rows, w); // a vertical seam steps along every row
    const hz = scan(cols, h); // a horizontal one steps down every column
    this.worst = Math.max(this.worst, v.peak, hz.peak);
    if (v.peak < THRESHOLD && hz.peak < THRESHOLD) return null;

    const hit = {
      at: new Date().toLocaleTimeString(),
      vertical: v.peak >= THRESHOLD ? { x: v.at, strength: +v.peak.toFixed(1) } : null,
      horizontal: hz.peak >= THRESHOLD ? { y: hz.at, strength: +hz.peak.toFixed(1) } : null,
      page: location.pathname,
      canvas: [w, h],
      uniforms: this.material
        ? (({ uScale, uSpeed, uPhase, uTime, uMix, uThick, uGlow, uSmoke, uGrain }) => ({
            uScale: +uScale.value.toFixed(4),
            uSpeed: +uSpeed.value.toFixed(4),
            uPhase: +uPhase.value.toFixed(4),
            uTime: +uTime.value.toFixed(4),
            uMix: +uMix.value.toFixed(4),
            uThick: +uThick.value.toFixed(4),
            uGlow: +uGlow.value.toFixed(4),
            uSmoke: +uSmoke.value.toFixed(4),
            uGrain: +uGrain.value.toFixed(4),
          }))(this.material.uniforms)
        : null,
      image: this.hits.length < 12 ? this.canvas.toDataURL() : null,
    };
    this.hits.push(hit);
    // eslint-disable-next-line no-console
    console.warn(
      `[seam] IN THE DRAWING BUFFER — ` +
        `vertical=${hit.vertical ? `x${hit.vertical.x} strength ${hit.vertical.strength}` : 'no'} ` +
        `horizontal=${hit.horizontal ? `y${hit.horizontal.y} strength ${hit.horizontal.strength}` : 'no'} ` +
        `(noise floor is ~24) on ${hit.page} at ${hit.at}`,
      hit.uniforms,
    );
    return hit;
  }
}
