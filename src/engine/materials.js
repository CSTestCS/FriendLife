// Weather-aware materials.
//
// Every standard material in the world is patched so that it reacts to the
// shared weather uniforms: surfaces darken and turn glossy when wet, flat
// ground grows puddles with rain ripples, vertical surfaces get running
// water streaks, and upward-facing surfaces collect snow.
//
// Characters get their own "local" wetness so a resident who walks
// indoors dries off while the street stays soaked.

import * as THREE from 'three';

export const weatherUniforms = {
  uWetness: { value: 0 }, // 0..1 how soaked the outdoor world is
  uRain: { value: 0 }, // 0..1 current rainfall (drives ripples/streak motion)
  uSnow: { value: 0 }, // 0..1 snow cover
  uTime: { value: 0 },
};

const NOISE_GLSL = /* glsl */ `
float fl_hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fl_noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = fl_hash(i), b = fl_hash(i + vec2(1.0, 0.0));
  float c = fl_hash(i + vec2(0.0, 1.0)), d = fl_hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fl_fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * fl_noise(p); p *= 2.03; a *= 0.5; } return v; }
// Expanding rain ripple rings on a grid of random cells.
float fl_ripples(vec2 p, float t) {
  vec2 cell = floor(p); vec2 f = fract(p);
  float r = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = cell + vec2(float(x), float(y));
    float h = fl_hash(c);
    vec2 o = vec2(fl_hash(c + 7.1), fl_hash(c + 3.7));
    float phase = fract(t * (0.8 + h) + h * 10.0);
    float d = length(f - vec2(float(x), float(y)) - o);
    float ring = smoothstep(0.05, 0.0, abs(d - phase * 0.45)) * (1.0 - phase);
    r += ring;
  }
  return r;
}
`;

/**
 * Patch a MeshStandardMaterial so it responds to rain and snow.
 * opts.porosity  how much the surface darkens when wet (0..1)
 * opts.puddles   allow puddles on flat parts
 * opts.snow      allow snow accumulation
 * opts.local     {value} uniform for per-object wetness (characters)
 */
export function patchWeather(material, opts = {}) {
  const porosity = opts.porosity ?? 0.45;
  const puddles = opts.puddles ?? false;
  const snow = opts.snow ?? true;
  const local = opts.local || null;
  material.userData.weather = { porosity, puddles, snow, local };
  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    shader.uniforms.uWetness = local || weatherUniforms.uWetness;
    shader.uniforms.uRain = weatherUniforms.uRain;
    shader.uniforms.uSnow = weatherUniforms.uSnow;
    shader.uniforms.uTime = weatherUniforms.uTime;
    shader.uniforms.uPorosity = { value: porosity };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlWorldPos;\nvarying vec3 vFlWorldNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vFlWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vFlWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vFlWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vFlWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        #endif`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFlWorldPos;
        varying vec3 vFlWorldNormal;
        uniform float uWetness; uniform float uRain; uniform float uSnow; uniform float uTime; uniform float uPorosity;
        ${NOISE_GLSL}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float flUp = clamp(vFlWorldNormal.y, 0.0, 1.0);
        float flWet = uWetness;
        float flPuddle = 0.0;
        ${puddles ? `flPuddle = smoothstep(0.55, 0.7, fl_fbm(vFlWorldPos.xz * 0.18) + uWetness * 0.35) * smoothstep(0.85, 0.98, flUp) * uWetness;` : ''}
        // wet surfaces absorb light and look darker
        diffuseColor.rgb *= mix(1.0, 1.0 - uPorosity, clamp(flWet, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55 + vec3(0.02, 0.03, 0.04), flPuddle);
        ${snow ? `float flSnow = smoothstep(0.35, 0.8, flUp) * smoothstep(0.0, 1.0, uSnow * 1.4 - fl_noise(vFlWorldPos.xz * 1.7) * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0), flSnow);` : 'float flSnow = 0.0;'}`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // water film: glossy, with streaks running down vertical faces
        float flStreak = 1.0;
        float flSide = 1.0 - flUp;
        if (flSide > 0.3) {
          float s = fl_noise(vec2(vFlWorldPos.x * 9.0 + vFlWorldPos.z * 9.0, vFlWorldPos.y * 1.3 + uTime * 1.6 * uRain));
          flStreak = mix(1.0, 0.45 + 0.9 * s, flSide);
        }
        float flGloss = clamp(flWet * flStreak, 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.07, flGloss * 0.92);
        roughnessFactor = mix(roughnessFactor, 0.02, flPuddle);
        roughnessFactor = mix(roughnessFactor, 0.85, flSnow);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        ${puddles ? `{
          float rip = fl_ripples(vFlWorldPos.xz * 1.6, uTime) * uRain * (flPuddle + 0.25 * uWetness);
          vec2 e = vec2(0.02, 0.0);
          float rx = fl_ripples((vFlWorldPos.xz + e.xy) * 1.6, uTime) - fl_ripples((vFlWorldPos.xz - e.xy) * 1.6, uTime);
          float rz = fl_ripples((vFlWorldPos.xz + e.yx) * 1.6, uTime) - fl_ripples((vFlWorldPos.xz - e.yx) * 1.6, uTime);
          vec3 rippleN = normalize(vec3(-rx, 1.0, -rz) );
          vec3 viewRipple = normalize((viewMatrix * vec4(rippleN, 0.0)).xyz);
          normal = normalize(mix(normal, viewRipple, clamp(rip * 0.6 + uRain * flPuddle * 0.15, 0.0, 0.7)));
        }` : ''}`
      );
    material.userData.shader = shader;
  };
  // Make sure three.js does not reuse an unpatched program for this material.
  const key = `fl-weather-${porosity}-${puddles}-${snow}-${local ? 'l' : 'g'}`;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|${key}`;
  material.needsUpdate = true;
  return material;
}

const matCache = new Map();
/** Shared weather-aware standard material (cached by params). */
export function stdMat(color, opts = {}) {
  const key = JSON.stringify([color, opts.roughness, opts.metalness, opts.porosity, opts.puddles, opts.snow, opts.emissive, opts.flat, opts.transparent, opts.opacity]);
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    flatShading: !!opts.flat,
    emissive: opts.emissive ?? 0x000000,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  patchWeather(m, opts);
  if (!opts.unique) { m.userData.shared = true; matCache.set(key, m); }
  return m;
}

// ---------------------------------------------------------------------
// MToon (VRM) wet look. MToon is a toon shader, so instead of physically
// based gloss we add a glossy matcap highlight and a cool rim light, and
// darken the base colour slightly. The matcap texture is generated once.

let wetMatcap = null;
export function getWetMatcap() {
  if (wetMatcap) return wetMatcap;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  // soft broad reflection of the sky on the upper half
  let grad = g.createRadialGradient(size * 0.5, size * 0.3, 4, size * 0.5, size * 0.4, size * 0.55);
  grad.addColorStop(0, 'rgba(200,215,235,0.55)');
  grad.addColorStop(0.6, 'rgba(90,110,140,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // tight specular hotspot
  grad = g.createRadialGradient(size * 0.38, size * 0.28, 0, size * 0.38, size * 0.28, size * 0.14);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // thin edge highlight
  g.strokeStyle = 'rgba(210,230,255,0.45)';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 4, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
  wetMatcap = new THREE.CanvasTexture(c);
  wetMatcap.colorSpace = THREE.SRGBColorSpace;
  return wetMatcap;
}

/** Prepare an MToon material for wetness. Call once after loading. */
export function prepareMToonWet(mat) {
  if (!mat.isMToonMaterial || mat.userData.wetBase) return;
  mat.userData.wetBase = {
    color: mat.color.clone(),
    shade: mat.shadeColorFactor.clone(),
    rim: mat.parametricRimColorFactor.clone(),
    rimPower: mat.parametricRimFresnelPowerFactor,
    rimLift: mat.parametricRimLiftFactor,
    matcapFactor: mat.matcapFactor.clone(),
    matcap: mat.matcapTexture || null,
    hadMatcap: !!mat.matcapTexture,
  };
  if (!mat.matcapTexture) {
    mat.matcapTexture = getWetMatcap();
    mat.matcapFactor.setRGB(0, 0, 0);
    mat.needsUpdate = true;
  }
}

const _c = new THREE.Color();
/** Apply wetness (0..1) to a prepared MToon material. tint optionally multiplies base colour. */
export function applyMToonWet(mat, wet, tint) {
  const b = mat.userData.wetBase;
  if (!b) return;
  const darken = 1 - 0.22 * wet;
  mat.color.copy(b.color).multiplyScalar(darken);
  mat.shadeColorFactor.copy(b.shade).multiplyScalar(1 - 0.15 * wet);
  if (tint) { mat.color.multiply(tint); mat.shadeColorFactor.multiply(tint); }
  // the wet sheen replaces the model's own matcap while wet (VRoid exports often ship one)
  if (wet > 0.03) {
    if (mat.matcapTexture !== getWetMatcap()) mat.matcapTexture = getWetMatcap();
    mat.matcapFactor.setScalar(0.9 * wet);
  } else if (b.hadMatcap) {
    if (mat.matcapTexture !== b.matcap) mat.matcapTexture = b.matcap;
    mat.matcapFactor.copy(b.matcapFactor);
  } else mat.matcapFactor.setScalar(0);
  mat.parametricRimColorFactor.copy(b.rim).lerp(_c.setRGB(0.45, 0.55, 0.7), wet * 0.8);
  mat.parametricRimFresnelPowerFactor = b.rimPower + (3.5 - b.rimPower) * wet;
  mat.parametricRimLiftFactor = b.rimLift + (0.05 - b.rimLift) * wet;
}
