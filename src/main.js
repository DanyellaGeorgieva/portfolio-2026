import './styles/main.scss';
import Swup from 'swup';
import Scene from './webgl/Scene.js';

// The WebGL scene is created once, on the persistent canvas (outside #swup), so
// it keeps running across page navigations — swup only swaps #swup.
const canvas = document.getElementById('webgl');
const scene = new Scene(canvas);

// Vite replaces this module on edit without reloading the page, which would
// leave the previous Scene's render loop running: two Scenes then draw to the
// same canvas and context from different uniforms, alternating frames. That
// shows up as a torn image — part of the screen a frame behind the rest.
if (import.meta.hot) {
  import.meta.hot.dispose(() => scene.dispose());
}

const navLinks = [...document.querySelectorAll('.mainnav a')];

// Every view change — entering a section, or opening a page — advances the
// palette one step through this fixed queue. The very first view stays on
// periwinkle; each change after that steps forward (wrapping).
const PALETTE_QUEUE = ['periwinkle', 'lilac', 'peach', 'coralPink', 'lime', 'aquaMint'];
let paletteIndex = 0;
let lastViewKey = null;

function goToView(key) {
  if (key === lastViewKey) return;
  if (lastViewKey !== null) {
    paletteIndex = (paletteIndex + 1) % PALETTE_QUEUE.length;
    scene.setPalette(PALETTE_QUEUE[paletteIndex]);
  }
  lastViewKey = key;
}

// Detail pages carry data-page="work"/"lab"; map those to the home section id
// so the right nav pill highlights.
const PAGE_SECTION = { work: 'works', lab: 'lab' };

// Opening a project pulls the background right back: uScale far above its 1.55
// default packs the field into small, dense cells, and the morph speed drops to
// a crawl, so a project page reads as still and distant behind the content.
// Scene's defaults come back on return to home.
const PAGE_SCALE = 4.6; // vs 1.55 default
const PAGE_SPEED = 0.05; // vs 0.18 default — barely moving

// Nav hrefs are "/#works" etc.; the section id is the part after the hash.
function navTarget(link) {
  return link.getAttribute('href').split('#')[1];
}

function setActiveNav(section) {
  navLinks.forEach((a) => a.classList.toggle('is-active', navTarget(a) === section));
}

// Home is one scroll of sections — watch them to highlight the active nav pill.
let sectionObserver = null;

function setupHome(main) {
  const sections = [...main.querySelectorAll('section[id]')];
  sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        setActiveNav(entry.target.id);
        // The hearts belong to "say hi" only: released on arriving, recalled on
        // leaving. Compared against lastViewKey before goToView() updates it, so
        // scrolling around within the section doesn't re-release them.
        if (entry.target.id === 'contact') {
          if (lastViewKey !== 'contact') scene.releaseHearts();
        } else if (lastViewKey === 'contact') {
          scene.retireHearts();
        }
        goToView(entry.target.id); // stepping into a section advances the palette
      }
    },
    { rootMargin: '-45% 0px -45% 0px' }, // active as a section crosses the viewport centre
  );
  sections.forEach((s) => sectionObserver.observe(s));

  // Arrived with a hash (e.g. from a project's "← works")? Jump there; else top.
  const target = location.hash && main.querySelector(location.hash);
  if (target) target.scrollIntoView();
  else window.scrollTo(0, 0);
}

// Runs on first load and after every swup swap.
function setupPage() {
  sectionObserver?.disconnect();
  sectionObserver = null;

  const main = document.querySelector('#swup');
  const page = main.dataset.page;

  if (page === 'home') {
    // Back to the default field.
    scene.setScale();
    scene.setSpeed();
    setupHome(main);
  } else {
    window.scrollTo(0, 0);
    setActiveNav(PAGE_SECTION[page]); // highlight works / lab
    goToView(location.pathname); // opening a page advances the palette
    scene.retireHearts(); // they belong to "say hi", not to a project page
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
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
    history.replaceState(null, '', `/#${section}`);
  }
});
