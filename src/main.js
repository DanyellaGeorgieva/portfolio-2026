import './styles/main.scss';
import Scene from './webgl/Scene.js';

const canvas = document.getElementById('webgl');
const scene = new Scene(canvas);

// Palette queue: clicking any nav link advances to the next palette in this
// fixed order and wraps around. Index 0 (bluePurple) is the initial palette, so
// the first click lands on pinkCream.
const PALETTE_QUEUE = ['bluePurple', 'pinkCream'];
let paletteIndex = 0;

document.querySelectorAll('.hero__nav a').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    paletteIndex = (paletteIndex + 1) % PALETTE_QUEUE.length;
    scene.setPalette(PALETTE_QUEUE[paletteIndex]);
  });
});
