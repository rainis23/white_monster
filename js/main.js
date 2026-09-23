import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { fishnetTexture, corsetTexture, tartanTexture, sigilTexture, blobShadowTexture } from './textures.js';
import { canLabelTextures } from './label.js';
import { animeFaceTextures } from './face.js';
import { createCan, loadCanModel, CAN_HEIGHT } from './can.js';
import { createAvatar, AVATAR_HEIGHT } from './avatar.js';
import { toonLight } from './toon.js';
import { makeReveal } from './reveal.js';
import { CAN_MODEL_URL } from './config.js';
import { createStage, PEDESTAL_TOP } from './stage.js';
import { MorphParticles, createSurfaceSampler, DEPART_END, ARRIVE_START } from './particles.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const ui = {
  button: $('transform'),
  label: document.querySelector('.transform-label'),
  caption: $('caption'),
  sound: $('sound'),
  flash: $('flash'),
  popup: $('popup'),
  loader: $('loader'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?dt=0.1 steps the simulation by a fixed amount per frame (handy for recording/screenshots)
const FIXED_DT = Number(new URLSearchParams(window.location.search).get('dt')) || 0;
const T_CHARGE = reducedMotion ? 0.3 : 1.05;
const T_MORPH = reducedMotion ? 1.4 : 2.9;
const CAN_FLOAT = 0.42;

const CAPTIONS = {
  can: [
    'pov: u cracked open a white monster at 3am',
    'the white monster is watching. she knows.',
    'zero sugar. zero chill. infinite aura.',
    'tap the button. she is waiting.',
  ],
  baddie: [
    'she’s not a drink. she’s a lifestyle 🖤',
    'loaded in t-posing and still ate',
    'avatar performance rank: very poor. aura: excellent',
    'mirror dweller. white monster in hand. do not disturb.',
    'full body tracking, zero sugar',
    'her wing could cut glass',
    'tap her again. she knows her angles.',
  ],
};

// Vertical extent of each subject and how much of the screen height it fills.
// Subjects sit a little above centre so the bottom controls never cover them.
const FRAMING = {
  can: { bottom: PEDESTAL_TOP + CAN_FLOAT, top: PEDESTAL_TOP + CAN_FLOAT + CAN_HEIGHT, halfWidth: 0.75, fill: 0.62 },
  baddie: { bottom: PEDESTAL_TOP, top: PEDESTAL_TOP + AVATAR_HEIGHT, halfWidth: 0.8, fill: 0.8 },
};

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

function fail(message) {
  ui.loader.querySelector('.loader-text').textContent = message;
}

async function init() {
  if (!webglAvailable()) {
    fail('your browser can’t summon her (WebGL 2 needed)');
    return;
  }

  // canvas textures need the web fonts ready before painting
  await withTimeout(
    Promise.all([
      document.fonts.load('150px "UnifrakturMaguntia"'),
      document.fonts.load('96px "Anton"'),
      document.fonts.load('600 30px "Space Grotesk"'),
      document.fonts.load('500 30px "Space Grotesk"'),
      ...[300, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "Montserrat"`)),
    ]),
    4000,
  ).catch(() => {});

  /* ---------------- renderer, scene, camera ---------------- */
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Neutral keeps the toon colours and the white can true to their albedo
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050407);
  scene.fog = new THREE.FogExp2(0x160d26, 0.05);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0.9, 2.9, 8);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.rotateSpeed = 0.7;

  /* ---------------- lights ---------------- */
  scene.add(new THREE.HemisphereLight(0x9d8cc0, 0x0b0910, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 6, 6);
  const fill = new THREE.DirectionalLight(0xc7d0ff, 0.7);
  fill.position.set(-5, 2.5, 4);
  const rimViolet = new THREE.DirectionalLight(0x8f5dff, 3.2);
  rimViolet.position.set(-4, 3.5, -5);
  const rimRose = new THREE.DirectionalLight(0xff4d8d, 1.3);
  rimRose.position.set(4.5, 2.5, -4);
  const underGlow = new THREE.PointLight(0xa07bff, 3, 5, 2);
  underGlow.position.set(0, PEDESTAL_TOP + 0.25, 1.3);
  scene.add(key, fill, rimViolet, rimRose, underGlow);

  /* ---------------- textures ---------------- */
  const label = canLabelTextures();
  const tex = {
    face: animeFaceTextures(),
    mesh: fishnetTexture({ cells: 8, width: 6.4, base: '#e2d0d0' }),
    corset: corsetTexture({ neckY: 247, waistY: 640 }),
    tartan: tartanTexture(),
  };
  const aniso = renderer.capabilities.getMaxAnisotropy();
  [label.map, label.orm, tex.face.open, tex.face.closed, tex.corset].forEach((t) => (t.anisotropy = aniso));

  // procedural can by default; a downloaded model if js/config.js points at one
  let makeCan = (reveal) => createCan({ label, reveal });
  if (CAN_MODEL_URL) {
    try {
      makeCan = await loadCanModel(CAN_MODEL_URL);
    } catch (err) {
      console.warn(`Couldn't load ${CAN_MODEL_URL}, using the built-in can instead.`, err);
    }
  }

  /* ---------------- stage ---------------- */
  const stage = createStage({ sigilMap: sigilTexture(), shadowMap: blobShadowTexture(), horizon: scene.fog.color });
  scene.add(stage.group);

  /* ---------------- the can ---------------- */
  const canReveal = makeReveal();
  const canRig = new THREE.Group();
  const can = makeCan(canReveal);
  canRig.add(can);
  canRig.position.y = PEDESTAL_TOP + CAN_FLOAT;
  scene.add(canRig);

  /* ---------------- the baddie ---------------- */
  const baddieReveal = makeReveal();
  const baddie = createAvatar({ tex, reveal: baddieReveal, makeCan });
  baddie.root.position.y = PEDESTAL_TOP;
  baddie.root.visible = false;
  baddieReveal.uReveal.value = -1e4;
  scene.add(baddie.root);

  const rigs = {
    can: {
      object: canRig,
      reveal: canReveal,
      bounds: () => [canRig.position.y - 0.05, canRig.position.y + CAN_HEIGHT + 0.05],
      sampler: null,
      sampleRoot: can,
    },
    baddie: {
      object: baddie.root,
      reveal: baddieReveal,
      bounds: () => [PEDESTAL_TOP - 0.02, PEDESTAL_TOP + AVATAR_HEIGHT - 0.3],
      sampler: null,
      sampleRoot: baddie.root,
    },
  };

  const particles = new MorphParticles(reducedMotion ? 2500 : 6000);
  scene.add(particles.points);

  /* ---------------- post ---------------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.45, 2.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    const px = h * renderer.getPixelRatio();
    particles.setViewport(px, camera.fov);
    stage.setViewport(px, camera.fov);
  }
  window.addEventListener('resize', resize);
  resize();

  function frame(mode) {
    const f = FRAMING[mode];
    // on tall phone screens the title sits over the scene, so leave headroom for it
    const top = f.top + (camera.aspect < 0.8 ? 0.12 * (f.top - f.bottom) : 0);
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const byHeight = (top - f.bottom) / f.fill / (2 * tanV);
    const byWidth = f.halfWidth / (tanV * camera.aspect);
    const dist = Math.max(byHeight, byWidth);
    const viewH = 2 * dist * tanV;
    return { target: new THREE.Vector3(0, (f.bottom + top) / 2 - 0.07 * viewH, 0), dist };
  }
  {
    const f = frame('can');
    controls.target.copy(f.target);
    camera.position.sub(f.target).setLength(f.dist).add(f.target);
  }

  /* ---------------- state ---------------- */
  const state = { mode: 'can', busy: false, tr: null, canSpin: 0, canFlip: 0, snap: 0 };
  const pointer = { x: 0, y: 0 };
  const sfx = new Sfx();
  try {
    if (localStorage.getItem('wm-sound') === 'off') sfx.enabled = false;
  } catch {
    /* storage unavailable: keep the default */
  }
  const syncSound = () => {
    ui.sound.setAttribute('aria-pressed', String(sfx.enabled));
    ui.sound.querySelector('.chip-label').textContent = sfx.enabled ? 'sound on' : 'sound off';
  };
  syncSound();
  ui.sound.addEventListener('click', () => {
    sfx.enabled = !sfx.enabled;
    syncSound();
    try {
      localStorage.setItem('wm-sound', sfx.enabled ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (sfx.enabled) sfx.sparkle();
  });

  let captionIndex = { can: 0, baddie: 0 };
  function setCaption(mode, next = true) {
    const list = CAPTIONS[mode];
    if (next) captionIndex[mode] = (captionIndex[mode] + 1) % list.length;
    const text = list[captionIndex[mode]];
    ui.caption.classList.add('swap');
    setTimeout(() => {
      ui.caption.textContent = text;
      ui.caption.classList.remove('swap');
    }, 250);
  }

  function flash(strength = 1, ms = 520) {
    ui.flash.animate([{ opacity: strength }, { opacity: 0 }], { duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  function popup(text) {
    ui.popup.classList.remove('show');
    ui.popup.querySelector('span').textContent = text;
    void ui.popup.offsetWidth;
    ui.popup.classList.add('show');
  }

  function setButton(mode, busy) {
    ui.button.disabled = busy;
    if (busy) ui.label.textContent = mode === 'can' ? 'summoning…' : 'sealing…';
    else ui.label.textContent = mode === 'can' ? 'unleash the baddie' : 'back in the can';
  }

  function startTransform() {
    if (state.busy) return;
    const toBaddie = state.mode === 'can';
    state.busy = true;
    state.tr = {
      t: 0,
      src: toBaddie ? rigs.can : rigs.baddie,
      dst: toBaddie ? rigs.baddie : rigs.can,
      toBaddie,
      started: false,
      camFrom: { target: controls.target.clone(), dist: camera.position.distanceTo(controls.target) },
      camTo: frame(toBaddie ? 'baddie' : 'can'),
    };
    setButton(state.mode, true);
    sfx.crack();
    sfx.riser(T_CHARGE + 0.2);
    if (!reducedMotion) document.body.classList.add('shake');
  }

  function beginMorph(tr) {
    for (const rig of [tr.src, tr.dst]) {
      if (!rig.sampler) rig.sampler = createSurfaceSampler(rig.sampleRoot);
    }
    tr.dst.object.visible = true;
    const [db, dt] = tr.dst.bounds();
    tr.dst.reveal.uReveal.value = db - 0.2;
    const [sb, st] = tr.src.bounds();
    const from = tr.src.sampler(particles.count, sb, st);
    const to = tr.dst.sampler(particles.count, db, dt);
    particles.setup(from, to);
    flash(0.55, 420);
    sfx.whoosh(T_MORPH * 0.8);
    document.body.classList.remove('shake');
  }

  function finishTransform(tr) {
    tr.src.object.visible = false;
    tr.src.reveal.uReveal.value = -1e4;
    tr.src.reveal.uGlow.value = 0;
    tr.dst.reveal.uReveal.value = 1e4;
    particles.points.visible = false;
    state.mode = tr.toBaddie ? 'baddie' : 'can';
    document.body.dataset.mode = state.mode;
    state.busy = false;
    state.tr = null;
    setButton(state.mode, false);
    flash(0.85, 700);
    sfx.boom();
    popup(tr.toBaddie ? 'baddie mode' : 'back in the can');
    setCaption(state.mode, false);
    // like every VRChat avatar she loads in T-posing, holds it for a beat, then snaps into her pose
    if (tr.toBaddie) state.snap = 1.7;
  }

  // 0 = posed, 1 = T-pose; plus how visible her nameplate is
  function avatarPose(dt) {
    const tr = state.tr;
    if (tr && tr.toBaddie) {
      const arrive = tr.started ? clamp01((particles.uniforms.uProgress.value - ARRIVE_START) / (1 - ARRIVE_START), 0, 1) : 0;
      return { tpose: 1, plate: arrive };
    }
    if (tr) {
      const c = clamp01(tr.t / (T_CHARGE * 0.7), 0, 1);
      return { tpose: c * c * (3 - 2 * c), plate: 1 - c };
    }
    if (state.snap > 0) state.snap = Math.max(0, state.snap - dt / 0.45);
    return { tpose: Math.pow(Math.min(1, state.snap), 3), plate: state.mode === 'baddie' ? 1 : 0 };
  }

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const clamp01 = THREE.MathUtils.clamp;

  function updateTransform(dt) {
    const tr = state.tr;
    tr.t += dt;
    const charge = clamp01(tr.t / T_CHARGE, 0, 1);
    const P = clamp01((tr.t - T_CHARGE) / T_MORPH, 0, 1);

    tr.src.reveal.uGlow.value = Math.pow(charge, 2) * 0.9;
    if (tr.src === rigs.can) state.canSpin = charge * charge * 14;
    else tr.src.object.position.y = PEDESTAL_TOP + Math.pow(charge, 2) * 0.12;

    if (!tr.started && tr.t >= T_CHARGE) {
      tr.started = true;
      beginMorph(tr);
    }
    if (tr.started) {
      particles.uniforms.uProgress.value = P;
      const [sb, st] = tr.src.bounds();
      const [db, dtop] = tr.dst.bounds();
      tr.src.reveal.uReveal.value = THREE.MathUtils.lerp(st + 0.08, sb - 0.1, clamp01(P / DEPART_END, 0, 1));
      const arrive = clamp01((P - ARRIVE_START) / (1 - ARRIVE_START), 0, 1);
      tr.dst.reveal.uReveal.value = THREE.MathUtils.lerp(db - 0.1, dtop + 0.12, arrive);
      tr.dst.reveal.uGlow.value = arrive > 0 ? 0.35 * (1 - arrive) : 0;

      const k = ease(clamp01((P - 0.05) / 0.85, 0, 1));
      controls.target.lerpVectors(tr.camFrom.target, tr.camTo.target, k);
      const dist = THREE.MathUtils.lerp(tr.camFrom.dist, tr.camTo.dist, k);
      camera.position.sub(controls.target).setLength(dist).add(controls.target);
    }
    if (P >= 1) {
      if (tr.src === rigs.baddie) tr.src.object.position.y = PEDESTAL_TOP;
      finishTransform(tr);
    }
  }

  ui.button.addEventListener('click', startTransform);

  /* ---------------- pointer: look-at + tap to hype ---------------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  });
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || state.busy) return;
    down = null;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const target = state.mode === 'can' ? canRig : baddie.root;
    if (raycaster.intersectObject(target, true).length) {
      if (state.mode === 'baddie') baddie.hype();
      else state.canFlip = 1;
      sfx.sparkle();
      setCaption(state.mode);
    }
  });

  /* ---------------- loop ---------------- */
  const timer = new THREE.Timer();
  timer.connect(document);
  let canAngle = 0;
  let t = 0;

  function tick(time) {
    timer.update(time);
    const dt = FIXED_DT || Math.min(timer.getDelta(), 1 / 20);
    t += dt;

    if (state.tr) updateTransform(dt);
    else state.canSpin *= 0.94;

    // can idle: slow turn + hover bob, tap for a flip
    if (canRig.visible) {
      canAngle += dt * (0.55 + state.canSpin);
      canRig.rotation.y = canAngle;
      canRig.position.y = PEDESTAL_TOP + CAN_FLOAT + Math.sin(t * 1.4) * 0.06;
      if (state.canFlip > 0) {
        // a barrel roll around the can's centre, with a little hop
        state.canFlip = Math.max(0, state.canFlip - dt / 0.9);
        const k = ease(1 - state.canFlip);
        const a = k * Math.PI * 2;
        const c = CAN_HEIGHT / 2;
        can.rotation.z = a;
        can.position.set(Math.sin(a) * c, c - Math.cos(a) * c + Math.sin(Math.PI * k) * 0.5, 0);
      } else {
        can.position.x = 0;
        can.rotation.z = 0;
        can.position.y = 0;
      }
    }
    if (baddie.root.visible) {
      const pose = avatarPose(dt);
      baddie.setTPose(pose.tpose);
      baddie.setNameplate(pose.plate);
      baddie.update(t, dt, pointer);
    }

    const transforming = !!state.tr;
    stage.update(t, dt, {
      ringBoost: transforming ? Math.sin(Math.PI * Math.min(1, state.tr.t / (T_CHARGE + T_MORPH))) : 0,
      beamLevel: state.mode === 'can' && !transforming ? 1 : transforming ? 1.6 : 0.18,
      shadowScale: state.mode === 'can' ? 1.5 : 1.3,
    });

    controls.update();
    camera.updateMatrixWorld();
    toonLight.uTime.value = t;
    toonLight.uLightDir.value.copy(key.position).normalize().transformDirection(camera.matrixWorldInverse);
    composer.render();
  }

  // ?mode=baddie skips straight to her (handy for screenshots)
  if (new URLSearchParams(window.location.search).get('mode') === 'baddie') {
    canRig.visible = false;
    canReveal.uReveal.value = -1e4;
    baddie.root.visible = true;
    baddieReveal.uReveal.value = 1e4;
    state.mode = 'baddie';
    document.body.dataset.mode = 'baddie';
    const f = frame('baddie');
    controls.target.copy(f.target);
    camera.position.sub(f.target).setLength(f.dist).add(f.target);
    ui.caption.textContent = CAPTIONS.baddie[0];
  }

  // Compile every shader (and upload the big textures) behind the loading
  // screen so the first transformation doesn't stutter.
  const hidden = [canRig, baddie.root, particles.points].filter((o) => !o.visible);
  hidden.forEach((o) => (o.visible = true));
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    /* compileAsync is only an optimisation */
  }
  hidden.forEach((o) => (o.visible = false));
  [label.map, label.orm, tex.face.open, tex.face.closed, tex.corset, tex.mesh, tex.tartan].forEach((t) => renderer.initTexture(t));

  renderer.setAnimationLoop(tick);
  setButton(state.mode, false);
  if (state.mode === 'can') ui.caption.textContent = CAPTIONS.can[0];
  requestAnimationFrame(() => ui.loader.classList.add('done'));

  // expose a tiny hook for automated screenshots/tests
  window.__whiteMonster = {
    transform: startTransform,
    get mode() {
      return state.mode;
    },
    get busy() {
      return state.busy;
    },
    get transformTime() {
      return state.tr ? state.tr.t : -1;
    },
    camera,
    controls,
  };
}

init().catch((err) => {
  console.error(err);
  fail('she tripped on her platforms. refresh to try again.');
});
