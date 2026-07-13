import { Vector3 } from "three";

/**
 * Named palettes for the gooey gradient background. Each is four sRGB hex stops,
 * in this order — think of them as the visual layers, front to back:
 *
 *   [ background, smoke, glow, inner ]
 *      0          1      2     3
 *
 *   • background (0) — the field behind everything
 *   • smoke      (1) — the rim where the glow meets the background (wispy layer)
 *   • glow       (2) — the warm mid halo around the channels
 *   • inner      (3) — the bright core of the channel lines
 *
 * A channel's cross-section ramps background → smoke → glow → inner
 * (outer edge inward to the bright centre).
 */
// Colours sampled across the reference's ~18s loop (six background zones).
// Backgrounds are kept white for now (see paletteColors); smoke/glow/inner are a
// shared accent stream windowed so each palette's inner becomes the next one's
// glow — the colours flow outward on each step. The stream is a cyclic 7-hue
// spectrum from the bubbles' iridescent rims:
//   sky → lavender → magenta → coral → gold → lime → aqua → (back to sky)
export const palettes = {
  //           background   smoke        glow         inner
  periwinkle: ["#ffffff", "#3C98F3", "#8F6CED", "#E694EF"], // sky · lavender · magenta
  lilac:      ["#ffffff", "#8F6CED", "#E694EF", "#F49A86"], // lavender · magenta · coral
  peach:      ["#ffffff", "#E694EF", "#F49A86", "#F4D499"], // magenta · coral · gold
  coralPink:  ["#ffffff", "#F49A86", "#F4D499", "#B1F8A1"], // coral · gold · lime
  lime:       ["#ffffff", "#F4D499", "#B1F8A1", "#6FE3C9"], // gold · lime · aqua
  aquaMint:   ["#ffffff", "#B1F8A1", "#6FE3C9", "#3C98F3"], // lime · aqua · sky (loops back)
};

export const paletteNames = Object.keys(palettes);

/** '#rrggbb' → Vector3 of raw sRGB components in the 0..1 range. */
function hexToVec3(hex) {
  const int = parseInt(hex.replace("#", ""), 16);
  return new Vector3(
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  );
}

/**
 * Return the five layer colours the shader still expects, as Vector3s in 0..1:
 * [background, background, smoke, glow, inner]. Palettes are authored with a
 * single background, which we duplicate into both background slots — a flat
 * background for now; split it back into two tones later to restore the depth.
 */
export function paletteColors(name) {
  const [bg, smoke, glow, inner] = palettes[name].map(hexToVec3);
  return [bg, bg.clone(), smoke, glow, inner];
}
