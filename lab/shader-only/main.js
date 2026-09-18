// The shader, on its own, with the buffer watcher running. See index.html.
import Scene from '../../src/webgl/Scene.js';

const canvas = document.getElementById('webgl');
document.body.style.cssText = 'margin:0;overflow:hidden;background:#000';
canvas.style.cssText = 'display:block;width:100vw;height:100vh';

const scene = new Scene(canvas);
window.__scene = scene;

// Cycle the palette on a timer so the field is doing something without anyone
// touching it — the bug needs no interaction, so neither should the test.
import('../../src/webgl/palettes.js').then(({ paletteNames }) => {
  let i = 0;
  setInterval(() => {
    i = (i + 1) % paletteNames.length;
    scene.setPalette(paletteNames[i]);
  }, 8000);
});

// And push the zoom back and forth, since that is what made the seams visible.
let zoomed = false;
setInterval(() => {
  zoomed = !zoomed;
  scene.setScale(zoomed ? 0.9 : undefined);
  scene.setSpeed(zoomed ? 0.05 : undefined);
}, 6000);
