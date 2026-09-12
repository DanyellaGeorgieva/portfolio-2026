// Demo harness. Everything component-side lives in src/gooeyStage.js; this file
// is the config and the controls.

import '../../src/styles/gooey-stage.scss';
import GooeyStage from '../../src/gooeyStage.js';

// ============================================================================
// The config — this is the only thing you edit to change the composition
// ============================================================================
//
// x and y are normalised 0..1 of the stage box: 0,0 top left, 1,1 bottom right.
// They name the *centre* of the text, so a word stays anchored where you put it
// however long it is.
//
// To add a blob: add an entry. To move one: change its numbers. Neither
// requires new markup, new CSS, or touching the component.
//
// Gooey *text* welds over a much shorter distance than gooey circles do: the
// blur has to stay under the stroke width for the letters to survive it, and a
// small blur only reaches a small gap. So these are stacked with their lines
// nearly touching — that is where the necks form. Drag the spread slider to
// pull them apart and watch the welds break.
// A note on `scale`, because it is the one property here with a floor. The
// whole stage shares one blur, so a scaled-down element has thinner strokes
// against the same blur radius and dissolves before a full-size one does. Below
// about 0.7 at the default settings the letterforms stop surviving the ramp.
// That is inherent to a single shared filter — see the tradeoffs note.
const BLOBS = [
  { id: 'design',     text: 'Design',     x: 0.42, y: 0.33, scale: 1.0, tag: 'h1' },
  { id: 'that',       text: 'that',       x: 0.31, y: 0.45, scale: 0.78 },
  { id: 'moves',      text: 'Moves',      x: 0.55, y: 0.49, scale: 1.15 },
  { id: 'misbehaves', text: 'misbehaves', x: 0.50, y: 0.64, scale: 0.8 },
];

const stage = new GooeyStage(document.getElementById('stage'), BLOBS);

// Handy from the console while tuning: __stage.update('moves', { x: 0.6 }).
if (import.meta.env.DEV) window.__stage = stage;

// ============================================================================
// Controls
// ============================================================================
const readout = document.getElementById('readout');

// Spread pulls every blob toward or away from the centre of the stage. It moves
// items by rewriting their x/y — i.e. by writing CSS variables — so the only
// thing that changes per frame is a transform. The filter is never touched.
document.getElementById('spread').addEventListener('input', (event) => {
  const amount = event.target.value / 50; // 0 = piled up, 1 = as configured, 2 = flung out
  BLOBS.forEach((blob) => {
    stage.update(blob.id, {
      x: 0.5 + (blob.x - 0.5) * amount,
      y: 0.5 + (blob.y - 0.5) * amount,
    });
  });
  report();
});

// The three filter tunables. These *do* force a filter recompute, which is
// exactly why they are on sliders in a lab page and not on a scroll handler in
// production: it is the expensive operation the component is built to avoid
// doing per frame.
const blurInput = document.getElementById('blur');
const slopeInput = document.getElementById('slope');
const interceptInput = document.getElementById('intercept');

function applyFilter() {
  const filter = document.querySelector('.goo-stage__defs filter');
  filter.querySelector('feGaussianBlur').setAttribute('stdDeviation', blurInput.value);
  filter.querySelector('feColorMatrix').setAttribute(
    'values',
    `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${slopeInput.value} ${interceptInput.value}`,
  );
  report();
}

[blurInput, slopeInput, interceptInput].forEach((input) =>
  input.addEventListener('input', applyFilter),
);

// ============================================================================
// Measuring the cost, rather than asserting it
// ============================================================================
//
// Two switches, because the interesting number is the *difference* between
// them, not either on its own:
//
//   drift  — moves every blob continuously, so there is real per-frame work.
//            It animates transform, which does not invalidate the filter; the
//            region is not recomputed as things move.
//   filter — turns the goo off, leaving the identical motion unfiltered.
//
// Toggle the filter with drift running and watch the worst-frame figure. That
// gap is what the effect actually costs on this machine, at this size, at this
// blur radius — which is the only number worth trusting, since it changes with
// all three.
//
// Worst frame rather than an average: a dropped frame is a spike, and an
// average is exactly the statistic that hides one.
const surface = document.querySelector('.goo-stage__surface');
const driftInput = document.getElementById('drift');

document.getElementById('filterOn').addEventListener('change', (event) => {
  surface.style.filter = event.target.checked ? `url(#${stage.filterId})` : 'none';
});

let worst = 0;
let frames = 0;
let last = performance.now();
let phase = 0;

function tick(now) {
  const delta = now - last;
  last = now;
  worst = Math.max(worst, delta);

  if (driftInput.checked) {
    phase += 0.012;
    BLOBS.forEach((blob, i) => {
      // Small orbits around each blob's configured position. Only the CSS
      // variables change, so only a transform is recomputed.
      stage.update(blob.id, {
        x: blob.x + Math.sin(phase + i * 1.7) * 0.05,
        y: blob.y + Math.cos(phase + i * 2.3) * 0.04,
      });
    });
  }

  if (++frames >= 60) {
    const fps = worst > 0 ? (1000 / worst).toFixed(0) : '—';
    document.getElementById('fps').textContent =
      `worst frame ${worst.toFixed(1)}ms (≈${fps}fps)`;
    worst = 0;
    frames = 0;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function report() {
  // The threshold is where the ramp crosses 0.5 — the alpha level that counts
  // as "inside the shape". It is the single number that predicts whether two
  // blobs will weld, and it is not either slider on its own.
  const threshold = -interceptInput.value / slopeInput.value;
  readout.textContent =
    `blur ${blurInput.value}px · slope ${slopeInput.value} · intercept ${interceptInput.value} ` +
    `→ merge threshold α ${threshold.toFixed(2)}`;
}

report();

// Resize handling is the component's own — see the ResizeObserver in
// GooeyStage. Nothing is needed here.
