// Every texture on the site is painted at runtime on a <canvas>, so the
// project ships with zero image assets.
import * as THREE from 'three';

export const FONTS = {
  goth: '"UnifrakturMaguntia", "Old English Text MT", serif',
  bold: '"Anton", Impact, "Arial Narrow", sans-serif',
  ui: '"Space Grotesk", "Helvetica Neue", Arial, sans-serif',
  can: '"Montserrat", "Helvetica Neue", Arial, sans-serif',
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

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') };
}

export function toTexture(c, { color = true, repeat = false, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function softDot(g, x, y, r, color, sy = 1) {
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

export function spaced(g, text, x, y, spacing) {
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

export function sparkle(g, x, y, r, color = 'rgba(255,255,255,0.95)') {
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
