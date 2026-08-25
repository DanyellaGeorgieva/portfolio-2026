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
// Smoke/glow/inner are a
// shared accent stream windowed so each palette's inner becomes the next one's
// glow — the colours flow outward on each step. The stream is a cyclic 7-hue
// spectrum from the bubbles' iridescent rims:
//   sky → lavender → magenta → coral → gold → lime → aqua → (back to sky)
// Each palette is named for the two ends of its window — the smoke it starts on
// and the inner it reaches — since that is what the eye actually reads as the
// channel ramps outward to inward. The names step in the same order the stream
// does, so each one's second half is the next one's first.
// The background is no longer white but a barely-there tint of each palette's
// complement — the hue opposite its glow, at ~96% lightness. Complement rather
// than a tint of the palette's own hues: a pale version of the same family makes
// the channels look like a stronger printing of the background, where the
// opposite hue sets them off and the field still reads as near-white. Keep these
// this pale; much below 95% lightness and the background stops being a ground
// and starts competing with the channels.
export const palettes = {
  //             background   smoke        glow         inner
  skyOrchid:    ["#F7F9F0", "#3C98F3", "#8F6CED", "#E694EF"], // pale citron  ← sky · lavender · orchid
  lavenderPeach:["#F1F9F0", "#8F6CED", "#e66df3", "#e8aa90"], // pale green   ← lavender · magenta · peach
  magentaGold:  ["#EFF7FA", "#e66df3", "#e88054", "#E9DC71"], // pale sky     ← magenta · amber · gold
  coralLime:    ["#F2F2FB", "#e4a191", "#F4F055", "#B1F8A1"], // pale violet  ← coral · gold · lime
  goldAqua:     ["#F9F2FA", "#F4F055", "#B1F8A1", "#23e7e7"], // pale lilac   ← gold · lime · aqua
  limeViolet:   ["#FBF1F4", "#B1F8A1", "#6FE3C9", "#9577e7"], // pale rose    ← lime · mint · violet (loops back)
};

export const paletteNames = Object.keys(palettes);

/**
 * Text ink per palette — each one is that palette's glow hue held at ~20%
 * lightness, so the copy reads as belonging to the field rather than sitting on
 * top of it as flat black. Kept separate from the stops above because these
 * never reach the shader: main.js writes the active one to the --ink custom
 * property and the whole page takes its colour from there.
 *
 * They are deliberately much darker than anything in the palette itself. The
 * stops are all light and saturated — #F4F055 on the panel would be invisible —
 * so these are derived rather than sampled. Every one clears 8:1 against the
 * translucent white panel, against AAA's 7:1, with the yellows and greens
 * naturally landing lowest.
 */
export const inks = {
  skyOrchid: "#251551", // deep violet
  lavenderPeach: "#4b1551", // deep orchid
  magentaGold: "#512715", // burnt umber
  coralLime: "#514f15", // dark olive
  goldAqua: "#205115", // deep green
  limeViolet: "#155143", // deep teal
};

/** The ink for a palette, falling back to the default palette's. */
export function paletteInk(name) {
  return inks[name] ?? inks.skyOrchid;
}

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
