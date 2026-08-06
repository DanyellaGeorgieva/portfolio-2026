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

uniform float uTime;  // real seconds — grain shimmer only
uniform vec2 uResolution;
// Morph phase: the z-slice through the noise field, accumulated on the JS side
// as phase += dt * speed. Passing the phase rather than (time × speed) means
// changing the speed bends the rate without jumping the slice — multiplying a
// large uTime by a new speed would teleport the pattern.
uniform float uPhase;
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

// Glass hearts, in the same aspect-corrected uv space as everything else:
// .xy = centre, .z = size (0 = empty slot). Filled by the floaters released on
// arriving at "say hi". HEART_COUNT must match Scene.js's HEART_COUNT.
#define HEART_COUNT 5
uniform vec3 uHearts[HEART_COUNT];

// Pointer poke — the surface swells outward near the pointer, so a heart it is
// over bulges under it and the bulge slides along as the pointer moves.
uniform vec2 uPointer;     // in the same aspect-corrected uv space as the hearts
uniform float uPoke;       // 0 = nothing, 1 = full; eases in with the pointer
uniform float uPokeRadius; // how far from the pointer the swelling reaches
uniform float uPokeAmount; // how far the surface is pushed out, in uv units
uniform float uGlassBend; // how far the edge bends its lookup
uniform float uGlassBevel; // depth over which the bend eases off
uniform float uGlassAberration; // per-channel spread in the bend
uniform float uGlassFrost; // milkiness across the whole panel
uniform float uGlassRim; // specular highlight strength
uniform float uGlassRimWidth; // how far in that highlight reaches
uniform float uWobble; // bubble-wobble amplitude, in the shape's local units
uniform float uWobbleRate; // how fast the outline breathes, radians per second

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

// Anchor the zoom at the centre of the screen: whatever sits at the origin
// stays put as uScale changes, and the field densifies outward from it, so a
// scale change reads as a dolly rather than a slide. Scaling uv directly would
// instead pin the bottom-left corner, since that's where uv is (0, 0).
// x is in aspect-corrected units (0..aspect), so the horizontal centre is half
// the aspect ratio, not 0.5; y runs 0 (bottom) to 1 (top).
vec2 scaleOrigin() {
  return vec2(0.5 * uResolution.x / uResolution.y, 0.5);
}

// The whole background as a function of position — everything except the grain,
// which is per-pixel and must not be refracted with the field. Being able to ask
// for the field at an *arbitrary* coordinate is what lets the glass panel bend
// its lookup: refraction here is a real resample, not a displaced screenshot.
vec3 fieldAt(in vec2 uv) {
  vec2 p = (uv - scaleOrigin()) * uScale;
  float t = uPhase;

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
  return mix(colTo, colFrom, reveal);
}

// --- Glass panel ------------------------------------------------------------
// The panel's shape is a signed distance field: negative inside, 0 on the edge.
// Its gradient is the surface normal, which is what the SVG approach bakes into
// the red/green channels of a displacement image — only computed, so it costs no
// texture, stays exact at any size, and works for any shape with an SDF.
// Shape of the gather across the bevel: higher packs the squeeze closer to the
// rim, 1.0 spreads it evenly across the whole band.
const float GATHER_CURVE = 2.0;

// Same idea for the colour split: higher confines the fringe to the outer edge,
// 0.0 gives the old behaviour of an even spread across the whole bevel.
const float ABERRATION_CURVE = 2.0;

// Heart, in a local space with the tip at the origin and the lobes above it.
// Half-extents of that shape, used to fit it into the tracked element's box.
const float HEART_HALF_W = 0.604;
const float HEART_HALF_H = 0.552;

// How wide the join is where two hearts meet, as a fraction of the smaller
// heart's size. 0 = a hard seam; larger values pull the merge further out.
const float SMOOTH = 0.45;

float dot2(in vec2 v) { return dot(v, v); }

// Inigo Quilez's heart SDF: mirrored about x, a circle for each lobe above the
// diagonal, and the distance to the point/edge below it.
float sdHeart(in vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) {
    return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  }
  return sqrt(min(dot2(p - vec2(0.0, 1.0)),
                  dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

// One heart's distance, in uv units. Scaled uniformly so it keeps its
// proportions — a non-uniform fit would stretch it and skew the distances the
// bevel and normals are built from. `phase` offsets the wobble per heart so a
// group of them never breathes in unison.
float heartDist(in vec2 rel, in float size, in float phase) {
  vec2 q = rel / size;
  q.y += HEART_HALF_H; // local origin sits at the tip, not the centre

  // Soap-bubble wobble: pushing the surface in and out by a smoothly varying
  // amount makes the outline undulate, as if surface tension were still
  // settling. Two sines over local space — no atan and no noise octave, so it is
  // a few ALU ops per heart. Driven by uTime, not uPhase, so the wobble keeps
  // its own pace even where the background's morph speed is dialled down.
  float t = uTime * uWobbleRate + phase;
  float w = uWobble * sin(q.x * 4.5 + t) * sin(q.y * 3.9 - t * 0.83);

  return (sdHeart(q) + w) * size; // back into uv units, so the bevel reads the same
}

// Every heart combined into one field. A plain min() would let the nearest heart
// cut a hard seam across its neighbour; the polynomial smooth-min rounds the
// join instead, so overlapping hearts fuse like drops of liquid. Also carries the
// blended size out, since the bevel is measured against it.
float heartsAt(in vec2 uv, out float size) {
  float d = 1e9;
  size = 0.0;
  for (int i = 0; i < HEART_COUNT; i++) {
    if (uHearts[i].z <= 0.0) continue; // empty slot
    // Slot index as the wobble phase: constant per heart and free.
    float di = heartDist(uv - uHearts[i].xy, uHearts[i].z, float(i) * 2.399);

    if (size <= 0.0) {
      d = di; // first contributor seeds the field
      size = uHearts[i].z;
    } else {
      // Blend width scales with the smaller heart, so a small one melting into a
      // large one doesn't get swallowed by an oversized joint.
      float k = SMOOTH * min(size, uHearts[i].z);
      float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0);
      d = mix(di, d, h) - k * h * (1.0 - h);
      size = mix(uHearts[i].z, size, h);
    }
  }

  // The poke. Subtracting from the distance field pushes the surface outward,
  // and it can only move a surface that is already nearby: away from every heart
  // the field stays far from zero, so nothing appears. That is what makes this
  // incapable of drawing anything at the pointer itself.
  // Falloff written the right way round: smoothstep's edges must go low → high,
  // and reversing them to invert the ramp is undefined in GLSL.
  float fall = 1.0 - smoothstep(0.0, uPokeRadius, distance(uv, uPointer));
  d -= uPoke * uPokeAmount * fall;

  return d;
}

vec3 glassAt(in vec2 uv, in float px) {
  float size;
  float d = heartsAt(uv, size);
  // No hearts at all, or outside them (with a pixel of slack for the edge blend).
  if (size <= 0.0 || d > px) return fieldAt(uv);

  // The bevel is a fraction of the heart's own half-thickness, not an absolute
  // depth — one setting then works at any size, so a small floater gets the same
  // proportioned edge as a large one.
  float bevel = uGlassBevel * HEART_HALF_H * size;
  float k = clamp(-d / bevel, 0.0, 1.0); // 0 at the rim, 1 past the bevel

  // How far this pixel reaches outward for its sample: the full gather at the
  // rim, easing to nothing where the bevel meets the flat middle. The gather is a
  // multiple of the bevel width, so the band shows a compressed copy of a stretch
  // of field several times wider than the band itself — that squeeze is the
  // effect. (A true spherical slope is asymptotic at the rim, which concentrates
  // all the displacement into a band a few pixels wide: correct, but invisible.)
  float reach = uGlassBend * bevel * pow(1.0 - k, GATHER_CURVE);
  float rim = 1.0 - smoothstep(0.0, uGlassRimWidth, -d);

  // The flat middle of a heart bends nothing and catches no highlight, so it is
  // just frosted field. Bailing here skips the normal (four more shape probes)
  // and the aberration samples for the bulk of a large heart's area — the single
  // biggest saving, since that middle is most of the pixels.
  if (reach < px && rim <= 0.0) {
    return mix(fieldAt(uv), vec3(1.0), uGlassFrost);
  }

  // Surface normal from the gradient of the *blended* field, so the merge region
  // gets a continuous surface rather than two normals meeting at a crease.
  vec2 e = vec2(px, 0.0);
  float s0, s1, s2, s3; // sizes at the probe points — not needed, but required
  vec2 n = normalize(vec2(
    heartsAt(uv + e.xy, s0) - heartsAt(uv - e.xy, s1),
    heartsAt(uv + e.yx, s2) - heartsAt(uv - e.yx, s3)
  ) + 1e-6);

  vec2 off = n * reach;

  // Chromatic aberration: the same bend at three strengths, one per channel —
  // exactly what the SVG filter's three feDisplacementMaps do. The spread is
  // concentrated at the rim rather than applied evenly across the bevel: at a
  // large setting a constant spread makes the mid-bevel pull its channels from
  // far-apart, unrelated parts of the field, which drifts independently of the
  // shape. Fading it with depth keeps the strong split where the edge is and
  // leaves the mid-bevel coherent. Only worth three samples while the bend can
  // actually separate them; below a pixel they would read the same coordinate.
  float spread = uGlassAberration * pow(1.0 - k, ABERRATION_CURVE);
  vec3 col;
  if (spread > 0.0 && reach > px) {
    col = vec3(
      fieldAt(uv + off * (1.0 + spread)).r,
      fieldAt(uv + off).g,
      fieldAt(uv + off * (1.0 - spread)).b
    );
  } else {
    col = fieldAt(uv + off);
  }

  // Frost, then a specular rim that catches the light from the upper left.
  col = mix(col, vec3(1.0), uGlassFrost);
  float facing = 0.5 + 0.5 * dot(n, normalize(vec2(-0.6, 0.8)));
  col += rim * facing * uGlassRim;

  // Soften the boundary itself so the edge isn't a stairstep. Only the pixels
  // straddling it need this; further in, `inside` is already 1 and the extra
  // field evaluation was being computed and thrown away.
  if (d > -px) {
    float inside = 1.0 - smoothstep(-px, px, d);
    col = mix(fieldAt(uv), col, inside);
  }
  return col;
}

void main() {
  // Aspect-correct UVs so the cells keep their proportions.
  vec2 uv = vUv;
  uv.x *= uResolution.x / uResolution.y;

  // One pixel, in uv units — both axes share a scale, since x was multiplied by
  // the aspect ratio above.
  float px = 1.0 / uResolution.y;

  // glassAt() falls through to the plain field when no heart is near.
  vec3 color = glassAt(uv, px);

  // Film grain — animated per frame (non-diagonal offset) so it shimmers. Sits
  // on top of the glass, like grain on the lens rather than behind it.
  float g = grainHash(gl_FragCoord.xy + fract(uTime) * vec2(137.0, 291.0)) - 0.5;
  color += g * uGrain;

  gl_FragColor = vec4(color, 1.0);
}
