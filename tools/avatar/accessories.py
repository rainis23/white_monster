"""Hardware and trims in the White Monster palette: glossy black horns, a
spiked choker with an O-ring, a studded belt with hip chains, spiked garters
and silver piercings. Units: model decimetres."""

import numpy as np

from outfit import tri_normals

TAU = 2 * np.pi
DEG = np.pi / 180


def unit(v):
    return v / (np.linalg.norm(v) + 1e-12)


def perp(axis):
    ref = np.array([0.0, 0, 1]) if abs(axis[2]) < 0.9 else np.array([1.0, 0, 0])
    u = unit(ref - axis * np.dot(ref, axis))
    return u, np.cross(axis, u)


def orient(pos, tris):
    """Wind a closed mesh outward (positive signed volume)."""
    p0, p1, p2 = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    vol = np.einsum('ij,ij->i', p0, np.cross(p1, p2)).sum()
    return tris if vol > 0 else tris[:, [0, 2, 1]]


def tube(path, radii, seg=12, closed=False):
    """A circle swept along `path` with parallel-transport frames. Open tubes get pointed/flat caps."""
    path = np.asarray(path, float)
    n = len(path)
    T = np.gradient(path, axis=0)
    if closed:
        T = np.roll(path, -1, 0) - np.roll(path, 1, 0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    N = [perp(T[0])[0]]
    for i in range(1, n):
        m = N[-1] - T[i] * np.dot(N[-1], T[i])
        N.append(unit(m))
    N = np.array(N)
    B = np.cross(T, N)
    ang = np.arange(seg) / seg * TAU
    pos = []
    for i in range(n):
        for a in ang:
            pos.append(path[i] + (N[i] * np.cos(a) + B[i] * np.sin(a)) * radii[i])
    tris = []
    rows = n if closed else n - 1
    for i in range(rows):
        i2 = (i + 1) % n
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            c, d = i2 * seg + k, i2 * seg + (k + 1) % seg
            tris += [(a, b, c), (b, d, c)]
    if not closed:
        for row in (0, n - 1):
            ci = len(pos)
            pos.append(path[row])
            for k in range(seg):
                tris.append((ci, row * seg + (k + 1) % seg, row * seg + k))
    pos = np.array(pos)
    return pos, orient(pos, np.array(tris))


def torus(center, normal, R, r, seg=16, rseg=6, phase=0.0):
    u, v = perp(unit(normal))
    t = np.arange(seg) / seg * TAU + phase
    path = [center + (u * np.cos(a) + v * np.sin(a)) * R for a in t]
    return tube(path, np.full(seg, r), rseg, closed=True)


def cone(base, apex, r, seg=8):
    return tube([base, base + (apex - base) * 0.5, apex], [r, r * 0.5, 1e-4], seg)


def sphere(center, r, seg=10):
    rows = seg // 2 + 1
    th = np.linspace(0, np.pi, rows)
    path = [center + np.array([0, -np.cos(t) * r, 0]) for t in th]
    rad = [max(np.sin(t) * r, 1e-4) for t in th]
    return tube(path, rad, seg)


def section(pts, center, axis, u, v, slab, n=64):
    """Largest radius per angle of the points near the plane through `center` normal to `axis`."""
    rel = pts - center
    sel = rel[np.abs(rel @ axis) < slab]
    x, y = sel @ u, sel @ v
    bins = ((np.arctan2(y, x) + np.pi) / TAU * n).astype(int) % n
    R = np.zeros(n)
    np.maximum.at(R, bins, np.hypot(x, y))
    for _ in range(n):
        if (R > 0).all():
            break
        R = np.where(R == 0, np.maximum(np.roll(R, 1), np.roll(R, -1)), R)
    for _ in range(3):
        R = (np.roll(R, 1) + 2 * R + np.roll(R, -1)) / 4
    return R


def angles(n):
    return -np.pi + (np.arange(n) + 0.5) / n * TAU


def band(center, axis, u, v, R, height, thick, gap):
    """A strap around a cross-section: a closed loop with a rectangular profile."""
    n = len(R)
    dirs = np.cos(angles(n))[:, None] * u + np.sin(angles(n))[:, None] * v
    prof = [(-height / 2, gap), (height / 2, gap), (height / 2, gap + thick), (-height / 2, gap + thick)]
    pos = np.array([center + axis * h + dirs[k] * (R[k] + g) for k in range(n) for h, g in prof])
    tris = []
    for k in range(n):
        k2 = (k + 1) % n
        for j in range(4):
            j2 = (j + 1) % 4
            a, b, c, d = k * 4 + j, k * 4 + j2, k2 * 4 + j, k2 * 4 + j2
            tris += [(a, b, c), (b, d, c)]
    return pos, orient(pos, np.array(tris)), dirs


class Accessories:
    def __init__(self, ctx, outfit, hair):
        self.c = ctx
        self.o = outfit
        self.hair = hair
        self.H = outfit.H
        self.body = ctx.base.group_verts('body')
        self.parts = {'silver': [], 'leather': [], 'horn': []}

    # ------------------------------------------------------------ plumbing
    def verts_of(self, doms, side=0):
        v = self.body[np.isin(self.o.dom[self.body], doms)]
        if side:
            v = v[self.c.coords[v][:, 0] * side > 0]
        return v

    def add(self, material, mesh, anchors, rigid=False):
        """Skin a piece to the nearest of `anchors` (body vertex ids), or rigidly to the one nearest its middle."""
        pos, tris = mesh
        P = self.c.coords[anchors]
        if rigid:
            src = np.full(len(pos), anchors[int(np.argmin(np.linalg.norm(P - pos.mean(0), axis=1)))])
        else:
            src = np.array([anchors[int(np.argmin(np.linalg.norm(P - p, axis=1)))] for p in pos])
        self.parts[material].append((pos, tris, src))

    def emit(self):
        n = 0
        names = {'silver': 'hardware', 'leather': 'straps', 'horn': 'horns'}
        for material, pieces in self.parts.items():
            if not pieces:
                continue
            pos, tris, src, off = [], [], [], 0
            for p, t, s in pieces:
                pos.append(p)
                tris.append(t + off)
                src.append(s)
                off += len(p)
            pos, tris, src = np.concatenate(pos), np.concatenate(tris), np.concatenate(src)
            self.o.emit(names[material], material, pos, tris, src, None, tri_normals(pos, tris))
            n += len(tris)
        return n

    # ------------------------------------------------------------ pieces
    def build(self):
        self.horns()
        self.choker()
        self.belt()
        for side in (1, -1):
            self.garter(side)
        self.piercings()
        return self.emit()

    def horns(self):
        hair = self.hair
        head = self.verts_of(('head',))
        for side in (1, -1):
            az, el = side * 34 * DEG, 50 * DEG
            d0 = np.array([np.cos(el) * np.sin(az), np.sin(el), np.cos(el) * np.cos(az)])
            p = hair.C + d0 * (hair.radius(az, el) - 0.05)
            up = unit(d0 + np.array([0, 0.9, 0]))
            back = unit(np.array([side * 0.3, 0.15, -1.0]))
            L, steps = 1.15, 28
            path, rad = [], []
            for i in range(steps):
                t = i / (steps - 1)
                path.append(p.copy())
                ridge = 1 + 0.07 * max(0.0, np.sin(t * np.pi * 10)) * (1 - t)
                rad.append((0.13 * (1 - t) ** 0.85 + 0.005) * ridge)
                h = unit(up * np.cos(t * 95 * DEG) + back * np.sin(t * 95 * DEG))
                p = p + h * L / (steps - 1)
            self.add('horn', tube(path, rad, 14), head, rigid=True)

    def choker(self):
        c, H = self.c, self.H
        neck = self.verts_of(('neck01', 'neck02', 'neck03'))
        axis = unit(H['neck02'] - H['neck01'])
        centre = H['neck01'] + (H['neck02'] - H['neck01']) * 0.4
        u, v = perp(axis)
        R = section(c.coords[neck], centre, axis, u, v, 0.08)
        pos, tris, dirs = band(centre, axis, u, v, R, 0.26, 0.05, 0.03)
        self.add('leather', (pos, tris), neck)
        front = int(np.argmax(dirs[:, 2]))
        n = len(R)
        for k in range(n):
            a = (k - front + n // 2) % n - n // 2
            if abs(a) <= 18 and a % 3 == 0 and a != 0:
                base = centre + dirs[k] * (R[k] + 0.07)
                self.add('silver', cone(base, base + dirs[k] * 0.13, 0.038), neck, rigid=True)
        ring = centre + dirs[front] * (R[front] + 0.1) - axis * 0.2
        self.add('silver', torus(ring, dirs[front], 0.1, 0.02), neck, rigid=True)

    def skirt_radius(self, y, th):
        ys, sth, R = self.o.skirt_geo
        i = np.clip(np.searchsorted(-ys, -y) - 1, 0, len(ys) - 2)
        t = np.clip((ys[i] - y) / (ys[i] - ys[i + 1]), 0, 1)
        ring = R[i] * (1 - t) + R[i + 1] * t
        return np.interp(th, sth, ring, period=TAU)

    def belt(self):
        o = self.o
        hips = self.verts_of(('root', 'spine05', 'spine04', 'pelvis'))
        ys = o.skirt_geo[0]
        y = ys[0] - 0.14
        centre = np.array([0, y, 0.1])
        axis, u, v = np.array([0, 1.0, 0]), np.array([0, 0, 1.0]), np.array([1.0, 0, 0])
        n = 72
        R = np.array([self.skirt_radius(y, a) for a in angles(n)])
        pos, tris, dirs = band(centre, axis, u, v, R, 0.34, 0.05, 0.015)
        self.add('leather', (pos, tris), hips)
        # pyramid studs all round, a square buckle at the front
        for k in range(0, n, 3):
            a = angles(n)[k]
            if abs(a) < 12 * DEG:
                continue
            base = centre + dirs[k] * (R[k] + 0.06)
            self.add('silver', cone(base, base + dirs[k] * 0.045, 0.04, seg=4), hips, rigid=True)
        f = int(np.argmin(np.abs(angles(n))))
        self.add('silver', torus(centre + dirs[f] * (R[f] + 0.09), dirs[f], 0.17, 0.028, seg=4, rseg=5, phase=np.pi / 4),
                 hips, rigid=True)
        # two chains swinging from her left hip
        for a0, a1, sag in ((22, 98, 0.75), (34, 124, 1.15)):
            self.chain(a0 * DEG, a1 * DEG, y - 0.17, sag, hips)

    def chain(self, a0, a1, y, sag, anchors):
        pts = []
        for t in np.linspace(0, 1, 60):
            a = a0 + (a1 - a0) * t
            yy = y - sag * 4 * t * (1 - t)
            r = self.skirt_radius(yy, a) + 0.06
            pts.append([np.sin(a) * r, yy, np.cos(a) * r + 0.1])
        pts = np.array(pts)
        s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
        step = 0.08
        for i, d in enumerate(np.arange(step / 2, s[-1], step)):
            p = np.array([np.interp(d, s, pts[:, k]) for k in range(3)])
            q = np.array([np.interp(d + 0.01, s, pts[:, k]) for k in range(3)])
            tng = unit(q - p)
            out = unit(np.array([p[0], 0, p[2] - 0.1]))
            normal = out if i % 2 == 0 else unit(np.cross(tng, out))  # links alternate by 90 degrees
            self.add('silver', self.link(p, normal, tng), anchors, rigid=True)

    @staticmethod
    def link(p, normal, tng, R=0.034, r=0.009):
        """An oval chain link lying in the plane that contains `tng` and is normal to `normal`."""
        side = unit(np.cross(normal, tng))
        path = [p + tng * np.cos(a) * R * 1.45 + side * np.sin(a) * R for a in np.arange(10) / 10 * TAU]
        return tube(path, np.full(10, r), 5, closed=True)

    def garter(self, side):
        c, o, H = self.c, self.o, self.H
        S = 'L' if side > 0 else 'R'
        thigh = self.verts_of(('upperleg01', 'upperleg02'), side)
        hip, knee = H[f'upperleg01.{S}'], H[f'lowerleg01.{S}']
        axis = unit(hip - knee)
        y = o.sock_top + 0.42
        centre = knee + axis * (y - knee[1]) / axis[1]
        u, v = perp(axis)
        R = section(c.coords[thigh], centre, axis, u, v, 0.08)
        pos, tris, dirs = band(centre, axis, u, v, R, 0.2, 0.045, 0.03)
        self.add('leather', (pos, tris), thigh)
        n = len(R)
        facing = dirs @ unit(np.array([side * 0.8, 0, 1.0]))
        for k in range(n):
            if facing[k] > 0.2 and k % 4 == 0:
                base = centre + dirs[k] * (R[k] + 0.065)
                self.add('silver', cone(base, base + dirs[k] * 0.11, 0.032), thigh, rigid=True)
        # an O-ring on the front, with a strap running up under the skirt
        f = int(np.argmax(dirs @ unit(np.array([side * 0.35, 0, 1.0]))))
        ring = centre + dirs[f] * (R[f] + 0.09) + axis * 0.16
        self.add('silver', torus(ring, dirs[f], 0.075, 0.016), thigh, rigid=True)
        top = o.hem_y + 0.5
        rows = []
        for t in np.linspace(0, 1, 8):
            cy = ring[1] + 0.075 + (top - ring[1] - 0.075) * t
            cc = knee + axis * (cy - knee[1]) / axis[1]
            r = section(c.coords[thigh], cc, axis, u, v, 0.1)[f]
            rows.append(cc + dirs[f] * (r + 0.05))
        tang = unit(np.cross(axis, dirs[f]))
        spos = []
        for p in rows:
            for w in (-0.045, 0.045):
                for dd in (0, 0.02):
                    spos.append(p + tang * w + dirs[f] * dd)
        spos = np.array(spos)
        stris = []
        for i in range(len(rows) - 1):
            for a, b in ((0, 2), (2, 3), (3, 1), (1, 0)):
                p0, p1 = i * 4 + a, i * 4 + b
                stris += [(p0, p1, p0 + 4), (p1, p1 + 4, p0 + 4)]
        stris += [(0, 1, 2), (1, 3, 2)]
        last = (len(rows) - 1) * 4
        stris += [(last, last + 2, last + 1), (last + 1, last + 2, last + 3)]
        stris = orient(spos, np.array(stris))
        self.add('leather', (spos, stris), thigh)

    def piercings(self):
        c = self.c
        lm = c.lm
        head = self.verts_of(('head',))
        P = c.coords[head]
        N = c.normals[head]
        eye_y = lm['eye_y']
        # nostril stud on her left
        m = (P[:, 1] > eye_y - 0.62) & (P[:, 1] < eye_y - 0.42) & (P[:, 0] > 0.07) & (P[:, 0] < 0.15)
        i = np.flatnonzero(m)[np.argmax(P[m][:, 2])]
        self.add('silver', sphere(P[i] + N[i] * 0.01, 0.017), head, rigid=True)
        # snake bites: a hoop either side of the lower lip
        mouth = lm['face']['mouth']
        cx = abs(mouth['left'][0])
        by = mouth['bottom'][1]
        for s in (1, -1):
            d = np.hypot(P[:, 0] - s * cx * 0.55, P[:, 1] - (by + 0.035))
            front = P[:, 2] > lm['face_z']
            i = np.flatnonzero(front)[np.argmin(d[front])]
            self.add('silver', torus(P[i] + np.array([0, -0.02, -0.012]), np.array([1.0, 0, 0]), 0.034, 0.0075,
                                     seg=14, rseg=5), head, rigid=True)
        # ear cuffs up the pointed ears, a hoop in each lobe
        ears = lm.get('ear_verts', np.array([], int))
        for s in (1, -1):
            e = ears[c.coords[ears][:, 0] * s > 0]
            if not len(e):
                continue
            E = c.coords[e]
            tip = E[:, 1].max()
            for dy in (0.1, 0.19, 0.28):
                band_ = np.abs(E[:, 1] - (tip - dy)) < 0.03
                if band_.any():
                    j = np.flatnonzero(band_)[np.argmax(np.abs(E[band_][:, 0]))]
                    self.add('silver', sphere(E[j] + c.normals[e[j]] * 0.012, 0.016), head, rigid=True)
            lobe = E[np.argmin(E[:, 1])]
            self.add('silver', torus(lobe + np.array([0, -0.04, 0]), np.array([0, 0, 1.0]), 0.045, 0.008,
                                     seg=14, rseg=5), head, rigid=True)
