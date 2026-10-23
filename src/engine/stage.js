// Renderer, camera, sky dome (with procedural clouds and stars), sun/moon
// lighting, fog and the reflection environment map.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clamp, lerp, damp } from '../core/util.js';

const SKY_KEYS = [
  // hour, top, horizon, sun color, sun intensity, ambient
  [0, '#0a0f24', '#1a2142', '#8fa3ff', 0.35, 0.12],
  [4.5, '#0d1430', '#26305a', '#8fa3ff', 0.3, 0.12],
  [6, '#4c6fa8', '#f5ad78', '#ffb07a', 1.2, 0.55],
  [8, '#4a92e6', '#bfe1ff', '#fff1d6', 2.6, 0.8],
  [16, '#3f8de8', '#c4e4ff', '#fff4e0', 2.7, 0.82],
  [18, '#4762a0', '#ff9e63', '#ff9a5a', 1.4, 0.6],
  [19.5, '#1d2552', '#5b4a78', '#a08cff', 0.4, 0.3],
  [21, '#0a0f24', '#1a2142', '#8fa3ff', 0.35, 0.12],
  [24, '#0a0f24', '#1a2142', '#8fa3ff', 0.35, 0.12],
];

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function sampleSky(hour) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && hour >= SKY_KEYS[i + 1][0]) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  const t = clamp((hour - a[0]) / (b[0] - a[0]));
  return {
    top: new THREE.Color(a[1]).lerp(_c1.set(b[1]), t),
    horizon: new THREE.Color(a[2]).lerp(_c1.set(b[2]), t),
    sun: new THREE.Color(a[3]).lerp(_c1.set(b[3]), t),
    sunIntensity: lerp(a[4], b[4], t),
    ambient: lerp(a[5], b[5], t),
  };
}

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uStars; uniform float uCloud; uniform float uStorm; uniform float uTime; uniform float uFlash; uniform float uWind;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*n2(p); p*=2.1; a*=0.5;} return v; }
void main() {
  vec3 d = normalize(vDir);
  float y = clamp(d.y, -1.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.55));
  if (y < 0.0) col = uHorizon * 0.9;
  // sun / moon disc
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25) * (1.0 - uCloud * 0.85);
  vec3 moonDir = -uSunDir;
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * pow(md, 2200.0) * 3.0 * uStars * (1.0 - uCloud);
  // stars
  if (y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.15) * 90.0;
    float s = step(0.9965, h(floor(sp))) * (0.6 + 0.4 * sin(uTime * 3.0 + h(floor(sp)) * 40.0));
    col += vec3(s) * uStars * (1.0 - uCloud);
  }
  // clouds
  if (y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.08) * 1.6 + vec2(uTime * 0.012 * (0.4 + uWind), uTime * 0.004);
    float c = fbm(cp);
    float cover = smoothstep(1.0 - uCloud * 0.95 - 0.05, 1.05 - uCloud * 0.6, c + uCloud * 0.35);
    vec3 cloudCol = mix(vec3(1.0), vec3(0.42, 0.45, 0.5), uStorm);
    cloudCol *= (uTop * 0.4 + uHorizon * 0.6) * 0.6 + 0.5 * length(uSunColor) * 0.35;
    cloudCol += uSunColor * pow(sd, 6.0) * 0.4 * (1.0 - uStorm);
    col = mix(col, cloudCol, cover * smoothstep(0.0, 0.15, y));
  }
  col += vec3(0.75, 0.8, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Stage {
  constructor(container) {
    this.container = container;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(container.clientWidth, container.clientHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 900);
    this.camera.position.set(0, 15, 27);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(0, 0, 4);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 110;
    this.controls.screenSpacePanning = false;

    // sky
    this.skyUniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
      uStars: { value: 0 }, uCloud: { value: 0.2 }, uStorm: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uWind: { value: 0.2 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // lights
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x7a6a50, 0.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.flashLight = new THREE.AmbientLight(0xdfe8ff, 0);
    this.scene.add(this.flashLight);

    this.scene.fog = new THREE.FogExp2(0xbfe1ff, 0.004);

    // environment map for reflections (wet surfaces need something to reflect)
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(this.sky.geometry, skyMat);
    this.envScene.add(this.envSky);
    this.envTimer = 0;
    this.envRT = null;

    this.light = { night: 0, daylight: 1, hour: 12 };
    this.flash = 0;
    this.shake = 0;

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  lightning(strength = 1) {
    this.flash = Math.max(this.flash, strength);
  }

  /** Update sky + lights from time of day and weather. */
  updateEnvironment(dt, minuteOfDay, w) {
    const hour = minuteOfDay / 60;
    const s = sampleSky(hour);
    // overcast desaturates the sky
    const grayTop = _c2.setRGB(0.55, 0.6, 0.66).multiplyScalar(0.35 + s.ambient * 0.8);
    const overcast = clamp(w.cloud * 0.85 + w.fog * 0.3);
    s.top.lerp(grayTop, overcast * 0.85);
    s.horizon.lerp(_c1.setRGB(0.66, 0.7, 0.75).multiplyScalar(0.35 + s.ambient * 0.8), overcast * 0.8);
    if (w.snow > 0.05) s.horizon.lerp(_c1.setRGB(0.85, 0.88, 0.92).multiplyScalar(0.3 + s.ambient), w.snow * 0.4);

    const ang = (hour / 24) * Math.PI * 2 - Math.PI / 2; // sunrise 6, sunset 18
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.85, Math.sin(ang), 0.42).normalize();
    const isDay = sunDir.y > -0.05;
    const lightDir = isDay ? sunDir : sunDir.clone().negate(); // moonlight at night
    this.sun.position.copy(lightDir).multiplyScalar(110).add(this.controls.target.clone().setY(0));
    this.sun.target.position.copy(this.controls.target).setY(0);
    const cloudDim = 1 - overcast * 0.72;
    this.sun.color.copy(s.sun);
    this.sun.intensity = s.sunIntensity * cloudDim * (isDay ? clamp(sunDir.y * 4 + 0.2) : 1);
    this.hemi.color.copy(s.top).lerp(_c1.setRGB(1, 1, 1), 0.1 + s.ambient * 0.3);
    this.hemi.groundColor.setRGB(0.42, 0.37, 0.3).multiplyScalar(s.ambient);
    this.hemi.intensity = 0.2 + s.ambient * 1.1;
    this.renderer.toneMappingExposure = 0.8 + s.ambient * 0.25;

    const u = this.skyUniforms;
    u.uTop.value.copy(s.top);
    u.uHorizon.value.copy(s.horizon);
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(s.sun).multiplyScalar(isDay ? 1 : 0);
    u.uStars.value = clamp((0.45 - s.ambient) * 4);
    u.uCloud.value = w.cloud;
    u.uStorm.value = clamp(w.rain * 0.8 + (w.lightning ? 0.3 : 0));
    u.uWind.value = w.wind;
    u.uTime.value += dt;

    // fog
    this.scene.fog.color.copy(s.horizon);
    this.scene.fog.density = 0.0035 + w.fog * 0.028 + w.rain * 0.006 + w.snow * 0.01;

    // lightning flash
    this.flash = Math.max(0, this.flash - dt * 4.5);
    const f = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(this.flash * 60)) : 0;
    this.flashLight.intensity = f * 3.5;
    u.uFlash.value = f * 0.8;

    this.light.night = clamp((0.45 - s.ambient) * 3.2);
    this.light.daylight = 1 - this.light.night;
    this.light.hour = hour;
    this.scene.environmentIntensity = 0.12 + s.ambient * 0.85 * (1 - overcast * 0.3);

    // refresh reflection map every so often
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 5; // the sky changes slowly; rebuilding reflections is costly
      const rt = this.pmrem.fromScene(this.envScene, 0, 1, 1000);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
    }
  }

  addShake(amount) { this.shake = Math.max(this.shake, amount); }

  render(dt) {
    this.controls.update();
    const off = new THREE.Vector3();
    if (this.shake > 0.001) {
      const s = this.shake;
      off.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0);
      this.camera.position.add(off);
      this.shake = damp(this.shake, 0, 10, dt);
    }
    this.sky.position.copy(this.camera.position);
    // shadows are redrawn every other frame: halves the shadow pass, no visible lag
    const sm = this.renderer.shadowMap;
    if (sm.enabled) {
      sm.autoUpdate = false;
      this.shadowFrame = (this.shadowFrame || 0) + 1;
      if (this.shadowFrame % 2 === 0 || this.overrideScene !== this.lastScene) sm.needsUpdate = true;
    }
    this.lastScene = this.overrideScene;
    this.renderer.render(this.overrideScene || this.scene, this.camera);
    this.camera.position.sub(off);
  }
}
