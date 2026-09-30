// The stage's textures (the projector's sigil, the floor shadow) are painted
// at runtime on a <canvas>; the can and the baddie bring their own.
import * as THREE from 'three';

export const FONTS = {
  goth: '"UnifrakturMaguntia", "Old English Text MT", serif',
  ui: '"Space Grotesk", "Helvetica Neue", Arial, sans-serif',
};

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
