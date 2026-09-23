// A 16 fl oz (473 mL) can modelled from real dimensions: a 66 mm body, a
// stepped die-necked shoulder, a rolled double seam, a countersunk 202 lid
// with a riveted pull tab and scored tear panel, and a domed base with a
// standing ring. The printed wall uses metallic silver ink under clear varnish.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyReveal } from './reveal.js';

export const CAN_HEIGHT = 2.8;
const MM = CAN_HEIGHT / 157; // scene units per millimetre
export const CAN_RADIUS = 33.1 * MM;

// lathe profiles in millimetres: [radius, height]
const DOME = [
  [0, 10.0], [8, 9.8], [14, 9.0], [18.5, 7.6], [21.5, 5.6], [23.2, 3.4], [24.0, 1.4], [24.6, 0.3], [25.3, 0.0],
];
const WALL = [
  [25.3, 0.0], [26.5, 0.25], [28.2, 1.2], [30.0, 3.0], [31.4, 5.2], [32.4, 7.8], [32.95, 10.4], [33.1, 12.5],
  [33.1, 140.5], [33.0, 141.6], [32.6, 142.9], [32.0, 143.9], [31.6, 144.4], [31.3, 145.1], [30.6, 146.1],
  [30.2, 146.6], [29.9, 147.3], [29.3, 148.2], [28.95, 148.7], [28.7, 149.4], [28.2, 150.3], [27.9, 150.9],
  [27.75, 151.6], [27.7, 152.4],
];
const LID = [
  [27.7, 152.4], [28.1, 153.2], [28.45, 154.3], [28.6, 155.5], [28.45, 156.5], [28.0, 157.0], [27.4, 157.0],
  [27.0, 156.6], [26.8, 155.8], [26.5, 154.2], [26.0, 152.6], [25.6, 151.8], [25.1, 151.6], [24.7, 151.9],
  [24.5, 152.6], [24.3, 153.1], [22, 153.3], [12, 153.4], [0, 153.45],
];
const LID_Y = 153.45;

const lathe = (pts, segments, phiStart = 0) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001) * MM, y * MM)),
    segments,
    phiStart,
  );

function tabShape() {
  // pull tab, in mm; +y points at the tear panel (the nose), -y at the finger ring
  const s = new THREE.Shape();
  s.moveTo(-4.2, 8.2);
  s.quadraticCurveTo(0, 10.2, 4.2, 8.2);
  s.quadraticCurveTo(6.6, 6.8, 6.8, 2);
  s.lineTo(6.8, -12.5);
  s.quadraticCurveTo(6.8, -18.6, 0, -18.8);
  s.quadraticCurveTo(-6.8, -18.6, -6.8, -12.5);
  s.lineTo(-6.8, 2);
  s.quadraticCurveTo(-6.6, 6.8, -4.2, 8.2);

  const ring = new THREE.Path();
  ring.moveTo(-4.6, -6.8);
  ring.lineTo(4.6, -6.8);
  ring.quadraticCurveTo(5, -16, 0, -16.2);
  ring.quadraticCurveTo(-5, -16, -4.6, -6.8);
  s.holes.push(ring);

  // U-shaped slot that frees the rivet island
  const slot = new THREE.Path();
  slot.moveTo(-3.6, 4.4);
  slot.lineTo(-3.6, -3.6);
  slot.quadraticCurveTo(0, -5.2, 3.6, -3.6);
  slot.lineTo(3.6, 4.4);
  slot.lineTo(2.9, 4.4);
  slot.lineTo(2.9, -3.0);
  slot.quadraticCurveTo(0, -4.3, -2.9, -3.0);
  slot.lineTo(-2.9, 4.4);
  slot.closePath();
  s.holes.push(slot);
  return s;
}

function tearPanelCurve() {
  // the scored opening, wide at the rim and narrowing toward the rivet (mm, lid plane)
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const x = Math.cos(a) * 8.2;
    const y = 12.4 + Math.sin(a) * 8.6;
    // pinch the end nearest the rivet
    const pinch = y < 12.4 ? 1 - ((12.4 - y) / 8.6) * 0.45 : 1;
    pts.push(new THREE.Vector3(x * pinch * MM, 0, y * MM));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

export function createCan({ label, reveal }) {
  const group = new THREE.Group();
  group.name = 'can';

  const print = new THREE.MeshPhysicalMaterial({
    map: label.map,
    roughnessMap: label.orm,
    metalnessMap: label.orm,
    roughness: 1,
    metalness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.045,
    envMapIntensity: 2.2,
  });
  // metal needs something bright to reflect, so the can gets a stronger studio env than the stage
  const alu = new THREE.MeshPhysicalMaterial({ color: 0xdfe1e6, metalness: 1, roughness: 0.24, envMapIntensity: 2.2 });
  const aluSatin = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd3, metalness: 1, roughness: 0.42, envMapIntensity: 2 });
  const tabMat = new THREE.MeshPhysicalMaterial({ color: 0xe6e8ec, metalness: 1, roughness: 0.18, envMapIntensity: 2.2 });
  [print, alu, aluSatin, tabMat].forEach((m) => applyReveal(m, reveal));

  // printed wall: phiStart = PI puts the middle of the artwork (u = 0.5) on +z
  const wallGeo = lathe(WALL, 180, Math.PI);
  {
    const pos = wallGeo.attributes.position;
    const uv = wallGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / (157 * MM));
  }
  const wall = new THREE.Mesh(wallGeo, print);
  const dome = new THREE.Mesh(lathe(DOME, 96), aluSatin);
  const lid = new THREE.Mesh(lathe(LID, 128), alu);

  // tab: extruded, bevelled for the rolled edge, sitting on the lid
  const tab = new THREE.Mesh(
    new THREE.ExtrudeGeometry(tabShape(), {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.35,
      bevelSegments: 3,
      curveSegments: 20,
    }),
    tabMat,
  );
  tab.scale.setScalar(MM);
  tab.rotation.x = -Math.PI / 2; // shape +y -> scene -z; flip so the nose points forward
  tab.rotation.z = Math.PI;
  tab.position.y = (LID_Y + 0.55) * MM;

  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(2.3 * MM, 2.9 * MM, 1.2 * MM, 24), alu);
  rivet.position.y = (LID_Y + 0.9) * MM;

  const panel = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshPhysicalMaterial({ color: 0xd2d5db, metalness: 1, roughness: 0.3, envMapIntensity: 2 }),
  );
  applyReveal(panel.material, reveal);
  panel.rotation.x = -Math.PI / 2;
  panel.scale.set(7.4 * MM, 8.4 * MM, 1);
  panel.position.set(0, (LID_Y + 0.06) * MM, 12.6 * MM);
  const score = new THREE.Mesh(new THREE.TubeGeometry(tearPanelCurve(), 96, 0.28 * MM, 6, true), aluSatin);
  score.position.y = (LID_Y + 0.02) * MM;

  group.add(wall, dome, lid, tab, rivet, panel, score);
  group.traverse((o) => {
    if (o.isMesh) o.userData.sample = o === wall || o === dome || o === lid;
  });
  return group;
}

/* ------------------------------------------------------------------ */
/* optional: a downloaded .glb model instead of the procedural can     */
/* ------------------------------------------------------------------ */

let gltfPromise = null;

// Loads a model once, then returns a function that makes a normalised copy of
// it (upright, base at y = 0, CAN_HEIGHT tall, centred) wired to `reveal`.
export function loadCanModel(url) {
  if (!gltfPromise) gltfPromise = new GLTFLoader().loadAsync(url);
  return gltfPromise.then((gltf) => (reveal) => {
    const src = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(src);
    const size = box.getSize(new THREE.Vector3());
    const s = CAN_HEIGHT / size.y;
    const center = box.getCenter(new THREE.Vector3());
    src.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    src.scale.multiplyScalar(s);
    const group = new THREE.Group();
    group.name = 'can';
    group.add(src);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const clones = mats.map((m) => applyReveal(m.clone(), reveal));
      o.material = Array.isArray(o.material) ? clones : clones[0];
      o.userData.sample = true;
    });
    return group;
  });
}
