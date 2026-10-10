// The frame round the screen, with a wavy inner edge.
//
// One <path> in a fixed, full-screen <svg>: the screen's own rectangle with a
// hole cut out of it, and the hole is what is wavy. Nothing is filtered — the
// wave is in the geometry. The hole's outline is walked point by point, each
// point is pushed in or out by smooth noise read at its own place on the
// screen, and the result is written to the path's `d`.
//
// Reading the noise by position is what makes it organic: two points near each
// other get nearly the same push, so the edge swells rather than jitters, and
// the outline closes on itself with no join to hide.
//
// It does not move. It is drawn once, in its shape, and again only when the
// window changes size.

// Everything worth tuning. Lengths are CSS px.
const WAVE = {
  amplitude: 5, // furthest the edge strays from straight, either way
  wavelength: 190, // roughly the length of one swell along the edge
  detail: 0.35, // a second, finer swell on top: its share of the first
  step: 14, // distance between points along a straight side
  corner: 5, // points round each rounded corner
};

// --- Noise ------------------------------------------------------------------
// Value noise in three dimensions: a random number at every whole-number
// corner of a grid, blended smoothly in between. Two across the screen, and a
// third that only picks which slice of it is read. Returns -1..1.

function hash(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function noise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const corner = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  const near = lerp(
    lerp(corner(0, 0, 0), corner(1, 0, 0), u),
    lerp(corner(0, 1, 0), corner(1, 1, 0), u),
    v,
  );
  const far = lerp(
    lerp(corner(0, 0, 1), corner(1, 0, 1), u),
    lerp(corner(0, 1, 1), corner(1, 1, 1), u),
    v,
  );
  return lerp(near, far, w) * 2 - 1;
}

// --- The shape, in three parts ----------------------------------------------
// Exported: the visualizer's window (visualizer/playerWindow.js) frames its
// video with the same outline, the same swell and the same line.

/**
 * A rounded rectangle as points, walked clockwise from the top left, each with
 * the direction that leads straight out of it (nx, ny).
 */
export function roundedRect(left, top, right, bottom, radius) {
  const r = Math.max(0, Math.min(radius, (right - left) / 2, (bottom - top) / 2));

  const points = [];
  const side = (x0, y0, x1, y1, nx, ny) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const count = Math.max(1, Math.round(length / WAVE.step));
    // Up to but not including the far end: the corner after it starts there.
    for (let i = 0; i < count; i++) {
      const t = i / count;
      points.push({ x: lerp(x0, x1, t), y: lerp(y0, y1, t), nx, ny });
    }
  };
  const corner = (cx, cy, from) => {
    for (let i = 0; i < WAVE.corner; i++) {
      const a = from + (i / WAVE.corner) * (Math.PI / 2);
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      points.push({ x: cx + nx * r, y: cy + ny * r, nx, ny });
    }
  };

  side(left + r, top, right - r, top, 0, -1);
  corner(right - r, top + r, -Math.PI / 2);
  side(right, top + r, right, bottom - r, 1, 0);
  corner(right - r, bottom - r, 0);
  side(right - r, bottom, left + r, bottom, 0, 1);
  corner(left + r, bottom - r, Math.PI / 2);
  side(left, bottom - r, left, top + r, -1, 0);
  corner(left + r, top + r, Math.PI);
  return points;
}

/**
 * How far the edge swells at a place, -1..1. Two swells: the long one, and a
 * finer one on top of it, read from elsewhere in the noise so the two never
 * line up. `slice` is which layer of the noise is read: another slice is
 * another shape of the same character.
 */
export function swell(x, y, slice = 0) {
  const scale = 1 / WAVE.wavelength;
  return (
    (noise(x * scale, y * scale, slice) +
      WAVE.detail * noise(x * scale * 2.3 + 40, y * scale * 2.3 + 40, slice + 9)) /
    (1 + WAVE.detail)
  );
}

/**
 * A smooth closed line through points, as path data. Each point is the control
 * point of a curve that runs from the midpoint before it to the midpoint after
 * it. The curves meet at those midpoints already pointing the same way, so
 * there is no corner anywhere — and it closes on itself the same way.
 */
export function smoothPath(xs, ys) {
  const f = (v) => v.toFixed(1);
  const n = xs.length;
  let d = `M${f((xs[n - 1] + xs[0]) / 2)} ${f((ys[n - 1] + ys[0]) / 2)}`;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    d += `Q${f(xs[i])} ${f(ys[i])} ${f((xs[i] + xs[j]) / 2)} ${f((ys[i] + ys[j]) / 2)}`;
  }
  return d + 'Z';
}

export default class WaveFrame {
  /**
   * @param {SVGSVGElement} svg the shell's .screen-frame
   */
  constructor(svg) {
    this.svg = svg;
    this.path = svg.querySelector('path');
    this.points = [];

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);

    this.measure();
    this.draw();
    // Only now does the stylesheet's plain frame stand down (see main.scss):
    // there is never a moment with no frame, and none with two.
    document.documentElement.classList.add('has-wave-frame');
  }

  /**
   * Lay the hole's outline out as points, each with the direction it is pushed
   * in: straight out from the page, toward the screen's edge.
   */
  measure() {
    const style = getComputedStyle(this.svg);
    const frame = parseFloat(style.getPropertyValue('--frame')) || 16;
    const radius = parseFloat(style.getPropertyValue('--frame-radius')) || 0;
    // The element's own box, not window.inner*: it is fixed at inset 0, so
    // this is the screen less any scrollbar — the same box the old frame had.
    const w = (this.width = this.svg.clientWidth);
    const h = (this.height = this.svg.clientHeight);

    this.points = roundedRect(frame, frame, w - frame, h - frame, radius);
    // The push can never reach the screen's edge, or the frame would tear
    // open there. A pixel and a half of frame is always left. (See draw():
    // this is approached, not hit.)
    this.limit = Math.max(0, frame - 1.5);
  }

  draw() {
    const { points, width: w, height: h, limit } = this;

    const n = points.length;
    const xs = new Array(n);
    const ys = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      let push = swell(p.x, p.y) * WAVE.amplitude;
      // Into the page there is room for any crest. Toward the screen's edge
      // there is only the frame's own width, so that way the push is eased
      // against the limit rather than cut off at it: a tall crest rounds over
      // under the edge instead of going flat along it.
      if (push > 0) push = limit * Math.tanh(push / limit);
      xs[i] = p.x + p.nx * push;
      ys[i] = p.y + p.ny * push;
    }

    // The screen, and a pixel past it; then the hole, as a smooth line.
    this.path.setAttribute('d', `M-1-1H${w + 1}V${h + 1}H-1Z` + smoothPath(xs, ys));
  }

  resize() {
    this.measure();
    this.draw();
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    document.documentElement.classList.remove('has-wave-frame');
    this.path.removeAttribute('d');
  }
}

// --- The bar on a phone -----------------------------------------------------
// On a phone there is no frame round the screen (main.scss, Small screens):
// what is left of it is the bar across the top — the header, or a case
// study's Back bar — and that keeps the frame's edge. The bar's ink is drawn
// here as one <path>: its box, with the bottom side swelling the way the
// frame's inner edge does, read from the same noise by position.
//
// The svg is put inside the bar, behind what is in it, and sized by the
// stylesheet (.wave-bar); it is drawn again whenever the bar changes size.
// The root is marked .has-wave-bar while any bar is drawn this way, which is
// when the stylesheet takes the bars' own flat background away.

// The frame's own swell is 5px over a 190px wavelength, which along a 390px
// bar came out as two shallow swells that read as a bar cut slightly crooked.
// So the bar's is deeper and shorter, to read as a wave at that width — and
// it hangs: the edge strays further below the bar's box than above it, where
// the words are.
const BAR_SWELL = 8; // the edge's reach, px: this far either side of its middle
const BAR_HANG = 0.4; // the middle sits this share of the reach below the box
const BAR_WAVELENGTH = 105; // px for one swell along the bar
const BAR_SLICE = 2; // which layer of the noise: not the frame's
let waveBars = 0;

export class WaveBar {
  /**
   * @param {HTMLElement} bar the fixed bar to give the edge to
   */
  constructor(bar) {
    this.bar = bar;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'wave-bar');
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.setAttribute('focusable', 'false');
    this.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.path.setAttribute('fill', 'currentColor');
    this.svg.append(this.path);
    bar.prepend(this.svg);

    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(bar);
    this.draw();
    if (++waveBars === 1) document.documentElement.classList.add('has-wave-bar');
  }

  draw() {
    const w = this.bar.offsetWidth;
    const h = this.bar.offsetHeight;
    // Not a box at this width (a case study's bar on a desktop): nothing to draw.
    if (!w || !h) return;

    // The bottom side, right to left, a point every 8px: closer than the
    // frame's, for the shorter swell.
    const count = Math.max(2, Math.round(w / 8));
    const f = (v) => v.toFixed(1);
    const at = (i) => {
      const x = w - (i / count) * w;
      // Read along the bar at the bar's own, shorter wavelength.
      const along = (x * WAVE.wavelength) / BAR_WAVELENGTH;
      return [x, h + (BAR_HANG + swell(along, h, BAR_SLICE)) * BAR_SWELL];
    };
    // The same smooth line as the frame's, open at both ends: each point is
    // the control point of a curve between the midpoints either side of it.
    let [px, py] = at(0);
    let d = `M-1-1H${w + 1}V${f(py)}L${f(px)} ${f(py)}`;
    for (let i = 1; i < count; i++) {
      const [x, y] = at(i);
      const [nx, ny] = at(i + 1);
      d += `Q${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
      [px, py] = [x, y];
    }
    const [ex, ey] = at(count);
    this.path.setAttribute('d', `${d}L${f(ex)} ${f(ey)}H-1Z`);
  }

  destroy() {
    this.observer.disconnect();
    this.svg.remove();
    if (--waveBars === 0) document.documentElement.classList.remove('has-wave-bar');
  }
}
