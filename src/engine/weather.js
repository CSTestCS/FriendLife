// Dynamic weather. Weather types change on a Markov chain every few in-game
// hours and blend smoothly. Rain/snow are GPU particles that follow the
// camera. The world's wetness builds up while it rains and dries slowly
// afterwards, driving the wet-sheen/puddle shaders.

import * as THREE from 'three';
import { weatherUniforms } from './materials.js';
import { clamp, damp, rand, weightedPick } from '../core/util.js';

export const WEATHER_TYPES = {
  sunny: { label: 'Sunny', icon: '☀️', cloud: 0.12, rain: 0, snow: 0, fog: 0, wind: 0.15 },
  partly: { label: 'Partly Cloudy', icon: '⛅', cloud: 0.45, rain: 0, snow: 0, fog: 0, wind: 0.3 },
  cloudy: { label: 'Overcast', icon: '☁️', cloud: 0.88, rain: 0, snow: 0, fog: 0.1, wind: 0.4 },
  drizzle: { label: 'Drizzle', icon: '🌦️', cloud: 0.8, rain: 0.3, snow: 0, fog: 0.15, wind: 0.25 },
  rain: { label: 'Rain', icon: '🌧️', cloud: 0.95, rain: 0.7, snow: 0, fog: 0.25, wind: 0.45 },
  storm: { label: 'Thunderstorm', icon: '⛈️', cloud: 1, rain: 1, snow: 0, fog: 0.35, wind: 0.95, lightning: true },
  snow: { label: 'Snow', icon: '🌨️', cloud: 0.9, rain: 0, snow: 0.75, fog: 0.3, wind: 0.3 },
  fog: { label: 'Foggy', icon: '🌫️', cloud: 0.55, rain: 0, snow: 0, fog: 0.85, wind: 0.05 },
};

const TRANSITIONS = {
  sunny: [['sunny', 4], ['partly', 4], ['cloudy', 1], ['fog', 0.4]],
  partly: [['sunny', 4], ['partly', 2], ['cloudy', 2.5], ['drizzle', 0.8]],
  cloudy: [['partly', 3], ['sunny', 1], ['cloudy', 1], ['drizzle', 1.5], ['rain', 1.5], ['storm', 0.6], ['snow', 0.5], ['fog', 0.6]],
  drizzle: [['cloudy', 2.5], ['rain', 1.2], ['partly', 2], ['drizzle', 0.5]],
  rain: [['rain', 0.6], ['storm', 0.8], ['drizzle', 2], ['cloudy', 2.5]],
  storm: [['rain', 3], ['storm', 0.3], ['cloudy', 1.5]],
  snow: [['snow', 1], ['cloudy', 2.5], ['partly', 1.5]],
  fog: [['partly', 2.5], ['cloudy', 1.5], ['sunny', 1.5]],
};

const RAIN_VERT = /* glsl */`
attribute vec3 aOffset; attribute float aEnd; attribute float aRnd;
uniform float uTime; uniform vec3 uCenter; uniform float uSize; uniform float uHeight; uniform vec2 uWind; uniform float uIntensity; uniform float uLen;
varying float vAlpha;
void main() {
  float speed = 16.0 + aRnd * 6.0;
  vec3 p = aOffset;
  float fall = mod(p.y - uTime * speed, uHeight);
  p.y = fall;
  p.xz += uWind * (uHeight - fall) * 0.12;
  p.xz = mod(p.xz - uCenter.xz + uSize * 0.5, uSize) - uSize * 0.5 + uCenter.xz;
  p.y += uCenter.y - 4.0;
  vec3 vel = normalize(vec3(uWind.x * 0.12 * speed, -speed, uWind.y * 0.12 * speed));
  p -= vel * aEnd * uLen * (0.7 + aRnd * 0.6);
  vAlpha = step(aRnd, uIntensity) * (1.0 - aEnd * 0.9);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const RAIN_FRAG = /* glsl */`
uniform vec3 uColor; varying float vAlpha;
void main() { if (vAlpha < 0.01) discard; gl_FragColor = vec4(uColor, vAlpha * 0.55); }`;

const SPLASH_VERT = /* glsl */`
attribute vec3 aOffset; attribute float aRnd;
uniform float uTime; uniform vec3 uCenter; uniform float uSize; uniform float uIntensity; uniform float uPixel;
varying float vPhase; varying float vOn;
void main() {
  float rate = 1.6 + aRnd;
  float cycle = uTime * rate + aRnd * 17.0;
  float phase = fract(cycle);
  float idx = floor(cycle);
  vec3 p = aOffset;
  // jump to a new random spot each cycle
  p.x += sin(idx * 12.9898 + aRnd * 78.2) * 7.0;
  p.z += cos(idx * 4.1414 + aRnd * 31.7) * 7.0;
  p.xz = mod(p.xz - uCenter.xz + uSize * 0.5, uSize) - uSize * 0.5 + uCenter.xz;
  p.y = 0.04 + phase * 0.06;
  vPhase = phase;
  vOn = step(aRnd, uIntensity);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.04 + phase * 0.22) * uPixel / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SPLASH_FRAG = /* glsl */`
uniform vec3 uColor; varying float vPhase; varying float vOn;
void main() {
  if (vOn < 0.5) discard;
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float ring = smoothstep(0.5, 0.42, r) * smoothstep(0.25, 0.38, r);
  float a = ring * (1.0 - vPhase) * 0.8;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

const SNOW_VERT = /* glsl */`
attribute vec3 aOffset; attribute float aRnd;
uniform float uTime; uniform vec3 uCenter; uniform float uSize; uniform float uHeight; uniform vec2 uWind; uniform float uIntensity; uniform float uPixel;
varying float vOn;
void main() {
  vec3 p = aOffset;
  float speed = 1.2 + aRnd * 0.8;
  p.y = mod(p.y - uTime * speed, uHeight);
  p.x += sin(uTime * (0.6 + aRnd) + aRnd * 30.0) * 0.6 + uWind.x * (uHeight - p.y) * 0.4;
  p.z += cos(uTime * (0.5 + aRnd) + aRnd * 20.0) * 0.6 + uWind.y * (uHeight - p.y) * 0.4;
  p.xz = mod(p.xz - uCenter.xz + uSize * 0.5, uSize) - uSize * 0.5 + uCenter.xz;
  p.y += uCenter.y - 3.0;
  vOn = step(aRnd, uIntensity);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.05 + aRnd * 0.06) * uPixel / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const SNOW_FRAG = /* glsl */`
varying float vOn;
void main() {
  if (vOn < 0.5) discard;
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, r);
  if (a < 0.02) discard;
  gl_FragColor = vec4(vec3(1.0), a * 0.9);
}`;

export class Weather {
  constructor(stage, audio) {
    this.stage = stage;
    this.audio = audio;
    this.type = 'sunny';
    this.next = 'partly';
    this.minutesLeft = rand(180, 360);
    this.locked = false; // player forced weather
    this.p = { ...WEATHER_TYPES.sunny, lightning: false };
    this.wetness = 0;
    this.snowCover = 0;
    this.lightningTimer = rand(5, 15);
    this.time = 0;
    this.bolts = [];
    this.history = [];
    this._buildParticles();
  }

  _buildParticles() {
    const scene = this.stage.scene;
    // rain streaks
    const N = 9000;
    const off = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    const rnd = new Float32Array(N * 2);
    this.area = 46;
    this.height = 22;
    for (let i = 0; i < N; i++) {
      const x = rand(0, this.area), y = rand(0, this.height), z = rand(0, this.area), r = Math.random();
      for (let k = 0; k < 2; k++) {
        off.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
        rnd[i * 2 + k] = r;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    g.setAttribute('aOffset', new THREE.BufferAttribute(off, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    this.rainUniforms = {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSize: { value: this.area }, uHeight: { value: this.height },
      uWind: { value: new THREE.Vector2() }, uIntensity: { value: 0 }, uLen: { value: 0.55 }, uColor: { value: new THREE.Color(0xaec4dc) },
    };
    this.rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: this.rainUniforms, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
    }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // ground splashes
    const S = 1600;
    const soff = new Float32Array(S * 3);
    const srnd = new Float32Array(S);
    for (let i = 0; i < S; i++) {
      soff.set([rand(0, 40), 0, rand(0, 40)], i * 3);
      srnd[i] = Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S * 3), 3));
    sg.setAttribute('aOffset', new THREE.BufferAttribute(soff, 3));
    sg.setAttribute('aRnd', new THREE.BufferAttribute(srnd, 1));
    this.splashUniforms = {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSize: { value: 40 }, uIntensity: { value: 0 },
      uPixel: { value: 300 }, uColor: { value: new THREE.Color(0xd8e6f5) },
    };
    this.splash = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: this.splashUniforms, vertexShader: SPLASH_VERT, fragmentShader: SPLASH_FRAG, transparent: true, depthWrite: false,
    }));
    this.splash.frustumCulled = false;
    scene.add(this.splash);

    // snow
    const F = 5000;
    const foff = new Float32Array(F * 3);
    const frnd = new Float32Array(F);
    for (let i = 0; i < F; i++) {
      foff.set([rand(0, this.area), rand(0, this.height), rand(0, this.area)], i * 3);
      frnd[i] = Math.random();
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(F * 3), 3));
    fg.setAttribute('aOffset', new THREE.BufferAttribute(foff, 3));
    fg.setAttribute('aRnd', new THREE.BufferAttribute(frnd, 1));
    this.snowUniforms = {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSize: { value: this.area }, uHeight: { value: this.height },
      uWind: { value: new THREE.Vector2() }, uIntensity: { value: 0 }, uPixel: { value: 300 },
    };
    this.snow = new THREE.Points(fg, new THREE.ShaderMaterial({
      uniforms: this.snowUniforms, vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, transparent: true, depthWrite: false,
    }));
    this.snow.frustumCulled = false;
    scene.add(this.snow);
  }

  get info() { return WEATHER_TYPES[this.type]; }
  get raining() { return this.p.rain > 0.12; }
  get snowing() { return this.p.snow > 0.15; }
  get stormy() { return this.type === 'storm'; }

  set(type, lock = false) {
    if (!WEATHER_TYPES[type]) return;
    this.type = type;
    this.locked = lock;
    this.minutesLeft = WEATHER_TYPES[type].rain > 0.5 ? rand(90, 240) : rand(180, 420);
    this.next = weightedPick(TRANSITIONS[type]);
  }

  /** Bad weather makes residents grumpier (used by the social sim). */
  irritability() {
    return clamp(this.p.rain * 0.6 + (this.type === 'storm' ? 0.3 : 0) + this.p.fog * 0.1);
  }

  update(dt, gameMinutes, minuteOfDay) {
    this.time += dt;
    // advance chain
    if (!this.locked) {
      this.minutesLeft -= gameMinutes;
      if (this.minutesLeft <= 0) {
        // snow is a winter/night thing here: discourage it in the middle of the day
        let next = this.next;
        if (next === 'snow' && minuteOfDay > 9 * 60 && minuteOfDay < 16 * 60 && Math.random() < 0.5) next = 'cloudy';
        this.set(next);
        this.history.push(next);
      }
    }
    // blend parameters towards target type
    const target = WEATHER_TYPES[this.type];
    const k = 0.35;
    for (const key of ['cloud', 'rain', 'snow', 'fog', 'wind']) this.p[key] = damp(this.p[key], target[key], k, dt);
    this.p.lightning = !!target.lightning;

    // wetness of the world (per game minute rates)
    const rain = this.p.rain;
    if (rain > 0.05) this.wetness = clamp(this.wetness + gameMinutes * rain * 0.03);
    else {
      const sunny = this.type === 'sunny' ? 1 : this.type === 'partly' ? 0.6 : 0.25;
      this.wetness = clamp(this.wetness - gameMinutes * 0.0035 * sunny);
    }
    if (this.p.snow > 0.1) this.snowCover = clamp(this.snowCover + gameMinutes * this.p.snow * 0.006);
    else this.snowCover = clamp(this.snowCover - gameMinutes * (rain > 0.1 ? 0.01 : 0.003));
    if (this.snowCover > 0.2) this.wetness = Math.max(this.wetness, this.snowCover * 0.3);
    weatherUniforms.uWetness.value = this.wetness;
    weatherUniforms.uRain.value = rain;
    weatherUniforms.uSnow.value = this.snowCover;
    weatherUniforms.uTime.value = this.time;

    // particles follow the camera focus
    const cam = this.stage.camera;
    const focus = this.stage.controls.target;
    const center = new THREE.Vector3().copy(focus).lerp(cam.position, 0.35);
    const windDir = new THREE.Vector2(Math.cos(this.time * 0.05), Math.sin(this.time * 0.05)).multiplyScalar(this.p.wind * 4);
    // pixels per world unit at distance 1 (for perspective-correct point sizes)
    const pixel = this.stage.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    Object.assign(this.rainUniforms.uTime, { value: this.time });
    this.rainUniforms.uCenter.value.copy(center);
    this.rainUniforms.uWind.value.copy(windDir);
    this.rainUniforms.uIntensity.value = rain;
    this.rain.visible = rain > 0.01;
    this.splashUniforms.uTime.value = this.time;
    this.splashUniforms.uCenter.value.copy(focus);
    this.splashUniforms.uIntensity.value = rain;
    this.splashUniforms.uPixel.value = pixel;
    this.splash.visible = rain > 0.05;
    this.snowUniforms.uTime.value = this.time;
    this.snowUniforms.uCenter.value.copy(center);
    this.snowUniforms.uWind.value.copy(windDir);
    this.snowUniforms.uIntensity.value = this.p.snow;
    this.snowUniforms.uPixel.value = pixel;
    this.snow.visible = this.p.snow > 0.01;

    // lightning
    if (this.p.lightning && this.p.rain > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = rand(4, 14);
        this.strike(center);
      }
    }
    for (const b of this.bolts) {
      b.life -= dt;
      b.mesh.material.opacity = Math.max(0, b.life * 5);
      if (b.life <= 0) { this.stage.scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);

    this.audio?.setWeather(rain, this.p.wind, this.p.snow);
  }

  strike(center) {
    const strength = rand(0.6, 1);
    this.stage.lightning(strength);
    // jagged bolt in the distance
    const pts = [];
    const ang = rand(0, Math.PI * 2);
    let p = new THREE.Vector3(center.x + Math.cos(ang) * rand(60, 120), 90, center.z + Math.sin(ang) * rand(60, 120));
    pts.push(p.clone());
    while (p.y > 0) {
      p = p.clone().add(new THREE.Vector3(rand(-6, 6), -rand(6, 12), rand(-6, 6)));
      pts.push(p.clone());
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mesh = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 1, fog: false }));
    this.stage.scene.add(mesh);
    this.bolts.push({ mesh, life: 0.25 });
    const dist = rand(0.6, 3.5);
    setTimeout(() => this.audio?.thunder(1.2 - dist / 4), dist * 1000);
  }

  serialize() {
    return { type: this.type, next: this.next, minutesLeft: this.minutesLeft, locked: this.locked, wetness: this.wetness, snowCover: this.snowCover };
  }

  restore(d) {
    if (!d) return;
    this.type = WEATHER_TYPES[d.type] ? d.type : 'sunny';
    this.next = d.next || 'partly';
    this.minutesLeft = d.minutesLeft ?? 200;
    this.locked = !!d.locked;
    this.wetness = d.wetness || 0;
    this.snowCover = d.snowCover || 0;
    Object.assign(this.p, WEATHER_TYPES[this.type]);
  }
}
