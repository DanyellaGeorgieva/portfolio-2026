import './styles/main.scss';
import Swup from 'swup';
import Scene from './webgl/Scene.js';
import MorphTitle from './morphTitle.js';
import { paletteInk } from './webgl/palettes.js';

// The WebGL scene is created once, on the persistent canvas (outside #swup), so
// it keeps running across page navigations — swup only swaps #swup.
const canvas = document.getElementById('webgl');
const scene = new Scene(canvas, {
  // The page takes its colour from whichever palette is up, so the copy belongs
  // to the field instead of sitting on it as flat black. Everything downstream
  // reads --ink, so this one property carries the nav, the title, the tracklist
  // rules and the body copy together.
  onPalette: (name) => {
    document.documentElement.style.setProperty('--ink', paletteInk(name));
  },
});

// Vite replaces this module on edit without reloading the page, which would
// leave the previous Scene's render loop running: two Scenes then draw to the
// same canvas and context from different uniforms, alternating frames. That
// shows up as a torn image — part of the screen a frame behind the rest.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    scene.dispose();
    morphTitle.dispose(); // its rAF would otherwise outlive the module too
  });
}

const navLinks = [...document.querySelectorAll('.mainnav a')];

// The pinned title. It lives in the persistent shell alongside the canvas, so it
// survives navigation and carries its current word across a page change.
const morphTitle = new MorphTitle(document.getElementById('morph'));

// What the pinned title reads in each view. A view with no entry here (a project
// page) morphs to an empty string, which melts the word away.
const VIEW_TITLES = {
  top: 'Hello there',
  works: 'Works',
  lab: 'Lab',
  contact: 'Say hi',
};

// Every view change — entering a section, or opening a page — advances the
// palette one step through this fixed queue. The very first view stays on
// skyOrchid; each change after that steps forward (wrapping).
const PALETTE_QUEUE = [
  'skyOrchid',
  'lavenderPeach',
  'magentaGold',
  'coralLime',
  'goldAqua',
  'limeViolet',
];
let paletteIndex = 0;
let lastViewKey = null;

function goToView(key) {
  if (key === lastViewKey) return;
  if (lastViewKey !== null) {
    paletteIndex = (paletteIndex + 1) % PALETTE_QUEUE.length;
    scene.setPalette(PALETTE_QUEUE[paletteIndex]);
  }
  // Every view change morphs the title from the word it is showing to this
  // view's — whether the change came from a nav click or from scrolling into
  // the section, since both land here. Views with no entry (a project page)
  // leave the title empty; setupPage() hides it there anyway.
  morphTitle.morphTo(VIEW_TITLES[key] ?? '');
  lastViewKey = key;
}

// Detail pages carry data-page="work"/"lab"; map those to the home section id
// so the right nav pill highlights.
const PAGE_SECTION = { work: 'works', lab: 'lab' };

// Opening a project dives into the field: uScale well below its default blows
// one or two channels up to fill the screen, and the morph slows to a crawl, so
// a project page reads as being right up against the surface rather than looking
// at it from across the room. The zoom is anchored at the centre of the screen
// (see scaleOrigin in background.frag), so it plays as a push in, not a slide.
// Scene's defaults come back on return to home.
const PAGE_SCALE = 0.9; // vs 3.6 default — a 4× magnification
const PAGE_SPEED = 0.05; // vs 0.18 default — barely moving

// Nav hrefs are "/#works" etc.; the section id is the part after the hash.
function navTarget(link) {
  return link.getAttribute('href').split('#')[1];
}

function setActiveNav(section) {
  navLinks.forEach((a) => a.classList.toggle('is-active', navTarget(a) === section));
}

// Home's sections are stacked in one place with only one shown, so nothing
// scrolls and there is no scroll position to infer the current section from —
// the nav is the only thing that changes it. Emptied on a project page.
let homeSections = [];

/**
 * Put a section up and take the others down. Everything that used to hang off a
 * section crossing the viewport centre hangs off this instead.
 */
function showSection(id) {
  const target = homeSections.find((section) => section.id === id);
  if (!target) return;

  homeSections.forEach((section) => {
    section.classList.toggle('is-active', section === target);
  });

  setActiveNav(id);
  // Arriving at "say hi" sends up a drift of glass hearts, which then finish
  // their climb over whatever section comes next. Compared against lastViewKey
  // before goToView() updates it, so it takes leaving and coming back to
  // release them again.
  if (id === 'contact' && lastViewKey !== 'contact') {
    scene.releaseHearts();
  }
  goToView(id); // stepping into a section advances the palette

  // The hash follows the section that is up, so a reload or a copied URL lands
  // back here. replaceState, not pushState: this is one page, and each section
  // shouldn't become its own back-button step.
  history.replaceState(null, '', `/#${id}`);
}

function setupHome(main) {
  homeSections = [...main.querySelectorAll('section[id]')];

  // Arrived with a hash (e.g. from a project's "← works")? Open that section;
  // otherwise start on the first.
  const fromHash = homeSections.find((s) => `#${s.id}` === location.hash);
  showSection((fromHash ?? homeSections[0])?.id);
}

// Runs on first load and after every swup swap.
function setupPage() {
  homeSections = [];

  const main = document.querySelector('#swup');
  const page = main.dataset.page;

  // A project page carries its own <h1>, so the pinned title stands down there.
  morphTitle.setVisible(page === 'home');

  if (page === 'home') {
    // Back to the default field.
    scene.setScale();
    scene.setSpeed();
    setupHome(main);
  } else {
    window.scrollTo(0, 0);
    setActiveNav(PAGE_SECTION[page]); // highlight works / lab
    goToView(location.pathname); // opening a page advances the palette
    scene.setScale(PAGE_SCALE);
    scene.setSpeed(PAGE_SPEED);
  }
}

// swup keeps the canvas alive by only ever replacing #swup. No await-animations.
const swup = new Swup({ containers: ['#swup'], animationSelector: false });
swup.hooks.on('page:view', () => setupPage());
setupPage(); // initial page

// Nav clicks: when already on home, just smooth-scroll to the section (no nav).
// From a project page, let swup navigate to "/#section" — setupHome() then scrolls.
document.addEventListener('click', (event) => {
  const link = event.target.closest('.mainnav a');
  if (!link) return;
  const section = navTarget(link);
  const onHome = document.querySelector('#swup')?.dataset.page === 'home';
  if (section && onHome) {
    event.preventDefault();
    showSection(section); // it handles the hash too
  }
});
