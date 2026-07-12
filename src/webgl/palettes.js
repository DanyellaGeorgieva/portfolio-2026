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
// Colours sampled from the reference (one hue stop per ~3.6s of its 18s
// loop). Backgrounds are that frame's soft gradient tone; smoke/glow/inner are a
// shared accent stream (blue→magenta→yellow→green→sky) windowed so each palette's
// inner becomes the next one's glow — the colours flow outward on each step.
export const palettes = {
  //          background    smoke            glow          inner
  bluePurple: ["#ffffff",  "#3C98F3",  "#8F6CED", "#E694EF"], // periwinkle bg · sky · blue · magenta
  pinkCream: ["#ffffff",   "#8F6CED",  "#E694EF", "#F4D499"], // peach bg · blue · magenta · yellow
  greenYellow: ["#ffffff", "#E694EF",  "#F4D499", "#B1F8A1"], // yellow-green bg · magenta · yellow · green
  blueGreen: ["#ffffff",   "#F4D499",  "#B1F8A1", "#3C98F3"], // mint bg · yellow · green · sky
  purpleBlue: ["#ffffff",  "#B1F8A1",   "#3C98F3", "#8F6CED"], // periwinkle-blue bg · green · sky · blue
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
