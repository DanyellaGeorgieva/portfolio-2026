import './styles/main.scss';
import Swup from 'swup';
import Scene from './webgl/Scene.js';
import GooeyText from './gooeyText.js';
import QuietGoo, { PROJECT_GOO, NAV_GOO, PICKER_GOO } from './quietGoo.js';
import { paletteNames } from './webgl/palettes.js';
// Defines <vitosha-ridge>, used by the Vitosha case study.
import './vitoshaRidge.js';
import vitoshaWidgets from './vitoshaWidgets.js';

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
//
// Every <svg> that hosts an eye, not just the one holding the <symbol>: a SMIL
// timeline belongs to an SVG root, and <use> deep-clones the animations into
// the root doing the referencing. The case-study eye is a root of its own and
// is on screen continuously, so it is the one where an unpaused blink would
// matter most.
if (reducedMotion) {
  document
    .querySelectorAll('.filter-defs, .site-header__eye, .project__view')
    .forEach((svg) => svg.pauseAnimations());
}

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

// --- The case-study eye ------------------------------------------------------
// It does not blink — it is drawn from #icon-eye-still, which has no <animate>
// in it — so the iris is the only thing that moves, and it does two things:
// it rolls while the page is scrolling, and it looks right at the text when the
// scrolling stops.
//
// How far the iris may travel from the centre of the eye, in the symbol's own
// viewBox units. The opening is about 19 wide and 10 tall and the iris has a
// radius of 3.5, which leaves roughly one and a half units of clearance inside
// the lid: past these the disc crosses the lid's stroke and the eye stops
// reading as an eye. Asymmetric for the same reason the opening is — which also
// means the "circle" the iris rolls in is really that same ellipse, so the path
// stays inside the lid all the way round.
const IRIS_REACH_X = 2.4;
const IRIS_REACH_Y = 1.1;

// Scroll distance for one full turn of the iris. Driven by scroll POSITION
// rather than by a timer, so the roll is tied to the page moving: it turns at
// whatever speed you scroll, stops dead when you do, and runs backwards when
// you scroll back up. A timer would keep spinning after the page had stopped.
const SCROLL_PER_TURN = 600;

// Quiet long enough to count as having stopped, and how long the iris then
// takes to swing to the text. The ease is handed to the shadow tree as a custom
// property — see the iris in frame.html — because it has to be OFF while
// rolling: a transition there would put the iris behind the scroll rather than
// on it, which is the same lag that made pointer-following feel broken.
const IRIS_SETTLE_AFTER = 180;
const IRIS_SETTLE_EASE = '0.55s';

// How long after the copy has finished landing the eye opens. The reveal's own
// length is not a constant — it depends on how many elements are above the fold
// — so this hangs off GooeyText's completion callback rather than off a total
// worked out here, which would drift the moment the copy changed.
const EYE_CUE_DELAY = 300;
let eyeCue = null;

const pageEye = document.querySelector('.page__eye');

/** Shut the eye, and cancel any cue that would open it again. */
function hidePageEye() {
  clearTimeout(eyeCue);
  pageEye?.classList.remove('is-visible');
}

function setIris(x, y) {
  pageEye?.style.setProperty('--iris-x', `${x.toFixed(3)}px`);
  pageEye?.style.setProperty('--iris-y', `${y.toFixed(3)}px`);
}

// Where the current roll started, in scroll pixels — null while the eye is at
// rest. The angle is measured from HERE rather than from the top of the
// document, which is what lets a new roll begin where the iris already is.
// Measured absolutely, stopping at 225px and scrolling again would snap the
// iris from the resting right back round to 135 degrees before carrying on.
let rollOrigin = null;

/**
 * Look right, at the text. This is the eye's resting state and also angle 0 of
 * every roll — so settling is a swing along the same ellipse rather than a jump
 * off it, and the next roll picks up from exactly where this leaves off.
 */
function restIris() {
  rollOrigin = null;
  pageEye?.style.setProperty('--iris-ease', IRIS_SETTLE_EASE);
  setIris(IRIS_REACH_X, 0);
}

if (pageEye && !reducedMotion) {
  let settle = null;
  // Passive: this only ever writes style, so it must never be allowed to hold
  // up the scroll itself.
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(settle);
      // First event of a new gesture: anchor the roll here. The delta is then
      // zero on this frame, so the iris starts the turn from the resting
      // position it is already in — no jump to catch up with.
      if (rollOrigin === null) rollOrigin = window.scrollY;

      pageEye.style.setProperty('--iris-ease', '0s');
      const angle = ((window.scrollY - rollOrigin) / SCROLL_PER_TURN) * Math.PI * 2;
      setIris(Math.cos(angle) * IRIS_REACH_X, Math.sin(angle) * IRIS_REACH_Y);
      settle = setTimeout(restIris, IRIS_SETTLE_AFTER);
    },
    { passive: true },
  );
}

// At rest from the start: a case study opens at scrollTop 0, which is angle 0,
// which is this — so the eye is already looking at the text when it fades in.
restIris();

// --- Palette picker ---------------------------------------------------------
// Six numbered stops, in the sequence palettes.js authors — the same order the
// nav steps through, so picking one is just entering that sequence at a
// different point. advancePalette() reads the live palette off the scene, so
// there is nothing here that has to be kept in step with it.
//
// An index rather than swatches: the field behind it is already the colour, and
// a row of coloured chips would compete with the thing it controls.
//
// The numbers share the nav links' weight, width reservation and quieting, but
// not the eye: six eyes in a row this small read as noise, not as a reply.
if (picker) {
  const mode = document.createElement('span');
  mode.className = 'picker__mode';
  mode.id = 'picker-mode';
  mode.textContent = 'mode:';

  const list = document.createElement('ul');
  list.className = 'picker__list';
  list.setAttribute('aria-labelledby', mode.id);

  paletteNames.forEach((name, i) => {
    const number = String(i + 1).padStart(2, '0');

    const item = document.createElement('li');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'picker__link';
    button.dataset.palette = name;
    // Reserves the bold width, the same way the nav links' data-label does.
    button.dataset.label = number;
    // "lavenderPeach" → "lavender peach". Not shown any more, but still the
    // button's name: "02" alone tells a screen reader nothing.
    button.setAttribute('aria-label', name.replace(/([A-Z])/g, (m) => ` ${m.toLowerCase()}`));
    button.setAttribute('aria-pressed', String(name === scene.paletteName));
    button.innerHTML = `<span class="picker__num">${number}</span>`;

    item.append(button);
    list.append(item);
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('.picker__link');
    if (button) scene.setPalette(button.dataset.palette);
  });

  picker.append(mode, list);

  new QuietGoo(picker, PICKER_GOO);
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
 * out of step with. A project page lights "work" too: /work/melba/ starts
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

// The pinned "back" on a detail page. Null on the top-level pages, which have
// none. Kept because Esc navigates to wherever it points.
//
// It used to be shown only on a scroll up, on the reasoning that reading down is
// reading and scrolling up is wanting to leave. It stands there the whole time
// now: a way out you have to go looking for is one that is missing whenever
// somebody wants it.
let backLink = null;

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
  // The first page of a visit opens on its own field: a case study loaded
  // directly would otherwise start at the home page's zoom and be seen easing
  // 4× into its own. Between pages the ease stays — that one is the transition.
  const field = navigated ? undefined : { instant: true };
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
    scene.setScale(PAGE_SCALE, field);
    scene.setSpeed(PAGE_SPEED, field);
  } else {
    backLink = null;
    // Back to the default field.
    scene.setScale(undefined, field);
    scene.setSpeed(undefined, field);
  }

  // Every piece of copy on every page, case studies included — the blur is a
  // fraction of each element's own type size, so one behaviour covers a title,
  // a heading and a paragraph without any of them needing its own settings.
  // Elements below the fold are skipped, which is what keeps a long case study
  // from costing more than a short section.
  // The eye waits for the copy. It is in the shell, so it survives the swap and
  // has to be put back to hidden on every arrival — otherwise it would already
  // be open on the next case study, having been revealed on the last one.
  hidePageEye();
  restIris();

  // On a case study the melt belongs to the title alone: every heading melting
  // spends the effect over and over and leaves the title with nothing of its
  // own. The rest of the copy fades in after it, one line at a time. Top-level
  // pages keep the behaviour they had — their sections are short enough that
  // melting each piece still reads as one gesture.
  gooeyText = new GooeyText(main, isDetail ? { gooOnly: '.page__title' } : undefined);
  gooeyText.play(() => {
    // A beat after the last line lands, not with it: arriving together would
    // make the eye part of the page's entrance, and the point is that it opens
    // on a page already there.
    eyeCue = setTimeout(() => pageEye?.classList.add('is-visible'), EYE_CUE_DELAY);
  });
  // Tuning handle, dev only: __goo.reset() parks the copy at the start of the
  // reveal so the blurred state can be looked at; __goo.play() runs it again.
  if (import.meta.env.DEV) window.__goo = gooeyText;

  // The Vitosha case study's interactive pieces, on the page that carries them.
  // It has to be called per page rather than once: the kit is a one-shot script
  // and swup gives it a new document to mount into on every arrival.
  vitoshaWidgets(main);

  // The Melba jars bring Matter.js and Paper.js with them, so only a page that
  // has one fetches them. Each module defines its element on arrival, and the
  // jars already on the page upgrade themselves.
  if (main.querySelector('jar-skin')) import('./melba/jarSkin.js');
  if (main.querySelector('jar-jelly')) import('./melba/jarJelly.js');

  // The Next-DC diagrams, on the page that has them.
  if (main.querySelector('ndc-roll, ndc-curtain, ndc-grid, ndc-labels, ndc-theme, ndc-micro')) {
    import('./nextdc/index.js');
  }

  // Pointing at one project thickens the others. It no-ops on any page without
  // a projects list, so it is built unconditionally rather than gated on view.
  quietGoo = new QuietGoo(main, PROJECT_GOO);

  // Arriving at contact sends up a drift of glass hearts.
  if (view === 'contact') scene.releaseHearts();
}

// swup keeps the canvas alive by only ever replacing #swup. No await-animations.
const swup = new Swup({ containers: ['#swup'], animationSelector: false });
// The eye is in the shell, so it outlives the page it was opened on. Closing it
// when the next page has already arrived is too late: for the length of the
// fade it sits open over a case study that is still assembling itself. This
// closes it as the visit starts, before any of the new page is on screen.
swup.hooks.on('visit:start', hidePageEye);

swup.hooks.on('page:view', () => {
  setupPage();
});
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

