import { Vector3 } from "three";

/**
 * Named palettes for the gooey gradient background. Each is five sRGB hex stops,
 * in this order — think of them as the visual layers, front to back:
 *
 *   [ background, background, smoke, glow, inner ]
 *      0           1          2      3     4
 *
 *   • background (0 & 1) — the soft two-tone field behind everything (low → high)
 *   • smoke      (2)     — the rim where the glow meets the background (wispy layer)
 *   • glow       (3)     — the warm mid halo around the channels
 *   • inner      (4)     — the bright core of the channel lines
 *
 * A channel's cross-section ramps background → smoke → glow → inner
 * (outer edge inward to the bright centre).
 */
export const palettes = {
  //          background   background     smoke       glow          inner
  bluePurple: ["#cbcdfe", "#e2e3f6", "#437fee", "#9676ed", "#fa94f5"], // bg green→lime · smoke deep green · glow lime · inner cream
  pinkCream: ["#F8E9F2", "#F0CDE1", "#ef1ca9", "#dfa586", "#FFEAB8"], // bg pale pink · smoke magenta · glow rose · inner pale yellow
  // greenYellow: ["#CEFAE5", "#98D0EF", "#9EEEC1", "#6aa0e0", "#9DB8F3"], // bg mint→sky · smoke green · glow blue · inner periwinkle
  // blueGreen: ["#D9F7CD", "#ecfbe7", "#AAF8F4", "#AAF8F4", "#AAF8F4"], // bg pale aqua→teal · smoke deep teal · glow teal · inner bright aqua
  // purpleBlue: ["#BEF9DD", "#e0f8ed", "#93DCE9", "#93DCE9", "#98AEF5"], // bg pale aqua→teal · smoke deep teal · glow teal · inner bright aqua
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

/** Return the [bgLow, bgHigh, rim, glow, center] Vector3 colors for a palette. */
export function paletteColors(name) {
  return palettes[name].map(hexToVec3);
}
