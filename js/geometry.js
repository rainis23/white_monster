// Geometry helpers used to build the avatar out of lathes and swept tubes.
import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = V(0, 1, 0);
export const FWD = V(0, 0, 1);
export const DEG = Math.PI / 180;

const smooth = (t) => t * t * (3 - 2 * t);

// Capsule along +y from 0..len: radius r0 at the bottom, r1 at the top, with an
// optional bulge (rMid at tMid) for calves and forearms. UVs are in world units
// so tiled fabrics keep one scale across every limb.
export function limbGeometry(r0, r1, len, { rMid = null, tMid = 0.5, radial = 28 } = {}) {
  const radiusAt = (t) => {
    if (rMid === null) return r0 + (r1 - r0) * t;
    return t < tMid ? r0 + (rMid - r0) * smooth(t / tMid) : rMid + (r1 - rMid) * smooth((t - tMid) / (1 - tMid));
  };
  const pts = [];
  const cap = 8;
  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r0), Math.sin(a) * r0));
  }
  for (let i = 1; i < 12; i++) pts.push(new THREE.Vector2(radiusAt(i / 12), (len * i) / 12));
  for (let i = 0; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r1), len + Math.sin(a) * r1));
  }
  // phiStart = PI keeps the texture seam on the back of the limb
  const g = new THREE.LatheGeometry(pts, radial, Math.PI);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * ((r0 + r1) / 2);
  for (let i = 0; i < pos.count; i++) uv.setXY(i, uv.getX(i) * circ, pos.getY(i));
  return g;
}

export function orient(obj, from, to, axis = UP) {
  obj.position.copy(from);
  obj.quaternion.setFromUnitVectors(axis, to.clone().sub(from).normalize());
  return obj;
}

export function limb(a, b, ra, rb, material, opts) {
  return orient(new THREE.Mesh(limbGeometry(ra, rb, a.distanceTo(b), opts), material), a, b);
}

export function ellipsoid(radii, material, segs = 32) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, segs, Math.round(segs * 0.75)), material);
  m.scale.copy(radii);
  return m;
}

// A flattened, tapering tube along a curve (hair clumps, straps, tails,
// fingers). aT runs 0 at the root to 1 at the tip and drives vertex sway;
// aPhase de-syncs neighbours.
export function strandGeometry(curve, { radius, width = 1, thick = 0.5, segs = 36, radial = 8, taper = () => 1, phase = 0 }) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const aT = [];
  const aPhase = [];
  const indices = [];
  const pts = curve.getSpacedPoints(segs);
  const O = V();
  const S = V();
  const W = V();
  const n = V();
  const prevS = V(1, 0, 0);
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
      uvs.push(t, j / radial);
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

// anime hair clump: widest a little below the root, then a long taper to a sharp point
export const clumpTaper = (t) => Math.min(1, 0.45 + t * 5) * Math.pow(1 - t, 0.85);
export const hornTaper = (t) => 1 - t * 0.94;
