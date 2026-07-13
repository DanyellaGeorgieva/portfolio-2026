// Glossy organic heart blob. Wet, liquid look: a soft translucent body lit by a
// faked studio environment (reflected view ray → bright vertical gradient), two
// sharp specular glints for the glossy wet highlight, a Fresnel edge with thin-
// film iridescence, and a per-bubble hue offset. No hard outline.
precision highp float;

varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vOpacity;
varying float vSeed;

void main() {
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(vViewDir);

  // Fresnel — bright, thin edge (glossy, not misty).
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

  // Faked environment reflection with punchy contrast: reflect the view ray and
  // map its height to a studio gradient (bright above, deep periwinkle below).
  // This moving reflection as the blob wobbles is what reads as "wet glossy".
  vec3 R = reflect(-V, N);
  float up = R.y * 0.5 + 0.5;
  vec3 env = mix(vec3(0.30, 0.36, 0.82), vec3(1.0), smoothstep(0.2, 1.0, up));

  // Thin-film iridescence rolling along the fresnel term, offset per-bubble.
  vec3 irid = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + fres * 1.7 + vSeed));

  // Two sharp specular glints from offset key lights — the glossy wet shine.
  vec3 L1 = normalize(vec3(-0.5, 0.9, 0.7));
  vec3 L2 = normalize(vec3(0.6, 0.35, 0.9));
  float spec1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 90.0);
  float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 45.0);

  // Compose: candy-pink jelly body + environment reflection + all-over iridescent
  // colour intensifying to the rim, then the bright glints on top.
  vec3 body = vec3(1.0, 0.72, 0.86);
  vec3 color = mix(body, env, 0.4) + irid * (0.16 + fres * 1.3);
  color += spec1 * 1.9 + spec2 * 0.85;

  // Solid glossy jelly in the middle, lighting up at the rim/glints.
  float alpha = clamp(0.62 + fres * 0.35 + spec1 * 0.9 + spec2 * 0.4, 0.0, 1.0) * vOpacity;

  gl_FragColor = vec4(color, alpha);
}
