// The transformation swarm: points sampled on the outgoing shape leave it as
// its hologram seam sweeps down, spiral around the projector, and land on the
// incoming shape just as its seam sweeps up past them.
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

// Departure / arrival windows (fractions of the morph). main.js drives the
// reveal seams with the same numbers so particles and seams stay in sync.
export const DEPART_END = 0.3;
export const ARRIVE_START = 0.55;

const vertexShader = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec2 aTiming;
  attribute vec4 aRand;
  uniform float uProgress;
  uniform float uSize;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    float t = clamp((uProgress - aTiming.x) / max(aTiming.y - aTiming.x, 0.001), 0.0, 1.0);
    float e = t * t * (3.0 - 2.0 * t);
    float arc = sin(3.14159265 * t);

    vec3 p = mix(aFrom, aTo, e);
    float ang = 6.2831853 * e * (aRand.y > 0.2 ? 1.0 : 2.0);
    float c = cos(ang);
    float s = sin(ang);
    p.xz = mat2(c, -s, s, c) * p.xz;
    vec2 radial = normalize(p.xz + vec2(0.0001, 0.0));
    p.xz += radial * arc * (0.45 + aRand.z * 1.1);
    p.y += arc * (aRand.w - 0.35) * 1.1;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.5 + aRand.x) * uScale / -mv.z;

    float live = step(0.0001, t) * (1.0 - step(0.9999, t));
    vAlpha = live * smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.82, 1.0, t));
    vColor = mix(vec3(1.0, 0.98, 1.0), vec3(0.72, 0.55, 1.0), aRand.y) * (0.7 + arc * 1.3);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha * 0.8);
  }
`;

export class MorphParticles {
  constructor(count = 7000) {
    this.count = count;
    const geo = new THREE.BufferGeometry();
    this.from = new Float32Array(count * 3);
    this.to = new Float32Array(count * 3);
    this.timing = new Float32Array(count * 2);
    const rand = new Float32Array(count * 4);
    for (let i = 0; i < rand.length; i++) rand[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(this.to, 3));
    geo.setAttribute('aFrom', new THREE.BufferAttribute(this.from, 3));
    geo.setAttribute('aTo', new THREE.BufferAttribute(this.to, 3));
    geo.setAttribute('aTiming', new THREE.BufferAttribute(this.timing, 2));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    this.geometry = geo;

    this.uniforms = {
      uProgress: { value: 0 },
      uSize: { value: 0.036 },
      uScale: { value: 800 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  // from/to: { positions: Float32Array, yNorm: Float32Array } in world space
  setup(from, to) {
    this.from.set(from.positions);
    this.to.set(to.positions);
    for (let i = 0; i < this.count; i++) {
      this.timing[i * 2] = (1 - from.yNorm[i]) * DEPART_END;
      this.timing[i * 2 + 1] = ARRIVE_START + to.yNorm[i] * (1 - ARRIVE_START);
    }
    const g = this.geometry;
    g.attributes.aFrom.needsUpdate = true;
    g.attributes.aTo.needsUpdate = true;
    g.attributes.position.needsUpdate = true;
    g.attributes.aTiming.needsUpdate = true;
    this.uniforms.uProgress.value = 0;
    this.points.visible = true;
  }

  setViewport(heightPx, fovDeg) {
    this.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
}

// Area-weighted surface sampling across every mesh under `root`.
export function createSurfaceSampler(root) {
  const entries = [];
  const scale = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.sample === false) return;
    const sampler = new MeshSurfaceSampler(o).build();
    const area = sampler.distribution[sampler.distribution.length - 1];
    entries.push({ mesh: o, sampler, area });
  });

  return function sample(count, bottom, top) {
    root.updateMatrixWorld(true);
    const weights = entries.map((e) => {
      e.mesh.getWorldScale(scale);
      return e.area * Math.abs(scale.x * scale.y);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    const cumulative = [];
    weights.reduce((acc, w, i) => (cumulative[i] = acc + w / total), 0);

    const positions = new Float32Array(count * 3);
    const yNorm = new Float32Array(count);
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let k = cumulative.findIndex((c) => c >= r);
      if (k < 0) k = entries.length - 1;
      entries[k].sampler.sample(p);
      p.applyMatrix4(entries[k].mesh.matrixWorld);
      positions.set([p.x, p.y, p.z], i * 3);
      yNorm[i] = THREE.MathUtils.clamp((p.y - bottom) / (top - bottom), 0, 1);
    }
    return { positions, yNorm };
  };
}
