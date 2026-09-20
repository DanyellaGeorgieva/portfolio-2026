// The contours, imported as URLs rather than written as paths: they live in
// src/assets with every other asset, and ?url leaves them as files the measuring
// step can fetch while still letting the build fingerprint and copy them. Same
// origin either way, which is what keeps the canvas readable.
import TOP from './assets/vitosha-top_D.svg?url';
import BOTTOM from './assets/vitosha-bottom_D.svg?url';

// <vitosha-ridge> — the Vitosha cloth that opens its case study.
//
// Plain 2D canvas: the two contours measured column by column into lists of
// heights, a band filled between them, drifting sideways for ever. It draws the
// shape the WebGL version drew at a fraction of the cost — no three, no second
// WebGL context, no mesh. What it gives up is the drag.
//
// It keeps the shaping mask, which is the part that reads as the teaser rather
// than as a mountain graphic: the bending eases off across the width and the
// last stretch of cloth hangs flat. On the real site that is the clean zone the
// labels sit in.
//
// The framing numbers are the site's own (distortConfig / DISTORT_PROFILES), so
// the silhouette matches the teaser's rather than being redrawn by eye.
//
// It is a custom element rather than the snippet's inline <script> because
// scripts inside #swup are not re-run when swup swaps a page in: an inline
// version would draw on a full load and never again. A defined custom element
// upgrades itself whenever it is inserted.
//
// Colour: filled with the element's own computed `color`, read on every frame,
// so it inherits the palette's ink and cross-fades with the rest of the page.
//
// Usage:
//   <vitosha-ridge></vitosha-ridge>
//   <vitosha-ridge data-speed="0.012" data-start="0.6" data-mask-end="0.79"></vitosha-ridge>

const LIST = 1024; // heights per contour
const RASTER_H = 1024; // how tall each contour is rasterised before measuring

// The site's own framing and amplitudes.
const TOP_MAX = 0.85; // how far the ridge rises
const BOTTOM_MAX = -0.25; // how the hem answers
const BAND = 0.55; // cloth height, share of the view
const DROP = -0.12; // how far down the cloth hangs
const WIDE = 2; // how wide the contour is drawn (panoramaScale)
const MASK_END = 0.79; // where the shaping has eased off completely
const MASK_FALLOFF = 0.2; // how long it takes to get there
const IMAGE_ASPECT = 2049 / 319;

/* ---- measure an SVG into a list of heights ------------------------
   Column by column, top down, to the first pixel of the line. Then the
   two ends are eased together so the list repeats, and each value is
   averaged with its neighbours to take out the whole-pixel steps. */
async function measure(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();

  const w = LIST;
  // Drawn tall on purpose, rather than at the contour's own aspect. Each height
  // is stored as a FRACTION of the bitmap, so stretching it vertically changes
  // no shape — it only buys resolution. At its own aspect the top contour
  // rasterises 80px tall, which quantises every height to a 1/80 step: measured,
  // the ridge then held still for several frames and hopped 1.3px at once, which
  // is the stepping you see as a jump. At RASTER_H the step is under a fifth of
  // a pixel at the size this draws.
  const h = RASTER_H;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h).data;

  const heights = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let top = h;
    for (let y = 0; y < h; y++) {
      if (px[(y * w + x) * 4 + 3] > 20) {
        top = y;
        break;
      }
    }
    heights[x] = 1 - top / h;
  }

  // make the ends agree, so it can loop for ever
  const ends = Math.floor(w * 0.08);
  const target = (heights[0] + heights[w - 1]) / 2;
  for (let i = 0; i < ends; i++) {
    const t = i / ends;
    const ease = t * t * (3 - 2 * t);
    heights[i] = target * (1 - ease) + heights[i] * ease;
    const j = w - 1 - i;
    heights[j] = target * (1 - ease) + heights[j] * ease;
  }

  // average with the immediate neighbours
  const smooth = Float32Array.from(heights);
  for (let x = 0; x < w; x++) {
    const a = heights[(x - 1 + w) % w];
    const b = heights[x];
    const c2 = heights[(x + 1) % w];
    smooth[x] = (a + b + c2) / 3;
  }
  return smooth;
}

// Measured once for the whole site, however many ridges ask: the lists are the
// same every time, and each measuring reads a full 1024-wide bitmap.
const lists = new Map();
const measureOnce = (url) => {
  if (!lists.has(url)) lists.set(url, measure(url));
  return lists.get(url);
};

// Wrapping lookup with the same linear interpolation the GPU gave the height
// texture, so the profile is as smooth between samples as it was on the mesh.
const at = (list, u) => {
  const f = (((u % 1) + 1) % 1) * (LIST - 1);
  const i = Math.floor(f);
  const k = f - i;
  return list[i] * (1 - k) + list[(i + 1) % LIST] * k;
};

// GLSL's smoothstep, because the mask it shapes is the shader's own.
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

class VitoshaRidge extends HTMLElement {
  connectedCallback() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.append(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.setAttribute('aria-hidden', 'true');

      this.speed = +this.dataset.speed || 0.012; // panoramas drifting past per second
      this.maskEnd = this.dataset.maskEnd === undefined ? MASK_END : +this.dataset.maskEnd;
      this.maskFalloff =
        this.dataset.maskFalloff === undefined ? MASK_FALLOFF : +this.dataset.maskFalloff;
      this.offset = this.dataset.start === undefined ? 0.6 : +this.dataset.start;
      this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.w = 0;
      this.h = 0;
    }

    this.playing = true;
    this.last = performance.now();

    this.resizes = new ResizeObserver(() => {
      this.size();
      this.draw();
    });
    this.resizes.observe(this);

    // Nothing moves while it is off screen.
    this.views = new IntersectionObserver(([e]) => {
      this.playing = e.isIntersecting;
    });
    this.views.observe(this);

    Promise.all([
      measureOnce(this.dataset.top || TOP),
      measureOnce(this.dataset.bottom || BOTTOM),
    ])
      .then(([top, bottom]) => {
        this.top = top;
        this.bottom = bottom;
        this.hidden = false;
        this.size();
        this.draw();
        this.frame = requestAnimationFrame(this.tick);
      })
      // No contours, no cloth: it takes up no space rather than leaving a gap
      // where a drawing was meant to be.
      .catch(() => {
        this.hidden = true;
      });
  }

  disconnectedCallback() {
    this.resizes?.disconnect();
    this.views?.disconnect();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.clientWidth;
    this.h = this.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw = () => {
    const { ctx, w, h, top, bottom } = this;
    if (!top || !bottom || !w || !h) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(this).color; // the palette's ink

    // The same framing the mesh had: a band of the view's height, hung below
    // centre, with the contour drawn WIDE panoramas across.
    const cloth = h * BAND;
    const middle = h / 2 - h * DROP;
    const tiles = w / (cloth * IMAGE_ASPECT) / WIDE;
    const step = 2; // px between samples

    // How much of the shaping survives at this column: full on the left, gone
    // by maskEnd. Past there both edges sit at their resting height and the
    // cloth hangs flat — the shader's mask, in two dimensions.
    const mask = (x) => 1 - smoothstep(this.maskEnd - this.maskFalloff, this.maskEnd, x / w);

    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      const u = (x / w) * tiles + this.offset;
      const y = middle - cloth / 2 - (at(top, u) - 0.5) * TOP_MAX * cloth * mask(x);
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    for (let x = w; x >= 0; x -= step) {
      const u = (x / w) * tiles + this.offset;
      const y = middle + cloth / 2 - (at(bottom, u) - 0.5) * BOTTOM_MAX * cloth * mask(x);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };

  tick = (now) => {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    if (this.playing && !this.still) {
      this.offset += (this.speed * dt) / 1000;
      this.draw();
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}

if (!customElements.get('vitosha-ridge')) {
  customElements.define('vitosha-ridge', VitoshaRidge);
}
