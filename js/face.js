// Anime avatar face, painted on a transparent canvas and projected straight
// onto the front of the head (1024 px = the head's full width). Big glossy
// eyes with slit "monster" pupils, a sharp goth wing, a smug fanged smirk and
// hatched blush.
import { makeCanvas, toTexture, softDot, sparkle } from './textures.js';

const S = 1024;
const CX = S / 2;
const EX = 150; // eye centre, measured out from the middle of the face
const EY = 566;

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

function eye(g, closed) {
  const inner = [EX - 68, EY + 6];
  const outer = [EX + 74, EY - 28];
  const up1 = [EX - 52, EY - 64];
  const up2 = [EX + 38, EY - 90];
  const lo1 = [EX + 70, EY + 42];
  const lo2 = [EX - 30, EY + 68];

  // soft red-violet shadow on the lid and a darker smoky outer corner
  softDot(g, EX + 10, EY - 58, 118, 'rgba(160,52,120,0.26)', 0.55);
  softDot(g, EX + 78, EY - 36, 72, 'rgba(70,16,74,0.4)', 0.75);

  if (!closed) {
    g.save();
    g.beginPath();
    g.moveTo(...inner);
    g.bezierCurveTo(...up1, ...up2, ...outer);
    g.bezierCurveTo(...lo1, ...lo2, ...inner);
    g.closePath();
    g.clip();

    g.fillStyle = '#fbf8ff';
    g.fillRect(EX - 110, EY - 120, 240, 220);

    // iris: tall, dark at the top, glowing lilac at the bottom
    const ix = EX + 6;
    const iy = EY + 4;
    const iris = g.createLinearGradient(0, iy - 68, 0, iy + 68);
    iris.addColorStop(0, '#1d1033');
    iris.addColorStop(0.35, '#5a3aa6');
    iris.addColorStop(0.72, '#b99cff');
    iris.addColorStop(1, '#f1eaff');
    g.fillStyle = iris;
    g.beginPath();
    g.ellipse(ix, iy, 52, 68, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#150a24';
    g.lineWidth = 5;
    g.stroke();
    // inner ring + glow crescent
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(ix, iy + 6, 36, 50, 0, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    softDot(g, ix, iy + 40, 34, 'rgba(236,222,255,0.55)', 0.45);
    // slit pupil
    g.fillStyle = '#0d0716';
    g.beginPath();
    g.ellipse(ix, iy + 2, 9, 40, 0, 0, Math.PI * 2);
    g.fill();
    // shadow of the upper lid
    const lid = g.createLinearGradient(0, EY - 80, 0, EY - 20);
    lid.addColorStop(0, 'rgba(60,30,90,0.7)');
    lid.addColorStop(1, 'rgba(60,30,90,0)');
    g.fillStyle = lid;
    g.fillRect(EX - 110, EY - 120, 240, 100);
    // highlights
    g.fillStyle = '#ffffff';
    g.save();
    g.translate(EX - 16, EY - 28);
    g.rotate(-0.35);
    g.beginPath();
    g.ellipse(0, 0, 16, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.beginPath();
    g.arc(EX + 28, EY + 32, 8, 0, Math.PI * 2);
    g.fill();
    sparkle(g, EX - 24, EY + 24, 12);
    g.restore();

    // lower lash line
    g.strokeStyle = '#2b1426';
    g.lineCap = 'round';
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const [x, y] = bez(outer, lo1, lo2, inner, i / 20 * 0.55);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    [0.12, 0.24].forEach((t) => {
      const [x, y] = bez(outer, lo1, lo2, inner, t);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 8, y + 14);
      g.stroke();
    });
    // double-lid crease
    g.strokeStyle = 'rgba(90,40,80,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(EX - 44, EY - 86);
    g.quadraticCurveTo(EX + 6, EY - 116, EX + 64, EY - 92);
    g.stroke();
  }

  // upper lash line (or the closed lid) + the wing
  g.strokeStyle = '#0c0710';
  g.fillStyle = '#0c0710';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 13;
  g.beginPath();
  if (closed) {
    g.moveTo(inner[0] + 4, inner[1] - 6);
    g.bezierCurveTo(EX - 30, EY + 20, EX + 40, EY + 18, outer[0], outer[1] + 8);
  } else {
    g.moveTo(...inner);
    g.bezierCurveTo(...up1, ...up2, ...outer);
  }
  g.stroke();

  g.beginPath();
  g.moveTo(EX + 40, EY - (closed ? 6 : 76));
  g.quadraticCurveTo(EX + 90, EY - (closed ? 12 : 70), EX + 124, EY - 62);
  g.quadraticCurveTo(EX + 96, EY - 38, EX + 70, EY - 22);
  g.closePath();
  g.fill();

  // spiky outer lashes
  g.lineWidth = 5;
  const lashes = closed ? [[EX + 44, EY + 8, EX + 56, EY + 28], [EX + 58, EY + 2, EX + 74, EY + 18]] : [[EX + 50, EY - 80, EX + 74, EY - 104], [EX + 64, EY - 66, EX + 96, EY - 84], [EX + 22, EY - 88, EX + 34, EY - 112]];
  lashes.forEach(([x0, y0, x1, y1]) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2 + 4, (y0 + y1) / 2 + 6, x1, y1);
    g.stroke();
  });
}

function brow(g) {
  // short, thin and a little smug (inner end lower)
  g.fillStyle = 'rgba(28,18,30,0.92)';
  g.beginPath();
  g.moveTo(EX - 64, EY - 136);
  g.quadraticCurveTo(EX - 4, EY - 168, EX + 62, EY - 160);
  g.quadraticCurveTo(EX, EY - 158, EX - 64, EY - 128);
  g.closePath();
  g.fill();
}

function drawFace(closed) {
  const { c, g } = makeCanvas(S, S);

  // hatched anime blush
  for (const s of [-1, 1]) {
    softDot(g, CX + s * 172, 690, 74, 'rgba(255,112,150,0.34)', 0.45);
    g.strokeStyle = 'rgba(232,86,122,0.62)';
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const x = CX + s * (138 + i * 20);
      g.beginPath();
      g.moveTo(x + 7, 674);
      g.lineTo(x - 7, 700);
      g.stroke();
    }
  }

  for (const s of [-1, 1]) {
    g.save();
    g.translate(CX, 0);
    g.scale(s, 1);
    brow(g);
    // draw the eyes a touch larger than their construction lines
    g.translate(EX, EY);
    g.scale(1.1, 1.1);
    g.translate(-EX, -EY);
    eye(g, closed);
    g.restore();
  }

  // tiny nose
  g.strokeStyle = 'rgba(170,96,120,0.6)';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(CX + 5, 674);
  g.lineTo(CX - 2, 690);
  g.stroke();
  softDot(g, CX + 2, 664, 9, 'rgba(255,255,255,0.5)');

  // smug smirk with dark plum lips and one fang
  g.fillStyle = 'rgba(66,18,48,0.62)';
  g.beginPath();
  g.moveTo(CX - 26, 777);
  g.quadraticCurveTo(CX, 800, CX + 24, 772);
  g.quadraticCurveTo(CX, 783, CX - 26, 777);
  g.fill();
  g.strokeStyle = '#34101f';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(CX - 36, 770);
  g.quadraticCurveTo(CX - 2, 784, CX + 32, 762);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#34101f';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(CX + 8, 776);
  g.lineTo(CX + 19, 772);
  g.lineTo(CX + 15, 787);
  g.closePath();
  g.fill();
  g.stroke();
  softDot(g, CX + 4, 790, 10, 'rgba(255,255,255,0.35)', 0.5);

  // tiny cross tattoo under her left eye
  g.strokeStyle = 'rgba(26,16,34,0.9)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(CX + 226, 628);
  g.lineTo(CX + 226, 656);
  g.moveTo(CX + 216, 637);
  g.lineTo(CX + 236, 637);
  g.stroke();

  return c;
}

export function animeFaceTextures() {
  return { open: toTexture(drawFace(false)), closed: toTexture(drawFace(true)) };
}
