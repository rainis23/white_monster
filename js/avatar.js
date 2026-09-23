// The White Monster baddie as a VRChat-style anime avatar: 6-head anime
// proportions, cel shading with ink outlines, big slit-pupil eyes, chunky
// two-tone anime hair with bangs, horns and a devil tail, a corset under a
// chest harness, flared goth sleeves, a pleated tartan skirt, thigh-highs and
// platform buckle boots. She shows off her can, follows the cursor, blinks,
// and loads in T-posing like every avatar in VRChat.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAN_HEIGHT, CAN_RADIUS } from './can.js';
import { toonMaterial, outlineMaterial, addOutline } from './toon.js';
import { V, UP, FWD, DEG, limb, ellipsoid, strandGeometry, clumpTaper, hornTaper } from './geometry.js';
import { rng, makeCanvas, toTexture, FONTS } from './textures.js';

export const AVATAR_HEIGHT = 4.36; // soles to the top of the nameplate

const HEAD_R = 0.285;
const HEAD_SY = 1.08;
const HEAD_PIVOT = V(0, 3.19, 0);
const SKULL_OFFSET = V(0, 0.33, 0.02);
const HEAD_C = HEAD_PIVOT.clone().add(SKULL_OFFSET);

const gauss = (x, c, s) => Math.exp(-(((x - c) / s) ** 2));

/* ------------------------------------------------------------------ */
/* head                                                                */
/* ------------------------------------------------------------------ */

// Sphere -> anime head: round cranium and cheeks, a V jaw into a small
// pointed chin, a flat face and a barely-there nose.
function sculptHead(geo, grow = 1) {
  const R = HEAD_R;
  const pos = geo.attributes.position;
  const p = V();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const nx = p.x / R;
    const ny = p.y / R;
    const nz = p.z / R;
    if (ny < 0) {
      const k = Math.pow(-ny, 1.35);
      p.x *= 1 - 0.46 * k;
      p.z *= nz > 0 ? 1 - 0.1 * k : 1 - 0.22 * k;
      p.y -= R * 0.07 * k * Math.max(nz, 0);
    }
    p.x *= 1 + 0.04 * gauss(ny, -0.12, 0.3);
    if (nz > 0) {
      p.z *= 1 - 0.085 * nz;
      p.z += R * 0.035 * gauss(nx, 0, 0.05) * gauss(ny, -0.3, 0.08) * nz * nz;
    }
    p.y *= HEAD_SY;
    p.multiplyScalar(grow);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// point on the head ellipsoid: azimuth 0 = front, +90 = her left
function sph(azDeg, elDeg, r) {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return V(r * Math.cos(el) * Math.sin(az), r * Math.sin(el) * HEAD_SY, r * Math.cos(el) * Math.cos(az));
}

/* ------------------------------------------------------------------ */
/* torso                                                               */
/* ------------------------------------------------------------------ */

const TORSO = [
  [0.001, 1.94], [0.15, 1.95], [0.215, 2.0], [0.238, 2.08], [0.236, 2.16], [0.22, 2.24], [0.19, 2.32],
  [0.165, 2.4], [0.162, 2.47], [0.172, 2.55], [0.19, 2.62], [0.205, 2.69], [0.208, 2.76], [0.2, 2.83],
  [0.205, 2.9], [0.212, 2.96], [0.2, 3.0], [0.16, 3.035], [0.1, 3.06], [0.001, 3.07],
];
const TORSO_BOTTOM = 1.94;
const TORSO_TOP = 3.07;

function torsoRadius(y) {
  for (let i = 1; i < TORSO.length; i++) {
    const [r1, y1] = TORSO[i];
    const [r0, y0] = TORSO[i - 1];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}
const torsoDepth = (y, front) => (front ? 0.7 + 0.075 * gauss(y, 2.72, 0.085) : 0.7);

function onTorso(y, azDeg, lift = 0.012) {
  const a = azDeg * DEG;
  const r = torsoRadius(y) + lift;
  return V(Math.sin(a) * r, y, Math.cos(a) * r * torsoDepth(y, Math.cos(a) > 0));
}

/* ------------------------------------------------------------------ */
/* nameplate                                                           */
/* ------------------------------------------------------------------ */

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function nameplateTexture(name) {
  const { c, g } = makeCanvas(512, 128);
  roundRect(g, 6, 6, 500, 104, 30);
  g.fillStyle = 'rgba(12,10,18,0.8)';
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = `600 50px ${FONTS.ui}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 256, 54);
  // the "Trusted User" rank colour
  roundRect(g, 176, 88, 160, 9, 4.5);
  g.fillStyle = '#8143e6';
  g.fill();
  return toTexture(c);
}

/* ------------------------------------------------------------------ */
/* materials                                                           */
/* ------------------------------------------------------------------ */

function makeMaterials(tex, reveal) {
  const hairSway = { value: 1 };
  const skirtSway = { value: 0.55 };

  const armNet = tex.mesh.clone();
  armNet.repeat.set(10, 10);
  armNet.needsUpdate = true;
  const tartan = tex.tartan.clone();
  tartan.repeat.set(1.6, 1.6);
  tartan.needsUpdate = true;

  const skinShade = [0.9, 0.7, 0.8];
  const t = (o) => toonMaterial(o, reveal);
  const M = {
    skin: t({ color: 0xf8ebe8, shade: skinShade, shadeShift: -0.12, rim: 0xffc6e0, rimStrength: 0.22 }),
    skinFace: t({ color: 0xf8ebe8, shade: skinShade, shadeShift: -0.5, rim: 0xffc6e0, rimStrength: 0.18 }),
    face: t({
      map: tex.face.open,
      shade: skinShade,
      shadeShift: -0.5,
      rimStrength: 0,
      transparent: true,
      depthWrite: false,
    }),
    arms: t({ map: armNet, shade: skinShade, shadeShift: -0.12, rim: 0xb89cff, rimStrength: 0.25 }),
    cloth: t({ color: 0x17141d, shade: [0.55, 0.5, 0.72], rim: 0x9a7bff, rimStrength: 0.55 }),
    sleeve: t({ color: 0x17141d, shade: [0.55, 0.5, 0.72], rim: 0x9a7bff, rimStrength: 0.55, side: THREE.DoubleSide }),
    patent: t({ color: 0x131118, shade: [0.5, 0.48, 0.66], rim: 0xa88bff, rimStrength: 0.6, spec: 0.9, specSize: 0.035 }),
    toe: t({ color: 0x131118, shade: [0.5, 0.48, 0.66], rim: 0xa88bff, rimStrength: 0.6, spec: 0.5, specSize: 0.01 }),
    corset: t({ map: tex.corset, shade: [0.6, 0.55, 0.78], rim: 0x9a7bff, rimStrength: 0.5 }),
    skirt: t({ map: tartan, shade: [0.6, 0.56, 0.78], rim: 0x9a7bff, rimStrength: 0.45, side: THREE.DoubleSide, sway: skirtSway }),
    trim: t({ color: 0xf2eef8, shade: [0.74, 0.7, 0.9], rim: 0xffffff, rimStrength: 0.2 }),
    silver: t({ color: 0xd4d6de, shade: [0.5, 0.5, 0.6], rim: 0xffffff, rimStrength: 0.5, spec: 1.1, specSize: 0.09 }),
    sole: t({ color: 0x1d1b22, shade: [0.6, 0.6, 0.72], rimStrength: 0.25 }),
    tread: t({ color: 0x3b3944, shade: [0.6, 0.6, 0.72], rimStrength: 0.2 }),
    hairBlack: t({
      color: 0x1a1621,
      shade: [0.5, 0.46, 0.68],
      rim: 0xa88bff,
      rimStrength: 0.55,
      spec: 0.28,
      specSize: 0.008,
      side: THREE.DoubleSide,
      sway: hairSway,
    }),
    hairWhite: t({
      color: 0xf5f2fb,
      shade: [0.74, 0.7, 0.9],
      rim: 0xffffff,
      rimStrength: 0.25,
      spec: 0.15,
      specSize: 0.008,
      side: THREE.DoubleSide,
      sway: hairSway,
    }),
    hairCap: t({ color: 0x1a1621, shade: [0.5, 0.46, 0.68], rim: 0xa88bff, rimStrength: 0.5, spec: 0.28, specSize: 0.008, side: THREE.DoubleSide }),
    horn: t({ color: 0x15111b, shade: [0.5, 0.46, 0.66], rim: 0xc4a8ff, rimStrength: 0.7, spec: 1, specSize: 0.05, emissive: 0x2a1650 }),
    glow: t({ color: 0xcdb4ff, rimStrength: 0, emissive: 0xb48cff, emissiveStrength: 2.6 }),
  };
  M.face.polygonOffset = true;
  M.face.polygonOffsetFactor = -2;
  M.face.polygonOffsetUnits = -2;

  const O = {
    ink: outlineMaterial({}, reveal),
    hair: outlineMaterial({ sway: hairSway }, reveal),
    skirt: outlineMaterial({ sway: skirtSway }, reveal),
  };
  return { M, O, hairSway, skirtSway };
}

/* ------------------------------------------------------------------ */
/* the avatar                                                          */
/* ------------------------------------------------------------------ */

export function createAvatar({ tex, reveal, makeCan }) {
  const { M, O } = makeMaterials(tex, reveal);
  const rand = rng(31);

  const root = new THREE.Group();
  root.name = 'avatar';
  const body = new THREE.Group();
  root.add(body);

  // add a mesh (optionally with an ink outline) to a parent
  const put = (parent, mesh, outline = O.ink) => {
    parent.add(mesh);
    if (outline) addOutline(mesh, outline);
    return mesh;
  };
  const detail = (parent, mesh) => {
    mesh.userData.sample = false;
    parent.add(mesh);
    return mesh;
  };

  /* ---------------- legs, thigh-highs, platform boots ---------------- */
  const legs = {
    right: { hip: V(-0.105, 2.02, 0), knee: V(-0.16, 1.18, 0.07), ankle: V(-0.19, 0.37, 0.03), side: -1 },
    left: { hip: V(0.105, 2.02, 0), knee: V(0.12, 1.17, 0.0), ankle: V(0.13, 0.37, -0.02), side: 1 },
  };

  for (const leg of Object.values(legs)) {
    const { hip, knee, ankle, side } = leg;
    put(body, limb(knee, hip, 0.068, 0.108, M.skin));
    put(body, limb(ankle, knee, 0.043, 0.066, M.cloth, { rMid: 0.068, tMid: 0.62 }));

    // thigh-high: covers the lower 45% of the thigh, finished with white lace
    const sockTop = knee.clone().lerp(hip, 0.45);
    const sockR = 0.068 + (0.108 - 0.068) * 0.45 + 0.005;
    put(body, limb(knee, sockTop, 0.072, sockR, M.cloth));
    const lace = new THREE.Mesh(new THREE.TorusGeometry(sockR + 0.002, 0.011, 8, 40), M.trim);
    lace.position.copy(sockTop);
    lace.quaternion.setFromUnitVectors(FWD, hip.clone().sub(knee).normalize());
    put(body, lace);
    // garter strap running up under the skirt
    const strapBottom = sockTop.clone().add(V(side * 0.01, 0.005, sockR * 0.92));
    const strapTop = V(hip.x + side * 0.035, 1.93, 0.13);
    const strap = new THREE.Mesh(
      strandGeometry(new THREE.LineCurve3(strapBottom, strapTop), { radius: 0.011, width: 1.3, thick: 0.35, segs: 4, radial: 6 }),
      M.cloth,
    );
    put(body, strap, null);
    const clip = new THREE.Mesh(new RoundedBoxGeometry(0.026, 0.02, 0.008, 2, 0.003), M.silver);
    clip.position.copy(strapBottom).add(V(0, 0.014, 0.004));
    detail(body, clip);

    // boot shaft to mid-calf with buckle straps
    const shaftBottom = ankle.clone().add(V(0, -0.09, 0));
    const shaftTop = ankle.clone().lerp(knee, 0.56);
    const shaftDir = shaftTop.clone().sub(shaftBottom).normalize();
    put(body, limb(shaftBottom, shaftTop, 0.074, 0.084, M.patent));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.084, 0.012, 10, 40), M.patent);
    cuff.position.copy(shaftTop);
    cuff.quaternion.setFromUnitVectors(FWD, shaftDir);
    put(body, cuff);
    for (let i = 0; i < 3; i++) {
      const p = shaftBottom.clone().lerp(shaftTop, 0.3 + i * 0.24);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.009, 8, 40), M.cloth);
      band.position.copy(p);
      band.quaternion.setFromUnitVectors(FWD, shaftDir);
      band.scale.set(1, 1, 1.5);
      body.add(band);
      const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.016, 0.028, 0.04, 2, 0.005), M.silver);
      buckle.position.copy(p).add(V(side * 0.092, 0, 0.012));
      detail(body, buckle);
    }

    // foot + chunky platform
    const foot = ellipsoid(V(0.082, 0.085, 0.175), M.toe);
    foot.position.set(ankle.x, 0.33, ankle.z + 0.07);
    put(body, foot);
    const sole = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.27, 0.41, 4, 0.045), M.sole);
    sole.position.set(ankle.x, 0.135, ankle.z + 0.07);
    put(body, sole);
    for (const y of [0.055, 0.19]) {
      const ridge = new THREE.Mesh(new RoundedBoxGeometry(0.208, 0.018, 0.418, 2, 0.007), M.tread);
      ridge.position.set(ankle.x, y, ankle.z + 0.07);
      detail(body, ridge);
    }
  }

  /* ---------------- torso: corset over a sheer mesh top ---------------- */
  {
    const geo = new THREE.LatheGeometry(
      TORSO.map(([r, y]) => new THREE.Vector2(r, y)),
      96,
      Math.PI,
    );
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      uv.setY(i, (y - TORSO_BOTTOM) / (TORSO_TOP - TORSO_BOTTOM));
      const z = pos.getZ(i);
      pos.setZ(i, z * torsoDepth(y, z > 0));
    }
    geo.computeVertexNormals();
    put(body, new THREE.Mesh(geo, M.corset));
  }
  for (const s of [-1, 1]) {
    const cap = ellipsoid(V(0.07, 0.066, 0.066), M.arms);
    cap.position.set(s * 0.215, 2.965, 0);
    put(body, cap);
  }
  put(body, limb(V(0, 2.96, -0.01), V(0, 3.42, 0), 0.058, 0.05, M.skin));

  // chest harness: straps over the shoulders into an O-ring, then down to an under-bust band
  {
    const ringAt = onTorso(2.8, 0, 0.02);
    const strapGeo = (pts) =>
      strandGeometry(new THREE.CatmullRomCurve3(pts), { radius: 0.013, width: 1.5, thick: 0.35, segs: 24, radial: 6 });
    for (const s of [-1, 1]) {
      const pts = [V(s * 0.13, 3.04, -0.02), onTorso(2.99, s * 34), onTorso(2.9, s * 22), onTorso(2.84, s * 11), ringAt];
      put(body, new THREE.Mesh(strapGeo(pts), M.patent), null);
    }
    put(body, new THREE.Mesh(strapGeo([ringAt, onTorso(2.72, 0, 0.018), onTorso(2.63, 0, 0.012)]), M.patent), null);
    const band = new THREE.Mesh(new THREE.TorusGeometry(torsoRadius(2.62) + 0.01, 0.014, 8, 64), M.patent);
    band.rotation.x = Math.PI / 2;
    band.position.y = 2.62;
    band.scale.set(1, torsoDepth(2.62, true), 1.4);
    put(body, band);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0065, 10, 28), M.silver);
    ring.position.copy(ringAt).add(V(0, 0, 0.006));
    detail(body, ring);
  }

  /* ---------------- skirt, belt & chains ---------------- */
  {
    const h = 0.46;
    const top = 2.36;
    const geo = new THREE.CylinderGeometry(0.182, 0.36, h, 192, 8, true, Math.PI);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const count = pos.count;
    const aT = new Float32Array(count);
    const aPhase = new Float32Array(count);
    const pleats = 20;
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(x, z);
      const down = (h / 2 - y) / h;
      const saw = (((a / (Math.PI * 2)) * pleats) % 1 + 1) % 1;
      const pleat = (saw - 0.5) * 0.04 * (0.2 + 0.8 * down);
      const r = Math.hypot(x, z);
      const k = (r + pleat) / r;
      pos.setXYZ(i, x * k, y, z * k * 0.74);
      uv.setXY(i, (uv.getX(i) * 4) / 1.6, y);
      aT[i] = down;
      aPhase[i] = a * 2;
    }
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
    geo.computeVertexNormals();
    const skirt = new THREE.Mesh(geo, M.skirt);
    skirt.position.y = top - h / 2;
    put(body, skirt, O.skirt);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.184, 0.018, 10, 64), M.patent);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.74, 1);
    band.position.y = top;
    put(body, band);

    const belt = new THREE.Group();
    belt.position.y = 2.28;
    belt.rotation.z = 0.07;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.218, 0.016, 10, 72), M.patent);
    strap.rotation.x = Math.PI / 2;
    strap.scale.set(1, 0.76, 1.3);
    put(belt, strap);
    const stud = new THREE.ConeGeometry(0.011, 0.018, 4);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const s = new THREE.Mesh(stud, M.silver);
      s.position.set(Math.sin(a) * 0.234, 0, Math.cos(a) * 0.234 * 0.76);
      s.quaternion.setFromUnitVectors(UP, V(Math.sin(a), 0, Math.cos(a) * 0.76).normalize());
      detail(belt, s);
    }
    const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.056, 0.016, 2, 0.008), M.silver);
    buckle.position.set(0, 0, 0.18);
    put(belt, buckle);
    body.add(belt);

    const link = new THREE.TorusGeometry(0.013, 0.0038, 6, 14);
    const chains = [
      new THREE.QuadraticBezierCurve3(V(0.06, 2.265, 0.176), V(0.2, 1.97, 0.28), V(0.215, 2.28, 0.06)),
      new THREE.QuadraticBezierCurve3(V(-0.02, 2.26, 0.178), V(0.16, 1.86, 0.3), V(0.165, 2.275, 0.125)),
    ];
    chains.forEach((curve) => {
      const n = Math.floor(curve.getLength() / 0.021);
      const inst = new THREE.InstancedMesh(link, M.silver, n);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const twist = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const tt = (i + 0.5) / n;
        q.setFromUnitVectors(V(1, 0, 0), curve.getTangentAt(tt));
        twist.setFromAxisAngle(V(1, 0, 0), i % 2 ? Math.PI / 2 : 0);
        q.multiply(twist);
        m.compose(curve.getPointAt(tt), q, V(1.5, 1, 1));
        inst.setMatrixAt(i, m);
      }
      body.add(inst);
    });
  }

  /* ---------------- choker ---------------- */
  {
    const y = 3.07;
    const choker = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.016, 12, 48), M.patent);
    choker.rotation.x = Math.PI / 2;
    choker.position.set(0, y, 0.002);
    put(body, choker);
    for (let i = 0; i < 9; i++) {
      const a = (-96 + i * 24) * DEG;
      const dir = V(Math.sin(a), 0, Math.cos(a));
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.028, 10), M.silver);
      spike.position.set(dir.x * 0.08, y, dir.z * 0.08 + 0.002);
      spike.quaternion.setFromUnitVectors(UP, dir);
      detail(body, spike);
    }
    const oring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 10, 28), M.silver);
    oring.position.set(0, y - 0.026, 0.084);
    detail(body, oring);
    // glowing cross charm
    const v = new THREE.Mesh(new RoundedBoxGeometry(0.011, 0.05, 0.008, 2, 0.002), M.glow);
    const hbar = new THREE.Mesh(new RoundedBoxGeometry(0.034, 0.011, 0.008, 2, 0.002), M.glow);
    v.position.set(0, y - 0.068, 0.086);
    hbar.position.set(0, y - 0.058, 0.086);
    detail(body, v);
    detail(body, hbar);
  }

  /* ---------------- arms (rigged for the T-pose) ---------------- */
  const arms = [];

  // Build an arm from world-space joints. Everything below the shoulder hangs
  // off pivot groups, so the whole arm can blend into a T-pose.
  function arm({ S, E, W, side }) {
    const shoulder = new THREE.Group();
    shoulder.position.copy(S);
    body.add(shoulder);
    const elbow = new THREE.Group();
    elbow.position.copy(E).sub(S);
    shoulder.add(elbow);
    const inShoulder = (mesh, outline = O.ink) => {
      mesh.position.sub(S);
      return put(shoulder, mesh, outline);
    };
    const inElbow = (mesh, outline = O.ink) => {
      mesh.position.sub(E);
      return put(elbow, mesh, outline);
    };
    const upperDir = E.clone().sub(S).normalize();
    const foreDir = W.clone().sub(E).normalize();
    inShoulder(limb(S, E, 0.052, 0.042, M.arms, { rMid: 0.05, tMid: 0.3 }));
    inElbow(limb(E, W, 0.042, 0.03, M.skin, { rMid: 0.04, tMid: 0.25 }));

    // flared goth sleeve with white lace at the cuff
    const a = E.clone().lerp(W, 0.18);
    const b = E.clone().lerp(W, 0.84);
    const len = a.distanceTo(b);
    const sleevePts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      sleevePts.push(new THREE.Vector2(0.047 + Math.pow(t, 1.8) * 0.052, t * len));
    }
    const sleeve = new THREE.Mesh(new THREE.LatheGeometry(sleevePts, 40), M.sleeve);
    sleeve.position.copy(a);
    sleeve.quaternion.setFromUnitVectors(UP, foreDir);
    inElbow(sleeve);
    const cuffLace = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 8, 48), M.trim);
    cuffLace.position.copy(b);
    cuffLace.quaternion.setFromUnitVectors(FWD, foreDir);
    inElbow(cuffLace);

    const entry = {
      shoulder,
      elbow,
      inElbow,
      qShoulder: new THREE.Quaternion().setFromUnitVectors(upperDir, V(side, -0.04, 0).normalize()),
      qElbow: new THREE.Quaternion().setFromUnitVectors(foreDir, upperDir),
      sway: new THREE.Quaternion(),
    };
    arms.push(entry);
    return entry;
  }

  const finger = (points, radius) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(
      strandGeometry(curve, { radius, thick: 1, segs: 10, radial: 10, taper: (t) => 1 - t * 0.25 }),
      M.skin,
    );
    const dir = curve.getTangentAt(1);
    const nail = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.8, radius * 3.2, 10), M.patent);
    nail.position.copy(curve.getPointAt(1)).addScaledVector(dir, radius * 1.2);
    nail.quaternion.setFromUnitVectors(UP, dir);
    nail.userData.sample = false;
    return [mesh, nail];
  };

  {
    // her left arm holds the can up by her shoulder
    const canS = 0.132;
    const canC = V(0.42, 3.1, 0.2);
    const canR = CAN_RADIUS * canS;
    const around = (deg, y, r = canR) => V(canC.x + Math.cos(deg * DEG) * r, y, canC.z + Math.sin(deg * DEG) * r);
    const palmDir = V(Math.cos(-25 * DEG), 0, Math.sin(-25 * DEG));
    const palmC = around(-25, 3.06, canR + 0.017);
    const W = palmC.clone().add(V(0, -0.06, 0)).addScaledVector(palmDir, 0.01);
    const E = V(0.46, 2.56, 0.0);
    const L = arm({ S: V(0.225, 2.975, 0), E, W, side: 1 });

    const palm = ellipsoid(V(0.016, 0.044, 0.035), M.skin);
    palm.position.copy(palmC);
    palm.rotation.y = Math.atan2(-palmDir.z, palmDir.x);
    L.inElbow(palm);
    [0, 1, 2, 3].forEach((k) => {
      const y = 3.09 - k * 0.022;
      const end = 80 - k * 9;
      const pts = [];
      for (let i = 0; i <= 5; i++) pts.push(around(-12 + ((end + 12) * i) / 5, y, canR + 0.01));
      finger(pts, 0.0102).forEach((m) => L.inElbow(m, null));
    });
    finger([around(-40, 3.08, canR + 0.014), around(-58, 3.115, canR + 0.011), around(-80, 3.135, canR + 0.009)], 0.011).forEach((m) =>
      L.inElbow(m, null),
    );

    const mini = makeCan(reveal);
    mini.scale.setScalar(canS);
    mini.position.set(canC.x, canC.y - (CAN_HEIGHT * canS) / 2, canC.z);
    mini.rotation.y = -0.22;
    L.elbow.add(mini);
    mini.position.sub(E);

    const fore = W.clone().sub(E).normalize();
    for (let i = 0; i < 2; i++) {
      const bangle = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.005, 8, 32), M.silver);
      bangle.position.copy(W).addScaledVector(fore, -0.025 - i * 0.02);
      bangle.quaternion.setFromUnitVectors(FWD, fore);
      bangle.userData.sample = false;
      L.inElbow(bangle, null);
    }
  }

  {
    // her right hand on her hip
    const S = V(-0.225, 2.975, 0);
    const E = V(-0.46, 2.62, -0.12);
    const W = V(-0.25, 2.33, 0.05);
    const R = arm({ S, E, W, side: -1 });
    const n = V(-0.95, 0, 0.3).normalize();
    const l = V(0.25, -0.4, 0.88);
    l.addScaledVector(n, -l.dot(n)).normalize();
    const w = V().crossVectors(n, l).normalize();
    const palmC = W.clone().addScaledVector(l, 0.04).addScaledVector(n, 0.004);
    const palm = ellipsoid(V(0.034, 0.016, 0.044), M.skin);
    palm.position.copy(palmC);
    palm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w, n, l));
    R.inElbow(palm);
    [-1.5, -0.5, 0.5, 1.5].forEach((k) => {
      const base = palmC.clone().addScaledVector(l, 0.036).addScaledVector(w, k * 0.016);
      const len = 0.066 - Math.abs(k + 0.5) * 0.007;
      const mid = base.clone().addScaledVector(l, len * 0.55).addScaledVector(n, -0.005);
      const tip = base.clone().addScaledVector(l, len).addScaledVector(n, -0.016);
      finger([base, mid, tip], 0.0098).forEach((m) => R.inElbow(m, null));
    });
    const tb = palmC.clone().addScaledVector(w, -0.03);
    finger([tb, tb.clone().addScaledVector(l, -0.026).addScaledVector(w, -0.018), tb.clone().addScaledVector(l, -0.052).addScaledVector(w, -0.013)], 0.0105).forEach((m) =>
      R.inElbow(m, null),
    );
  }

  /* ---------------- head ---------------- */
  const headGroup = new THREE.Group();
  headGroup.position.copy(HEAD_PIVOT);
  body.add(headGroup);
  const skull = new THREE.Group();
  skull.position.copy(SKULL_OFFSET);
  headGroup.add(skull);

  const headGeo = sculptHead(new THREE.SphereGeometry(HEAD_R, 96, 72));
  put(skull, new THREE.Mesh(headGeo, M.skinFace));

  const faceGeo = sculptHead(
    new THREE.SphereGeometry(HEAD_R, 96, 72, Math.PI / 2 - 1.45, 2.9, 0.12 * Math.PI, 0.88 * Math.PI),
    1.004,
  );
  {
    const pos = faceGeo.attributes.position;
    const uv = faceGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / (2 * HEAD_R) + 0.5, pos.getY(i) / (2 * HEAD_R * HEAD_SY) + 0.5);
    }
  }
  const face = new THREE.Mesh(faceGeo, M.face);
  face.userData.sample = false;
  face.renderOrder = 1;
  skull.add(face);

  // find a point on the face from face-canvas pixel coordinates
  const probe = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const onFace = (px, py, lift = 0.004) => {
    const x = (px / 1024 - 0.5) * 2 * HEAD_R;
    const y = (0.5 - py / 1024) * 2 * HEAD_R * HEAD_SY;
    ray.set(V(x, y, 2), V(0, 0, -1));
    const hit = ray.intersectObject(probe)[0];
    return hit ? hit.point.addScaledVector(hit.face.normal, lift) : V(x, y, HEAD_R);
  };
  {
    const lipRing = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0028, 8, 28), M.silver);
    lipRing.position.copy(onFace(540, 792, -0.001));
    lipRing.rotation.set(-0.3, 0, 0.35);
    detail(skull, lipRing);
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), M.silver);
    stud.position.copy(onFace(498, 684, 0.003));
    detail(skull, stud);
  }

  /* ---------------- anime hair ---------------- */
  {
    // Scalp shell with its poles pointing front/back, cut away around the face
    // and under the jaw. Bangs and locks sit on top of it.
    const capGeo = new THREE.SphereGeometry(HEAD_R * 1.07, 96, 64, -Math.PI / 2, Math.PI * 2, 0, Math.PI);
    capGeo.rotateX(Math.PI / 2);
    {
      const pos = capGeo.attributes.position;
      const idx = capGeo.index.array;
      const keep = [];
      const c = V();
      const p = V();
      for (let i = 0; i < idx.length; i += 3) {
        c.set(0, 0, 0);
        for (let k = 0; k < 3; k++) c.add(p.fromBufferAttribute(pos, idx[i + k]));
        c.normalize();
        const az = Math.abs(Math.atan2(c.x, c.z)) / DEG;
        const el = Math.asin(c.y) / DEG;
        const inFace = az < 70 && el < 32 - 22 * Math.min(1, az / 70) ** 2;
        const underJaw = c.y < -0.3 - 0.4 * (1 - c.z) * 0.5;
        if (!inFace && !underJaw) keep.push(idx[i], idx[i + 1], idx[i + 2]);
      }
      capGeo.setIndex(keep);
    }
    capGeo.scale(1, HEAD_SY, 1);
    put(skull, new THREE.Mesh(capGeo, M.hairCap));

    const local = (x, y, z) => V(x, y, z).sub(HEAD_C);
    const black = [];
    const white = [];
    const clump = (pts, radius, width = 1.6) =>
      strandGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), {
        radius,
        width,
        thick: 0.34,
        segs: 32,
        radial: 8,
        taper: clumpTaper,
        phase: rand() * Math.PI * 2,
      });

    // bangs: pointed clumps over the forehead, shorter in the middle so the eyes stay clear
    for (let i = 0; i < 11; i++) {
      const az = -50 + i * 10 + (rand() - 0.5) * 3;
      const side = Math.abs(az) > 38;
      const tipEl = side ? -8 - rand() * 6 : 11 + Math.abs(az) * 0.08 + rand() * 4;
      const bang = clump(
        [
          sph(az * 0.45, 72, HEAD_R * 1.0),
          sph(az * 0.8, 46, HEAD_R * 1.13),
          sph(az * 0.97, 26, HEAD_R * 1.1),
          sph(az * 1.03 + (rand() - 0.5) * 4, tipEl, HEAD_R * (side ? 1.08 : 1.03)),
        ],
        0.056,
        1.5,
      );
      // bangs barely sway, so they never swing across her eyes
      const at = bang.attributes.aT;
      for (let k = 0; k < at.count; k++) at.setX(k, at.getX(k) * 0.4);
      black.push(bang);
    }

    // one white money-piece lock on each side of the face
    for (const s of [-1, 1]) {
      white.push(
        clump(
          [
            sph(s * 34, 60, HEAD_R * 1.0),
            sph(s * 60, 22, HEAD_R * 1.12),
            sph(s * 64, -14, HEAD_R * 1.14),
            local(s * 0.26, 3.2, 0.12),
            local(s * 0.235, 3.0, 0.165),
            local(s * 0.215, 2.8, 0.182),
            local(s * 0.205, 2.6, 0.172),
          ],
          0.036,
          1.35,
        ),
      );
    }

    // long back hair (black) with a white under-layer peeking out at the ends
    for (const s of [-1, 1]) {
      for (let az = 80; az <= 180; az += 8.5) {
        const sin = Math.sin(az * DEG);
        const cos = Math.cos(az * DEG);
        const len = 2.34 - ((az - 80) / 100) * 0.12 - rand() * 0.06;
        black.push(
          clump(
            [
              sph(s * az * 0.7, 74, HEAD_R * 0.98),
              sph(s * az, 36, HEAD_R * 1.11),
              sph(s * az, -4, HEAD_R * 1.15),
              sph(s * az, -34, HEAD_R * 1.17),
              local(s * sin * 0.3, 3.02, Math.min(cos * 0.32, -0.11)),
              local(s * sin * 0.26, 2.72, Math.min(cos * 0.3, -0.19)),
              local(s * sin * 0.21, len, Math.min(cos * 0.26, -0.2)),
            ],
            0.07,
            1.6,
          ),
        );
      }
      // the white under-layer starts at the nape, so it only shows at the ends
      for (let az = 100; az <= 176; az += 14) {
        const sin = Math.sin(az * DEG);
        const cos = Math.cos(az * DEG);
        white.push(
          clump(
            [
              sph(s * az, -18, HEAD_R * 1.04),
              sph(s * az, -36, HEAD_R * 1.1),
              local(s * sin * 0.27, 3.0, Math.min(cos * 0.28, -0.1)),
              local(s * sin * 0.23, 2.7, Math.min(cos * 0.26, -0.17)),
              local(s * sin * 0.19, 2.2 - rand() * 0.05, Math.min(cos * 0.23, -0.18)),
            ],
            0.06,
            1.5,
          ),
        );
      }
    }
    put(skull, new THREE.Mesh(mergeGeometries(black), M.hairBlack), O.hair);
    put(skull, new THREE.Mesh(mergeGeometries(white), M.hairWhite), O.hair);

    // horns
    for (const s of [-1, 1]) {
      const r0 = sph(s * 40, 55, HEAD_R * 0.98);
      const curve = new THREE.CatmullRomCurve3([
        r0,
        r0.clone().add(V(s * 0.035, 0.09, -0.005)),
        r0.clone().add(V(s * 0.085, 0.16, -0.045)),
        r0.clone().add(V(s * 0.1, 0.185, -0.11)),
      ]);
      put(skull, new THREE.Mesh(strandGeometry(curve, { radius: 0.046, thick: 1, segs: 24, radial: 16, taper: hornTaper }), M.horn));
    }
  }

  /* ---------------- devil tail ---------------- */
  const tail = new THREE.Group();
  tail.position.set(0, 2.2, -0.19);
  body.add(tail);
  {
    const curve = new THREE.CatmullRomCurve3([
      V(0, 0, 0), V(0.04, -0.22, -0.12), V(0.17, -0.38, -0.24), V(0.33, -0.34, -0.26), V(0.42, -0.18, -0.18),
    ]);
    put(tail, new THREE.Mesh(strandGeometry(curve, { radius: 0.022, thick: 1, segs: 40, radial: 12, taper: (t) => 1 - t * 0.45 }), M.cloth));
    const spade = new THREE.Shape();
    spade.moveTo(0, 0.07);
    spade.bezierCurveTo(0.03, 0.03, 0.06, 0.0, 0.03, -0.03);
    spade.quadraticCurveTo(0.012, -0.045, 0, -0.02);
    spade.quadraticCurveTo(-0.012, -0.045, -0.03, -0.03);
    spade.bezierCurveTo(-0.06, 0.0, -0.03, 0.03, 0, 0.07);
    const tipGeo = new THREE.ExtrudeGeometry(spade, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
    tipGeo.translate(0, 0.02, -0.006);
    const tip = new THREE.Mesh(tipGeo, M.cloth);
    tip.position.copy(curve.getPointAt(1));
    tip.quaternion.setFromUnitVectors(UP, curve.getTangentAt(1));
    put(tail, tip);
  }

  /* ---------------- VRChat nameplate ---------------- */
  const nameplate = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: nameplateTexture('WhiteMonster'), transparent: true, depthWrite: false, opacity: 0 }),
  );
  nameplate.scale.set(0.84, 0.21, 1);
  nameplate.position.set(0, 4.22, 0);
  nameplate.renderOrder = 5;
  nameplate.raycast = () => {};
  root.add(nameplate);

  /* ---------------- animation ---------------- */
  const look = { yaw: 0, pitch: 0 };
  const qIdentity = new THREE.Quaternion();
  let tpose = 0;
  let blinkTimer = 2.5;
  let blinkHold = 0;
  let spin = 0;
  let spinDir = 1;

  function update(t, dt, pointer) {
    if (spin > 0) spin = Math.max(0, spin - dt / 1.1);
    const s = 1 - spin;
    const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
    body.rotation.y = Math.sin(t * 0.55) * 0.09 * (1 - tpose) + (spin > 0 ? e * Math.PI * 2 * spinDir : 0);
    body.position.y = spin > 0 ? Math.sin(Math.PI * s) * 0.18 : 0;
    body.rotation.z = Math.sin(t * 1.1) * 0.01 * (1 - tpose);

    look.yaw += (pointer.x * 0.35 * (1 - tpose) - look.yaw) * Math.min(1, dt * 3);
    look.pitch += (-pointer.y * 0.12 * (1 - tpose) - look.pitch) * Math.min(1, dt * 3);
    headGroup.rotation.set(0.03 + look.pitch, look.yaw - body.rotation.y * 0.6, (0.08 + Math.sin(t * 0.9) * 0.025) * (1 - tpose), 'YXZ');

    arms.forEach((a, i) => {
      a.sway.setFromAxisAngle(FWD, Math.sin(t * (1.3 + i * 0.4)) * 0.018 * (1 - tpose));
      a.shoulder.quaternion.slerpQuaternions(qIdentity, a.qShoulder, tpose).premultiply(a.sway);
      a.elbow.quaternion.slerpQuaternions(qIdentity, a.qElbow, tpose);
    });

    tail.rotation.set(Math.sin(t * 1.4) * 0.12, Math.sin(t * 1.05) * 0.28, Math.sin(t * 1.7) * 0.1);

    blinkTimer -= dt;
    if (blinkTimer <= 0 && blinkHold <= 0) {
      blinkHold = 0.12;
      blinkTimer = 2 + Math.random() * 3.5;
    }
    if (blinkHold > 0) blinkHold -= dt;
    M.face.uniforms.uMap.value = blinkHold > 0 ? tex.face.closed : tex.face.open;
  }

  return {
    root,
    update,
    height: AVATAR_HEIGHT,
    hype() {
      if (spin > 0 || tpose > 0.01) return;
      spin = 1;
      spinDir = Math.random() > 0.5 ? 1 : -1;
    },
    // 0 = posed, 1 = VRChat default T-pose
    setTPose(k) {
      tpose = THREE.MathUtils.clamp(k, 0, 1);
    },
    setNameplate(opacity) {
      nameplate.material.opacity = opacity;
      nameplate.visible = opacity > 0.01;
    },
  };
}
