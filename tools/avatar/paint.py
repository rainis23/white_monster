"""Texture painting for the avatar: a UV-space baker (so procedural patterns
can be painted onto the body at their 3D positions), the face makeup decal,
the iris texture and the eyelash strip texture."""

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


# ------------------------------------------------------------------ #
# UV baking                                                           #
# ------------------------------------------------------------------ #

def rasterize(uv, tris, attrs, size):
    """For every texel covered by a triangle in UV space, interpolate the given
    per-vertex attributes. Returns (mask, [images...])."""
    mask = np.zeros((size, size), dtype=bool)
    outs = [np.zeros((size, size, a.shape[1]), dtype=np.float32) for a in attrs]
    px = uv * size
    px[:, 1] = uv[:, 1] * size  # uv already has v flipped (top-left origin)
    for tri in tris:
        p = px[tri]
        x0, y0 = np.floor(p.min(axis=0)).astype(int)
        x1, y1 = np.ceil(p.max(axis=0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        a, b, c = p
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
        if not inside.any():
            continue
        iy, ix = np.nonzero(inside)
        gy, gx = iy + y0, ix + x0
        mask[gy, gx] = True
        W = np.stack([w0[inside], w1[inside], w2[inside]], axis=1)
        for out, a_ in zip(outs, attrs):
            out[gy, gx] = W @ a_[tri]
    return mask, outs


def dilate(img, mask, steps=6):
    """Bleed island colours outward so mip-mapping never samples the void."""
    img = img.copy()
    mask = mask.copy()
    for _ in range(steps):
        acc = np.zeros_like(img)
        cnt = np.zeros(mask.shape, dtype=np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            m = np.roll(mask, (dy, dx), axis=(0, 1))
            acc += np.roll(img, (dy, dx), axis=(0, 1)) * m[..., None]
            cnt += m
        grow = (~mask) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        mask = mask | grow
    return img


def fbm(p, octaves=4, seed=0):
    """Cheap 3D value-noise fbm, vectorised."""
    rng = np.random.default_rng(seed)
    perm = rng.integers(0, 1 << 30, size=(3,))
    total = np.zeros(p.shape[:-1], dtype=np.float32)
    amp, freq = 0.5, 1.0
    for o in range(octaves):
        q = p * freq
        i = np.floor(q).astype(np.int64)
        f = q - i
        f = f * f * (3 - 2 * f)

        def h(dx, dy, dz):
            n = (i[..., 0] + dx) * 73856093 ^ (i[..., 1] + dy) * 19349663 ^ (i[..., 2] + dz) * 83492791 ^ perm[0] + o
            n = (n ^ (n >> 13)) * 1274126177
            return ((n & 0xFFFF) / 65535.0).astype(np.float32)

        v = 0
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    wx = f[..., 0] if dx else 1 - f[..., 0]
                    wy = f[..., 1] if dy else 1 - f[..., 1]
                    wz = f[..., 2] if dz else 1 - f[..., 2]
                    v = v + h(dx, dy, dz) * wx * wy * wz
        total += amp * v
        amp *= 0.5
        freq *= 2.03
    return total


# ------------------------------------------------------------------ #
# Face makeup decal                                                   #
# ------------------------------------------------------------------ #

class FaceCanvas:
    """A square canvas laid flat over the front of the face. `to_px` maps
    face-plane (x, y) in model units to pixels."""

    def __init__(self, center, half, size=2048):
        self.cx, self.cy = center
        self.half = half
        self.size = size
        self.img = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    def to_px(self, x, y):
        s = self.size / (2 * self.half)
        return ((x - self.cx) * s + self.size / 2, (self.cy - y) * s + self.size / 2)

    def uv(self, pos):
        u = (pos[:, 0] - self.cx) / (2 * self.half) + 0.5
        v = (self.cy - pos[:, 1]) / (2 * self.half) + 0.5
        return np.stack([u, v], axis=1)

    def layer(self):
        return Image.new('RGBA', (self.size, self.size), (0, 0, 0, 0))

    def add(self, layer, blur=0):
        if blur:
            layer = layer.filter(ImageFilter.GaussianBlur(blur))
        self.img = Image.alpha_composite(self.img, layer)


def catmull(points, n=24):
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (np.array(pts[j], dtype=float) for j in (i - 1, i, i + 1, i + 2))
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(np.array(points[-1], dtype=float))
    return out


def paint_face(fc, lm):
    """Goth-baddie makeup. `lm` holds face-plane landmarks (model units):
    per side: lid (upper lash line points inner->outer), lower (lower lash
    line), brow (inner, arch, tail); mouth corners, cupid, lower lip."""
    S = fc.size / (2 * fc.half)  # px per unit
    P = fc.to_px

    # soft contour + blush
    lay = fc.layer()
    d = ImageDraw.Draw(lay)
    for side in ('L', 'R'):
        cx, cy = lm[side]['cheek']
        x, y = P(cx, cy)
        r = 0.13 * S
        d.ellipse([x - r, y - r * 0.5, x + r, y + r * 0.5], fill=(214, 118, 150, 55))
    fc.add(lay, blur=0.05 * S)

    for side in ('L', 'R'):
        L = lm[side]
        lid = [P(*p) for p in L['lid']]
        lower = [P(*p) for p in L['lower']]
        inner, outer = np.array(lid[0]), np.array(lid[-1])
        out_dir = outer - inner
        out_dir /= np.linalg.norm(out_dir)
        up = np.array([0, -1.0])
        wing_tip = outer + out_dir * 0.2 * S + up * 0.12 * S

        # smoky shadow on the lid, heavier at the outer corner
        lay = fc.layer()
        d = ImageDraw.Draw(lay)
        lid_arr = np.array(lid)
        top = [tuple(p + up * 0.09 * S * (0.6 + 0.6 * i / (len(lid_arr) - 1))) for i, p in enumerate(lid_arr)]
        d.polygon([tuple(p) for p in lid_arr] + top[::-1], fill=(30, 18, 38, 200))
        d.polygon([tuple(outer), tuple(wing_tip), tuple(outer + up * 0.1 * S)], fill=(20, 10, 26, 210))
        fc.add(lay, blur=0.035 * S)
        lay = fc.layer()
        d = ImageDraw.Draw(lay)
        d.polygon([tuple(p) for p in np.array(lower)] + [tuple(p + np.array([0, 0.045 * S])) for p in np.array(lower)[::-1]],
                  fill=(28, 16, 34, 90))
        fc.add(lay, blur=0.02 * S)

        # sharp winged liner
        lay = fc.layer()
        d = ImageDraw.Draw(lay)
        line = catmull([tuple(p) for p in lid_arr], 12)
        width = [0.008 + 0.018 * (i / (len(line) - 1)) ** 1.4 for i in range(len(line))]
        poly_top, poly_bot = [], []
        for i, p in enumerate(line):
            q = line[min(i + 1, len(line) - 1)] - line[max(i - 1, 0)]
            nrm = np.array([q[1], -q[0]])
            nrm /= (np.linalg.norm(nrm) + 1e-9)
            if nrm[1] > 0:
                nrm = -nrm
            poly_top.append(tuple(p + nrm * width[i] * S))
            poly_bot.append(tuple(p - nrm * 0.004 * S))
        d.polygon(poly_top + [tuple(wing_tip)] + poly_bot[::-1], fill=(8, 6, 10, 255))
        # tightline under the eye, fading toward the inner corner
        low = catmull([tuple(p) for p in np.array(lower)], 10)
        for i in range(len(low) - 1):
            t = i / (len(low) - 1)
            d.line([tuple(low[i]), tuple(low[i + 1])], fill=(10, 8, 12, int(200 * (1 - t) ** 1.5)), width=max(1, int(0.005 * S)))
        fc.add(lay, blur=0.0015 * S)

        # brows: thin, arched, dark
        lay = fc.layer()
        d = ImageDraw.Draw(lay)
        brow = catmull([P(*p) for p in L['brow']], 16)
        for i in range(len(brow) - 1):
            t = i / (len(brow) - 1)
            w = (0.018 * (1 - t) + 0.006) * S
            d.line([tuple(brow[i]), tuple(brow[i + 1])], fill=(24, 18, 22, 235), width=max(1, int(w)))
        fc.add(lay, blur=0.004 * S)

    # lips: overlined black-plum with a glossy hit
    M = lm['mouth']
    cl, cr = np.array(P(*M['left'])), np.array(P(*M['right']))
    top_c = np.array(P(*M['top']))
    bot_c = np.array(P(*M['bottom']))
    seam_c = np.array(P(*M['seam']))
    w = cr[0] - cl[0]
    upper = catmull([tuple(cl), tuple(cl + [w * 0.22, -(seam_c[1] - top_c[1]) * 0.7]), tuple(top_c + [-w * 0.1, 0]),
                     tuple(top_c + [0, (seam_c[1] - top_c[1]) * 0.18]), tuple(top_c + [w * 0.1, 0]),
                     tuple(cr - [w * 0.22, (seam_c[1] - top_c[1]) * 0.7]), tuple(cr)], 10)
    lower = catmull([tuple(cr), tuple(cr + [-w * 0.2, (bot_c[1] - seam_c[1]) * 0.62]),
                     tuple(bot_c - [0, (bot_c[1] - seam_c[1]) * 0.08]),
                     tuple(cl + [w * 0.2, (bot_c[1] - seam_c[1]) * 0.62]), tuple(cl)], 10)
    lay = fc.layer()
    d = ImageDraw.Draw(lay)
    d.polygon([tuple(p) for p in upper + lower], fill=(22, 8, 18, 250))
    fc.add(lay, blur=0.004 * S)
    # ombre: a softer plum toward the middle of the lips, liner-dark at the edges
    centre = (seam_c + np.array([0, (bot_c[1] - top_c[1]) * 0.05])).astype(float)
    inner = [tuple(centre + (np.array(p) - centre) * [0.55, 0.45]) for p in upper + lower]
    lay = fc.layer()
    d = ImageDraw.Draw(lay)
    d.polygon(inner, fill=(92, 30, 62, 150))
    fc.add(lay, blur=0.012 * S)
    lay = fc.layer()
    d = ImageDraw.Draw(lay)
    seam = catmull([tuple(cl), tuple(seam_c + [-w * 0.2, -0.004 * S]), tuple(seam_c), tuple(seam_c + [w * 0.2, -0.004 * S]), tuple(cr)], 10)
    d.line([tuple(p) for p in seam], fill=(4, 2, 4, 255), width=max(1, int(0.008 * S)))
    gx, gy = (seam_c + bot_c) / 2
    d.ellipse([gx - w * 0.14, gy - 0.012 * S, gx + w * 0.18, gy + 0.018 * S], fill=(255, 255, 255, 70))
    fc.add(lay, blur=0.006 * S)

    # tiny claw-scratch tattoo under her left eye
    lay = fc.layer()
    d = ImageDraw.Draw(lay)
    tx, ty = P(*lm['tattoo'])
    for k in range(3):
        x = tx + (k - 1) * 0.022 * S
        d.line([(x, ty - 0.035 * S), (x - 0.006 * S, ty + 0.03 * S)], fill=(16, 12, 20, 230), width=max(1, int(0.006 * S)))
    fc.add(lay, blur=0.0015 * S)
    return fc.img


# ------------------------------------------------------------------ #
# Eyes and lashes                                                     #
# ------------------------------------------------------------------ #

def iris_texture(template_path, size=1024):
    """Recolour MakeHuman's eye texture layout: icy silver iris, dark limbal
    ring and a slightly larger pupil, on a clean white sclera."""
    src = np.asarray(Image.open(template_path).convert('RGB').resize((size, size)), dtype=np.float32) / 255
    lum = src.mean(axis=2)
    out = np.ones((size, size, 3), dtype=np.float32) * np.array([0.93, 0.92, 0.94])
    # soft grey shading of the sclera from the template
    out *= (0.82 + 0.18 * np.clip((lum - 0.55) / 0.35, 0, 1))[..., None]
    yy, xx = np.mgrid[0:size, 0:size] / size
    dark = lum < 0.42
    for quad in ((xx > 0.5) & (yy < 0.5), (xx < 0.5) & (yy > 0.5)):
        m = dark & quad
        cy, cx = yy[m].mean(), xx[m].mean()
        r = np.hypot(xx - cx, yy - cy)
        ang = np.arctan2(yy - cy, xx - cx)
        R = 0.118
        fibres = 0.5 + 0.5 * np.sin(ang * 60 + np.sin(ang * 7) * 3)
        base = np.array([0.72, 0.78, 0.86])
        iris = base * (0.75 + 0.3 * fibres[..., None]) * (1.05 - 0.45 * (r / R)[..., None])
        limbal = np.clip((r - R * 0.8) / (R * 0.2), 0, 1)[..., None]
        iris = iris * (1 - limbal * 0.85)
        pupil = np.clip((r - 0.036) / 0.008, 0, 1)[..., None]
        iris = iris * pupil + np.array([0.02, 0.02, 0.03]) * (1 - pupil)
        inside = np.clip((R - r) / 0.006, 0, 1)[..., None]
        out = out * (1 - inside) + iris * inside
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def lash_texture(w=512, h=128, seed=3):
    """Alpha strip of lashes: u runs along the lid, v from root (0) to tip (1)."""
    rng = np.random.default_rng(seed)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i in range(150):
        x = rng.uniform(0, w)
        length = h * rng.uniform(0.55, 1.0) * (0.55 + 0.45 * math.sin(math.pi * x / w) ** 0.6)
        lean = rng.uniform(-6, 6) + (x / w - 0.5) * 26
        pts = [(x + lean * (t ** 2), h - 1 - t * length) for t in np.linspace(0, 1, 8)]
        for k in range(len(pts) - 1):
            a = int(255 * (1 - k / (len(pts) - 1)) ** 0.5)
            d.line([pts[k], pts[k + 1]], fill=(10, 8, 12, a), width=max(1, int(3.2 * (1 - k / len(pts)))))
    return img.transpose(Image.FLIP_TOP_BOTTOM)
