import './styles/main.scss';
import Swup from 'swup';
import Scene from './webgl/Scene.js';
import GooeyText from './gooeyText.js';
import QuietGoo, { PROJECT_GOO, NAV_GOO } from './quietGoo.js';
import { paletteNames } from './webgl/palettes.js';

// Declared before the scene because Scene calls onPalette from its own
// constructor, and the callback below marks the picker.
const picker = document.getElementById('picker');

/** Light the stop matching `name` and put the rest out. */
function markPalette(name) {
  picker?.querySelectorAll('.picker__link').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.palette === name));
  });
}

// The WebGL scene is created once, on the persistent canvas (outside #swup), so
// it keeps running across page navigations — swup only swaps #swup.
const canvas = document.getElementById('webgl');
const scene = new Scene(canvas, {
  onPalette: (name) => {
    // The palette's *name* goes on the root element, and that is all JS does
    // about colour. The stylesheet decides what each name looks like — see the
    // $inks map in main.scss — so text colours are edited where every other
    // colour on the site is edited, not in a JavaScript file.
    document.documentElement.dataset.palette = name;
    markPalette(name);
  },
});

// Vite replaces this module on edit without reloading the page, which would
// leave the previous Scene's render loop running: two Scenes then draw to the
// same canvas and context from different uniforms, alternating frames. That
// shows up as a torn image — part of the screen a frame behind the rest.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    scene.dispose();
    // swup has to go too. It binds a document-level click handler, so a second
    // instance from a hot reload leaves two routers intercepting the same link:
    // the first navigation appears to work and every one after it is swallowed.
    // A confusing failure, and only ever in dev.
    swup?.destroy();
    gooeyText?.destroy();
    quietGoo?.destroy();
    navGoo?.destroy();
  });
}

// --- The blinking eye -------------------------------------------------------
const eyeDefs = document.querySelector('.filter-defs');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A small repeating movement that never settles is what this preference is
// about. SMIL has no CSS switch, so it is paused here instead — at time zero,
// which is the open eye: the icon stays, it just stops.
if (reducedMotion) eyeDefs?.pauseAnimations();

// When the blink starts inside the symbol's own timeline, and how long after
// arriving on a row the first one should land. Long enough to register as the
// eye having been open, short enough that nobody has to wait for it.
// Everywhere an eye can appear. Both are hover-revealed, so both want the
// blink to land a known moment after arriving rather than wherever the
// free-running loop happens to be.
const BLINKS_ON = '.project__link, .site-header a';
const BLINK_AT = 2.3;
const BLINK_LEAD = 0.55;

// The eye is only on screen while a row is hovered, but its animation runs
// whether anyone is looking or not. Left alone, what you get on arriving at a
// row is a random point in a 3.2s loop that only does anything for 0.9s of it —
// so hovering briefly is a coin flip on whether you see a blink at all, and
// across a few tries it reads as an eye that never blinks.
//
// Seeking the shared timeline on arrival makes it deterministic: the eye turns
// up open, and blinks BLINK_LEAD later, every time. One timeline serves all
// three rows because only one eye is ever visible.
const navGoo = new QuietGoo(document, NAV_GOO);

let blinkRow = null;
document.addEventListener('pointerover', (event) => {
  const row = event.target.closest?.(BLINKS_ON) ?? null;
  // pointerover fires again for every element inside the row; only a change of
  // row is an arrival.
  if (row === blinkRow) return;
  blinkRow = row;
  if (row && !reducedMotion) eyeDefs?.setCurrentTime(BLINK_AT - BLINK_LEAD);
});

// --- Palette picker ---------------------------------------------------------
// Six numbered stops, in the sequence palettes.js authors — the same order the
// nav steps through, so picking one is just entering that sequence at a
// different point. advancePalette() reads the live palette off the scene, so
// there is nothing here that has to be kept in step with it.
//
// An index rather than swatches: the field behind it is already the colour, and
// a row of coloured chips would compete with the thing it controls.
if (picker) {
  const list = document.createElement('ul');
  list.className = 'picker__list';

  paletteNames.forEach((name, i) => {
    // "lavenderPeach" → "lavender peach", for the label and the button's name.
    const label = name.replace(/([A-Z])/g, (m) => ` ${m.toLowerCase()}`);

    const item = document.createElement('li');
    item.className = 'picker__item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'picker__link';
    button.dataset.palette = name;
    button.textContent = `[ ${String(i + 1).padStart(2, '0')} ]`;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(name === scene.paletteName));

    const caption = document.createElement('span');
    caption.className = 'picker__label';
    caption.textContent = label;
    // The button already carries this as its accessible name; on screen it is
    // just the hover reveal, so it would otherwise be announced twice.
    caption.setAttribute('aria-hidden', 'true');

    item.append(button, caption);
    list.append(item);
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('.picker__link');
    if (button) scene.setPalette(button.dataset.palette);
  });

  picker.append(list);
}

// Every link in the header, the name included — it is the link to /, which is
// a destination like any other now.
const navLinks = [...document.querySelectorAll('.site-header a')];

// Each link carries its own text as data-label, which the stylesheet uses to
// reserve the width of its bold state so lighting one does not shift the bar.
// Read off the element rather than written into the markup, so the reservation
// can never drift from the wording it is reserving for.
navLinks.forEach((a) => {
  a.dataset.label = a.textContent.trim();
});

/**
 * Light the nav item for the page being shown.
 *
 * Matched on the URL rather than on any state this file keeps, because after
 * the move to real pages the URL *is* the state — there is nothing else to get
 * out of step with. A project page lights "work" too: /work/project-one/ starts
 * with /work/, so a case study reads as being inside that section.
 *
 * The name is matched exactly and never by prefix, because every path starts
 * with "/" — without that it would light on every page of the site.
 */
function setActiveNav(path) {
  navLinks.forEach((a) => {
    const href = a.getAttribute('href');
    a.classList.toggle('is-active', path === href || (href !== '/' && path.startsWith(href)));
  });
}

// --- Palette ----------------------------------------------------------------
// Every navigation steps one along the sequence palettes.js authors, wrapping
// at the end. The current position is read off the scene each time rather than
// kept in a counter here, so there is nothing that can drift out of step with
// what is actually on screen — including the number keys Scene binds itself.
function advancePalette() {
  const index = Math.max(0, paletteNames.indexOf(scene.paletteName));
  scene.setPalette(paletteNames[(index + 1) % paletteNames.length]);
}

// --- Detail pages -----------------------------------------------------------
// Opening a project dives into the field: uScale well below its default blows
// one or two channels up to fill the screen, and the morph slows to a crawl, so
// a project page reads as being right up against the surface rather than looking
// at it from across the room. The zoom is anchored at the centre of the screen
// (see scaleOrigin in background.frag), so it plays as a push in, not a slide.
// Scene's defaults come back on any top-level page.
const PAGE_SCALE = 0.9; // vs 3.6 default — a 4× magnification
const PAGE_SPEED = 0.05; // vs 0.18 default — barely moving

// The pinned "← work" on a detail page. Null on the top-level pages, which have
// none.
let backLink = null;
let lastScrollY = 0;
let scrollQueued = false;

// Reading down is reading; scrolling back up is what someone does when they have
// stopped reading and want to get somewhere. So the escape hatch follows the
// direction of travel rather than sitting there the whole time.
function updateBackLink() {
  if (!backLink) return;
  const y = window.scrollY;
  // Trackpads emit a lot of sub-pixel noise; anything under a few px isn't a
  // direction, it's jitter, and acting on it makes the link flicker.
  if (Math.abs(y - lastScrollY) < 4) return;
  backLink.classList.toggle('is-visible', y < lastScrollY);
  lastScrollY = y;
}

window.addEventListener(
  'scroll',
  () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      updateBackLink();
    });
  },
  { passive: true },
);

// --- Per-page setup ---------------------------------------------------------
// Rebuilt per page: swup replaces #swup wholesale, so an instance kept from the
// last visit would be holding detached titles and orphaned filter definitions.
let gooeyText = null;
// Same reason: it holds a filter per title and listeners on a list that swup is
// about to throw away.
let quietGoo = null;

// Whether anything has been shown yet. Used to tell a cold load from a
// navigation: the first page should keep the palette it was linked with rather
// than immediately stepping past it.
let navigated = false;

// Runs on first load and after every swup swap.
function setupPage() {
  const main = document.querySelector('#swup');
  const isDetail = main.dataset.page === 'detail';
  const view = main.dataset.view; // home | work | about | contact, top-level only

  gooeyText?.destroy();
  gooeyText = null;
  quietGoo?.destroy();
  quietGoo = null;

  // Every navigation steps the palette — nav clicks, project links, the "next
  // project" at the foot of a case study, Back and Forward. One rule covers
  // them all now that every view is a real page.
  if (navigated) advancePalette();
  navigated = true;

  setActiveNav(location.pathname);

  // The picker belongs to the front door: it is a choice for the whole visit,
  // not a control for the page you happen to be reading.
  if (picker) picker.hidden = view !== 'home';

  if (isDetail) {
    // Before the reveal is built, not after: it decides what to animate by
    // asking each element where it is, and a page still scrolled to the middle
    // of the last one would answer for the wrong viewport.
    window.scrollTo(0, 0);
    // Fresh page, fresh scroll position — and the hatch starts closed, so the
    // case study opens on its title and nothing else.
    backLink = main.querySelector('.back');
    backLink?.classList.remove('is-visible');
    lastScrollY = 0;
    scene.setScale(PAGE_SCALE);
    scene.setSpeed(PAGE_SPEED);
  } else {
    backLink = null;
    // Back to the default field.
    scene.setScale();
    scene.setSpeed();
  }

  // Every piece of copy on every page, case studies included — the blur is a
  // fraction of each element's own type size, so one behaviour covers a title,
  // a heading and a paragraph without any of them needing its own settings.
  // Elements below the fold are skipped, which is what keeps a long case study
  // from costing more than a short section.
  gooeyText = new GooeyText(main);
  gooeyText.play();
  // Tuning handle, dev only: __goo.reset() parks the copy at the start of the
  // reveal so the blurred state can be looked at; __goo.play() runs it again.
  if (import.meta.env.DEV) window.__goo = gooeyText;

  // Pointing at one project thickens the others. It no-ops on any page without
  // a projects list, so it is built unconditionally rather than gated on view.
  quietGoo = new QuietGoo(main, PROJECT_GOO);

  // Arriving at contact sends up a drift of glass hearts.
  if (view === 'contact') scene.releaseHearts();
}

// swup keeps the canvas alive by only ever replacing #swup. No await-animations.
const swup = new Swup({ containers: ['#swup'], animationSelector: false });
swup.hooks.on('page:view', () => setupPage());
if (import.meta.env.DEV) window.__swup = swup;
setupPage(); // initial page

// Esc backs out of a detail page, the way it closes anything you have dived
// into. It goes wherever that page's own back link goes, so lab pages land on
// the lab rather than on works.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !backLink) return;
  swup.navigate(backLink.getAttribute('href'));
});

// Nothing intercepts the nav or the brand any more. They are ordinary links to
// ordinary URLs, and swup handles them the way it handles every other link on
// the site — fetching the page and swapping #swup while the canvas outside it
// keeps running. Everything that used to happen on a nav click now happens in
// setupPage(), which fires for *every* arrival: a click, a typed URL, Back,
// Forward. One path instead of two, and no way for them to disagree.

