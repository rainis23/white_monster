// The White Monster baddie: a stylised doll built entirely from primitives,
// lathes and tube curves, dressed in goth-baddie staples: winged liner, black
// lips, white money-piece streaks, spiked choker, corset, fishnets, tartan
// mini, chains and platform buckle boots. She holds her can up like a trophy.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createCan } from './can.js';
import { applyReveal } from './reveal.js';
import { rng } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const FWD = V(0, 0, 1);
const DEG = Math.PI / 180;

export const BADDIE_HEIGHT = 4.2;

/* ------------------------------------------------------------------ */
/* geometry helpers                                                    */
/* ------------------------------------------------------------------ */

// Tapered capsule along +y from 0..len (radius r0 at the bottom, r1 at the top).
// UVs are in world units so tiled fabrics keep one scale across limbs.
function limbGeometry(r0, r1, len, radial = 28) {
  const pts = [];
  const cap = 8;
  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r0), Math.sin(a) * r0));
  }
  for (let i = 0; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r1), len + Math.sin(a) * r1));
  }
  // phiStart = PI keeps the texture seam on the back of the limb
  const g = new THREE.LatheGeometry(pts, radial, Math.PI);
  worldUV(g, (r0 + r1) / 2);
  return g;
}

function worldUV(geo, radius) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const circ = Math.PI * 2 * radius;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, uv.getX(i) * circ, pos.getY(i));
}

function orient(obj, from, to, axis = UP) {
  obj.position.copy(from);
  obj.quaternion.setFromUnitVectors(axis, to.clone().sub(from).normalize());
  return obj;
}

function limb(a, b, ra, rb, material) {
  return orient(new THREE.Mesh(limbGeometry(ra, rb, a.distanceTo(b)), material), a, b);
}

function ellipsoid(radii, material, segs = 32) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, segs, Math.round(segs * 0.75)), material);
  m.scale.copy(radii);
  return m;
}

// A flattened, tapering tube along a curve. aT runs 0 at the root to 1 at the
// tip (used for hair sway), aPhase de-syncs neighbouring strands.
function strandGeometry(curve, { radius, width = 1, thick = 0.5, segs = 36, radial = 8, taper, phase = 0 }) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const aT = [];
  const aPhase = [];
  const indices = [];
  const pts = curve.getSpacedPoints(segs);
  const O = V(0, 0, 0);
  const S = V(0, 0, 0);
  const W = V(0, 0, 0);
  const n = V(0, 0, 0);
  let prevS = V(1, 0, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const P = pts[i];
    const T = curve.getTangentAt(Math.min(t, 0.9999)).normalize();
    O.set(P.x, 0, P.z);
    if (O.lengthSq() < 1e-6) O.set(0, 0, 1);
    O.normalize();
    S.crossVectors(T, O);
    if (S.lengthSq() < 1e-5) S.copy(prevS);
    S.normalize();
    prevS.copy(S);
    W.crossVectors(S, T).normalize();
    const r = radius * taper(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      positions.push(
        P.x + (S.x * c * width + W.x * s * thick) * r,
        P.y + (S.y * c * width + W.y * s * thick) * r,
        P.z + (S.z * c * width + W.z * s * thick) * r,
      );
      n.copy(S).multiplyScalar(c / width).addScaledVector(W, s / thick).normalize();
      normals.push(n.x, n.y, n.z);
      uvs.push(t * 2, j / radial);
      aT.push(t);
      aPhase.push(phase);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(aPhase, 1));
  g.setIndex(indices);
  return g;
}

const hairTaper = (t) => Math.min(1, 0.55 + t * 6) * (t < 0.55 ? 1 : 1 - Math.pow((t - 0.55) / 0.45, 1.4) * 0.88);
const hornTaper = (t) => 1 - t * 0.94;

/* ------------------------------------------------------------------ */
/* head sculpt                                                         */
/* ------------------------------------------------------------------ */

const HEAD_R = 0.36;
const HEAD_SY = 1.06;

function gauss(nx, ny, cx, cy, sx, sy) {
  return Math.exp(-(((nx - cx) / sx) ** 2) - (((ny - cy) / sy) ** 2));
}

// Turn a sphere into a doll head: tapered "snatched" jaw, flatter face,
// a nose, lips, cheekbones and soft eye sockets.
function sculptHead(geo, R, grow = 1) {
  const pos = geo.attributes.position;
  const p = V(0, 0, 0);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const nx = p.x / R;
    const ny = p.y / R;
    const nz = p.z / R;
    if (ny < 0.05) {
      const k = Math.pow((0.05 - ny) / 1.05, 1.5);
      p.x *= 1 - 0.3 * k;
      p.z *= 1 - 0.1 * k;
    }
    if (nz > 0) {
      p.z *= 1 - 0.07 * nz;
      const front = Math.pow(nz, 2);
      const bump =
        0.07 * gauss(nx, ny, 0, -0.27, 0.07, 0.11) +
        0.018 * gauss(nx, ny, 0, -0.54, 0.22, 0.07) +
        0.022 * gauss(nx, ny, 0.44, -0.14, 0.14, 0.12) +
        0.022 * gauss(nx, ny, -0.44, -0.14, 0.14, 0.12) -
        0.022 * gauss(nx, ny, 0.34, -0.03, 0.12, 0.08) -
        0.022 * gauss(nx, ny, -0.34, -0.03, 0.12, 0.08) +
        0.02 * gauss(nx, ny, 0, -0.86, 0.14, 0.1);
      p.z += bump * R * front;
    }
    p.y *= HEAD_SY;
    p.multiplyScalar(grow);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Point on the (unsculpted) head ellipsoid: azimuth 0 = front, +90 = her left.
function sph(azDeg, elDeg, r) {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return V(r * Math.cos(el) * Math.sin(az), r * Math.sin(el) * HEAD_SY, r * Math.cos(el) * Math.cos(az));
}

/* ------------------------------------------------------------------ */
/* materials                                                           */
/* ------------------------------------------------------------------ */

function makeMaterials(tex, reveal, sway) {
  const skinColor = 0xf3e5e3;
  const armNet = tex.mesh.clone();
  armNet.repeat.set(9, 9);
  armNet.needsUpdate = true;
  const legNet = tex.fishnet.clone();
  legNet.repeat.set(6.5, 6.5);
  legNet.needsUpdate = true;
  const tartan = tex.tartan;
  tartan.repeat.set(1.7, 1.7);
  const hairMap = tex.hair;
  hairMap.repeat.set(1, 3);
  const capMap = tex.hair.clone();
  capMap.repeat.set(1, 12);
  capMap.needsUpdate = true;

  const m = {
    skin: new THREE.MeshPhysicalMaterial({
      color: skinColor,
      roughness: 0.55,
      sheen: 0.5,
      sheenColor: new THREE.Color(0xffc7d6),
      sheenRoughness: 0.5,
    }),
    face: new THREE.MeshPhysicalMaterial({
      map: tex.face.open,
      transparent: true,
      depthWrite: false,
      roughness: 0.45,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    arms: new THREE.MeshPhysicalMaterial({ map: armNet, roughness: 0.6, sheen: 0.4, sheenColor: new THREE.Color(0x8a78a8) }),
    legs: new THREE.MeshPhysicalMaterial({ map: legNet, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffc7d6) }),
    corset: new THREE.MeshPhysicalMaterial({
      map: tex.corset,
      roughness: 0.34,
      clearcoat: 0.45,
      clearcoatRoughness: 0.25,
      sheen: 1,
      sheenColor: new THREE.Color(0x6d52a6),
      sheenRoughness: 0.35,
    }),
    skirt: new THREE.MeshPhysicalMaterial({
      map: tartan,
      roughness: 0.78,
      sheen: 0.6,
      sheenColor: new THREE.Color(0x9a88c8),
      side: THREE.DoubleSide,
    }),
    patent: new THREE.MeshPhysicalMaterial({ color: 0x0b0a0e, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    leather: new THREE.MeshPhysicalMaterial({ color: 0x121016, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x141317, roughness: 0.75 }),
    tread: new THREE.MeshStandardMaterial({ color: 0x34323b, roughness: 0.6 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xf1f1f6, metalness: 1, roughness: 0.14 }),
    hairBlack: new THREE.MeshPhysicalMaterial({
      color: 0x16131c,
      map: hairMap,
      roughness: 0.34,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      sheen: 1,
      sheenColor: new THREE.Color(0x6b5a8e),
      sheenRoughness: 0.3,
      side: THREE.DoubleSide,
    }),
    hairWhite: new THREE.MeshPhysicalMaterial({
      color: 0xf6f3fb,
      map: hairMap,
      roughness: 0.42,
      clearcoat: 0.3,
      sheen: 1,
      sheenColor: new THREE.Color(0xd9ccff),
      side: THREE.DoubleSide,
    }),
    hairCap: new THREE.MeshPhysicalMaterial({
      color: 0x16131c,
      map: capMap,
      side: THREE.DoubleSide,
      roughness: 0.34,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      sheen: 1,
      sheenColor: new THREE.Color(0x6b5a8e),
    }),
    gem: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.05,
      iridescence: 1,
      iridescenceIOR: 1.8,
      emissive: new THREE.Color(0xe6dcff),
      emissiveIntensity: 2.4,
    }),
    horn: new THREE.MeshPhysicalMaterial({
      color: 0x0c0a10,
      roughness: 0.12,
      clearcoat: 1,
      iridescence: 0.8,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [250, 700],
    }),
  };

  for (const key of ['hairBlack', 'hairWhite']) {
    m[key].onBeforeCompile = (shader) => {
      shader.uniforms.uTime = sway.uTime;
      shader.uniforms.uSway = sway.uSway;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aT;\nattribute float aPhase;\nuniform float uTime;\nuniform float uSway;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float swayK = aT * aT * uSway;
          transformed.x += sin( uTime * 1.3 + aPhase ) * 0.03 * swayK;
          transformed.z += sin( uTime * 0.9 + aPhase * 1.7 ) * 0.02 * swayK;`,
        );
    };
    m[key].customProgramCacheKey = () => 'hair-sway';
  }

  Object.values(m).forEach((mat) => applyReveal(mat, reveal));
  return m;
}

/* ------------------------------------------------------------------ */
/* the baddie                                                          */
/* ------------------------------------------------------------------ */

export function createBaddie({ tex, reveal, labelMap }) {
  const sway = { uTime: { value: 0 }, uSway: { value: 1 } };
  const M = makeMaterials(tex, reveal, sway);
  const rand = rng(23);

  const root = new THREE.Group();
  root.name = 'baddie';
  const body = new THREE.Group();
  root.add(body);
  const add = (...objs) => {
    objs.forEach((o) => body.add(o));
    return objs[0];
  };

  /* ---------------- legs & platform boots ---------------- */
  const legs = {
    right: { hip: V(-0.13, 1.95, 0), knee: V(-0.19, 1.17, 0.07), ankle: V(-0.22, 0.37, 0.03), side: -1 },
    left: { hip: V(0.13, 1.95, 0), knee: V(0.145, 1.15, 0.0), ankle: V(0.155, 0.37, -0.02), side: 1 },
  };

  for (const leg of Object.values(legs)) {
    const { hip, knee, ankle, side } = leg;
    add(limb(knee, hip, 0.082, 0.126, M.legs));
    add(limb(ankle, knee, 0.058, 0.08, M.legs));

    // shaft up to just under the knee
    const shaftBottom = ankle.clone().add(V(0, -0.1, 0));
    const shaftTop = ankle.clone().lerp(knee, 0.84);
    add(limb(shaftBottom, shaftTop, 0.092, 0.104, M.patent));
    const shaftDir = shaftTop.clone().sub(shaftBottom).normalize();
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.014, 12, 40), M.patent);
    cuff.position.copy(shaftTop);
    cuff.quaternion.setFromUnitVectors(FWD, shaftDir);
    add(cuff);

    // buckle straps
    for (let i = 0; i < 5; i++) {
      const t = 0.14 + i * 0.17;
      const p = shaftBottom.clone().lerp(shaftTop, t);
      const r = 0.092 + 0.012 * t + 0.006;
      const strap = new THREE.Mesh(new THREE.TorusGeometry(r, 0.011, 8, 40), M.leather);
      strap.position.copy(p);
      strap.quaternion.setFromUnitVectors(FWD, shaftDir);
      strap.scale.set(1, 1, 1.4);
      const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.034, 0.05, 2, 0.006), M.silver);
      buckle.position.copy(p).add(V(side * (r + 0.008), 0, 0.01));
      add(strap, buckle);
    }

    // foot, platform sole with ridges
    const foot = ellipsoid(V(0.098, 0.1, 0.205), M.patent);
    foot.position.set(ankle.x, 0.35, ankle.z + 0.075);
    add(foot);
    const sole = new THREE.Mesh(new RoundedBoxGeometry(0.235, 0.29, 0.47, 4, 0.05), M.sole);
    sole.position.set(ankle.x, 0.145, ankle.z + 0.075);
    add(sole);
    for (const y of [0.06, 0.2]) {
      const ridge = new THREE.Mesh(new RoundedBoxGeometry(0.245, 0.02, 0.48, 2, 0.008), M.tread);
      ridge.position.set(ankle.x, y, ankle.z + 0.075);
      ridge.userData.sample = false;
      add(ridge);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 24), M.silver);
    ring.position.set(ankle.x, 0.43, ankle.z + 0.185);
    ring.rotation.x = -0.5;
    add(ring);
  }

  {
    // leg garter with an O-ring and a little chain on her left thigh
    const { hip, knee } = legs.left;
    const dir = hip.clone().sub(knee).normalize();
    const c = knee.clone().lerp(hip, 0.52);
    const r = THREE.MathUtils.lerp(0.082, 0.126, 0.52) + 0.006;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(r, 0.011, 8, 40), M.patent);
    strap.position.copy(c);
    strap.quaternion.setFromUnitVectors(FWD, dir);
    strap.scale.set(1, 0.9, 1.5);
    const o = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 24), M.silver);
    o.position.copy(c).add(V(0.02, -0.018, r * 0.9 + 0.006));
    o.rotation.y = 0.2;
    const drape = new THREE.QuadraticBezierCurve3(
      o.position.clone().add(V(0.012, -0.018, 0)),
      c.clone().add(V(r * 0.95, -0.1, r * 0.4)),
      c.clone().add(V(r + 0.004, -0.006, -0.02)),
    );
    add(strap, o, new THREE.Mesh(new THREE.TubeGeometry(drape, 24, 0.0045, 6, false), M.silver));
  }

  /* ---------------- torso: corset + sheer mesh ---------------- */
  const torsoProfile = [
    [0.001, 1.86], [0.16, 1.87], [0.235, 1.92], [0.258, 1.99], [0.25, 2.06], [0.222, 2.14],
    [0.2, 2.22], [0.2, 2.3], [0.216, 2.4], [0.236, 2.5], [0.247, 2.58], [0.25, 2.66], [0.252, 2.73],
    [0.258, 2.79], [0.25, 2.835], [0.215, 2.878], [0.15, 2.915], [0.09, 2.94], [0.001, 2.95],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, 96, Math.PI, Math.PI * 2);
  {
    const pos = torsoGeo.attributes.position;
    const uv = torsoGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setY(i, (pos.getY(i) - 1.86) / 1.09);
      pos.setZ(i, pos.getZ(i) * 0.66);
    }
    torsoGeo.computeVertexNormals();
  }
  add(new THREE.Mesh(torsoGeo, M.corset));

  for (const s of [-1, 1]) {
    const shoulder = ellipsoid(V(0.085, 0.08, 0.08), M.arms);
    shoulder.position.set(s * 0.272, 2.785, 0);
    add(shoulder);
  }

  add(limb(V(0, 2.84, -0.005), V(0, 3.2, 0.0), 0.074, 0.066, M.skin));

  /* ---------------- skirt, belt & chains ---------------- */
  {
    const h = 0.46;
    const top = 2.17;
    const geo = new THREE.CylinderGeometry(0.242, 0.4, h, 192, 8, true, Math.PI);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const pleats = 22;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const a = Math.atan2(x, z);
      const down = (h / 2 - y) / h;
      const saw = ((a / (Math.PI * 2)) * pleats) % 1;
      const pleat = ((saw + 1) % 1 - 0.5) * 0.05 * (0.2 + 0.8 * down);
      const r = Math.hypot(x, z);
      const k = (r + pleat) / r;
      pos.setXYZ(i, x * k, y, z * k * 0.74);
      uv.setXY(i, (uv.getX(i) * 4) / 1.7, y); // exactly four tartan repeats around
    }
    geo.computeVertexNormals();
    const skirt = new THREE.Mesh(geo, M.skirt);
    skirt.position.y = top - h / 2;
    add(skirt);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.243, 0.022, 10, 64), M.leather);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.74, 1);
    band.position.y = top;
    add(band);
  }

  {
    const belt = new THREE.Group();
    belt.position.y = 2.09;
    belt.rotation.z = 0.07;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.268, 0.02, 10, 72), M.patent);
    strap.rotation.x = Math.PI / 2;
    strap.scale.set(1, 0.76, 1.3);
    belt.add(strap);
    const stud = new THREE.ConeGeometry(0.014, 0.022, 4);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const dir = V(Math.sin(a), 0, Math.cos(a) * 0.76).normalize();
      const s = new THREE.Mesh(stud, M.silver);
      s.position.set(Math.sin(a) * 0.288, 0, Math.cos(a) * 0.288 * 0.76);
      s.quaternion.setFromUnitVectors(UP, dir);
      s.userData.sample = false;
      belt.add(s);
    }
    const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.07, 0.02, 2, 0.01), M.silver);
    buckle.position.set(0, 0, 0.222);
    belt.add(buckle);
    add(belt);

    // hanging chains built from instanced links
    const link = new THREE.TorusGeometry(0.016, 0.0045, 6, 14);
    const chains = [
      new THREE.QuadraticBezierCurve3(V(0.07, 2.075, 0.212), V(0.25, 1.72, 0.34), V(0.262, 2.085, 0.075)),
      new THREE.QuadraticBezierCurve3(V(-0.02, 2.07, 0.215), V(0.2, 1.6, 0.36), V(0.2, 2.08, 0.15)),
    ];
    chains.forEach((curve) => {
      const count = Math.floor(curve.getLength() / 0.025);
      const inst = new THREE.InstancedMesh(link, M.silver, count);
      const mtx = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const twist = new THREE.Quaternion();
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        q.setFromUnitVectors(V(1, 0, 0), tan);
        twist.setFromAxisAngle(V(1, 0, 0), i % 2 ? Math.PI / 2 : 0);
        q.multiply(twist);
        mtx.compose(p, q, V(1.5, 1, 1));
        inst.setMatrixAt(i, mtx);
      }
      add(inst);
    });
  }

  /* ---------------- arms ---------------- */
  const canArm = new THREE.Group();
  const hipArm = new THREE.Group();
  body.add(canArm, hipArm);

  const finger = (points, radius, material = M.skin) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const g = strandGeometry(curve, {
      radius,
      thick: 1,
      segs: 10,
      radial: 10,
      taper: (t) => 1 - t * 0.25,
    });
    const mesh = new THREE.Mesh(g, material);
    const tip = curve.getPointAt(1);
    const dir = curve.getTangentAt(1);
    const nail = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.8, radius * 3.2, 10), M.patent);
    nail.position.copy(tip).addScaledVector(dir, radius * 1.2);
    nail.quaternion.setFromUnitVectors(UP, dir);
    nail.userData.sample = false;
    return [mesh, nail];
  };

  {
    // her left arm raises the can beside her face
    const S = V(0.285, 2.79, 0);
    const E = V(0.52, 2.36, 0.08);
    const canC = V(0.4, 2.86, 0.33);
    const canR = 0.077;
    const around = (deg, y, r = canR) => V(canC.x + Math.cos(deg * DEG) * r, y, canC.z + Math.sin(deg * DEG) * r);
    const palmDir = V(Math.cos(-25 * DEG), 0, Math.sin(-25 * DEG));
    const palmC = around(-25, 2.82, canR + 0.02);
    const W = palmC.clone().add(V(0, -0.065, 0)).addScaledVector(palmDir, 0.012);

    canArm.add(limb(S, E, 0.068, 0.052, M.arms));
    canArm.add(limb(E, W, 0.052, 0.036, M.arms));

    const palm = ellipsoid(V(0.018, 0.05, 0.04), M.skin);
    palm.position.copy(palmC);
    palm.rotation.y = Math.atan2(palmDir.x, palmDir.z) - Math.PI / 2;
    canArm.add(palm);

    [0, 1, 2, 3].forEach((k) => {
      const y = 2.852 - k * 0.026;
      const end = 78 - k * 9;
      const pts = [];
      for (let a = -12; a <= end; a += (end + 12) / 5) pts.push(around(a, y - a * 0.0001, canR + 0.011));
      canArm.add(...finger(pts, 0.0115));
    });
    canArm.add(
      ...finger([around(-40, 2.84, canR + 0.016), around(-58, 2.88, canR + 0.012), around(-80, 2.905, canR + 0.01)], 0.012),
    );

    const mini = createCan({ labelMap, reveal });
    const s = 0.14;
    mini.scale.setScalar(s);
    mini.position.set(canC.x, canC.y - (2.885 * s) / 2, canC.z);
    mini.rotation.y = -0.18;
    canArm.add(mini);

    // stacked bangles
    const fore = W.clone().sub(E).normalize();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.046 + i * 0.002, 0.0055, 8, 32), M.silver);
      b.position.copy(W).addScaledVector(fore, -0.03 - i * 0.022);
      b.quaternion.setFromUnitVectors(FWD, fore);
      canArm.add(b);
    }
    canArm.userData.pivot = S;
  }

  {
    // her right hand sits on her hip
    const S = V(-0.285, 2.79, 0);
    const E = V(-0.56, 2.38, -0.1);
    const W = V(-0.31, 2.1, 0.04);
    hipArm.add(limb(S, E, 0.068, 0.052, M.arms));
    hipArm.add(limb(E, W, 0.052, 0.036, M.arms));

    const n = V(-0.95, 0, 0.3).normalize();
    const l = V(0.25, -0.4, 0.88);
    l.addScaledVector(n, -l.dot(n)).normalize();
    const w = V().crossVectors(n, l).normalize();
    const palmC = W.clone().addScaledVector(l, 0.045).addScaledVector(n, 0.004);
    const palm = ellipsoid(V(0.04, 0.018, 0.05), M.skin);
    palm.position.copy(palmC);
    palm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w, n, l));
    hipArm.add(palm);

    [-1.5, -0.5, 0.5, 1.5].forEach((k) => {
      const base = palmC.clone().addScaledVector(l, 0.04).addScaledVector(w, k * 0.019);
      const len = 0.075 - Math.abs(k + 0.5) * 0.008;
      const mid = base.clone().addScaledVector(l, len * 0.55).addScaledVector(n, -0.006);
      const tip = base.clone().addScaledVector(l, len).addScaledVector(n, -0.018);
      hipArm.add(...finger([base, mid, tip], 0.011));
    });
    const tb = palmC.clone().addScaledVector(w, -0.035);
    hipArm.add(...finger([tb, tb.clone().addScaledVector(l, -0.03).addScaledVector(w, -0.02), tb.clone().addScaledVector(l, -0.06).addScaledVector(w, -0.015)], 0.012));

    // spiked leather cuff
    const fore = W.clone().sub(E).normalize();
    const cuffC = W.clone().addScaledVector(fore, -0.05);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.048, 0.06, 32, 1, false), M.patent);
    orient(cuff, cuffC, cuffC.clone().add(fore));
    hipArm.add(cuff);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, fore);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dir = V(Math.cos(a), 0, Math.sin(a)).applyQuaternion(q);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.03, 8), M.silver);
      spike.position.copy(cuffC).addScaledVector(dir, 0.058);
      spike.quaternion.setFromUnitVectors(UP, dir);
      spike.userData.sample = false;
      hipArm.add(spike);
    }
    hipArm.userData.pivot = S;
  }

  /* ---------------- choker & necklace ---------------- */
  {
    const y = 2.975;
    const choker = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.019, 12, 48), M.patent);
    choker.rotation.x = Math.PI / 2;
    choker.position.set(0, y, 0.004);
    add(choker);
    for (let i = 0; i < 11; i++) {
      const a = (-110 + i * 22) * DEG;
      const dir = V(Math.sin(a), 0, Math.cos(a));
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.034, 10), M.silver);
      spike.position.set(dir.x * 0.095, y, dir.z * 0.095 + 0.004);
      spike.quaternion.setFromUnitVectors(UP, dir);
      spike.userData.sample = false;
      add(spike);
    }
    const oring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0055, 10, 28), M.silver);
    oring.position.set(0, y - 0.03, 0.102);
    add(oring);

    const cross = (x, yc, z, s) => {
      const v = new THREE.Mesh(new RoundedBoxGeometry(0.018 * s, 0.085 * s, 0.01 * s, 2, 0.003 * s), M.silver);
      const h = new THREE.Mesh(new RoundedBoxGeometry(0.056 * s, 0.018 * s, 0.01 * s, 2, 0.003 * s), M.silver);
      v.position.set(x, yc, z);
      h.position.set(x, yc + 0.018 * s, z);
      add(v, h);
    };
    cross(0, y - 0.075, 0.104, 0.55);

    const chain = new THREE.CatmullRomCurve3([
      V(-0.08, 2.94, -0.01), V(-0.125, 2.86, 0.145), V(-0.07, 2.74, 0.18), V(0, 2.69, 0.19),
      V(0.07, 2.74, 0.18), V(0.125, 2.86, 0.145), V(0.08, 2.94, -0.01),
    ]);
    add(new THREE.Mesh(new THREE.TubeGeometry(chain, 80, 0.0045, 6, false), M.silver));
    cross(0, 2.625, 0.195, 1);
  }

  /* ---------------- head ---------------- */
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 3.05, 0);
  body.add(headGroup);
  const skull = new THREE.Group();
  skull.position.set(0, 0.36, 0.02);
  headGroup.add(skull);

  const headGeo = sculptHead(new THREE.SphereGeometry(HEAD_R, 96, 72), HEAD_R);
  const head = new THREE.Mesh(headGeo, M.skin);
  skull.add(head);

  // face decal: front part of the same sculpt, planar-projected UVs
  const faceGeo = sculptHead(
    new THREE.SphereGeometry(HEAD_R, 96, 72, Math.PI / 2 - 1.45, 2.9, 0.16 * Math.PI, 0.84 * Math.PI),
    HEAD_R,
    1.003,
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

  // piercings: septum, snake bites, brow barbell, nose stud
  {
    const septum = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0036, 10, 36), M.silver);
    septum.position.copy(onFace(512, 700, 0.0)).add(V(0, -0.02, 0.002));
    septum.rotation.x = -0.25;
    skull.add(septum);
    for (const s of [-1, 1]) {
      const bite = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, 8, 28), M.silver);
      bite.position.copy(onFace(512 + s * 66, 846, -0.002)).add(V(0, -0.006, 0));
      bite.rotation.set(-0.35, 0, s * 0.3);
      skull.add(bite);
    }
    for (const [px, py] of [[722, 372], [744, 426]]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 14, 10), M.silver);
      ball.position.copy(onFace(px, py, 0.005));
      skull.add(ball);
    }
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 12, 8), M.silver);
    stud.position.copy(onFace(478, 680, 0.004));
    skull.add(stud);

    // rhinestone face gems under the outer corners of her eyes
    const gem = new THREE.SphereGeometry(1, 12, 8);
    for (const s of [-1, 1]) {
      [[242, 608, 0.0072], [270, 590, 0.0056], [220, 628, 0.0048], [290, 570, 0.0042]].forEach(([dx, py, r]) => {
        const m = new THREE.Mesh(gem, M.gem);
        m.scale.setScalar(r);
        m.position.copy(onFace(512 + s * dx, py, r * 0.4));
        m.userData.sample = false;
        skull.add(m);
      });
    }
    skull.traverse((o) => {
      if (o !== head && o.isMesh && o.material === M.silver) o.userData.sample = false;
    });
  }

  /* ---------------- hair ---------------- */
  {
    // Sleek scalp shell. The sphere's poles point front/back, so its parallels
    // run from the middle part down the sides (the way the hair is combed) and
    // the UV seam lands exactly on the part. The face opening and everything
    // under the jaw are cut away.
    const capGeo = new THREE.SphereGeometry(HEAD_R * 1.08, 96, 64, -Math.PI / 2, Math.PI * 2, 0, Math.PI);
    capGeo.rotateX(Math.PI / 2);
    {
      const pos = capGeo.attributes.position;
      const idx = capGeo.index.array;
      const keep = [];
      const c = V(0, 0, 0);
      for (let i = 0; i < idx.length; i += 3) {
        c.set(0, 0, 0);
        for (let k = 0; k < 3; k++) c.add(V(pos.getX(idx[i + k]), pos.getY(idx[i + k]), pos.getZ(idx[i + k])));
        c.normalize();
        const az = Math.abs(Math.atan2(c.x, c.z)) / DEG;
        const el = Math.asin(c.y) / DEG;
        const hairline = 26 - 20 * Math.min(1, az / 64) ** 2;
        const inFace = az < 64 && el < hairline;
        const underJaw = c.y < -0.28 - 0.42 * (1 - c.z) * 0.5;
        if (!inFace && !underJaw) keep.push(idx[i], idx[i + 1], idx[i + 2]);
      }
      capGeo.setIndex(keep);
    }
    capGeo.scale(1, HEAD_SY, 1);
    skull.add(new THREE.Mesh(capGeo, M.hairCap));

    const headC = V(0, 3.05 + 0.36, 0.02); // skull centre in body space
    const local = (x, y, z) => V(x, y, z).sub(headC);
    const black = [];
    const white = [];

    const frontStrand = (phi, sgn, layer) => {
      const f = (phi - 50) / 46;
      const e0 = 28 + f * 24;
      const j = () => (rand() - 0.5) * 0.02;
      const pts = [
        sph(0, e0, HEAD_R * 1.05).add(V(sgn * 0.012, 0, 0)),
        sph(sgn * phi * 0.45, e0 - 6, HEAD_R * (1.07 + layer * 0.015)),
        sph(sgn * phi * 0.85, 16 - f * 6, HEAD_R * (1.09 + layer * 0.015)),
        sph(sgn * phi, -14, HEAD_R * (1.1 + layer * 0.015)),
        local(sgn * (0.3 + f * 0.06) + j(), 3.12, 0.2 - f * 0.12 + j()),
        local(sgn * (0.255 + f * 0.06) + j(), 2.93, 0.2 - f * 0.06),
        local(sgn * (0.215 + f * 0.07) + j(), 2.72, 0.225 - f * 0.03),
        local(sgn * (0.2 + f * 0.07) + j(), 2.44 - rand() * 0.1, 0.21 - f * 0.02),
      ];
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    };

    const backStrand = (phi, sgn, layer) => {
      const f = (phi - 96) / 84;
      const e0 = 56 + f * 32;
      const sin = Math.sin(phi * DEG);
      const cos = Math.cos(phi * DEG);
      const j = () => (rand() - 0.5) * 0.025;
      const pts = [
        sph(0, e0, HEAD_R * 1.05).add(V(sgn * 0.012, 0, 0)),
        sph(sgn * phi * (0.6 + f * 0.4), e0 * 0.5 + 8 + rand() * 6, HEAD_R * (1.075 + layer * 0.015)),
        sph(sgn * phi, 0, HEAD_R * (1.1 + layer * 0.015)),
        sph(sgn * phi, -30, HEAD_R * (1.12 + layer * 0.015)),
        local(sgn * sin * 0.3 + j(), 2.96, Math.min(cos * 0.34, -0.1) - 0.02),
        local(sgn * sin * 0.27 + j(), 2.72, Math.min(cos * 0.3, -0.2) + j()),
        local(sgn * sin * 0.21 + j(), 2.3 - f * 0.14 - rand() * 0.06, Math.min(cos * 0.25, -0.2)),
      ];
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    };

    for (const sgn of [-1, 1]) {
      for (let layer = 0; layer < 2; layer++) {
        const off = layer * 1.6;
        for (let phi = 50 + off * 0.8; phi <= 95; phi += 2.6) {
          const isWhite = phi < 58;
          const g = strandGeometry(frontStrand(phi, sgn, layer), {
            radius: isWhite ? 0.034 : 0.033,
            width: 1.45,
            thick: 0.4,
            taper: hairTaper,
            phase: rand() * Math.PI * 2,
          });
          (isWhite ? white : black).push(g);
        }
        for (let phi = 96 + off; phi <= 180; phi += 2.8) {
          black.push(
            strandGeometry(backStrand(phi, sgn, layer), {
              radius: 0.042,
              width: 1.3,
              thick: 0.42,
              taper: hairTaper,
              phase: rand() * Math.PI * 2,
            }),
          );
        }
      }
    }
    skull.add(new THREE.Mesh(mergeGeometries(black), M.hairBlack));
    skull.add(new THREE.Mesh(mergeGeometries(white), M.hairWhite));

    // little devil horns poking through the hair
    for (const s of [-1, 1]) {
      const r0 = sph(s * 36, 58, HEAD_R * 0.98);
      const curve = new THREE.CatmullRomCurve3([
        r0,
        r0.clone().add(V(s * 0.04, 0.1, -0.005)),
        r0.clone().add(V(s * 0.095, 0.175, -0.05)),
        r0.clone().add(V(s * 0.11, 0.2, -0.12)),
      ]);
      skull.add(new THREE.Mesh(strandGeometry(curve, { radius: 0.052, thick: 1, width: 1, segs: 24, radial: 16, taper: hornTaper }), M.horn));
    }
  }

  /* ---------------- animation ---------------- */
  const look = { yaw: 0, pitch: 0 };
  let blinkTimer = 2.5;
  let blinkHold = 0;
  let spin = 0;
  let spinDir = 1;

  function update(t, dt, pointer) {
    sway.uTime.value = t;

    if (spin > 0) spin = Math.max(0, spin - dt / 1.1);
    const s = 1 - spin;
    const e = s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
    body.rotation.y = Math.sin(t * 0.55) * 0.1 + (spin > 0 ? e * Math.PI * 2 * spinDir : 0);
    body.position.y = spin > 0 ? Math.sin(Math.PI * s) * 0.18 : 0;
    body.rotation.z = Math.sin(t * 1.1) * 0.012;

    look.yaw += (pointer.x * 0.32 - look.yaw) * Math.min(1, dt * 3);
    look.pitch += (-pointer.y * 0.1 - look.pitch) * Math.min(1, dt * 3);
    headGroup.rotation.set(0.04 + look.pitch, look.yaw - body.rotation.y * 0.6, 0.07 + Math.sin(t * 0.9) * 0.025, 'YXZ');

    const armSway = Math.sin(t * 1.3) * 0.02;
    canArm.position.copy(canArm.userData.pivot);
    canArm.rotation.z = armSway;
    canArm.position.sub(canArm.userData.pivot.clone().applyEuler(canArm.rotation));
    const hipBreath = Math.sin(t * 2) * 0.01;
    hipArm.position.copy(hipArm.userData.pivot);
    hipArm.rotation.z = hipBreath;
    hipArm.position.sub(hipArm.userData.pivot.clone().applyEuler(hipArm.rotation));

    blinkTimer -= dt;
    if (blinkTimer <= 0 && blinkHold <= 0) {
      blinkHold = 0.12;
      blinkTimer = 2 + Math.random() * 3.5;
    }
    if (blinkHold > 0) blinkHold -= dt;
    const closed = blinkHold > 0;
    const want = closed ? tex.face.closed : tex.face.open;
    if (M.face.map !== want) M.face.map = want;
  }

  function hype() {
    if (spin > 0) return;
    spin = 1;
    spinDir = Math.random() > 0.5 ? 1 : -1;
  }

  return { root, update, hype, height: BADDIE_HEIGHT, sway };
}
