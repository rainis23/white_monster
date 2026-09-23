// Every texture on the site is painted at runtime on a <canvas>, so the
// project ships with zero image assets.
import * as THREE from 'three';

export const FONTS = {
  goth: '"UnifrakturMaguntia", "Old English Text MT", serif',
  bold: '"Anton", Impact, "Arial Narrow", sans-serif',
  ui: '"Space Grotesk", "Helvetica Neue", Arial, sans-serif',
};

// Small deterministic PRNG so the hand-drawn details look the same every visit.
export function rng(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

function toTexture(c, { color = true, repeat = false, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function softDot(g, x, y, r, color, sy = 1) {
  g.save();
  g.translate(x, y);
  g.scale(1, sy);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function spaced(g, text, x, y, spacing) {
  // canvas letterSpacing is not everywhere yet; fall back to manual spacing.
  if ('letterSpacing' in g) {
    g.letterSpacing = `${spacing}px`;
    g.fillText(text, x + spacing / 2, y);
    g.letterSpacing = '0px';
    return;
  }
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const align = g.textAlign;
  g.textAlign = 'left';
  let cx = align === 'center' ? x - total / 2 : x;
  chars.forEach((ch, i) => {
    g.fillText(ch, cx, y);
    cx += widths[i] + spacing;
  });
  g.textAlign = align;
}

function sparkle(g, x, y, r, color = 'rgba(255,255,255,0.95)') {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.18;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.restore();
}

// A torn, jagged claw slash along a bent path.
function clawSlash(g, x0, y0, x1, y1, bend, width, rand) {
  const N = 60;
  const mx = (x0 + x1) / 2 + bend;
  const my = (y0 + y1) / 2;
  const left = [];
  const right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
    const tx = 2 * (1 - t) * (mx - x0) + 2 * t * (x1 - mx);
    const ty = 2 * (1 - t) * (my - y0) + 2 * t * (y1 - my);
    const len = Math.hypot(tx, ty);
    const nx = -ty / len;
    const ny = tx / len;
    const w = width * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.75);
    const jl = i % 2 ? 1 + (rand() - 0.5) * 0.7 : 1;
    const jr = i % 3 ? 1 + (rand() - 0.5) * 0.6 : 1;
    left.push([x + nx * w * jl, y + ny * w * jl]);
    right.push([x - nx * w * jr, y - ny * w * jr]);
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  left.forEach(([x, y]) => g.lineTo(x, y));
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
}

/* ------------------------------------------------------------------ */
/* Can label                                                           */
/* ------------------------------------------------------------------ */

// The label wraps a cylinder whose u = 0.5 faces the camera.
export function canLabelTexture() {
  const W = 2048;
  const H = 1360;
  const { c, g } = makeCanvas(W, H);
  const rand = rng(7);
  const cx = W / 2;

  // pearl white base with a faint iridescent drift around the can
  const base = g.createLinearGradient(0, 0, W, 0);
  base.addColorStop(0, '#eeeef3');
  base.addColorStop(0.2, '#f7f5fb');
  base.addColorStop(0.5, '#ffffff');
  base.addColorStop(0.8, '#f5f7fb');
  base.addColorStop(1, '#eeeef3');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  const pearl = g.createLinearGradient(0, 0, 0, H);
  pearl.addColorStop(0, 'rgba(214,200,255,0.18)');
  pearl.addColorStop(0.5, 'rgba(255,255,255,0)');
  pearl.addColorStop(1, 'rgba(200,232,255,0.16)');
  g.fillStyle = pearl;
  g.fillRect(0, 0, W, H);

  // faint crosses scattered in the print
  g.fillStyle = 'rgba(20,16,28,0.045)';
  g.font = `44px ${FONTS.goth}`;
  g.textAlign = 'center';
  for (let i = 0; i < 90; i++) g.fillText('†', rand() * W, rand() * H);

  // brushed noise
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.022)' : 'rgba(255,255,255,0.05)';
    g.fillRect(rand() * W, rand() * H, 2 + rand() * 6, 1);
  }

  // top and bottom pinstripes
  g.fillStyle = '#121016';
  g.fillRect(0, 34, W, 7);
  g.fillRect(0, 52, W, 2);
  g.fillRect(0, H - 41, W, 7);
  g.fillRect(0, H - 54, W, 2);

  // soft holographic halo behind the claws
  softDot(g, cx, 700, 420, 'rgba(186,160,255,0.16)', 1.35);

  // ---- claw slashes (front) ----
  const slashes = [
    [cx - 210, 330, cx - 150, 1060, -40, 70],
    [cx - 10, 300, cx + 40, 1100, -30, 82],
    [cx + 190, 340, cx + 230, 1040, -24, 66],
  ];
  slashes.forEach(([x0, y0, x1, y1, bend, w]) => {
    // shadow
    g.save();
    g.translate(10, 12);
    clawSlash(g, x0, y0, x1, y1, bend, w, rng(x0 | 0));
    g.fillStyle = 'rgba(40,20,70,0.18)';
    g.fill();
    g.restore();

    clawSlash(g, x0, y0, x1, y1, bend, w, rng(x0 | 0));
    const grad = g.createLinearGradient(x0 - w, 0, x0 + w, 0);
    grad.addColorStop(0, '#08080b');
    grad.addColorStop(0.42, '#2b2a33');
    grad.addColorStop(0.55, '#8c8b98');
    grad.addColorStop(0.62, '#2b2a33');
    grad.addColorStop(1, '#060608');
    g.fillStyle = grad;
    g.fill();

    // thin chrome edge
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(210,205,230,0.55)';
    g.stroke();
  });

  // small secondary scratches
  g.strokeStyle = 'rgba(12,10,16,0.8)';
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const x = cx - 300 + rand() * 600;
    const y = 360 + rand() * 640;
    g.lineWidth = 2 + rand() * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 14 + rand() * 20, y + 40 + rand() * 60);
    g.stroke();
  }

  sparkle(g, cx + 70, 420, 46);
  sparkle(g, cx - 190, 880, 28);
  sparkle(g, cx + 250, 980, 22);

  // ---- front typography ----
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(120,110,150,0.35)';
  g.font = `150px ${FONTS.goth}`;
  g.fillText('White Monster', cx + 4, 234);
  g.fillStyle = '#0c0b0f';
  g.fillText('White Monster', cx, 230);

  g.fillStyle = '#4a4656';
  g.font = `600 30px ${FONTS.ui}`;
  spaced(g, '— BADDIE EDITION —', cx, 286, 10);

  g.fillStyle = '#0c0b0f';
  g.font = `96px ${FONTS.bold}`;
  spaced(g, 'ULTRA WHITE', cx, 1210, 20);

  g.fillStyle = '#3b3846';
  g.font = `500 32px ${FONTS.ui}`;
  spaced(g, 'ZERO SUGAR · ZERO CHILL', cx, 1264, 8);

  // ---- left side: vertical slogan ----
  g.save();
  g.translate(W * 0.2, H / 2);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#0c0b0f';
  g.font = `112px ${FONTS.bold}`;
  spaced(g, 'UNLEASH THE BADDIE', 0, 38, 10);
  g.restore();

  g.save();
  g.translate(W * 0.2 + 88, H / 2);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#5a5566';
  g.font = `500 26px ${FONTS.ui}`;
  spaced(g, 'EYELINER SHARP ENOUGH TO KILL', 0, 0, 9);
  g.restore();

  // ---- right side: "baddie facts" panel ----
  const px = W * 0.8;
  const pw = 360;
  const top = 250;
  g.strokeStyle = '#121016';
  g.lineWidth = 5;
  g.strokeRect(px - pw / 2, top, pw, 640);
  g.fillStyle = '#121016';
  g.textAlign = 'left';
  g.font = `64px ${FONTS.bold}`;
  g.fillText('BADDIE', px - pw / 2 + 22, top + 82);
  g.fillText('FACTS', px - pw / 2 + 22, top + 150);
  g.fillRect(px - pw / 2 + 16, top + 172, pw - 32, 12);
  const facts = [
    ['Eyeliner', '200%'],
    ['Attitude', '100%'],
    ['Black lipstick', '∞'],
    ['Piercings', '5'],
    ['Sugar', '0g'],
    ['Chill', '0g'],
  ];
  g.font = `500 30px ${FONTS.ui}`;
  facts.forEach(([k, v], i) => {
    const y = top + 238 + i * 64;
    g.textAlign = 'left';
    g.fillText(k, px - pw / 2 + 22, y);
    g.textAlign = 'right';
    g.fillText(v, px + pw / 2 - 22, y);
    g.fillRect(px - pw / 2 + 16, y + 20, pw - 32, 2);
  });

  // barcode
  let bx = px - 150;
  while (bx < px + 150) {
    const bw = 2 + Math.floor(rand() * 7);
    if (rand() > 0.35) g.fillRect(bx, 950, bw, 120);
    bx += bw + 2 + Math.floor(rand() * 4);
  }
  g.textAlign = 'center';
  g.font = `500 26px ${FONTS.ui}`;
  spaced(g, '0 66666 13 1 7', px, 1106, 6);

  // ---- back seam: fine print ----
  g.fillStyle = '#6a6576';
  g.font = `500 24px ${FONTS.ui}`;
  g.textAlign = 'center';
  g.save();
  g.translate(W * 0.985, H / 2);
  g.rotate(-Math.PI / 2);
  spaced(g, 'FAN-MADE PARODY · NOT A REAL PRODUCT · 473 mL · NO REFUNDS ON ATTITUDE', 0, 0, 5);
  g.restore();

  return toTexture(c, { anisotropy: 16 });
}

/* ------------------------------------------------------------------ */
/* Face (planar projected onto the front of the head)                  */
/* ------------------------------------------------------------------ */

export function faceTextures() {
  return { open: toTexture(drawFace(false)), closed: toTexture(drawFace(true)) };
}

function bezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

function drawEye(g, ey, closed) {
  // Coordinates are relative to the face centre line (x = 0) and mirrored by the caller.
  const inner = [80, ey + 8];
  const outer = [256, ey - 14];
  const up1 = [118, ey - 54];
  const up2 = [212, ey - 62];
  const lo1 = [226, ey + 30];
  const lo2 = [128, ey + 44];

  // smoky shadow
  softDot(g, 176, ey - 26, 150, 'rgba(22,8,30,0.62)', 0.72);
  softDot(g, 250, ey - 38, 110, 'rgba(58,18,84,0.42)', 0.7);
  softDot(g, 170, ey + 32, 92, 'rgba(22,8,30,0.34)', 0.5);
  softDot(g, 176, ey - 8, 108, 'rgba(12,4,16,0.55)', 0.62);

  const upperPath = () => {
    g.beginPath();
    g.moveTo(...inner);
    g.bezierCurveTo(...up1, ...up2, ...outer);
  };

  if (!closed) {
    g.save();
    g.beginPath();
    g.moveTo(...inner);
    g.bezierCurveTo(...up1, ...up2, ...outer);
    g.bezierCurveTo(...lo1, ...lo2, ...inner);
    g.closePath();
    g.clip();

    g.fillStyle = '#f1ecf2';
    g.fillRect(40, ey - 90, 260, 170);

    // iris: icy lilac "white contacts"
    const ix = 172;
    const iy = ey - 10;
    const iris = g.createRadialGradient(ix, iy, 4, ix, iy, 43);
    iris.addColorStop(0, '#fbfaff');
    iris.addColorStop(0.35, '#dcd4f4');
    iris.addColorStop(0.72, '#a497cc');
    iris.addColorStop(0.9, '#3a2f52');
    iris.addColorStop(1, '#17111f');
    g.fillStyle = iris;
    g.beginPath();
    g.arc(ix, iy, 43, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(70,52,110,0.35)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      g.beginPath();
      g.moveTo(ix + Math.cos(a) * 17, iy + Math.sin(a) * 17);
      g.lineTo(ix + Math.cos(a) * 37, iy + Math.sin(a) * 37);
      g.stroke();
    }
    g.fillStyle = '#07050a';
    g.beginPath();
    g.arc(ix, iy, 15, 0, Math.PI * 2);
    g.fill();

    // upper lid shadow on the eyeball
    const lid = g.createLinearGradient(0, ey - 60, 0, ey + 5);
    lid.addColorStop(0, 'rgba(30,14,40,0.75)');
    lid.addColorStop(1, 'rgba(30,14,40,0)');
    g.fillStyle = lid;
    g.fillRect(40, ey - 90, 260, 100);

    // catchlights
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ix + 17, iy - 16, 10, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(ix - 13, iy + 12, 4.5, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // tightline on the lower lash line
    g.strokeStyle = 'rgba(10,5,14,0.9)';
    g.lineCap = 'round';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(...outer);
    g.bezierCurveTo(...lo1, ...lo2, ...inner);
    g.stroke();

    // lower lashes
    g.lineWidth = 2.6;
    for (let i = 0; i < 6; i++) {
      const t = 0.05 + i * 0.09;
      const [x, y] = bezierPoint(outer, lo1, lo2, inner, t);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 4, y + 10, x + 8 - i, y + 18 - i * 1.5);
      g.stroke();
    }

    // glitter on the inner corner
    softDot(g, inner[0] + 4, inner[1] + 2, 14, 'rgba(255,255,255,0.9)');
    sparkle(g, inner[0] + 2, inner[1] + 1, 11);
  } else {
    // closed: skin lid with a crease and a lash line that curves down
    g.strokeStyle = 'rgba(40,18,48,0.45)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(inner[0] + 10, ey - 18);
    g.bezierCurveTo(130, ey - 50, 210, ey - 52, 250, ey - 24);
    g.stroke();
  }

  // upper lash line (or the closed-lid lash line)
  g.strokeStyle = '#050307';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = closed ? 10 : 12;
  if (closed) {
    g.beginPath();
    g.moveTo(...inner);
    g.bezierCurveTo(130, ey + 30, 214, ey + 24, outer[0], outer[1] + 4);
    g.stroke();
  } else {
    upperPath();
    g.stroke();
  }

  // the wing: long and sharp, with a lower "siren" wing underneath
  g.fillStyle = '#050307';
  g.beginPath();
  g.moveTo(206, ey - 44);
  g.quadraticCurveTo(262, ey - 50, 330, ey - 86);
  g.quadraticCurveTo(292, ey - 36, 250, ey + (closed ? -4 : -8));
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(214, ey + 14);
  g.quadraticCurveTo(262, ey + 2, 318, ey - 50);
  g.quadraticCurveTo(270, ey - 2, 222, ey + 22);
  g.closePath();
  g.fill();

  // lashes
  g.lineWidth = 3.4;
  for (let i = 0; i < 12; i++) {
    const t = 0.18 + i * 0.07;
    let x;
    let y;
    let dx;
    let dy;
    const len = 12 + t * 26;
    if (closed) {
      [x, y] = bezierPoint(inner, [130, ey + 30], [214, ey + 24], [outer[0], outer[1] + 4], t);
      dx = 0.35 + t * 0.4;
      dy = 1;
    } else {
      [x, y] = bezierPoint(inner, up1, up2, outer, t);
      dx = 0.3 + t * 0.9;
      dy = -1;
    }
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + dx * len * 0.3, y + dy * len * 0.8, x + dx * len, y + dy * len * 0.9);
    g.stroke();
  }
}

function drawBrow(g, slit) {
  const pts = [
    [66, 452],
    [128, 404],
    [190, 384],
    [292, 424],
  ];
  g.save();
  if (slit) {
    // the eyebrow slit
    g.beginPath();
    g.rect(0, 0, 400, 1024);
    g.moveTo(206, 370);
    g.lineTo(218, 370);
    g.lineTo(230, 420);
    g.lineTo(218, 420);
    g.closePath();
    g.clip('evenodd');
  }
  g.lineCap = 'round';
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const [x, y] = bezierPoint(...pts, t);
    const w = 20 * (1 - t) + 5;
    g.fillStyle = 'rgba(22,16,22,0.95)';
    g.beginPath();
    g.ellipse(x, y, w * 0.55, w * 0.5, -0.4 + t * 0.9, 0, Math.PI * 2);
    g.fill();
  }
  // hair strokes for texture
  const rand = rng(3);
  g.strokeStyle = 'rgba(60,44,60,0.6)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 60; i++) {
    const t = rand();
    const [x, y] = bezierPoint(...pts, t);
    const w = 16 * (1 - t) + 4;
    const ox = (rand() - 0.5) * w;
    const oy = (rand() - 0.5) * w * 0.6;
    g.beginPath();
    g.moveTo(x + ox, y + oy + 5);
    g.lineTo(x + ox + 9, y + oy - 4);
    g.stroke();
  }
  g.restore();
}

function drawFace(closed) {
  const S = 1024;
  const cx = S / 2;
  const { c, g } = makeCanvas(S, S);

  // blush: e-girl style across the nose and cheeks
  softDot(g, cx - 210, 690, 130, 'rgba(206,108,146,0.4)', 0.8);
  softDot(g, cx + 210, 690, 130, 'rgba(206,108,146,0.4)', 0.8);
  softDot(g, cx, 650, 80, 'rgba(206,108,146,0.28)', 0.6);

  // contour under the cheekbones + highlight on top
  for (const s of [-1, 1]) {
    g.save();
    g.translate(cx + s * 240, 760);
    g.rotate(s * -0.55);
    softDot(g, 0, 0, 120, 'rgba(84,44,70,0.16)', 0.28);
    g.restore();
    softDot(g, cx + s * 222, 612, 50, 'rgba(255,255,255,0.3)', 0.6);
  }

  // eyes & brows (mirrored)
  for (const s of [-1, 1]) {
    g.save();
    g.translate(cx, 0);
    g.scale(s, 1);
    drawBrow(g, s === 1);
    // big doll eyes: draw at 1.15x around the eye centre
    g.translate(172, 548);
    g.scale(1.15, 1.15);
    g.translate(-172, -548);
    drawEye(g, 548, closed);
    g.restore();
  }

  // nose
  softDot(g, cx, 610, 70, 'rgba(255,255,255,0.18)', 1.6);
  g.strokeStyle = 'rgba(120,74,92,0.22)';
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * 22, 580);
    g.quadraticCurveTo(cx + s * 30, 650, cx + s * 30, 684);
    g.stroke();
  }
  softDot(g, cx, 704, 44, 'rgba(110,62,84,0.28)', 0.3);
  g.fillStyle = 'rgba(64,30,46,0.55)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * 18, 697, 9, 4.5, s * 0.35, 0, Math.PI * 2);
    g.fill();
  }
  softDot(g, cx, 672, 12, 'rgba(255,255,255,0.4)');

  // lips: overlined black lipstick with a gloss hit, slight smirk
  g.save();
  g.translate(cx, 796);
  g.scale(1.1, 1.12);
  g.translate(-cx, -796);
  const L = [cx - 94, 792];
  const R = [cx + 94, 784];
  const upper = () => {
    g.moveTo(...L);
    g.bezierCurveTo(cx - 70, 772, cx - 46, 746, cx - 26, 748);
    g.quadraticCurveTo(cx - 10, 748, cx, 760);
    g.quadraticCurveTo(cx + 10, 748, cx + 26, 748);
    g.bezierCurveTo(cx + 46, 746, cx + 70, 766, ...R);
  };
  const seam = () => g.bezierCurveTo(cx + 40, 800, cx - 40, 802, ...L);

  g.beginPath();
  upper();
  seam();
  g.closePath();
  const ug = g.createLinearGradient(0, 745, 0, 800);
  ug.addColorStop(0, '#1d1522');
  ug.addColorStop(1, '#09060b');
  g.fillStyle = ug;
  g.fill();

  g.beginPath();
  g.moveTo(...L);
  g.bezierCurveTo(cx - 40, 802, cx + 40, 800, ...R);
  g.bezierCurveTo(cx + 72, 818, cx + 46, 846, cx, 846);
  g.bezierCurveTo(cx - 46, 846, cx - 74, 820, ...L);
  g.closePath();
  const lg = g.createLinearGradient(0, 796, 0, 846);
  lg.addColorStop(0, '#0b070d');
  lg.addColorStop(0.55, '#2a1a30');
  lg.addColorStop(1, '#100a12');
  g.fillStyle = lg;
  g.fill();

  g.strokeStyle = '#000';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(...R);
  seam();
  g.stroke();

  softDot(g, cx + 10, 824, 34, 'rgba(255,255,255,0.55)', 0.24);
  softDot(g, cx - 42, 766, 14, 'rgba(255,255,255,0.35)', 0.35);
  softDot(g, cx + 44, 764, 12, 'rgba(255,255,255,0.3)', 0.35);
  softDot(g, cx, 738, 26, 'rgba(255,255,255,0.18)', 0.25);
  g.restore();

  // tiny cross tattoo under her left eye, beauty mark by the lip
  g.strokeStyle = 'rgba(16,12,22,0.9)';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(cx + 196, 626);
  g.lineTo(cx + 196, 654);
  g.moveTo(cx + 186, 635);
  g.lineTo(cx + 206, 635);
  g.stroke();
  g.fillStyle = 'rgba(40,24,30,0.85)';
  g.beginPath();
  g.arc(cx - 122, 818, 4, 0, Math.PI * 2);
  g.fill();

  return c;
}

/* ------------------------------------------------------------------ */
/* Fabric & detail textures                                            */
/* ------------------------------------------------------------------ */

// Diamond fishnet over pale skin. Tiles seamlessly.
export function fishnetTexture({ cells = 4, width = 3.2, base = '#efe0de', line = 'rgba(8,6,10,0.94)' } = {}) {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const cell = S / cells;
  g.strokeStyle = line;
  g.lineWidth = width;
  for (let k = -cells; k <= cells * 2; k++) {
    g.beginPath();
    g.moveTo(k * cell, 0);
    g.lineTo(k * cell + S, S);
    g.moveTo(k * cell, 0);
    g.lineTo(k * cell - S, S);
    g.stroke();
  }
  g.fillStyle = line;
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      g.beginPath();
      g.arc(i * cell, j * cell, width * 0.9, 0, Math.PI * 2);
      g.arc((i + 0.5) * cell, (j + 0.5) * cell, width * 0.9, 0, Math.PI * 2);
      g.fill();
    }
  }
  return toTexture(c, { repeat: true });
}

// Corset + sheer mesh top. u = 0.5 is the front; v runs up the torso.
export function corsetTexture({ neckY = 240, waistY = 740 } = {}) {
  const S = 1024;
  const { c, g } = makeCanvas(S, S);
  const rand = rng(11);

  // sheer black mesh over skin everywhere first
  g.fillStyle = '#b8a6a8';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(8,6,10,0.94)';
  g.lineWidth = 7;
  for (let k = -64; k < 128; k++) {
    g.beginPath();
    g.moveTo(k * 16, 0);
    g.lineTo(k * 16 + S, S);
    g.moveTo(k * 16, 0);
    g.lineTo(k * 16 - S, S);
    g.stroke();
  }

  // sweetheart neckline
  const neck = (x) => {
    const u = x / S;
    const d = Math.abs(u - 0.5);
    let y = neckY;
    if (d < 0.14) y = neckY + 70 - Math.sin((d / 0.14) * Math.PI) * 55 - (d / 0.14) * 40;
    else y = neckY + 30 - Math.min(1, (d - 0.14) / 0.2) * 60;
    return y;
  };

  g.save();
  g.beginPath();
  g.moveTo(0, S);
  for (let x = 0; x <= S; x += 8) g.lineTo(x, neck(x));
  g.lineTo(S, S);
  g.closePath();
  g.clip();

  // satin panels
  const seams = [0, 0.06, 0.13, 0.21, 0.3, 0.4, 0.47, 0.53, 0.6, 0.7, 0.79, 0.87, 0.94, 1];
  for (let i = 0; i < seams.length - 1; i++) {
    const x0 = seams[i] * S;
    const x1 = seams[i + 1] * S;
    const grad = g.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, '#07060a');
    grad.addColorStop(0.5, '#1f1b27');
    grad.addColorStop(1, '#07060a');
    g.fillStyle = grad;
    g.fillRect(x0, 0, x1 - x0 + 1, S);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(x0, 0, 3, S);
  }
  // topstitching
  g.strokeStyle = 'rgba(200,190,220,0.18)';
  g.lineWidth = 1.5;
  g.setLineDash([6, 6]);
  seams.forEach((u) => {
    g.beginPath();
    g.moveTo(u * S + 8, 0);
    g.lineTo(u * S + 8, S);
    g.stroke();
  });
  g.setLineDash([]);

  // front lacing gap shows the mesh underneath
  const top = neckY + 80;
  const bottom = waistY;
  g.fillStyle = '#b8a6a8';
  g.fillRect(S / 2 - 18, top, 36, bottom - top);
  g.strokeStyle = 'rgba(8,6,10,0.9)';
  g.lineWidth = 3;
  for (let k = -4; k < 70; k++) {
    g.beginPath();
    g.moveTo(S / 2 - 18, top + k * 16);
    g.lineTo(S / 2 + 18, top + k * 16 + 36);
    g.moveTo(S / 2 + 18, top + k * 16);
    g.lineTo(S / 2 - 18, top + k * 16 + 36);
    g.stroke();
  }
  const rows = Math.floor((bottom - top) / 44);
  const eyelets = [];
  for (let i = 0; i <= rows; i++) eyelets.push(top + 10 + i * 44);
  g.strokeStyle = '#f2f0f7';
  g.lineWidth = 6;
  g.lineCap = 'round';
  for (let i = 0; i < eyelets.length - 1; i++) {
    g.beginPath();
    g.moveTo(S / 2 - 26, eyelets[i]);
    g.lineTo(S / 2 + 26, eyelets[i + 1]);
    g.moveTo(S / 2 + 26, eyelets[i]);
    g.lineTo(S / 2 - 26, eyelets[i + 1]);
    g.stroke();
  }
  eyelets.forEach((y) => {
    for (const s of [-1, 1]) {
      g.fillStyle = '#0a090c';
      g.beginPath();
      g.arc(S / 2 + s * 28, y, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#d7d5de';
      g.lineWidth = 3;
      g.stroke();
    }
  });
  // bow at the top of the lacing
  g.strokeStyle = '#f2f0f7';
  g.lineWidth = 6;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(S / 2 + s * 26, top - 6, 24, 12, s * 0.4, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(S / 2, top);
    g.lineTo(S / 2 + s * 20, top + 50);
    g.stroke();
  }
  g.restore();

  // lace trim on the neckline
  for (let x = 0; x <= S; x += 14) {
    const y = neck(x);
    g.fillStyle = '#0d0b10';
    g.beginPath();
    g.arc(x, y - 3, 9, Math.PI, 0);
    g.fill();
    g.fillStyle = 'rgba(184,166,168,0.7)';
    g.beginPath();
    g.arc(x, y - 6, 2.2, 0, Math.PI * 2);
    g.fill();
  }

  // satin sheen flecks
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(190,170,230,${0.02 + rand() * 0.03})`;
    g.fillRect(rand() * S, neckY + 60 + rand() * (S - neckY), 1, 6 + rand() * 18);
  }

  return toTexture(c);
}

// Black/charcoal tartan with white and violet overchecks.
export function tartanTexture() {
  const S = 512;
  const { c, g } = makeCanvas(S, S);
  g.fillStyle = '#0d0c11';
  g.fillRect(0, 0, S, S);
  const bands = [
    [0, 120, 'rgba(58,56,68,0.55)'],
    [300, 60, 'rgba(58,56,68,0.45)'],
    [176, 4, 'rgba(236,234,244,0.75)'],
    [194, 4, 'rgba(236,234,244,0.75)'],
    [420, 3, 'rgba(162,118,255,0.6)'],
    [60, 2, 'rgba(236,234,244,0.35)'],
  ];
  bands.forEach(([p, w, col]) => {
    g.fillStyle = col;
    g.fillRect(p, 0, w, S);
    g.fillRect(0, p, S, w);
  });
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 1.5;
  for (let k = -S; k < S; k += 5) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + S, S);
    g.stroke();
  }
  return toTexture(c, { repeat: true });
}

// Grey strand lines running along u; tint comes from the material colour.
export function hairTexture() {
  const W = 512;
  const H = 256;
  const { c, g } = makeCanvas(W, H);
  const rand = rng(5);
  g.fillStyle = '#c9c7cf';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 520; i++) {
    const y = rand() * H;
    const v = rand();
    g.strokeStyle = v > 0.5 ? `rgba(255,255,255,${0.15 + rand() * 0.3})` : `rgba(140,136,150,${0.12 + rand() * 0.25})`;
    g.lineWidth = 0.6 + rand() * 1.6;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + (rand() - 0.5) * 6, W * 0.7, y + (rand() - 0.5) * 6, W, y);
    g.stroke();
  }
  return toTexture(c, { repeat: true });
}

// Summoning-circle engraving for the projector top.
export function sigilTexture() {
  const S = 1024;
  const { c, g } = makeCanvas(S, S);
  const cx = S / 2;
  g.translate(cx, cx);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';

  const ring = (r, w, dash) => {
    g.lineWidth = w;
    g.setLineDash(dash || []);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  };
  ring(500, 5);
  ring(478, 1.5);
  ring(404, 2.5);
  ring(330, 1.5, [10, 12]);
  ring(250, 1);

  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const l = i % 5 === 0 ? 20 : 9;
    g.lineWidth = i % 5 === 0 ? 2.5 : 1.2;
    g.beginPath();
    g.moveTo(Math.cos(a) * 404, Math.sin(a) * 404);
    g.lineTo(Math.cos(a) * (404 - l), Math.sin(a) * (404 - l));
    g.stroke();
  }

  const text = 'WHITE MONSTER † ZERO SUGAR † ALL ATTITUDE † UNLEASH THE BADDIE † ';
  g.font = `600 30px ${FONTS.ui}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...text];
  chars.forEach((ch, i) => {
    const a = (i / chars.length) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.translate(0, -441);
    g.fillText(ch, 0, 0);
    g.restore();
  });

  g.font = `64px ${FONTS.goth}`;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.translate(0, -366);
    g.fillText('†', 0, 4);
    g.restore();
  }

  // woven star between the inner rings
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = (i * 3 / 7) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * 330, Math.sin(a) * 330);
  }
  g.stroke();

  return toTexture(c, { anisotropy: 16 });
}

export function blobShadowTexture() {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return toTexture(c);
}
