import './styles/main.scss';
import Scene from './webgl/Scene.js';

const canvas = document.getElementById('webgl');
const scene = new Scene(canvas);

// Palette queue: clicking any nav link advances to the next palette in this
// fixed order and wraps around. Index 0 (periwinkle) is the initial palette, so
// the first click lands on lilac.
const PALETTE_QUEUE = [
  'periwinkle',
  'lilac',
  'peach',
  'coralPink',
  'lime',
  'aquaMint',
];
let paletteIndex = 0;

document.querySelectorAll('.hero__nav a').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    paletteIndex = (paletteIndex + 1) % PALETTE_QUEUE.length;
    scene.setPalette(PALETTE_QUEUE[paletteIndex]);
  });
});

// Say Hi → release a drift of iridescent heart bubbles rising up the screen.
document
  .querySelector('.hero__nav a[href="#contact"]')
  ?.addEventListener('click', () => scene.releaseHearts());
