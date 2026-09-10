// The arrival of a home section's content.
//
// Deliberately small. Visibility is state, not animation: main.js switches the
// sections synchronously — one on, all others off, so two are never up at once
// even for a frame — and this only animates the content of whichever one is now
// showing. Nothing here decides what is visible.
//
// It used to. The outgoing section was held visible so it could animate out, and
// the incoming one was shown by a callback partway through a timeline. That put
// "is this section on screen" behind an animation completing, and when the
// timeline didn't run, a nav click changed the URL and showed nothing at all.
//
// The content enters from off one edge and travels into the place CSS already
// put it, fading up as it comes. The direction follows the travel: going forward
// it comes in from the right, going back from the left.

import gsap from 'gsap';

// Tuning handle, dev only: gsap.globalTimeline.timeScale(0.2) to judge the ease.
if (import.meta.env.DEV) window.gsap = gsap;

// The field eases its own uniform tweens on a cubic ease-out — `1 - (1 - t)³`,
// see the tween loop in Scene.js — so the content settles the way it does.
const EASE = 'power3.out';
const EASE_OUT = 'power2.in'; // leaving gathers pace instead of settling
const DISTANCE = 64; // px the content travels
const OUT_DISTANCE = 40; // the exit is shorter, so it reads as following on
const DURATION_OUT = 0.4;
const DURATION = 0.7;
const STAGGER = 0.05; // between blocks, so the content arrives in order
// A home section has two or three blocks; a case study has thirty. At a fixed
// step per block that would take a second and a half to finish arriving, so past
// this the same offsets are spread across a fixed window instead.
const STAGGER_MAX = 0.4; // seconds, total

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The blocks that move. Direct children of the section, except that a list hands
 * over its items — so the tracklist arrives row by row rather than as one slab.
 * Structural rather than by class name, so it survives a rename.
 */
function blocksOf(section) {
  return [...section.children].flatMap((el) =>
    el.tagName === 'UL' || el.tagName === 'OL' ? [...el.children] : [el],
  );
}

/**
 * Animate the content of `root` out, then hand back so the caller can hide it.
 * `direction` is 1 forward, -1 back; the content leaves against the travel, so
 * going back it exits the way it would have come in.
 *
 * `onHidden` is called when the content is off screen — on interrupt too, since
 * an overwritten tween never completes and the section would otherwise be left
 * visible but empty. The caller must check the section is still the one it means
 * to hide: a fast return to the same section adds the class back before this
 * fires, and hiding it then would blank a section the visitor just asked for.
 */
export function hideSection(root, direction = 1, onHidden) {
  if (!root) {
    onHidden?.();
    return;
  }

  const blocks = blocksOf(root);
  gsap.killTweensOf(blocks);

  if (reduced || !blocks.length) {
    onHidden?.();
    gsap.set(blocks, { clearProps: 'transform,opacity,visibility' });
    return;
  }

  const finish = () => {
    onHidden?.();
    // Back where CSS had it, ready for its next arrival — otherwise it would
    // return already shifted and invisible.
    gsap.set(blocks, { clearProps: 'transform,opacity,visibility' });
  };

  gsap.to(blocks, {
    x: -direction * OUT_DISTANCE,
    autoAlpha: 0,
    duration: DURATION_OUT,
    ease: EASE_OUT,
    onComplete: finish,
    onInterrupt: finish,
  });
}

/**
 * Animate the content of `root` in — a home section, or a case study's article.
 * `direction` is 1 forward, -1 back.
 */
export default function revealSection(root, direction = 1) {
  if (!root) return;

  const blocks = blocksOf(root);
  if (!blocks.length) return;
  // Whatever a previous reveal left on these, gone — including if it was
  // interrupted. The section is already visible either way; this only decides
  // where its content starts from.
  gsap.killTweensOf(blocks);
  gsap.set(blocks, { clearProps: 'transform,opacity,visibility' });
  if (reduced) return;

  gsap.fromTo(
    blocks,
    { x: direction * DISTANCE, autoAlpha: 0 },
    {
      x: 0,
      autoAlpha: 1,
      duration: DURATION,
      ease: EASE,
      stagger: blocks.length * STAGGER > STAGGER_MAX ? { amount: STAGGER_MAX } : STAGGER,
      // Nothing of the tween survives the landing, however it ends: the blocks
      // sit exactly where the stylesheet puts them, with no inline transform
      // left over. onInterrupt as well, because an overwritten tween never
      // completes and would otherwise leave the content mid-flight.
      onComplete: () => gsap.set(blocks, { clearProps: 'transform,opacity,visibility' }),
      onInterrupt: () => gsap.set(blocks, { clearProps: 'transform,opacity,visibility' }),
    },
  );
}
