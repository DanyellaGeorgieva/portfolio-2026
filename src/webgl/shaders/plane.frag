// Animated gooey gradient background.
//
// Technique: a soft honeycomb channel network that morphs IN PLACE. The yellow
// channels are the contour band around the mid-level of a 3D value-noise field
// sliced at z = time. As the slice advances, the 2D pattern stays put but its
// cells continuously grow, shrink, merge and split — "colliding with
// themselves" — with no sliding and no coordinate warp. Channels are drawn as
// a single soft-edged band (no secondary halo → no smoke) over a two-tone
// background gradient, with film grain on top.
//
// Written in GLSL ES 1.00 to match Three.js ShaderMaterial (gl_FragColor).
// See gooey-gradient-background-spec.md.

uniform float uTime;
uniform vec2 uResolution;
uniform float uSpeed; // morph speed — how fast the cells reshape (slow ~0.15)
uniform float uScale; // cell/channel density (low = big cells)
uniform float uThick; // channel (bright core) width
uniform float uGlow;  // warm-glow spread beyond the core (>1 = bigger glow)
uniform float uSmoke; // wispy turbulence in the glow (0 = clean gradient)
uniform float uGrain; // film-grain amount
uniform vec3 uColorA; // background — low
uniform vec3 uColorB; // background — high
uniform vec3 uColorC; // outer rim — deep/warm, where glow meets background
uniform vec3 uColorD; // mid glow — warm amber
uniform vec3 uColorE; // channel centre — bright
// Target palette during a transition, plus the front position uMix (0 = show
// current palette everywhere, 1 = show target everywhere). The front expands
// outward from the channel centres, so the new palette flows out from the core.
uniform vec3 uColorA2;
uniform vec3 uColorB2;
uniform vec3 uColorC2;
uniform vec3 uColorD2;
uniform vec3 uColorE2;
uniform float uMix;

varying vec2 vUv;

// --- 2D value noise (used for the static background gradient) --------
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(in vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                 dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                 dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(in vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p;
    a *= 0.5;
  }
  return v;
}

// --- 3D value noise (drives the morphing channel network) -----------
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(in vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i + vec3(0.0, 0.0, 0.0)), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

// --- channel network ------------------------------------------------
// Channels sit where the 3D field crosses its mid-level. Slicing at z = t makes
// the cells morph, merge and split in place. Returns the distance from the
// nearest channel centre-line (0 on the line, growing outward).
float channelDist(in vec2 p, in float t) {
  return abs(noise3(vec3(p, t)) * 2.0 - 1.0);
}

// Animated turbulence for the smoky glow. A few octaves of 3D noise (z = time)
// give slowly-drifting wispy tendrils, centred around zero.
float smokeFbm(in vec2 p, in float t) {
  float v = 0.0;
  float a = 0.6;
  float f = 1.0;
  for (int i = 0; i < 3; i++) {
    v += a * (noise3(vec3(p * f, t + float(i) * 3.7)) - 0.5);
    f *= 2.0;
    a *= 0.5;
  }
  return v;
}

// Per-pixel hash for the grain. Sine-free (Dave Hoskins' hash12) so it gives
// uniform white noise with no diagonal banding — unlike fract(sin(dot(...))),
// which projects onto one direction and streaks diagonally.
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Build the cross-section colour for one palette from the band masks:
// background gradient → rim (smoke) → mid glow → bright centre.
vec3 assemble(vec3 cA, vec3 cB, vec3 cC, vec3 cD, vec3 cE,
              float bgT, float glow, float glowMid, float core) {
  vec3 col = mix(mix(cA, cB, bgT), cC, glow);
  col = mix(col, cD, glowMid);
  col = mix(col, cE, core);
  return col;
}

void main() {
  // Aspect-correct UVs so the cells keep their proportions.
  vec2 uv = vUv;
  uv.x *= uResolution.x / uResolution.y;

  vec2 p = uv * uScale;
  float t = uTime * uSpeed;

  float d = channelDist(p, t);
  // Smoky turbulence: perturb the distance used for the GLOW bands only (the
  // bright core keeps a clean edge), so the warm halo breaks into wispy tendrils.
  float dGlow = d + uSmoke * smokeFbm(p * 3.0, t * 0.8);
  // Three nested bands: a wide outer glow, a tighter mid glow, and the tight
  // bright core — used to layer the cross-section colours.
  float glow = 1.0 - smoothstep(uThick * 0.3, uThick * uGlow, dGlow);        // widest
  float glowMid = 1.0 - smoothstep(uThick * 0.3, uThick * uGlow * 0.55, dGlow); // medium
  float core = 1.0 - smoothstep(uThick * 0.3, uThick, d);                   // tightest

  // Background colored gradient, slowly varying across space (static).
  float bgT = clamp(0.5 + 0.5 * fbm(p * 0.5 + 4.0), 0.0, 1.0);

  // Assemble the current and target palettes for this pixel...
  vec3 colFrom = assemble(uColorA, uColorB, uColorC, uColorD, uColorE,
                          bgT, glow, glowMid, core);
  vec3 colTo = assemble(uColorA2, uColorB2, uColorC2, uColorD2, uColorE2,
                        bgT, glow, glowMid, core);

  // ...then reveal the target behind a soft front that expands outward from the
  // channel centres (d = 0) into the field (d ≈ 1) as uMix goes 0 → 1. Pixels the
  // front has passed (d < front) show the new palette; the moving boundary is the
  // outward "flow". EDGE softens the boundary; the +EDGE bias guarantees full
  // coverage at uMix = 1.
  const float EDGE = 0.35;
  // FRONT_CURVE < 1 races the front through the centre and slows it outward, so
  // the inner colour transitions quickly and the outer field lingers behind it.
  const float FRONT_CURVE = 0.7;
  // Sweep the front from -EDGE (nothing revealed) to 1+EDGE (all revealed).
  // Starting below zero means even the centre-line (d = 0) passes through the
  // soft EDGE window, so every colour — the inner core included — cross-fades
  // old→new as the front reaches it, instead of snapping.
  float front = mix(-EDGE, 1.0 + EDGE, pow(uMix, FRONT_CURVE));
  float reveal = smoothstep(front, front + EDGE, d); // 0 = new (reached), 1 = old
  vec3 color = mix(colTo, colFrom, reveal);

  // Film grain — animated per frame (non-diagonal offset) so it shimmers.
  float g = grainHash(gl_FragCoord.xy + fract(uTime) * vec2(137.0, 291.0)) - 0.5;
  color += g * uGrain;

  gl_FragColor = vec4(color, 1.0);
}
