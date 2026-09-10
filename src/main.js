import './styles/main.scss';
import Swup, { updateHistoryRecord } from 'swup';
import Scene from './webgl/Scene.js';
import { paletteInk, paletteNames } from './webgl/palettes.js';
import revealSection, { hideSection } from './sectionReveal.js';

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
  // The page takes its colour from whichever palette is up, so the copy belongs
  // to the field instead of sitting on it as flat black. Everything downstream
  // reads --ink, so this one property carries the nav, the tracklist rules and
  // the body copy together.
  onPalette: (name) => {
    document.documentElement.style.setProperty('--ink', paletteInk(name));
    // Driven from here rather than from the click, so the picker follows the
    // palette however it changed — a nav click steps it too.
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
  });
}

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

const navLinks = [...document.querySelectorAll('.main-nav a')];

// Nav hrefs are "/#works" etc.; the section id is the part after the hash.
function navTarget(link) {
  return link.getAttribute('href').split('#')[1];
}

function setActiveNav(section) {
  navLinks.forEach((a) => a.classList.toggle('is-active', navTarget(a) === section));
}

// --- Palette ----------------------------------------------------------------
// A nav click steps one along the sequence palettes.js authors, wrapping at the
// end. The current position is read off the scene each time rather than kept in
// a counter here, so there is nothing that can drift out of step with what is
// actually on screen — including the number keys Scene binds for itself.
function advancePalette() {
  const index = Math.max(0, paletteNames.indexOf(scene.paletteName));
  scene.setPalette(paletteNames[(index + 1) % paletteNames.length]);
}

// --- Home -------------------------------------------------------------------
// Home's sections are stacked in one place with only one shown, so nothing
// scrolls and there is no scroll position to infer the current section from —
// the nav is the only thing that changes it. Emptied on a project page.
let homeSections = [];
let lastViewKey = null;

// Remembers which view is up: what the hearts below are compared against, and
// what tells a first load apart from a navigation.
function goToView(key) {
  if (key === lastViewKey) return;
  lastViewKey = key;
}

// Which section is up, held here rather than read back off the .is-active class.
// The class is removed by the reveal's exit callback, so it lags the decision by
// the length of a transition — and stepping reads this to work out where "next"
// is. Deriving position from the DOM meant an interrupted or delayed transition
// left the scroll computing from the wrong place.
let currentSection = null;

/** Put a section up and take the others down. */
function showSection(id) {
  const target = homeSections.find((section) => section.id === id);
  if (!target || target === currentSection) return;

  const leaving = currentSection;
  currentSection = target;

  // One on, all others off, right now. Two sections are never up together, not
  // even for a frame, and nothing about what is on screen waits on an animation.
  homeSections.forEach((section) => {
    section.classList.toggle('is-active', section === target);
  });

  // Down the list is forward. A nav click jumping backwards reverses the motion,
  // so the direction always matches where you are going, not how you got there.
  revealSection(target, positionOf(target) > positionOf(leaving) ? 1 : -1);

  // The picker is a control for the whole visit, not for the section you happen
  // to be reading, so it goes with the clean view.
  if (picker) picker.hidden = true;
  setActiveNav(id);
  // Arriving at "say hi" sends up a drift of glass hearts, which then finish
  // their climb over whatever section comes next. Compared against lastViewKey
  // before goToView() updates it, so it takes leaving and coming back to
  // release them again.
  if (id === 'contact' && lastViewKey !== 'contact') {
    scene.releaseHearts();
  }
  goToView(id);

  // The hash follows the section that is up, so a reload or a copied URL lands
  // back here. Replace, not push: this is one page, and each section shouldn't
  // become its own back-button step.
  //
  // swup's helper rather than history.replaceState, because swup stamps every
  // entry it owns with { source: 'swup' } and ignores the popstate of any entry
  // without it. A bare replaceState(null, ...) strips that stamp, and then Back
  // from a project page only rewrites the URL to /#works — the project stays on
  // screen, so the next Back steps past it into whatever came before. This keeps
  // the stamp (and the index swup reads the direction from) and rewrites the URL.
  updateHistoryRecord(`/#${id}`);
}

/**
 * The clean view: the shell and the field, and nothing else. It is a view like
 * any other — it stands the nav down and takes the hash off the URL — it just
 * has no section behind it.
 */
function showIndex() {
  const leaving = currentSection;
  currentSection = null;

  // Everything except the one that is leaving goes down now; that one is held
  // visible until its content has travelled off, then hidden.
  homeSections.forEach((section) => {
    if (section !== leaving) section.classList.remove('is-active');
  });
  // Backwards: the clean view sits before every section, so the content leaves
  // the way it would have arrived from there.
  hideSection(leaving, -1, () => {
    // Only if it is still the one on the way out. Going straight back to this
    // section re-marks it active before this runs, and hiding it then would
    // blank the section that was just asked for.
    if (leaving !== currentSection) leaving?.classList.remove('is-active');
  });
  if (picker) picker.hidden = false; // nothing is up, so the choice is on offer
  setActiveNav(null); // no nav item matches, so every pill stands down
  goToView('index');
  updateHistoryRecord('/');
}

function setupHome(main) {
  homeSections = [...main.querySelectorAll('section[id]')];
  currentSection = null; // swup replaced #swup; the old reference is detached

  // Arrived with a hash (e.g. from a project's "← works")? Open that section.
  // Otherwise this is the front door, which opens clean — so a reload of "/"
  // lands on the same thing clicking the name does.
  const fromHash = homeSections.find((s) => `#${s.id}` === location.hash);
  if (fromHash) showSection(fromHash.id);
  else showIndex();
}

// --- Scrolling between sections ---------------------------------------------
// Home is one viewport with nothing to scroll, so the gesture is the event
// rather than a scroll position, and one gesture has to mean exactly one step.
//
// That can't be done on a timer. A trackpad flick keeps emitting wheel events
// from momentum long after the fingers have lifted — easily a second or two,
// and the tail is indistinguishable from a fresh flick except by *when* it
// arrives. Locking for a fixed period just means the tail steps again as soon
// as the lock expires, which is how you scroll through the whole site in one
// swipe.
//
// One gesture has to mean one step. The browser gives one undifferentiated
// wheel stream for finger-down dragging, inertia and mouse notches, and four
// approaches were tried before this one:
//
//   • A fixed lock. Momentum outlasts any lock short enough to feel responsive.
//   • A size threshold per event. Momentum decays through the whole range a real
//     push occupies, so it re-arms mid-coast wherever the line is drawn.
//   • An acceleration test. True of a flick, false of a drag: fingers stay down
//     and the delta rises and falls with them, so every rise stepped again.
//   • Silence alone. One threshold has to serve two jobs at once — a pause
//     *inside* a gesture must not end it, while a pause *between* two gestures
//     must. Set it short and a slow drag re-steps; set it long and a quick
//     second flick is swallowed. Those are the "rescrolls" and the "does
//     nothing".
//
// So there are three rules, not one:
//
//   1. Silence for gestureEnd ends the gesture and re-arms. Generous enough
//      that a stutter inside a drag doesn't count.
//   2. No two steps closer together than cooldown, whatever the stream does.
//      This is the floor that makes a re-arm inside a gesture harmless — the
//      transition itself runs nearly this long, so a faster step had nothing to
//      show anyway.
//   3. A spike re-arms early. Coasting decays, so a delta several times the
//      recent average is a hand back on the trackpad — that restores the quick
//      second flick that rule 1 alone would swallow. Gated behind the cooldown,
//      so a drag's own wandering can't trigger it.
//
// The clean view sits at -1, one before the first section, so scrolling up past
// the top returns to it rather than being a separate case.
// These four are the whole feel of it, and they can only be judged on real
// hardware — trackpad event timing differs by device and by how you swipe. In
// dev they hang off window.__scroll so they can be changed live in the console
// without a rebuild:
//
//   __scroll.gestureEnd = 400   // it re-steps during one slow drag
//   __scroll.gestureEnd = 200   // a quick second flick gets ignored
//   __scroll.cooldown   = 700   // a firm flick occasionally counts twice
//   __scroll.minPush    = 20    // a coasting tail still creeps a step through
//   __scroll.spikeFloor = 40    // ...or one sneaks in via the spike rule
//   __scroll.spike      = 2     // a second flick during coasting feels dead
//
// minPush and spikeFloor are the two that stop a coast counting as intent: both
// are absolute, because every relative test a decayed tail can satisfy.
//
// gestureEnd is patient on purpose: a slow drag can leave 150ms+ between
// events, and anything shorter treats the drag's own stutter as a new gesture.
// Rule 3 is what pays for that patience.
const tuning = {
  gestureEnd: 300, // ms of silence that ends a gesture
  cooldown: 500, // ms floor between steps
  spike: 3, // × the recent average to read as a fresh push
  spikeFloor: 25, // ...and this big in absolute terms
  minPush: 12, // below this it is coasting or jitter, not a push
};
const RECENT = 8; // events averaged for the spike test

if (import.meta.env.DEV) window.__scroll = tuning;

let armed = true;
let quiet = null;
let lastStep = 0;
let recent = [];

function positionOf(section) {
  return section ? homeSections.indexOf(section) : -1;
}

/** Move one section. Returns false if there was nowhere to go. */
function step(delta) {
  if (!homeSections.length || !delta) return false;

  const next = positionOf(currentSection) + (delta > 0 ? 1 : -1);
  if (next < -1 || next >= homeSections.length) return false;

  // Same as a nav click: a change of view steps the palette. Called here rather
  // than inside showSection() so it stays out of the way of the paths that must
  // not step it — a first load, and the nav handler, which decides for itself
  // whether the click was a real move.
  advancePalette();

  if (next === -1) showIndex();
  else showSection(homeSections[next].id);
  return true;
}

/** One step per gesture. */
function onGesture(delta) {
  const magnitude = Math.abs(delta);
  const now = performance.now();
  const rested = now - lastStep > tuning.cooldown;

  // Every event pushes the silence out, coasting ones included — a coasting
  // event is still the gesture continuing.
  clearTimeout(quiet);
  quiet = setTimeout(() => {
    armed = true;
  }, tuning.gestureEnd);

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

  // Only a move that actually happened spends the gesture — at the last section
  // a downward flick does nothing, and it must not cost you the flick back up.
  if (step(delta)) {
    armed = false;
    lastStep = now;
  }
}

const onHomePage = () => document.querySelector('#swup')?.dataset.page === 'home';

// Not passive: on home the gesture drives the sections, so the browser must not
// also act on it — without this a stray overscroll nudges the page underneath.
window.addEventListener(
  'wheel',
  (event) => {
    if (!onHomePage()) return;
    event.preventDefault();
    onGesture(event.deltaY);
  },
  { passive: false },
);

let touchStartY = null;
window.addEventListener(
  'touchstart',
  (event) => {
    touchStartY = event.touches[0]?.clientY ?? null;
  },
  { passive: true },
);
window.addEventListener(
  'touchmove',
  (event) => {
    if (touchStartY === null || !onHomePage()) return;
    // Dragging up is scrolling down. The threshold keeps a tap's wobble from
    // counting as a gesture.
    const travelled = touchStartY - (event.touches[0]?.clientY ?? touchStartY);
    if (Math.abs(travelled) > 24) {
      step(travelled);
      touchStartY = null; // one step per drag, not one per frame of it
    }
  },
  { passive: true },
);

// --- Detail pages -----------------------------------------------------------
// Opening a project dives into the field: uScale well below its default blows
// one or two channels up to fill the screen, and the morph slows to a crawl, so
// a project page reads as being right up against the surface rather than looking
// at it from across the room. The zoom is anchored at the centre of the screen
// (see scaleOrigin in background.frag), so it plays as a push in, not a slide.
// Scene's defaults come back on return to home.
const PAGE_SCALE = 0.9; // vs 3.6 default — a 4× magnification
const PAGE_SPEED = 0.05; // vs 0.18 default — barely moving

// The pinned "← works" on a detail page. Null on home, which has none.
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

// Runs on first load and after every swup swap.
function setupPage() {
  homeSections = [];

  const main = document.querySelector('#swup');
  const page = main.dataset.page;

  if (page === 'home') {
    backLink = null;
    // Back to the default field.
    scene.setScale();
    scene.setSpeed();
    setupHome(main);
  } else {
    window.scrollTo(0, 0);
    // Fresh page, fresh scroll position — and the hatch starts closed, so the
    // case study opens on its title and nothing else.
    backLink = main.querySelector('.back');
    backLink?.classList.remove('is-visible');
    lastScrollY = 0;
    // The case study arrives the way a section does. Forward, because opening a
    // project is always going deeper — coming back out is the home side's move.
    revealSection(main.querySelector('.page'));
    // Opening a project steps the palette too, which covers every route into
    // one: a card in the tracklist, "next project" at the foot of a case study,
    // a lab sketch. Skipped on the very first view, so landing straight on a
    // project URL shows the palette it was linked with rather than the next.
    if (lastViewKey !== null) advancePalette();
    goToView(location.pathname);
    scene.setScale(PAGE_SCALE);
    scene.setSpeed(PAGE_SPEED);
  }
}

// swup keeps the canvas alive by only ever replacing #swup. No await-animations.
const swup = new Swup({ containers: ['#swup'], animationSelector: false });
swup.hooks.on('page:view', () => setupPage());
setupPage(); // initial page

// Esc backs out of a detail page, the way it closes anything you have dived
// into. It goes wherever that page's own back link goes, so lab pages land on
// the lab rather than on works.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !backLink) return;
  swup.navigate(backLink.getAttribute('href'));
});

// Nav clicks step the palette. On home there is nothing to navigate to — every
// section is already in the document — so the view is changed here instead.
// From a project page the click is left to swup, which loads home and opens the
// section from the hash; the palette still steps on the way out.
document.addEventListener('click', (event) => {
  const onHome = document.querySelector('#swup')?.dataset.page === 'home';

  // The name empties the view back out to the clean view. Checked before the
  // nav, since the two sit in the same bar. From a project page it is left to
  // swup, which loads "/" — and setupHome() opens clean on a bare URL, so both
  // routes land in the same place.
  if (event.target.closest('.site-header__brand')) {
    if (!onHome) return;
    event.preventDefault();
    showIndex();
    return;
  }

  const link = event.target.closest('.main-nav a');
  if (!link) return;

  const section = navTarget(link);
  if (!section) return;

  if (!onHome) {
    advancePalette();
    return;
  }

  event.preventDefault();
  // Only on a real move — clicking the pill you are already on shouldn't
  // repaint the site out from under you.
  if (section !== lastViewKey) advancePalette();
  showSection(section);
});
