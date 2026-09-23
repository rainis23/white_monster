// The set: a hologram projector pedestal with a glowing summoning ring, a
// light beam, drifting embers, a dark glossy floor and a violet horizon.
import * as THREE from 'three';

export const PEDESTAL_TOP = 0.3;

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

const beamFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    float h = vUv.y;
    float fade = pow(1.0 - h, 1.8) * smoothstep(0.0, 0.03, h);
    float streak = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 23.0 + uTime * 0.7) * sin(vUv.x * 6.2831 * 7.0 - uTime * 0.4);
    float scan = 0.8 + 0.2 * sin(h * 140.0 - uTime * 6.0);
    float soft = smoothstep(0.0, 0.6, vFacing);
    gl_FragColor = vec4(uColor, fade * streak * scan * soft * uIntensity * 0.22);
  }
`;

const dustVertex = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + uTime * (0.08 + aSeed.x * 0.18), 9.0);
    p.x += sin(uTime * 0.3 + aSeed.y * 6.28) * 0.3;
    p.z += cos(uTime * 0.25 + aSeed.z * 6.28) * 0.3;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.02 + aSeed.w * 0.035) * uScale / -mv.z;
    float twinkle = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed.x * 3.0) + aSeed.y * 20.0);
    vAlpha = twinkle * smoothstep(0.0, 1.0, p.y) * (1.0 - smoothstep(6.5, 9.0, p.y));
  }
`;

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha);
  }
`;

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// fades from the fog colour at the horizon (so the floor melts into it) to near-black
const skyFragment = /* glsl */ `
  uniform vec3 uHorizon;
  varying vec3 vDir;
  void main() {
    float y = max(vDir.y, 0.0);
    vec3 top = vec3(0.004, 0.003, 0.007);
    vec3 col = mix(uHorizon, top, smoothstep(0.0, 0.45, y));
    col += uHorizon * 0.6 * exp(-pow((y - 0.06) / 0.05, 2.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createStage({ sigilMap, shadowMap, horizon }) {
  const group = new THREE.Group();

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { uHorizon: { value: horizon } },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  group.add(sky);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(80, 96),
    new THREE.MeshStandardMaterial({ color: 0x09080c, roughness: 0.82, metalness: 0.15, envMapIntensity: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // pedestal
  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x1a1820, metalness: 0.85, roughness: 0.3 });
  const profile = [
    [0.001, 0], [1.55, 0], [1.58, 0.02], [1.58, 0.1], [1.55, 0.12], [1.4, 0.14],
    [1.37, 0.16], [1.37, 0.27], [1.345, 0.298], [1.3, PEDESTAL_TOP], [0.001, PEDESTAL_TOP],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  group.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 128), pedestalMat));

  const top = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 96),
    new THREE.MeshStandardMaterial({ color: 0x08070b, metalness: 0.6, roughness: 0.18 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = PEDESTAL_TOP + 0.001;
  group.add(top);

  const sigil = new THREE.Mesh(
    new THREE.PlaneGeometry(2.56, 2.56),
    new THREE.MeshBasicMaterial({
      map: sigilMap,
      color: new THREE.Color(0.5, 0.42, 0.9),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sigil.rotation.x = -Math.PI / 2;
  sigil.position.y = PEDESTAL_TOP + 0.003;
  group.add(sigil);

  const floorSigil = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 7.4),
    new THREE.MeshBasicMaterial({
      map: sigilMap,
      color: new THREE.Color(0.16, 0.1, 0.3),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  floorSigil.rotation.x = -Math.PI / 2;
  floorSigil.position.y = 0.002;
  group.add(floorSigil);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, color: 0x000000 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = PEDESTAL_TOP + 0.004;
  shadow.renderOrder = 2;
  group.add(shadow);

  const ringColor = new THREE.Color(0.85, 0.72, 1.0);
  const ringMat = new THREE.MeshBasicMaterial({ color: ringColor.clone(), toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.352, 0.016, 12, 160), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = PEDESTAL_TOP - 0.004;
  group.add(ring);
  const lowRingMat = new THREE.MeshBasicMaterial({ color: ringColor.clone(), toneMapped: false });
  const lowRing = new THREE.Mesh(new THREE.TorusGeometry(1.585, 0.008, 8, 160), lowRingMat);
  lowRing.rotation.x = Math.PI / 2;
  lowRing.position.y = 0.06;
  group.add(lowRing);

  const beamUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 1 },
    uColor: { value: new THREE.Color(0.75, 0.62, 1.0) },
  };
  const beamGeo = new THREE.CylinderGeometry(1.05, 1.3, 4.2, 96, 1, true);
  beamGeo.translate(0, 2.1, 0);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.ShaderMaterial({
      uniforms: beamUniforms,
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = PEDESTAL_TOP;
  beam.renderOrder = 3;
  group.add(beam);

  // embers
  const count = 700;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const r = 1.6 + Math.pow(Math.random(), 0.7) * 9;
    const a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * r, Math.random() * 9, Math.sin(a) * r], i * 3);
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const dustUniforms = { uTime: { value: 0 }, uScale: { value: 800 }, uColor: { value: new THREE.Color(1.4, 1.2, 2.2) } };
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      uniforms: dustUniforms,
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  dust.frustumCulled = false;
  group.add(dust);

  const state = { beam: 1 };

  function update(t, dt, { ringBoost = 0, beamLevel = 1, shadowScale = 1 }) {
    beamUniforms.uTime.value = t;
    dustUniforms.uTime.value = t;
    state.beam += (beamLevel - state.beam) * Math.min(1, dt * 4);
    beamUniforms.uIntensity.value = state.beam * (0.9 + Math.sin(t * 7.3) * 0.04 + Math.sin(t * 2.1) * 0.06);
    const k = 4 + Math.sin(t * 1.7) * 0.6 + ringBoost * 4;
    ringMat.color.copy(ringColor).multiplyScalar(k);
    lowRingMat.color.copy(ringColor).multiplyScalar(k * 0.5);
    sigil.material.opacity = 0.7 + ringBoost * 0.3;
    sigil.rotation.z = t * 0.05;
    floorSigil.rotation.z = -t * 0.02;
    shadow.scale.setScalar(THREE.MathUtils.lerp(shadow.scale.x, shadowScale, Math.min(1, dt * 4)));
  }

  function setViewport(heightPx, fovDeg) {
    dustUniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  return { group, update, setViewport };
}
