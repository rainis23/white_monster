// Fan recreation of the white 16oz can wrap, painted on two canvases:
//   map - the printed colours
//   orm - occlusion / roughness / metalness (R / G / B), so the silver ink
//         reads as real metal and the white ink as glossy varnish.
// The canvas covers the whole sidewall: x wraps the circumference with the
// front of the can at the centre, y runs from the seam (top) to the base.
import { FONTS, rng, makeCanvas, toTexture, spaced } from './textures.js';

const CIRC_MM = 208; // 2 * PI * 33.1 mm body radius
const HEIGHT_MM = 157;
const W = 2048;
const K = W / CIRC_MM; // px per mm
const H = Math.round(HEIGHT_MM * K);

// x in mm measured around the can from the front centre, y in mm from the base
const X = (mm) => W / 2 + mm * K;
const Y = (mm) => (HEIGHT_MM - mm) * K;

const ORM = {
  white: 'rgb(255,112,0)',
  black: 'rgb(255,96,0)',
  silver: 'rgb(255,70,255)',
  bare: 'rgb(255,70,255)',
};
const INK = {
  white: '#f6f6f8',
  black: '#0e0e12',
  grey: '#55575e',
  silver: '#dcdee4',
};

// run the same drawing on the colour and the ORM canvas
function both(ctxs, draw) {
  draw(ctxs.c, false);
  draw(ctxs.o, true);
}

function clawPath(g, top, tip, width, bend, seed) {
  // one ragged claw gash: flat-ish torn top, full width for most of its length,
  // then tapering to a sharp point
  const rand = rng(seed);
  const N = 54;
  const left = [];
  const right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const cx = top[0] + (tip[0] - top[0]) * t + Math.sin(Math.PI * t) * bend;
    const cy = top[1] + (tip[1] - top[1]) * t;
    let w = width / 2;
    if (t > 0.55) w *= Math.pow(1 - (t - 0.55) / 0.45, 0.85);
    if (t < 0.04) w *= 0.75 + t * 6;
    // sharp torn teeth every few points rather than a wobbly edge
    const jag = () => (i % 3 === 0 ? (rand() - 0.35) * 1.3 : (rand() - 0.5) * 0.25);
    left.push([cx - w - jag(), cy]);
    right.push([cx + w + jag(), cy]);
  }
  g.beginPath();
  // ragged torn top edge
  g.moveTo(X(left[0][0]), Y(left[0][1] - 1.2));
  for (let k = 1; k < 6; k++) {
    const x = left[0][0] + ((right[0][0] - left[0][0]) * k) / 6;
    g.lineTo(X(x), Y(top[1] + (k % 2 ? 1.6 : -0.4) * (0.6 + rand() * 0.7)));
  }
  g.lineTo(X(right[0][0]), Y(right[0][1] - 0.8));
  right.forEach(([x, y]) => g.lineTo(X(x), Y(y)));
  for (let i = left.length - 1; i >= 0; i--) g.lineTo(X(left[i][0]), Y(left[i][1]));
  g.closePath();
}

const CLAWS = [
  { top: [-15.4, 122], tip: [-17.4, 59], width: 10.2, bend: -1.4, seed: 11 },
  { top: [0, 124.5], tip: [0.6, 49], width: 11.2, bend: 0.4, seed: 23 },
  { top: [15.4, 121.4], tip: [17.7, 60], width: 10.2, bend: 1.4, seed: 37 },
];

function drawClawLogo(ctxs) {
  both(ctxs, (g, orm) => {
    // heavy black keyline first, then the silver ink inside it
    CLAWS.forEach((c) => {
      clawPath(g, c.top, c.tip, c.width, c.bend, c.seed);
      g.lineJoin = 'round';
      g.lineWidth = 1.7 * K;
      g.strokeStyle = orm ? ORM.black : INK.black;
      g.stroke();
      g.fillStyle = orm ? ORM.silver : INK.silver;
      g.fill();
    });
    if (orm) return;
    // brushed shading inside the silver
    CLAWS.forEach((c) => {
      g.save();
      clawPath(g, c.top, c.tip, c.width, c.bend, c.seed);
      g.clip();
      const grad = g.createLinearGradient(X(c.top[0] - c.width / 2), 0, X(c.top[0] + c.width / 2), 0);
      grad.addColorStop(0, 'rgba(120,122,132,0.55)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(110,112,122,0.5)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.restore();
    });
  });
}

// Grungy condensed wordmark, distressed by painting white-ink scratches over it.
function drawWordmark(ctxs, text, cx, cy, capMm, rotate) {
  const rand = rng(99);
  const fontPx = (capMm * K) / 0.74;
  const scratches = [];
  for (let i = 0; i < 70; i++) {
    scratches.push([(rand() - 0.5) * text.length * capMm * 0.62, (rand() - 0.5) * capMm, 1.5 + rand() * 4, rand() * 0.6 - 0.3, 0.25 + rand() * 0.5]);
  }
  both(ctxs, (g, orm) => {
    g.save();
    g.translate(X(cx), Y(cy));
    if (rotate) g.rotate(rotate);
    g.font = `${fontPx}px ${FONTS.bold}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = orm ? ORM.black : INK.black;
    spaced(g, text, 0, 0, 0.6 * K);
    g.strokeStyle = orm ? ORM.white : INK.white;
    g.lineCap = 'round';
    scratches.forEach(([x, y, len, ang, w]) => {
      g.lineWidth = w * K;
      g.beginPath();
      g.moveTo(x * K, y * K);
      g.lineTo((x + Math.cos(ang) * len) * K, (y + Math.sin(ang) * len) * K);
      g.stroke();
    });
    g.restore();
  });
}

function text(ctxs, str, xMm, yMm, { capMm, weight = 600, font = FONTS.can, color = INK.black, orm = ORM.black, spacing = 0, align = 'center' }) {
  both(ctxs, (g, isOrm) => {
    g.font = `${weight} ${(capMm * K) / 0.72}px ${font}`;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillStyle = isOrm ? orm : color;
    spaced(g, str, X(xMm), Y(yMm), spacing * K);
  });
}

// draw something centred on the back seam twice so it wraps cleanly
function onBack(fn) {
  fn(CIRC_MM / 2);
  fn(-CIRC_MM / 2);
}

export function canLabelTextures() {
  const color = makeCanvas(W, H);
  const orm = makeCanvas(W, H);
  const ctxs = { c: color.g, o: orm.g };

  // pearl white ink over the whole wall, bare aluminium at the very base
  both(ctxs, (g, isOrm) => {
    if (isOrm) {
      g.fillStyle = ORM.white;
      g.fillRect(0, 0, W, H);
    } else {
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#f1f1f4');
      grad.addColorStop(0.5, '#fbfbfc');
      grad.addColorStop(1, '#f1f1f4');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    g.fillStyle = isOrm ? ORM.bare : '#c9ccd2';
    g.fillRect(0, Y(1.6), W, H);
  });

  // silver pinstripes near the shoulder and the base
  both(ctxs, (g, isOrm) => {
    g.fillStyle = isOrm ? ORM.silver : INK.silver;
    g.fillRect(0, Y(139.6), W, 1.4 * K);
    g.fillRect(0, Y(15.4), W, 1.4 * K);
    g.fillStyle = isOrm ? ORM.black : INK.black;
    g.fillRect(0, Y(140.5), W, 0.5 * K);
    g.fillRect(0, Y(14.2), W, 0.5 * K);
  });

  /* ---------------- front ---------------- */
  drawClawLogo(ctxs);

  text(ctxs, 'ZERO SUGAR', 0, 129.5, { capMm: 4.2, weight: 800, spacing: 1.0 });
  both(ctxs, (g, isOrm) => {
    // rules either side of "ZERO SUGAR"
    g.font = `800 ${(4.2 * K) / 0.72}px ${FONTS.can}`;
    if ('letterSpacing' in g) g.letterSpacing = `${1.0 * K}px`;
    const half = g.measureText('ZERO SUGAR').width / 2 / K;
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.fillStyle = isOrm ? ORM.black : INK.black;
    g.fillRect(X(half + 2.5), Y(131.6), 8 * K, 0.5 * K);
    g.fillRect(X(-half - 10.5), Y(131.6), 8 * K, 0.5 * K);
  });
  text(ctxs, 'ULTRA', 0.9, 33, { capMm: 9.2, weight: 300, spacing: 4.4 });
  text(ctxs, 'ZERO CALORIES · LIGHT CITRUS', 0, 25.5, { capMm: 2.3, weight: 600, spacing: 0.7, color: INK.grey });

  /* ---------------- right side: wordmark ---------------- */
  drawWordmark(ctxs, 'MONSTER', 47, 84, 15.5, -Math.PI / 2);
  both(ctxs, (g, isOrm) => {
    g.save();
    g.translate(X(58.5), Y(84));
    g.rotate(-Math.PI / 2);
    g.font = `800 ${(4 * K) / 0.72}px ${FONTS.can}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = isOrm ? ORM.black : INK.black;
    spaced(g, 'ENERGY', 0, 0, 3.2 * K);
    g.restore();
  });
  text(ctxs, '16 FL OZ (473 mL)', 50, 21, { capMm: 2.6, weight: 700, spacing: 0.4 });

  /* ---------------- left side: flavour copy + badges ---------------- */
  text(ctxs, 'ZERO ULTRA', -50, 120, { capMm: 4.2, weight: 800, spacing: 0.8 });
  [
    'Light, crisp citrus flavor',
    'with a clean, smooth finish.',
    'Zero sugar. Zero calories.',
    'Full Monster energy blend:',
    'taurine, panax ginseng,',
    'B vitamins & caffeine.',
  ].forEach((line, i) => text(ctxs, line, -50, 110 - i * 4.6, { capMm: 2.05, weight: 500, color: '#34353b' }));
  both(ctxs, (g, isOrm) => {
    [[-58, '0g', 'SUGAR'], [-42, '0', 'CAL']].forEach(([x, big, small]) => {
      g.strokeStyle = isOrm ? ORM.black : INK.black;
      g.lineWidth = 0.55 * K;
      g.beginPath();
      g.arc(X(x), Y(66), 6.4 * K, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = isOrm ? ORM.black : INK.black;
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `800 ${(4 * K) / 0.72}px ${FONTS.can}`;
      g.fillText(big, X(x), Y(66.4));
      g.font = `700 ${(1.6 * K) / 0.72}px ${FONTS.can}`;
      spaced(g, small, X(x), Y(62.6), 0.3 * K);
    });
  });

  /* ---------------- back: tagline, nutrition facts, barcode, recycling ---------------- */
  onBack((c) => {
    text(ctxs, 'UNLEASH THE', c, 131, { capMm: 5.2, weight: 400, font: FONTS.bold, spacing: 0.5 });
    text(ctxs, 'ULTRA BEAST!', c, 124, { capMm: 5.2, weight: 400, font: FONTS.bold, spacing: 0.5 });

    // nutrition facts panel
    both(ctxs, (g, isOrm) => {
      const ink = isOrm ? ORM.black : INK.black;
      const x0 = X(c - 15);
      const w = 30 * K;
      g.strokeStyle = ink;
      g.fillStyle = ink;
      g.lineWidth = 0.35 * K;
      g.strokeRect(x0, Y(116), w, 64 * K);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.font = `800 ${(3.2 * K) / 0.72}px ${FONTS.can}`;
      g.fillText('Nutrition Facts', x0 + 1 * K, Y(111.2));
      g.font = `500 ${(1.5 * K) / 0.72}px ${FONTS.can}`;
      g.fillText('2 servings per container', x0 + 1 * K, Y(108));
      g.fillText('Serving size  8 fl oz (240mL)', x0 + 1 * K, Y(105.3));
      g.fillRect(x0 + 1 * K, Y(104), w - 2 * K, 1.4 * K);
      g.font = `800 ${(2.6 * K) / 0.72}px ${FONTS.can}`;
      g.fillText('Calories', x0 + 1 * K, Y(98.8));
      g.textAlign = 'right';
      g.fillText('5', x0 + w - 1 * K, Y(98.8));
      g.fillRect(x0 + 1 * K, Y(97.6), w - 2 * K, 0.8 * K);
      const rows = [
        ['Total Fat 0g', '0%'],
        ['Sodium 185mg', '8%'],
        ['Total Carb. 2g', '1%'],
        ['Total Sugars 0g', ''],
        ['Protein 0g', ''],
        ['Niacin', '100%'],
        ['Vitamin B6', '120%'],
        ['Vitamin B12', '120%'],
      ];
      rows.forEach(([k, v], i) => {
        const y = Y(94.2 - i * 3.6);
        g.font = `600 ${(1.55 * K) / 0.72}px ${FONTS.can}`;
        g.textAlign = 'left';
        g.fillText(k, x0 + 1 * K, y);
        g.textAlign = 'right';
        g.fillText(v, x0 + w - 1 * K, y);
        g.fillRect(x0 + 1 * K, y + 0.9 * K, w - 2 * K, 0.18 * K);
      });
      g.textAlign = 'left';
      g.font = `500 ${(1.2 * K) / 0.72}px ${FONTS.can}`;
      ['ENERGY BLEND: TAURINE, PANAX GINSENG', 'EXTRACT, L-CARNITINE, CAFFEINE,', 'GLUCURONOLACTONE, INOSITOL.'].forEach((l, i) =>
        g.fillText(l, x0 + 1 * K, Y(62.5 - i * 2.2)),
      );
    });

    text(ctxs, 'FAN-MADE 3D RECREATION · NOT AN OFFICIAL PRODUCT', c, 8.5, { capMm: 1.3, weight: 600, color: '#8a8c93', spacing: 0.25 });
  });

  // barcode (runs along the height, like the real thing)
  both(ctxs, (g, isOrm) => {
    const br = rng(71);
    g.fillStyle = isOrm ? 'rgb(255,120,0)' : '#ffffff';
    g.fillRect(X(78), Y(52), 13 * K, 30 * K);
    g.fillStyle = isOrm ? ORM.black : INK.black;
    let y = 24;
    while (y < 50) {
      const t = 0.18 + br() * 0.55;
      if (br() > 0.3) g.fillRect(X(79), Y(y + t), 9.5 * K, t * K);
      y += t + 0.2 + br() * 0.35;
    }
    g.save();
    g.translate(X(90.2), Y(37));
    g.rotate(-Math.PI / 2);
    g.font = `500 ${(1.4 * K) / 0.72}px ${FONTS.can}`;
    g.textAlign = 'center';
    g.fillText('0 12345 67890 5', 0, 0);
    g.restore();
  });

  // recycling + deposit copy on the other side of the seam
  both(ctxs, (g, isOrm) => {
    const ink = isOrm ? ORM.black : INK.black;
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineWidth = 0.45 * K;
    const cx = X(-84);
    const cy = Y(42);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      g.beginPath();
      g.moveTo(-2.4 * K, -3.2 * K);
      g.lineTo(2.2 * K, -3.2 * K);
      g.lineTo(1.2 * K, -4.2 * K);
      g.moveTo(2.2 * K, -3.2 * K);
      g.lineTo(1.2 * K, -2.2 * K);
      g.stroke();
      g.restore();
    }
    g.textAlign = 'center';
    g.font = `700 ${(1.4 * K) / 0.72}px ${FONTS.can}`;
    ['PLEASE RECYCLE', 'CA CASH REFUND', 'HI 5¢ · ME VT 5¢', 'MI 10¢ · OR 10¢'].forEach((l, i) => g.fillText(l, cx, Y(34 - i * 2.6)));
  });

  const map = toTexture(color.c, { anisotropy: 16 });
  const ormTex = toTexture(orm.c, { color: false, anisotropy: 16 });
  return { map, orm: ormTex };
}
