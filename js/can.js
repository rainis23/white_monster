// A procedurally modelled 16oz can: lathe-turned aluminium ends, a printed
// label wrapped around the body, and an extruded pull tab.
import * as THREE from 'three';
import { applyReveal } from './reveal.js';

export const CAN_HEIGHT = 2.885;
export const CAN_RADIUS = 0.55;

const v2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));

function roundedTabShape() {
  const s = new THREE.Shape();
  const w = 0.1;
  const top = 0.15;
  const bottom = -0.2;
  s.moveTo(-w, bottom + 0.06);
  s.quadraticCurveTo(-w, bottom, -w + 0.05, bottom - 0.01);
  s.quadraticCurveTo(0, bottom - 0.03, w - 0.05, bottom - 0.01);
  s.quadraticCurveTo(w, bottom, w, bottom + 0.06);
  s.lineTo(w, top - 0.08);
  s.quadraticCurveTo(w, top, 0, top);
  s.quadraticCurveTo(-w, top, -w, top - 0.08);
  s.closePath();
  const hole = new THREE.Path();
  hole.absellipse(0, 0.065, 0.058, 0.05, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

function tearPanelShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.13, 0);
  s.quadraticCurveTo(-0.15, 0.13, 0, 0.17);
  s.quadraticCurveTo(0.15, 0.13, 0.13, 0);
  s.quadraticCurveTo(0, -0.05, -0.13, 0);
  return s;
}

export function createCan({ labelMap, reveal }) {
  const group = new THREE.Group();
  group.name = 'can';
  const R = CAN_RADIUS;
  const yB = 0.26;
  const yT = 2.5;

  const label = new THREE.MeshPhysicalMaterial({
    map: labelMap,
    roughness: 0.32,
    metalness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.4,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
  });
  const alu = new THREE.MeshStandardMaterial({ color: 0xe4e6eb, metalness: 1, roughness: 0.26 });
  const aluDark = new THREE.MeshStandardMaterial({ color: 0xaeb1ba, metalness: 1, roughness: 0.34 });
  [label, alu, aluDark].forEach((m) => applyReveal(m, reveal));

  // thetaStart = PI puts u = 0.5 (the front of the label art) on +z
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, yT - yB, 160, 1, true, Math.PI, Math.PI * 2), label);
  body.position.y = (yT + yB) / 2;

  const bottom = new THREE.Mesh(
    new THREE.LatheGeometry(
      v2([
        [0.001, 0.16], [0.18, 0.15], [0.3, 0.12], [0.37, 0.07], [0.4, 0.02], [0.415, 0.0],
        [0.44, 0.0], [0.46, 0.012], [0.49, 0.05], [0.52, 0.11], [0.54, 0.18], [0.548, 0.23], [R, yB],
      ]),
      96,
    ),
    alu,
  );

  const top = new THREE.Mesh(
    new THREE.LatheGeometry(
      v2([
        [R, yT], [0.548, 2.54], [0.54, 2.58], [0.52, 2.64], [0.495, 2.7], [0.472, 2.75],
        [0.462, 2.79], [0.462, 2.82], [0.468, 2.845], [0.47, 2.862], [0.465, 2.876],
        [0.455, 2.882], [0.446, 2.876], [0.442, 2.86], [0.438, 2.835], [0.43, 2.822],
        [0.418, 2.82], [0.4, 2.826], [0.3, 2.83], [0.15, 2.832], [0.001, 2.833],
      ]),
      96,
    ),
    alu,
  );

  const tab = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedTabShape(), {
      depth: 0.01,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 2,
      curveSegments: 24,
    }),
    alu,
  );
  // shape +y ends up pointing to -z, so the finger ring sits at the back
  tab.rotation.x = -Math.PI / 2;
  tab.position.set(0, 2.842, 0.0);

  const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.03, 20), aluDark);
  rivet.position.set(0, 2.845, 0.035);

  const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(tearPanelShape(), { depth: 0.004, bevelEnabled: false }), aluDark);
  panel.rotation.x = -Math.PI / 2;
  panel.position.set(0, 2.833, 0.14);
  panel.scale.set(1, -1, 1);

  group.add(body, bottom, top, tab, rivet, panel);
  group.traverse((o) => {
    if (o.isMesh) o.userData.sample = o === body || o === bottom || o === top;
  });
  group.userData.materials = { label, alu, aluDark };
  return group;
}
