// Per-instance glossy heart blob. `instanceMatrix` is provided by Three.js for an
// InstancedMesh; aOpacity/aSeed are our per-instance attributes. The vertex is
// pushed along its normal by a low-frequency wobble so the blob morphs organically.
uniform float uTime;

attribute float aOpacity;
attribute float aSeed;

varying vec3 vNormalV; // view-space normal
varying vec3 vViewDir; // view-space direction back to the camera
varying float vOpacity;
varying float vSeed;

void main() {
  float t = uTime + aSeed * 6.2831853;

  // Organic wobble: gentle low-frequency swells pushed along the normal so the
  // blob breathes and morphs. Kept small — the sphere base is already smooth, so
  // a little goes a long way (too much makes the glossy surface look lumpy).
  float wob =
      sin(position.y * 3.0 + t * 1.3) * 0.022 +
      sin(position.x * 3.5 - t * 1.0) * 0.02 +
      sin(position.x * 2.0 + position.y * 2.0 + t * 0.8) * 0.026;
  vec3 pos = position + normal * wob;

  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  vViewDir = -mvPosition.xyz;
  // Base normal (ignoring the subtle wobble) — good enough for smooth reflections.
  vNormalV = normalMatrix * (mat3(instanceMatrix) * normal);
  vOpacity = aOpacity;
  vSeed = aSeed;
  gl_Position = projectionMatrix * mvPosition;
}
