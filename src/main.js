import './styles/main.scss';
import Swup from 'swup';
import SwupA11yPlugin from '@swup/a11y-plugin';
import Scene from './webgl/Scene.js';
import GooeyText from './gooeyText.js';
import QuietGoo, { PROJECT_GOO, NAV_GOO, PICKER_GOO } from './quietGoo.js';
import { paletteNames } from './webgl/palettes.js';
// Define <vitosha-ridge> and <vitosha-textiles>, used by the Vitosha case study.
import './vitoshaRidge.js';
import './vitoshaTextiles.js';
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
// Tuning handle, dev only: the glass lives in its uniforms, so
// __scene.material.uniforms.uGlassIridescence.value = 0.8 changes it live.
if (import.meta.env.DEV) window.__scene = scene;

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
// viewBox units. The opening is about 33 wide and 22 tall and the iris has a
// radius of 7, which leaves a unit or two of clearance inside the lid at these
// reaches: past them the disc crosses the lid's stroke and the eye stops
// reading as an eye. Asymmetric for the same reason the opening is — which also
// means the "circle" the iris rolls in is really that same ellipse, so the path
// stays inside the lid all the way round. (Twice what they were on the previous
// drawing, which was drawn at half this scale in its own units.)
const IRIS_REACH_X = 4.8;
const IRIS_REACH_Y = 2.2;

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
  mode.textContent = 'palette:';

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
  const view = main.dataset.view; // home | work | colophon | contact, top-level only

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
  // On a phone the nav's goo follows the active page rather than the pointer
  // (NAV_GOO's `rest`), so a new active page is a change it has to hear about.
  navGoo.schedule();

  // The picker belongs to the colophon, beside the story of the shader it
  // recolours: the page that explains the field is the one that lets you play
  // with it.
  if (picker) picker.hidden = view !== 'colophon';

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

  // A looping recording is motion that never ends, so each one gets a way to
  // stop it, and with reduced motion asked for it never starts: it waits on its
  // poster until someone presses Play.
  main.querySelectorAll('.page__video').forEach((figure) => {
    const video = figure.querySelector('video');
    const toggle = figure.querySelector('.page__video-toggle');
    if (!video || !toggle) return;
    if (reducedMotion) {
      video.autoplay = false;
      video.pause();
    }
    const sync = () => (toggle.textContent = video.paused ? 'Play' : 'Pause');
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    toggle.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
    sync();
  });

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

  // Arriving at contact sends up a drift of glass hearts — or on a phone, one:
  // four across a narrow screen crowd it rather than drift. Same breakpoint as
  // the stylesheet's small screens.
  if (view === 'contact') scene.releaseHearts(matchMedia('(max-width: 640px)').matches ? 1 : 4);
}

// swup keeps the canvas alive by only ever replacing #swup. No await-animations.
//
// The a11y plugin does what a full page load does for free: it announces the
// new page by its <h1> (or its title, on the front door, which has none) and
// puts focus back at the top of the document, so the next Tab starts on the
// new page. Without it, a screen reader says nothing after a link at all.
const swup = new Swup({
  containers: ['#swup'],
  animationSelector: false,
  plugins: [new SwupA11yPlugin()],
});
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

// --- Scroll on to the next page ---------------------------------------------
// On a top-level page, scrolling past the bottom — a wheel or trackpad push, a
// swipe up on a phone, or Space, Page Down or ↓ — is the same as clicking the
// next link in the header: home → work → colophon → contact. Scrolling past the
// top — the same gestures the other way, or Shift+Space, Page Up or ↑ — is the
// link before it. The order is read off the header itself, so rearranging the
// nav rearranges this with it. Home and contact are the two ends: there is
// nowhere further, and a push past them does nothing. Case studies are left
// alone — they are long reads, and the end of one is not a request to leave.
//
// One gesture has to mean exactly one step, and that can't be done on a timer.
// A trackpad flick keeps emitting wheel events from momentum long after the
// fingers have lifted — easily a second or two, and the tail is
// indistinguishable from a fresh flick except by *when* it arrives. Locking for
// a fixed period just means the tail steps again as soon as the lock expires,
// which is how you scroll through the whole site in one swipe.
//
// This is the detector from the one-document version of the site, when the
// wheel moved between sections stacked on home. Four approaches were tried
// before it:
//
//   • A fixed lock. Momentum outlasts any lock short enough to feel responsive.
//   • A size threshold per event. Momentum decays through the whole range a real
//     push occupies, so it re-arms mid-coast wherever the line is drawn.
//   • An acceleration test. True of a flick, false of a drag: fingers stay down
//     and the delta rises and falls with them, so every rise stepped again.
//   • Silence alone. One threshold has to serve two jobs at once — a pause
//     *inside* a gesture must not end it, while a pause *between* two gestures
//     must. Set it short and a slow drag re-steps; set it long and a quick
//     second flick is swallowed.
//
// So there are three rules, not one:
//
//   1. Silence for gestureEnd ends the gesture and re-arms. Generous enough
//      that a stutter inside a drag doesn't count.
//   2. No two steps closer together than cooldown, whatever the stream does.
//   3. A spike re-arms early. Coasting decays, so a delta several times the
//      recent average is a hand back on the trackpad — that restores the quick
//      second flick that rule 1 alone would swallow. Gated behind the cooldown,
//      so a drag's own wandering can't trigger it.
//
// One rule is new, because pages are real pages now and some can scroll — work
// on a phone, anything on a short window. A gesture only counts if it starts
// with the page already at the edge it is pushing past: the bottom to go on,
// the top to go back. Otherwise the flick that scrolls you down to the end
// would carry straight on into the next page; this way you arrive at the end,
// and a second push is what takes you on. A page with nothing to scroll is at
// both edges at once, so there either direction steps straight away.
//
// These are the whole feel of it, and they can only be judged on real hardware
// — trackpad timing differs by device and by how you swipe. In dev they hang
// off window.__scroll so they can be changed live in the console:
//
//   __scroll.gestureEnd = 400   // it re-steps during one slow drag
//   __scroll.gestureEnd = 200   // a quick second flick gets ignored
//   __scroll.cooldown   = 700   // a firm flick occasionally counts twice
//   __scroll.minPush    = 20    // a coasting tail still creeps a step through
//   __scroll.spikeFloor = 40    // ...or one sneaks in via the spike rule
//   __scroll.spike      = 2     // a second flick during coasting feels dead
//   __scroll.swipe      = 40    // a phone swipe needs to travel further
const tuning = {
  gestureEnd: 300, // ms of silence that ends a gesture
  cooldown: 500, // ms floor between steps
  spike: 3, // × the recent average to read as a fresh push
  spikeFloor: 25, // ...and this big in absolute terms
  minPush: 12, // below this it is coasting or jitter, not a push
  swipe: 24, // px a finger has to travel before it counts
};
const RECENT = 8; // events averaged for the spike test

if (import.meta.env.DEV) window.__scroll = tuning;

let armed = true;
let quiet = null;
let lastStep = 0;
let recent = [];
// Set while swup is fetching and swapping, so a push during the swap can't
// queue a second visit behind the first. Cleared once the new page is in, not
// at visit:end: that waits on an animation frame, which a backgrounded tab
// never runs, and the guard has no reason to outlast the swap.
let visiting = false;
swup.hooks.on('visit:start', () => (visiting = true));
swup.hooks.on('page:view', () => (visiting = false));
// A visit that fails or is overtaken never ends, so it would hold this forever.
swup.hooks.on('visit:abort', () => (visiting = false));

const onTopPage = () => document.querySelector('#swup')?.dataset.page === 'top';

/**
 * Whether the page is at the edge a push in `direction` would go past: the
 * bottom for 1, the top for -1. A pixel of slack either way: on a zoomed or
 * high-density screen the scroll can land a fraction short of the edge and
 * never quite reach it.
 */
function atEdge(direction) {
  return direction > 0
    ? window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1
    : window.scrollY <= 1;
}

/**
 * Go to the link after the lit one (1) or before it (-1). Returns false if
 * there was nowhere to go.
 */
function step(direction) {
  if (visiting) return false;
  const current = navLinks.findIndex((a) => a.classList.contains('is-active'));
  const target = navLinks[current + direction];
  if (current < 0 || !target) return false;
  swup.navigate(target.getAttribute('href'));
  return true;
}

/** One step per gesture. */
function onGesture(delta) {
  const magnitude = Math.abs(delta);
  const direction = Math.sign(delta);
  const now = performance.now();
  const rested = now - lastStep > tuning.cooldown;

  // Every event pushes the silence out, coasting ones included — a coasting
  // event is still the gesture continuing.
  clearTimeout(quiet);
  quiet = setTimeout(() => {
    armed = true;
  }, tuning.gestureEnd);

  // A gesture still scrolling the page is reading, not leaving. Spend it, so
  // its momentum reaching the end doesn't count as a push past it.
  if (!direction || !atEdge(direction)) {
    armed = false;
    recent = [];
    return;
  }

  const average = recent.length ? recent.reduce((n, v) => n + v, 0) / recent.length : 0;
  recent.push(magnitude);
  if (recent.length > RECENT) recent.shift();

  // Rule 3: a spike well above the recent average, once the cooldown has passed.
  //
  // The absolute floor matters as much as the ratio. A decayed coast sits around
  // 1, so *any* jitter clears "three times the average" — that is a coast
  // re-arming itself and stepping again for as long as it trickles. A real push
  // starts in the tens whatever came before it.
  if (
    !armed &&
    rested &&
    average &&
    magnitude >= tuning.spikeFloor &&
    magnitude > average * tuning.spike
  ) {
    armed = true;
    recent = [magnitude];
  }

  if (!armed || magnitude < tuning.minPush) return;
  if (!rested) return; // rule 2

  // Only a move that actually happened spends the gesture — past either end a
  // push does nothing, and it must not cost you the push back the other way.
  if (step(direction)) {
    armed = false;
    lastStep = now;
  }
}

// Removed on a hot reload, like swup: two sets of these would step twice.
const gestures = new AbortController();
if (import.meta.hot) import.meta.hot.dispose(() => gestures.abort());

// Passive: nothing here needs to stop the browser scrolling. At an edge there is
// nothing left to scroll that way, and the bounce is already off
// (overscroll-behavior in main.scss).
window.addEventListener(
  'wheel',
  (event) => {
    // A trackpad pinch arrives as a wheel event with ctrlKey set. That is zoom.
    if (!onTopPage() || event.ctrlKey) return;
    // Firefox reports a mouse wheel in lines, not pixels — 3 a notch, which
    // would never clear minPush. Rough pixel equivalents put it on one scale.
    const unit = [1, 16, window.innerHeight][event.deltaMode] ?? 1;
    onGesture(event.deltaY * unit);
  },
  { passive: true, signal: gestures.signal },
);

// A swipe is one gesture by construction — it starts with a touch and ends
// when the finger lifts — so it needs none of the wheel's rules. It counts
// only if the page was at the edge it pushes past when the finger went down,
// for the same reason the wheel's has to start there. Both edges are noted at
// the start, because which one matters isn't known until the finger moves.
//
// Swiping down at the top would be pull-to-refresh in Chrome on Android, but
// the overscroll-behavior that stops the bounce stops that too.
let touchStart = null;
window.addEventListener(
  'touchstart',
  (event) => {
    const touch = event.touches[0];
    touchStart =
      onTopPage() && event.touches.length === 1
        ? { x: touch.clientX, y: touch.clientY, top: atEdge(-1), bottom: atEdge(1) }
        : null;
  },
  { passive: true, signal: gestures.signal },
);
window.addEventListener(
  'touchmove',
  (event) => {
    if (!touchStart) return;
    const touch = event.touches[0];
    // Dragging up is scrolling down, so this is positive for a swipe up.
    const travel = touchStart.y - touch.clientY;
    const across = Math.abs(touch.clientX - touchStart.x);
    // Mostly vertical, and far enough that a tap's wobble doesn't count.
    if (Math.abs(travel) <= tuning.swipe || Math.abs(travel) <= across) return;
    const direction = Math.sign(travel);
    if (direction > 0 ? touchStart.bottom : touchStart.top) step(direction);
    touchStart = null; // one decision per swipe, not one per frame of it
  },
  { passive: true, signal: gestures.signal },
);

// The keys that scroll a page, with the same rule as everything else: they
// step only once the page has nothing left to scroll that way, so on a page
// that does scroll they read it first and move on after.
const STEP_KEYS = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 };

window.addEventListener(
  'keydown',
  (event) => {
    let direction = STEP_KEYS[event.key];
    if (!direction || !onTopPage() || event.defaultPrevented) return;
    // Held down, a key repeats — which would run through every page in turn.
    // With a modifier it belongs to the browser or the OS (⌥↓, ⌘↑ and so on).
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ' && event.shiftKey) direction = -1; // Shift+Space scrolls up
    // Typing, or a key that means something to what has focus: Space presses a
    // focused button — a palette number on the colophon — and follows a link.
    const field = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
    const control = 'a[href], button, summary, [role="button"]';
    if (event.target.closest?.(event.key === ' ' ? `${field}, ${control}` : field)) return;
    if (atEdge(direction)) step(direction);
  },
  { signal: gestures.signal },
);

// Nothing intercepts the nav or the brand any more. They are ordinary links to
// ordinary URLs, and swup handles them the way it handles every other link on
// the site — fetching the page and swapping #swup while the canvas outside it
// keeps running. Everything that used to happen on a nav click now happens in
// setupPage(), which fires for *every* arrival: a click, a typed URL, Back,
// Forward. One path instead of two, and no way for them to disagree.

