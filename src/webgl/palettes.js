import { Vector3 } from 'three';

/**
 * Named palettes for the gooey gradient background. Each is five sRGB hex
 * stops — [backgroundLow, backgroundHigh, rim, glow, center]. The first two
 * form the soft two-tone background gradient. Across a channel's cross-section
 * the colour ramps background → `rim` (deep, where the glow meets the bg) →
 * `glow` (warm mid) → `center` (bright core), giving the layered border-glow.
 */
export const palettes = {
  storm: ['#0a0a12', '#15151f', '#4a4a55', '#9a9aa5', '#ffffff'], // grayscale test
  pinkCream: ['#F8E9F2', '#F0CDE1', '#DB4AAA', '#DF8A86', '#FFEAB8'], // pale pink bg, magenta→rose glow, pale yellow lightning
  bluePurple: ['#7a4cd0', '#7fb0ea', '#3a5fc0', '#6aa0e0', '#eaf6ff'], // blue bg, indigo, sky, white
  greenYellow: ['#7fcf9a', '#bfe08a', '#5fa85a', '#a8cc60', '#f8f4c8'], // green bg, deep green, lime, cream
};

export const paletteNames = Object.keys(palettes);

/** '#rrggbb' → Vector3 of raw sRGB components in the 0..1 range. */
function hexToVec3(hex) {
  const int = parseInt(hex.replace('#', ''), 16);
  return new Vector3(
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  );
}

/** Return the [bgLow, bgHigh, rim, glow, center] Vector3 colors for a palette. */
export function paletteColors(name) {
  return palettes[name].map(hexToVec3);
}
