import { paletteNames } from './palettes.js';

/**
 * Minimal, dependency-free tweak panel shown when the page is loaded with
 * ?debug. Exposes the feel-defining uniforms (speed / scale / warp) as sliders
 * and the named palettes as buttons. Kept out of the main bundle via a dynamic
 * import in Scene.js.
 */
export function createDebugPanel(scene) {
  const { uniforms } = scene.material;

  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    'top:12px',
    'right:12px',
    'z-index:10',
    'padding:12px 14px',
    'background:rgba(0,0,0,0.55)',
    'color:#fff',
    'font:12px/1.6 system-ui,sans-serif',
    'border-radius:8px',
    'backdrop-filter:blur(6px)',
    'min-width:200px',
  ].join(';');

  const slider = (label, uniform, min, max, step) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin-bottom:8px';
    const value = document.createElement('span');
    value.textContent = uniforms[uniform].value.toFixed(2);
    value.style.cssText = 'float:right;opacity:0.7';
    row.append(`${label} `, value);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = uniforms[uniform].value;
    input.style.cssText = 'width:100%;display:block;margin-top:2px';
    input.addEventListener('input', () => {
      uniforms[uniform].value = Number(input.value);
      value.textContent = Number(input.value).toFixed(2);
    });
    row.append(input);
    panel.append(row);
  };

  slider('speed', 'uSpeed', 0, 0.5, 0.01);
  slider('scale', 'uScale', 0.5, 6, 0.1);
  slider('thick', 'uThick', 0.01, 0.3, 0.005);
  slider('glow', 'uGlow', 1, 8, 0.1);
  slider('smoke', 'uSmoke', 0, 0.5, 0.01);
  slider('grain', 'uGrain', 0, 0.2, 0.005);

  const glass = document.createElement('div');
  glass.textContent = 'glass';
  glass.style.cssText = 'margin:10px 0 6px;opacity:0.6;letter-spacing:0.08em';
  panel.append(glass);

  slider('bend', 'uGlassBend', 0, 8, 0.1);
  slider('bevel', 'uGlassBevel', 0.05, 1, 0.01);
  slider('aberration', 'uGlassAberration', 0, 3, 0.02);
  slider('frost', 'uGlassFrost', 0, 0.3, 0.005);
  slider('rim', 'uGlassRim', 0, 1, 0.01);
  slider('rim width', 'uGlassRimWidth', 0.001, 0.02, 0.001);
  slider('wobble', 'uWobble', 0, 0.15, 0.005);
  slider('wobble rate', 'uWobbleRate', 0, 2, 0.05);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:4px';
  paletteNames.forEach((name, i) => {
    const button = document.createElement('button');
    button.textContent = `${i + 1}·${name}`;
    button.style.cssText =
      'flex:1;cursor:pointer;padding:4px 6px;border:0;border-radius:4px;font:11px system-ui';
    button.addEventListener('click', () => scene.setPalette(name));
    buttons.append(button);
  });
  panel.append(buttons);

  document.body.append(panel);
}
