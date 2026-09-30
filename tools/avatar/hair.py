"""Long, softly waved platinum hair with curtain bangs.

The hair is a few layered sheets. Each sheet is a row of strand columns that
start at a middle part, follow the scalp, then fall around her shoulders
(colliding with the body and the sweater). Neighbouring columns are joined
into wide cards (locks) with uneven tips, so the hair reads as one mass
rather than loose ribbons. Units: model decimetres."""

from collections import defaultdict

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DEG = np.pi / 180


def direction(az, el):
    return np.array([np.cos(el) * np.sin(az), np.sin(el), np.cos(el) * np.cos(az)])


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def arc(pts):
    return np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])


def resample(pts, n, upto=None):
    s = arc(pts)
    ss = np.linspace(0, s[-1] if upto is None else upto, n)
    return np.stack([np.interp(ss, s, pts[:, i]) for i in range(3)], 1), ss


class Grid:
    """Spatial hash over surface points with normals, for pushing points out of the body."""

    def __init__(self, pts, nrm, cell=0.25):
        self.pts = pts
        self.nrm = nrm
        self.cell = cell
        self.map = defaultdict(list)
        for i, k in enumerate(map(tuple, np.floor(pts / cell).astype(int))):
            self.map[k].append(i)

    def push_out(self, p, clear):
        k = np.floor(p / self.cell).astype(int)
        idx = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    idx += self.map.get((k[0] + dx, k[1] + dy, k[2] + dz), [])
        if not idx:
            return p
        q = self.pts[idx]
        i = np.argmin(np.linalg.norm(q - p, axis=1))
        n = self.nrm[idx[i]]
        d = np.dot(p - q[i], n)  # signed: negative when inside
        if d < clear:
            p = p + n * (clear - d)
        return p


class Hair:
    def __init__(self, ctx, outfit, rng_seed=7):
        self.c = ctx
        self.o = outfit
        self.rng = np.random.default_rng(rng_seed)
        c = ctx
        verts = c.base.group_verts('body')
        dom = outfit.dom[verts]
        P = c.coords[verts]
        ear = np.isin(verts, c.lm.get('ear_verts', []))
        self.head_pts = P[(dom == 'head') & ~ear]
        eye_y = c.lm['eye_y']
        # skull centre: middle of the cranium above the brows (the face would pull it forward)
        cran = self.head_pts[self.head_pts[:, 1] > eye_y + 0.2]
        self.C = np.array([0.0, eye_y + 0.35, (cran[:, 2].min() + cran[:, 2].max()) / 2])
        # head + neck radius per direction on a 5 degree (az, el) grid, without the ears
        rel = P[np.isin(dom, ('head', 'neck01', 'neck02', 'neck03')) & ~ear] - self.C
        r = np.linalg.norm(rel, axis=1)
        az = np.arctan2(rel[:, 0], rel[:, 2])
        el = np.arcsin(np.clip(rel[:, 1] / r, -1, 1))
        R = np.zeros((72, 36))
        ia = np.clip(((az + np.pi) / (2 * np.pi) * 72).astype(int), 0, 71)
        ie = np.clip(((el + np.pi / 2) / np.pi * 36).astype(int), 0, 35)
        np.maximum.at(R, (ia, ie), r)

        def nbrs(R):  # azimuth wraps around, elevation does not
            E = np.pad(R, ((0, 0), (1, 1)), mode='edge')
            return [np.roll(R, 1, 0), np.roll(R, -1, 0), E[:, :-2], E[:, 2:]]

        for _ in range(12):  # fill holes
            R = np.where(R == 0, np.maximum.reduce(nbrs(R)) * 0.98, R)
        for _ in range(3):
            R = (R * 4 + sum(nbrs(R))) / 8
        self.R = R
        # the hair falls against the body (not the forearms/hands, they get posed) and the sweater
        keep = ~np.isin(dom, ('lowerarm01', 'lowerarm02', 'wrist')) & ~np.char.startswith(dom.astype(str), 'finger') \
            & ~np.char.startswith(dom.astype(str), 'metacarpal')
        sweater_pos, sweater_nrm = outfit.sweater_bake[:2]
        self.grid = Grid(np.concatenate([P[keep], sweater_pos]), np.concatenate([c.normals[verts][keep], sweater_nrm]))
        self.H = outfit.H

    # ---------------------------------------------------------------- scalp
    def radius(self, az, el):
        fa = (az + np.pi) / (2 * np.pi) * 72 - 0.5
        fe = np.clip((el + np.pi / 2) / np.pi * 36 - 0.5, 0, 34.999)
        a0, e0 = int(np.floor(fa)), int(np.floor(fe))
        ta, te = fa - a0, fe - e0
        a0, a1 = a0 % 72, (a0 + 1) % 72
        R = self.R
        return (R[a0, e0] * (1 - ta) * (1 - te) + R[a1, e0] * ta * (1 - te)
                + R[a0, e0 + 1] * (1 - ta) * te + R[a1, e0 + 1] * ta * te)

    def on_head(self, az, el, lift):
        return self.C + direction(az, el) * (self.radius(az, el) + lift)

    @staticmethod
    def hairline(az):
        """Elevation of the hairline seen from the skull centre: forehead, temples, around the ears, nape."""
        a = abs(az) / DEG
        if a < 35:
            return (22 - a * 0.1) * DEG
        if a < 75:
            return (18.5 - (a - 35)) * DEG
        if a < 100:
            return (-21.5 - (a - 75) * 0.6) * DEG
        return (-36.5 - (a - 100) * 0.25) * DEG

    def exit_el(self, phi):
        """Where a column leaves the skull, a little below the hairline."""
        return max(self.hairline(phi) - 10 * DEG, -66 * DEG)

    # ---------------------------------------------------------------- columns
    def fall(self, pts, lift, tip_y, forward, step=0.1):
        """Continue a polyline from its last point under gravity, colliding with the body."""
        pts = list(pts)
        p = pts[-1].copy()
        v = pts[-1] - pts[-2]
        v /= np.linalg.norm(v)
        clav = self.H['clavicle.L'][1]
        x0 = p[0]
        while p[1] > tip_y and len(pts) < 400:
            v = v * 0.6 + np.array([0, -0.4, 0])
            above = max(0, p[1] - (clav - 0.5))
            if forward:
                v = v + np.array([0, 0, 0.12]) * above
            else:
                v = v + np.array([0, 0, -0.1]) * above
            # fan out over the shoulders and back instead of closing in around the neck
            v = v + np.array([0.17 * x0, 0, 0]) * min(above, 1.0)
            v /= np.linalg.norm(v)
            p = self.grid.push_out(p + v * step, 0.1 + lift)
            pts.append(p.copy())
        return np.array(pts)

    def column(self, side, phi, lift, tip_y, forward):
        """One strand column: from the middle part over the scalp to the exit, then down.
        Returns (polyline, arc length where it leaves the scalp)."""
        a = abs(phi) / DEG
        # the root slides back along the part from the front hairline to the crown
        g = (38 + 82 * np.clip((a - 64) / (150 - 64), 0, 1)) * DEG
        az_r, el_r = (side * 1.5 * DEG, g) if g <= np.pi / 2 else (side * 178.5 * DEG, np.pi - g)
        az_e, el_e = side * a * DEG, self.exit_el(phi)
        pts = []
        n = 24
        for i in range(n):
            t = i / (n - 1)
            az = az_r + (az_e - az_r) * (1 - (1 - t) ** 2)
            el = el_r + (el_e - el_r) * t ** 2.4
            # hair starts flat at the part and builds volume away from it
            pts.append(self.on_head(az, el, 0.015 + (lift - 0.015) * smoothstep(0, 0.35, t)))
        scalp = arc(np.array(pts))[-1]
        return self.fall(pts, lift, tip_y, forward), scalp

    def bang(self, side, q, lift, tip_y):
        """Curtain bang column q in [0, 1] (inner edge to outer edge): from the front of the part,
        down across the forehead and out past the outer corner of the eye."""
        d0 = direction(side * 1.5 * DEG, (26 + 20 * q) * DEG)
        d1 = direction(side * (14 + 26 * q) * DEG, (0 + 20 * q) * DEG)
        d2 = direction(side * (42 + 22 * q) * DEG, (-28 - 2 * q) * DEG)
        pts = []
        n = 20
        for i in range(n):
            t = i / (n - 1)
            d = slerp(slerp(d0, d1, t), slerp(d1, d2, t), t)
            az, el = np.arctan2(d[0], d[2]), np.arcsin(np.clip(d[1], -1, 1))
            bump = np.sin(np.pi * min(1, t * 1.15)) * 0.1
            pts.append(self.on_head(az, el, 0.015 + (lift - 0.015) * smoothstep(0, 0.3, t) + bump))
        scalp = arc(np.array(pts))[-1]
        return self.fall(pts, lift, tip_y, True, step=0.08), scalp

    # ---------------------------------------------------------------- sheets
    def outward(self, p):
        o = p - self.C if p[1] > self.C[1] - 1.0 else np.array([p[0], 0, p[2] - self.C[2]])
        return o / (np.linalg.norm(o) + 1e-9)

    def normals(self, G):
        dU = np.gradient(G, axis=0) if len(G) > 1 else np.zeros_like(G)
        dV = np.gradient(G, axis=1)
        N = np.cross(dV, dU)
        N /= np.linalg.norm(N, axis=2, keepdims=True) + 1e-9
        for j in range(G.shape[0]):
            for i in range(G.shape[1]):
                if np.dot(N[j, i], self.outward(G[j, i])) < 0:
                    N[j, i] = -N[j, i]
        return N

    def sheet(self, columns, shade, tile=0.55, step=0.14, clump=3, tip_var=(0.82, 1.0), wave=0.12,
              wavelength=1.7, phase=0.0, bulge=0.035):
        """Join columns [(polyline, scalp_len)] into cards of `clump` columns each."""
        rng = self.rng
        L = np.array([arc(p)[-1] for p, _ in columns])
        n = max(6, int(round(L.max() / step)) + 1)
        G = np.stack([resample(p, n)[0] for p, _ in columns])
        S = np.stack([np.linspace(0, l, n) for l in L])
        E = np.array([s for _, s in columns])
        N = self.normals(G)
        # soft waves once the hair leaves the scalp (in/out along the sheet, plus a little sideways)
        if wave > 0:
            dU = np.gradient(G, axis=0) if len(G) > 1 else np.zeros_like(G)
            dU /= np.linalg.norm(dU, axis=2, keepdims=True) + 1e-9
            w = np.maximum(S - E[:, None], 0)
            amp = wave * smoothstep(0, 2.0, w)
            ph = 2 * np.pi * w / wavelength + phase + np.linspace(0, 0.8, len(G))[:, None]
            G = G + N * (amp * (0.5 + 0.5 * np.sin(ph)))[..., None] + dU * (amp * 0.5 * np.cos(ph))[..., None]
            N = self.normals(G)
        gaps = np.linalg.norm(np.diff(G, axis=0), axis=2) if len(G) > 1 else np.zeros((0, n))
        U = np.concatenate([[0], np.cumsum(np.median(gaps, axis=1))]) / tile + rng.uniform(0, 1)
        cards = []
        for j0 in range(0, max(1, len(G) - 1), clump):
            j1 = min(j0 + clump, len(G) - 1)
            m = max(4, int(round(rng.uniform(*tip_var) * (n - 1)))) + 1
            sub = G[j0:j1 + 1, :m].copy()
            nrm = N[j0:j1 + 1, :m]
            k = sub.shape[0]
            if k > 2 and bulge > 0:  # each lock is a little rounded
                prof = np.sin(np.pi * np.arange(k) / (k - 1))[:, None]
                ramp = smoothstep(0, 1.2, np.maximum(S[j0:j1 + 1, :m] - E[j0:j1 + 1, None], 0))
                sub = sub + nrm * (bulge * prof * ramp)[..., None]
            pos = sub.reshape(-1, 3)
            uv = np.stack([np.repeat(U[j0:j1 + 1], m), np.tile(np.linspace(0, 1, m), k)], 1)
            tris = []
            for a in range(k - 1):
                for i in range(m - 1):
                    p0, p1 = a * m + i, (a + 1) * m + i
                    tris += [(p0, p0 + 1, p1), (p1, p0 + 1, p1 + 1)]
            if k == 1:
                continue
            # wind the triangles to face outward, so double-sided lighting picks the right side
            mid = min(k // 2, k - 2) * m + m // 2
            fn = np.cross(pos[mid + 1] - pos[mid], pos[mid + m] - pos[mid])
            if np.dot(fn, nrm.reshape(-1, 3)[mid]) < 0:
                tris = [(t0, t2, t1) for t0, t1, t2 in tris]
            tint = shade * rng.uniform(0.92, 1.04)
            # a touch darker toward the roots, for depth
            col = np.repeat(tint * (0.86 + 0.14 * smoothstep(0, 0.35, uv[:, 1]))[:, None], 3, 1)
            cards.append((pos, nrm.reshape(-1, 3), uv, col, np.array(tris)))
        return cards

    def build(self):
        H = self.H
        rng = self.rng
        back_tip = H['spine04'][1] - 0.15  # to the small of her back
        front_tip = H['spine03'][1] - 0.4
        cards = []
        split = 108
        for layer, (lift, shade) in enumerate(((0.06, 0.8), (0.14, 0.9), (0.22, 1.0))):
            shorten = layer * 0.25  # outer layers a touch shorter
            off = layer / 3
            for side in (-1, 1):
                front = [self.column(side, (66 + (i + off) * 3.2) * DEG, lift,
                                     front_tip + shorten + rng.uniform(-0.1, 0.1), True)
                         for i in range(int((split - 66) / 3.2) + 1)]
                back = [self.column(side, min(180, split + (i + off) * 3.4) * DEG, lift,
                                    back_tip + shorten + rng.uniform(-0.1, 0.1), False)
                        for i in range(int((180 - split) / 3.4) + 1)]
                kw = dict(phase=layer * 1.3 + (side > 0) * 0.4)
                cards += self.sheet(front, shade, **kw)
                cards += self.sheet(back, shade, **kw)
        # curtain bangs over the forehead, falling into the face-framing layers
        eye_y = self.c.lm['eye_y']
        for side in (-1, 1):
            cols = [self.bang(side, q, 0.14, eye_y - 0.5 - 0.5 * q) for q in np.linspace(0, 1, 9)]
            cards += self.sheet(cols, 1.0, clump=2, tip_var=(0.9, 1.0), wave=0.05, wavelength=1.4, bulge=0.02)
        return cards

    # ---------------------------------------------------------------- output
    @staticmethod
    def mesh(cards):
        pos, nrm, uv, col, tris = [], [], [], [], []
        off = 0
        for p, n, u, c, t in cards:
            pos.append(p)
            nrm.append(n)
            uv.append(u)
            col.append(c)
            tris.append(t + off)
            off += len(p)
        return (np.concatenate(pos), np.concatenate(nrm), np.concatenate(uv), np.concatenate(col),
                np.concatenate(tris))

    def weights(self, pos, rig):
        """Head for the top, easing into neck and spine further down."""
        idx = rig.index
        H = self.H
        chin = self.c.lm['chin_y'] + 0.4
        neck = H['neck01'][1]
        j = np.zeros((len(pos), 4), int)
        w = np.zeros((len(pos), 4))
        for i, p in enumerate(pos):
            y = p[1]
            if y >= chin:
                j[i, 0], w[i, 0] = idx['head'], 1
            elif y >= neck:
                t = (y - neck) / (chin - neck)
                j[i, :2] = idx['head'], idx['neck02']
                w[i, :2] = t, 1 - t
            else:
                t = np.clip((neck - y) / 3.0, 0, 1)
                j[i, :3] = idx['neck01'], idx['spine01'], idx['spine02']
                w[i, :3] = max(0, 1 - 2 * t), 1 - abs(2 * t - 1), max(0, 2 * t - 1)
        return j, w

    def emit(self, name, material, cards):
        c = self.c
        pos, nrm, uv, col, tris = self.mesh(cards)
        j, w = self.weights(pos, c.rig)
        c.scene.append(c.glb.node(name=name, mesh=c.glb.mesh(name, pos * c.UNIT, nrm, uv, tris, material, j, w,
                                                           extra={'COLOR_0': col}), skin=c.skin))
        return len(tris)

    def cap(self):
        """Scalp cap under the cards so no skin shows between them."""
        c = self.c
        faces = []
        for fi in c.base.groups['body']:
            vs = c.base.faces[fi][1]
            rel = c.coords[vs] - self.C
            r = np.linalg.norm(rel, axis=1)
            az = np.arctan2(rel[:, 0], rel[:, 2])
            el = np.arcsin(np.clip(rel[:, 1] / r, -1, 1))
            if all(e > self.hairline(a) for a, e in zip(az, el)) and np.isin(self.o.dom[vs], ('head',)).all():
                faces.append(fi)
        verts = sorted({v for fi in faces for v in c.base.faces[fi][1]})
        return faces, verts


def slerp(a, b, t):
    w = np.arccos(np.clip(np.dot(a, b), -1, 1))
    if w < 1e-6:
        return a
    return (np.sin((1 - t) * w) * a + np.sin(t * w) * b) / np.sin(w)


def strand_texture(w=512, h=1024, seed=5):
    """RGBA hair texture, tileable across u: fine strands along v gathered into
    loose locks, full at the roots and thinning to uneven tips."""
    rng = np.random.default_rng(seed)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    centres = rng.uniform(0, w, 14)
    for i in range(2600):
        if rng.random() < 0.7:
            x = rng.choice(centres) + rng.normal(0, 14)
        else:
            x = rng.uniform(0, w)
        x %= w
        end = rng.uniform(0.62, 1.0) * h
        drift = rng.uniform(-8, 8)
        val = int(rng.uniform(165, 255))
        alpha = int(255 * rng.uniform(0.7, 1.0))
        width = int(rng.choice((1, 1, 2)))
        ts = np.linspace(0, 1, 14)
        for shift in (-w, 0, w):  # wrap across the u seam
            pts = [(x + shift + drift * t ** 2, t * end) for t in ts]
            if max(p[0] for p in pts) < -4 or min(p[0] for p in pts) > w + 4:
                continue
            for k in range(len(pts) - 1):
                fade = 1 - max(0, (k / 13 - 0.6) / 0.4)
                d.line([pts[k], pts[k + 1]], fill=(val, val, val, int(alpha * fade)), width=width)
    return img.filter(ImageFilter.GaussianBlur(0.5))
