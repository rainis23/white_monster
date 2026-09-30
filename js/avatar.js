// The baddie: a realistic, rigged avatar (built by tools/avatar from
// MakeHuman's CC0 base mesh) in the White Monster palette. She's posed with
// one hand on her hip and the other raising the scanned can, breathes, follows
// the pointer with her head and eyes, and spins when tapped.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyReveal } from './reveal.js';
import { createCan, CAN_REAL_HEIGHT } from './can.js';

const DIR = 'models/avatar/';
export const AVATAR_SCALE = 2.2; // the model is in metres
export const BADDIE_HEIGHT = 1.97 * AVATAR_SCALE; // soles to horn tips

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const bone = (name) => THREE.PropertyBinding.sanitizeNodeName(name);

function fishnetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = '#08070a';
  g.lineWidth = 7;
  for (let k = -4; k <= 8; k++) {
    g.beginPath();
    g.moveTo(k * 64, 0);
    g.lineTo(k * 64 + 256, 256);
    g.moveTo(k * 64, 0);
    g.lineTo(k * 64 - 256, 256);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.2, 3.2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function loadMaterials(manager, anisotropy, msaa) {
  const loader = new THREE.TextureLoader(manager);
  const names = ['skin.jpg', 'face.png', 'eye.jpg', 'lash.png', 'sock.jpg', 'sweater.jpg', 'hair.png'];
  const maps = Object.fromEntries(
    await Promise.all(
      names.map(async (n) => {
        const t = await loader.loadAsync(DIR + n);
        t.flipY = false; // glTF UV convention
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = anisotropy;
        return [n.split('.')[0], t];
      }),
    ),
  );
  maps.hair.wrapS = THREE.RepeatWrapping;
  const fishnet = fishnetTexture();
  fishnet.anisotropy = anisotropy;
  const hair = {
    map: maps.hair,
    alphaTest: 0.35,
    alphaToCoverage: msaa,
    vertexColors: true,
    side: THREE.DoubleSide,
    sheen: 0.4,
  };
  return {
    maps: [...Object.values(maps), fishnet],
    materials: {
      skin: new THREE.MeshPhysicalMaterial({ map: maps.skin, roughness: 0.55, sheen: 0.4, sheenColor: 0xffd0d8 }),
      face: new THREE.MeshPhysicalMaterial({
        map: maps.face,
        transparent: true,
        depthWrite: false,
        roughness: 0.45,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      eye: new THREE.MeshPhysicalMaterial({ map: maps.eye, roughness: 0.05, clearcoat: 1 }),
      lash: new THREE.MeshStandardMaterial({ map: maps.lash, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8 }),
      fishnet: new THREE.MeshStandardMaterial({ map: fishnet, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
      sock: new THREE.MeshPhysicalMaterial({ map: maps.sock, roughness: 0.85, sheen: 0.6, sheenColor: 0xffffff }),
      sweater: new THREE.MeshPhysicalMaterial({
        map: maps.sweater,
        roughness: 0.9,
        sheen: 0.8,
        sheenColor: 0xffffff,
        side: THREE.DoubleSide,
      }),
      skirt: new THREE.MeshPhysicalMaterial({
        color: 0x121115,
        roughness: 0.7,
        sheen: 0.5,
        sheenColor: 0x8888aa,
        side: THREE.DoubleSide,
      }),
      boot: new THREE.MeshPhysicalMaterial({ color: 0x0c0b0e, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
      sole: new THREE.MeshStandardMaterial({ color: 0x141317, roughness: 0.7 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 1, roughness: 0.2 }),
      leather: new THREE.MeshPhysicalMaterial({
        color: 0x0d0c10,
        roughness: 0.32,
        clearcoat: 0.7,
        clearcoatRoughness: 0.2,
        side: THREE.DoubleSide,
      }),
      horn: new THREE.MeshPhysicalMaterial({
        color: 0x0b0a0d,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        sheen: 0.4,
        sheenColor: 0x9a90b0,
      }),
      hair: new THREE.MeshPhysicalMaterial({ ...hair, color: 0xece9ef, roughness: 0.5, sheenColor: 0xffffff, sheenRoughness: 0.4 }),
      hairCap: new THREE.MeshStandardMaterial({ color: 0xe2dee6, roughness: 0.6 }),
    },
  };
}

// ---------------------------------------------------------------- posing
// Every bone's rest rotation is the identity, so rest directions come straight
// from joint positions, and a bone's model-space rotation is the product of the
// local rotations above it.
class Poser {
  constructor(model, bones) {
    this.model = model;
    this.b = bones;
    this.rest = {};
    for (const [name, b] of Object.entries(bones)) this.rest[name] = this.pos(b);
  }

  quat(b) {
    const q = Q();
    for (let o = b; o && o !== this.model; o = o.parent) q.premultiply(o.quaternion);
    return q;
  }

  pos(b) {
    // model-space joint position under the current pose
    const chain = [];
    for (let o = b; o && o !== this.model; o = o.parent) chain.unshift(o);
    const p = V();
    const q = Q();
    for (const o of chain) {
      p.add(o.position.clone().applyQuaternion(q));
      q.multiply(o.quaternion);
    }
    return p;
  }

  // set a bone's model-space rotation (its local rotation is solved for)
  setModelQuat(name, qModel) {
    const b = this.b[name];
    const parent = this.quat(b.parent);
    b.quaternion.copy(parent.invert().multiply(qModel));
  }

  // turn `name` so the rest segment `from -> to` points along `dir` (model space)
  aim(name, from, to, dir) {
    const b = this.b[name];
    const parentQ = this.quat(b.parent);
    const restDir = this.rest[to].clone().sub(this.rest[from]).normalize().applyQuaternion(parentQ);
    const delta = Q().setFromUnitVectors(restDir, dir.clone().normalize());
    this.setModelQuat(name, delta.multiply(parentQ));
  }

  // two-bone IK: wrist to `target`, elbow bent toward `pole`
  arm(s, target, pole) {
    const S = this.pos(this.b[`upperarm01${s}`]);
    const L1 = this.rest[`lowerarm01${s}`].distanceTo(this.rest[`upperarm01${s}`]);
    const L2 = this.rest[`wrist${s}`].distanceTo(this.rest[`lowerarm01${s}`]);
    const d = target.clone().sub(S);
    const dist = THREE.MathUtils.clamp(d.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    d.normalize();
    const cosA = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
    const n = pole.clone().sub(d.clone().multiplyScalar(pole.dot(d))).normalize();
    const elbow = S.clone()
      .addScaledVector(d, L1 * cosA)
      .addScaledVector(n, L1 * Math.sqrt(Math.max(0, 1 - cosA * cosA)));
    const wrist = S.clone().addScaledVector(d, dist);
    this.aim(`upperarm01${s}`, `upperarm01${s}`, `lowerarm01${s}`, elbow.clone().sub(S));
    this.aim(`lowerarm01${s}`, `lowerarm01${s}`, `wrist${s}`, wrist.clone().sub(elbow));
  }

  // rest-pose frame of a hand: fingers direction, palm normal, knuckle axis
  handFrame(s) {
    const w = this.rest[`wrist${s}`];
    const dir = this.rest[`finger3-1${s}`].clone().sub(w).normalize();
    const knuckles = this.rest[`finger2-1${s}`].clone().sub(this.rest[`finger5-1${s}`]).normalize();
    const palm = new THREE.Vector3().crossVectors(dir, knuckles).normalize();
    // the palm faces the thigh at rest
    if (palm.x * Math.sign(w.x) > 0) palm.negate();
    knuckles.crossVectors(palm, dir).normalize();
    return { dir, palm, knuckles };
  }

  // orient a hand: fingers along `dir`, palm facing `palm` (model space)
  hand(s, dir, palm) {
    const r = this.handFrame(s);
    const d = dir.clone().normalize();
    const p = palm.clone().sub(d.clone().multiplyScalar(palm.dot(d))).normalize();
    const m0 = new THREE.Matrix4().makeBasis(r.dir, r.palm, V().crossVectors(r.dir, r.palm));
    const m1 = new THREE.Matrix4().makeBasis(d, p, V().crossVectors(d, p));
    this.setModelQuat(`wrist${s}`, Q().setFromRotationMatrix(m1.multiply(m0.transpose())));
  }

  // curl the fingers toward the palm (angles in degrees for the three joints)
  curl(s, angles, thumb = [20, 15, 10]) {
    const r = this.handFrame(s);
    const axis = V().crossVectors(r.dir, r.palm).normalize(); // positive turns fingers into the palm
    for (let f = 2; f <= 5; f++) {
      angles.forEach((a, j) => {
        const b = this.b[`finger${f}-${j + 1}${s}`];
        if (b) b.quaternion.setFromAxisAngle(axis, THREE.MathUtils.degToRad(a * (1 - (f - 2) * 0.04)));
      });
    }
    const tDir = this.rest[`finger1-2${s}`].clone().sub(this.rest[`finger1-1${s}`]).normalize();
    const tAxis = V().crossVectors(tDir, r.palm).normalize();
    thumb.forEach((a, j) => {
      const b = this.b[`finger1-${j + 1}${s}`];
      if (b) b.quaternion.setFromAxisAngle(tAxis, THREE.MathUtils.degToRad(a));
    });
  }
}

export async function loadAvatar({ reveal, canAsset, manager, anisotropy = 8, msaa = false }) {
  const [gltf, { materials, maps }] = await Promise.all([
    new GLTFLoader(manager).loadAsync(DIR + 'avatar.glb'),
    loadMaterials(manager, anisotropy, msaa),
  ]);
  Object.values(materials).forEach((m) => applyReveal(m, reveal));

  const model = gltf.scene;
  const fallback = applyReveal(new THREE.MeshStandardMaterial({ color: 0x888899 }), reveal);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = materials[o.material.name] || fallback;
    o.frustumCulled = false; // skinned bounds don't follow the pose
    // tiny parts would only add noise to the particle swarm
    o.userData.sample = !/^(eyes|face|lash|hair_cap)/.test(o.name);
  });

  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const P = new Poser(model, bones);
  const L = bone('.L');
  const R = bone('.R');
  const rest = P.rest;

  // ---- her stance: a slight lean, head tilted toward the can
  const set = (name, x, y, z) => bones[name].quaternion.setFromEuler(new THREE.Euler(x, y, z));
  const D = THREE.MathUtils.degToRad;
  set('spine04', 0, D(-4), D(-2));
  set('spine02', D(2), D(6), D(3));
  set('neck02', D(-3), 0, D(-5));

  // ---- left hand on her hip, elbow out and back
  const bodyMesh = model.getObjectByName('body');
  const hipY = rest.spine04.y + 0.02;
  let hipX = 0;
  {
    const pos = bodyMesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - hipY) < 0.02 && Math.abs(pos.getZ(i) - rest.spine04.z) < 0.08) hipX = Math.max(hipX, pos.getX(i));
    }
  }
  P.arm(L, V(hipX + 0.045, hipY + 0.02, rest.spine04.z + 0.02), V(1, 0.1, -0.9));
  P.hand(L, V(-0.25, -0.55, 0.8), V(-1, 0, 0.1));
  P.curl(L, [12, 18, 10], [10, 8, 5]);

  // ---- right hand raising the can beside her chin, logo to the camera
  const canCentre = V(rest[`upperarm01${R}`].x + 0.03, rest.neck01.y, rest.neck01.z + 0.25);
  const canRadius = 0.033;
  const handDir = V(1, 0.45, 0.15).normalize();
  const palm = V(0.1, 0, 1);
  const wrist = canCentre
    .clone()
    .addScaledVector(palm.clone().normalize(), -(canRadius + 0.022))
    .addScaledVector(handDir, -0.075)
    .add(V(0, -0.02, 0));
  P.arm(R, wrist, V(-0.6, -1, -0.1));
  P.hand(R, handDir, palm);
  P.curl(R, [40, 60, 40], [35, 25, 20]);

  model.updateMatrixWorld(true);
  const handCan = createCan(canAsset, { reveal, height: CAN_REAL_HEIGHT });
  {
    const wristBone = bones[`wrist${R}`];
    const target = new THREE.Matrix4().compose(
      canCentre.clone().add(V(0, -CAN_REAL_HEIGHT / 2, 0)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, D(-10), 0)),
      V(1, 1, 1).multiplyScalar(handCan.scale.x),
    );
    const local = wristBone.matrixWorld.clone().invert().multiply(target);
    local.decompose(handCan.position, handCan.quaternion, handCan.scale);
    wristBone.add(handCan);
  }

  // keep the posed rotations to layer the idle motion on top of
  const base = {};
  for (const [name, b] of Object.entries(bones)) base[name] = b.quaternion.clone();

  model.scale.setScalar(AVATAR_SCALE);
  const root = new THREE.Group();
  root.name = 'baddie';
  root.add(model);

  // ---------------------------------------------------------------- motion
  const look = { x: 0, y: 0 };
  let spin = 0;
  const tmpQ = Q();
  const tmpE = new THREE.Euler();
  const layer = (name, x, y, z) => {
    tmpQ.setFromEuler(tmpE.set(x, y, z));
    bones[name].quaternion.copy(base[name]).multiply(tmpQ);
  };

  function update(t, dt, pointer) {
    // ease the gaze toward the pointer
    const k = 1 - Math.exp(-dt * 4);
    look.x += (THREE.MathUtils.clamp(pointer.x, -1, 1) - look.x) * k;
    look.y += (THREE.MathUtils.clamp(pointer.y, -1, 1) - look.y) * k;

    const breath = Math.sin(t * 1.7);
    const sway = Math.sin(t * 0.6);
    layer('spine03', D(0.8) * breath, 0, 0);
    layer('spine02', D(0.6) * breath, D(1.2) * sway, 0);
    layer(`clavicle${L}`, 0, 0, D(0.8) * breath);
    layer(`clavicle${R}`, 0, 0, -D(0.8) * breath);
    layer('spine05', 0, D(1) * sway, D(0.6) * sway);
    layer('neck01', D(8) * look.y * 0.4, D(18) * look.x * 0.4, 0);
    layer('head', D(10) * look.y * 0.6, D(22) * look.x * 0.6, D(2) * Math.sin(t * 0.9));
    for (const s of [L, R]) layer(`eye${s}`, D(8) * look.y, D(14) * look.x, 0);
    // the can bobs a little in her grip
    layer(`lowerarm01${R}`, D(1.5) * Math.sin(t * 1.3), 0, 0);

    // tap: a full turn with a little hop
    if (spin > 0) {
      spin = Math.max(0, spin - dt / 1.15);
      const x = 1 - spin;
      const e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      model.rotation.y = e * Math.PI * 2;
      model.position.y = Math.sin(Math.PI * x) * 0.18;
    } else {
      model.rotation.y = 0;
      model.position.y = 0;
    }
  }

  return {
    root,
    maps,
    update,
    hype() {
      if (spin === 0) spin = 1;
    },
  };
}
