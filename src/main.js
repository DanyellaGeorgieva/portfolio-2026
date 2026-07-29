import './styles/main.scss';
import Swup from 'swup';
import Scene from './webgl/Scene.js';

// The WebGL scene is created once, on the persistent canvas (outside #swup), so
// it keeps running across page navigations — swup only swaps #swup.
const canvas = document.getElementById('webgl');
const scene = new Scene(canvas);

const navLinks = [...document.querySelectorAll('.mainnav a')];

// Every page navigation advances the palette one step through this fixed queue
// (wrapping around). The initial load stays on the first entry.
const PALETTE_QUEUE = ['periwinkle', 'lilac', 'peach', 'coralPink', 'lime', 'aquaMint'];
let paletteIndex = 0;

function advancePalette() {
  paletteIndex = (paletteIndex + 1) % PALETTE_QUEUE.length;
  scene.setPalette(PALETTE_QUEUE[paletteIndex]);
}

// Highlight the nav item matching the current page. Nav hrefs are "/work/" etc.,
// so the first path segment ("work") is what we compare against data-page.
function setActiveNav(page) {
  navLinks.forEach((a) => {
    const segment = a.getAttribute('href').split('/').filter(Boolean)[0];
    a.classList.toggle('is-active', segment === page);
  });
}

// Runs on first load and after every swup swap.
function setupPage() {
  const page = document.querySelector('#swup').dataset.page;
  window.scrollTo(0, 0);
  setActiveNav(page);
}

// swup keeps the canvas alive by only ever replacing #swup. No await-animations.
const swup = new Swup({ containers: ['#swup'], animationSelector: false });
swup.hooks.on('page:view', () => {
  setupPage();
  advancePalette(); // each click steps to the next palette
});
setupPage(); // initial page (stays on PALETTE_QUEUE[0])
