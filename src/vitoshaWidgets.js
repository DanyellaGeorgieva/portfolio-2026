// The Vitosha widget kit, brought onto a page that asks for it.
//
// The kit itself (public/widgets/) is Dana's, generated from the artifact by
// make-widgets.py, and is left exactly as generated. This file is the glue: it
// is here because the kit was written for one standalone page, and this site is
// neither standalone nor one page.
//
// What it has to do that the kit's own <script> tag cannot: run again after a
// navigation. swup swaps #swup's markup and does not execute scripts inside it,
// so a <script> in the case study would run on a cold load and never again —
// arrive from the work list and every widget would be an empty div. The kit is a
// one-shot IIFE with no re-init of its own, so running it again means loading it
// again, under a fresh URL.
//
// Everything else — the pipeline, the drawing, the controls — is the kit's, and
// it is left exactly as generated.
//
// The page carries no `hero`, which the kit treats as a whole branch it can
// skip: no three.js fetched, no WebGL context, no textiles loaded. Adding one
// would need both of the things this repo does not have — the real shader
// source (the generated file still carries "__VERT__" and "__FRAG__" in its
// shader slots) and the textile photographs.

const KIT_JS = '/widgets/vitosha-widgets.js';
const KIT_CSS = '/widgets/vitosha-widgets.css';
// The same two files the ridge at the top of the page measures — see
// src/vitoshaRidge.js. One copy, one fetch.
const TOP = '/assets/vitosha-top_D.svg';
const BOTTOM = '/assets/vitosha-bottom_D.svg';

let run = 0;

/**
 * Mount the kit into `root`, if it asks for any of it.
 *
 * @param {ParentNode} root  the view swup has just put on screen
 */
export default function vitoshaWidgets(root) {
  if (!root?.querySelector('[data-vitosha]')) return;

  if (!document.querySelector(`link[href="${KIT_CSS}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = KIT_CSS;
    document.head.append(link);
  }

  // The kit mounts the widgets the page has and stashes the rest in a hidden
  // div on <body>, which swup never clears. Left alone, every visit would leave
  // another one behind.
  document.querySelectorAll('body > .vtw[aria-hidden="true"]').forEach((el) => el.remove());
  document.querySelector('script[data-vitosha-kit]')?.remove();

  // A fresh URL each time, because a script the browser has already run does
  // not run again on being re-inserted. The query is what makes it a new one;
  // the file behind it is the same and comes from cache.
  const script = document.createElement('script');
  script.dataset.vitoshaKit = '';
  script.dataset.top = TOP;
  script.dataset.bottom = BOTTOM;
  script.src = `${KIT_JS}?run=${++run}`;
  document.body.append(script);
}
