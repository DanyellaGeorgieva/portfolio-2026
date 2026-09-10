// Weight drift on the tracklist titles.
//
// The titles are set in Cabinet Grotesk, a variable font — but a weight-only
// one. It carries no `wdth` axis: rendering the same string at `wdth 50` and
// `wdth 200` gives an identical advance width. `wght` is the width control
// here, and animating it is the only way to change a letter's width without
// faking it with scaleX, which would distort the glyphs rather than redraw
// them. See LIGHT/HEAVY below for how much width there actually is.
//
// The motion is a slice of the field's own construction rather than a tween:
// value noise, interpolated with the same smoothstep curve, sampled with time
// as one axis. That is exactly why the shader's cells morph in place instead of
// cycling, and it is what makes this drift rather than repeat — one letter is
// thickening while its neighbour thins, and the pattern never comes back round.
//
// A staggered yoyo can't do that. It is one wave on a fixed period, and the eye
// finds the loop in a couple of passes.

import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

// Tuning handles, dev only. `gsap.globalTimeline.timeScale(0.2)` slows the
// drift enough to judge it; `__cardTitles` is the live set of letters.
if (import.meta.env.DEV) window.gsap = gsap;

// The axis really does stop here: measured on this font, the advance width is
// identical at wght 1, 50 and 100, and identical again at 900, 950 and 1000.
// End to end that is 667.27px → 745.80px on a title-length string — 11.8%, and
// that is all the width this typeface has to give. LIGHT is held above the
// floor because 100 is a hairline at this size; drop it to 100 for the maximum.
const LIGHT = 300;
const HEAVY = 900;

const SPEED = 0.22; // how fast the field slides past the word

// How far apart neighbouring letters sit in the field, and the single control
// over whether this reads as organic or as random. The noise cells are 1 wide,
// so at 0.6 adjacent letters keep landing in different cells and jump against
// each other — measured, a mean step of 78 in weight. At 0.15 a word spans about
// three cells and undulates across them: a mean step of 24. Lower still and the
// whole word moves as one.
const SPREAD = 0.15;

// Layers of noise. Each one is finer and quieter than the last; past two they
// stop adding life and start adding grain.
const OCTAVES = 2;

// Octaves average toward the middle, so raw fbm never reaches its own ends —
// at two octaves the 1st and 99th percentiles sit 0.67 apart, which would leave
// the letters drifting across two thirds of the weight range they were given.
// This stretches that span to fill it, about the midpoint. Re-measure it if
// OCTAVES changes: one octave wants 1.16, three wants 1.66.
const GAIN = 1.49;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// The effect is continuous motion, which is what this setting asks us not to
// do. The titles sit at their resting weight instead.
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- The field, in one dimension less ---------------------------------------
// hash3/noise3 from background.frag, dropped to 2D: one axis runs along the
// word, the other is time.

const fract = (x) => x - Math.floor(x);
const lerp = (a, b, t) => a + (b - a) * t;

function hash2(x, y) {
  const px = fract(x * 0.3183099 + 0.1) * 17;
  const py = fract(y * 0.3183099 + 0.1) * 17;
  return fract(px * py * (px + py));
}

function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // The shader's interpolation curve, f * f * (3 - 2f) — smooth at every cell
  // boundary, which is what keeps the drift from ticking as it crosses one.
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(
    lerp(hash2(ix, iy), hash2(ix + 1, iy), ux),
    lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux),
    uy,
  );
}

/** Octaves of noise, halving in amplitude, normalised back to 0..1. */
function fbm2(x, y) {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < OCTAVES; i++) {
    value += amplitude * noise2(px, py);
    total += amplitude;
    // Not a clean doubling: an exact 2× lines the octaves' cell boundaries up
    // and the layers reinforce each other into a visible beat.
    px *= 2.03;
    py *= 2.03;
    amplitude *= 0.5;
  }
  return value / total;
}

let splits = [];
let letters = [];
let ticking = false;

function drift(time) {
  for (const letter of letters) {
    const n = clamp01((fbm2(letter.seed, time * SPEED) - 0.5) * GAIN + 0.5);
    letter.el.style.setProperty('--wght', Math.round(LIGHT + (HEAVY - LIGHT) * n));
  }
}

/**
 * Split every tracklist title inside `root` and set its letters drifting.
 * Safe to call again — the previous split is put back first.
 */
export default function initCardTitles(root) {
  if (ticking) {
    gsap.ticker.remove(drift);
    ticking = false;
  }
  splits.forEach((split) => split.revert());
  splits = [];
  letters = [];
  if (reduced || !root) return;

  root.querySelectorAll('.card').forEach((card, cardIndex) => {
    const title = card.querySelector('.card__title');
    if (!title) return;

    // words as well as chars: characters alone are inline-blocks, which lets a
    // line break fall inside a word. Keeping the word wrappers holds the breaks
    // where they belong.
    const split = new SplitText(title, { type: 'words,chars', charsClass: 'card__char' });
    splits.push(split);

    split.chars.forEach((el, i) => {
      // Neighbours sit close together in the field, so a letter is always near
      // its neighbour's weight and the word reads as one surface rather than as
      // separate letters flickering. Each title starts far enough along the
      // axis that the three of them are never in step.
      letters.push({ el, seed: cardIndex * 40 + i * SPREAD });
    });
  });

  if (!letters.length) return;
  gsap.ticker.add(drift);
  ticking = true;
  drift(gsap.ticker.time); // paint the first frame now rather than next tick

  if (import.meta.env.DEV) window.__cardTitles = letters;
}
