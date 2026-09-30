"""The outfit, in the White Monster palette (white, black, silver):
fishnet tights, white thigh-highs with black stripes, a cropped white knit
sweater with a black claw print, a black pleated mini, and chunky black
platform boots. Heights are in model units (decimetres, soles at y = 0)."""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import garments as G
import paint

LEG = ('pelvis', 'upperleg01', 'upperleg02', 'lowerleg01', 'lowerleg02', 'foot')
TORSO = ('spine01', 'spine02', 'spine03', 'spine04')
ARM = ('clavicle', 'shoulder01', 'upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02')


class Outfit:
    def __init__(self, ctx):
        self.c = ctx
        rig = ctx.rig
        dom = np.array(rig.names)[rig.dense.argmax(axis=1)]
        self.dom = np.array([n.split('.')[0] for n in dom])
        self.H = {k: v * 10 for k, v in rig.heads.items()}  # joint heads in model units
        self.T = {k: v * 10 for k, v in rig.tails.items()}

    # -------------------------------------------------------------- helpers
    def faces_where(self, pred):
        c = self.c
        out = []
        for fi in c.base.groups['body']:
            vs = c.base.faces[fi][1]
            if pred(np.array(vs)).all():
                out.append(fi)
        return out

    def emit(self, name, material, pos, tris, src, uv=None, normals=None):
        c = self.c
        if normals is None:
            normals = tri_normals(pos, tris)
        j, w = c.rig.for_base(src)
        c.scene.append(c.glb.node(name=name, mesh=c.glb.mesh(name, pos * c.UNIT, normals, uv, tris, material, j, w), skin=c.skin))

    def emit_shell(self, name, material, face_ids, offset, smooth=0, min_gap=None, grow=None, uv='atlas', rim_depth=None):
        c = self.c
        P, faces = G.shell(c.base, c.coords, c.normals, face_ids, offset, smooth, min_gap, grow)
        shell_coords = G.to_coords(c.coords, P)
        nrm = c.vertex_normals(shell_coords, faces)
        pos, n, atlas_uv, tris, src = c.assemble(faces, shell_coords, c.base.uvs, nrm)
        use_uv = atlas_uv if uv == 'atlas' else uv(pos, src)
        self.emit(name, material, pos, tris, src, use_uv, n)
        if rim_depth:
            rp, rt, rs = G.rim(faces, P, c.coords, c.normals, rim_depth)
            if len(rp):
                ruv = np.zeros((len(rp), 2)) if uv == 'atlas' else uv(rp, rs)
                if uv == 'atlas':
                    ruv = c.base.uvs[[self.uv_of(v) for v in rs]].copy()
                    ruv[:, 1] = 1 - ruv[:, 1]
                self.emit(name + '_rim', material, rp, rt, rs, ruv)
        return pos, n, atlas_uv, tris

    def uv_of(self, v):
        if not hasattr(self, '_uvmap'):
            self._uvmap = {}
            for fi in self.c.base.groups['body']:
                _, vs, ts = self.c.base.faces[fi]
                for a, b in zip(vs, ts):
                    self._uvmap.setdefault(a, b)
        return self._uvmap[v]

    def leg_uv(self, pos, src):
        """Tiling UVs (1 unit = 1 dm) around each leg, around the body above the hips."""
        out = np.zeros((len(pos), 2))
        for side, sgn in (('L', 1), ('R', -1)):
            m = pos[:, 0] * sgn > 0
            a, b = self.H[f'upperleg01.{side}'], self.T[f'lowerleg02.{side}']
            out[m] = G.cylinder_uv(pos[m], a, b - a, np.array([0, 0, 1.0]), 1.0)
        hips = pos[:, 1] > self.H['upperleg01.L'][1] - 0.2
        out[hips] = G.cylinder_uv(pos[hips], np.array([0, 0, 0.1]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]), 1.0)
        return out

    # -------------------------------------------------------------- pieces
    def build(self):
        c = self.c
        y = c.coords[:, 1]
        dom = self.dom
        knee_y, hip_y = self.H['lowerleg01.L'][1], self.H['upperleg01.L'][1]
        self.sock_top = knee_y + (hip_y - knee_y) * 0.4
        self.waist_y = self.H['spine04'][1] + 0.55
        self.crop_y = self.H['spine03'][1] + 0.55
        self.hem_y = hip_y - 1.75
        ankle = self.H['foot.L'][1]
        self.boot_top = ankle + (knee_y - ankle) * 0.45

        leg = np.isin(dom, LEG)
        hand = np.isin(dom, ('wrist', 'metacarpal1', 'metacarpal2', 'metacarpal3', 'metacarpal4', 'finger1-1', 'finger1-2',
                             'finger1-3', 'finger2-1', 'finger2-2', 'finger2-3', 'finger3-1', 'finger3-2', 'finger3-3',
                             'finger4-1', 'finger4-2', 'finger4-3', 'finger5-1', 'finger5-2', 'finger5-3'))
        arm = np.isin(dom, ARM)
        torso = np.isin(dom, TORSO + ('root', 'spine05'))

        # fishnet tights: waist to ankle
        tights = self.faces_where(lambda vs: (y[vs] < self.waist_y) & (y[vs] > ankle + 0.3) & (leg[vs] | torso[vs]) & ~hand[vs])
        self.emit_shell('tights', 'fishnet', tights, 0.012, uv=self.leg_uv)

        # thigh-highs
        socks = self.faces_where(lambda vs: (y[vs] < self.sock_top) & (y[vs] > ankle - 0.2) & leg[vs])
        sp, sn, suv, st = self.emit_shell('socks', 'sock', socks, 0.035, smooth=2, min_gap=0.03, rim_depth=0.03)
        self.sock_bake = (sp, sn, suv, st)

        # cropped oversized sweater, sleeves flaring toward the wrist
        wrist_y = self.H['wrist.L'][1]
        neck_cut = self.H['neck01'][1] - 0.45

        def loose(p):
            flare = np.clip((self.H['upperarm02.L'][1] - p[:, 1]) / (self.H['upperarm02.L'][1] - wrist_y), 0, 1)
            sleeve = (np.abs(p[:, 0]) > 1.35).astype(float)
            chest = self.H['spine02'][1] + 0.85
            return 0.05 + sleeve * flare ** 1.5 * 0.35 + (1 - sleeve) * np.clip((chest - p[:, 1]) / 1.2, 0, 1) * 0.12

        sweater = self.faces_where(lambda vs: (y[vs] > self.crop_y) & (torso[vs] | arm[vs]) & ~hand[vs]
                                   & ~((y[vs] > neck_cut) & (np.abs(c.coords[vs][:, 0]) < 1.0)))
        wp, wn, wuv, wt = self.emit_shell('sweater', 'sweater', sweater, 0.07, smooth=6, min_gap=0.06, grow=loose, rim_depth=0.09)
        self.sweater_bake = (wp, wn, wuv, wt)

        # boots: a smoothed shell around the lower calf, a moulded toe box, a platform sole
        shaft = self.faces_where(lambda vs: (y[vs] < self.boot_top) & (y[vs] > ankle - 0.35)
                                 & np.isin(dom[vs], ('lowerleg02', 'lowerleg01')))
        self.emit_shell('boot_shaft', 'boot', shaft, 0.08, smooth=6, min_gap=0.075, rim_depth=0.08)
        for side, sgn in (('L', 1), ('R', -1)):
            self.boot_foot(side, sgn)

        self.skirt()

    def boot_foot(self, side, sgn):
        """A boot last: smooth superelliptic cross-sections along the foot's
        length, sized from the bare foot plus padding, sat on a platform."""
        c = self.c
        verts = c.base.group_verts('body')
        foot = verts[(self.dom[verts] == 'foot') & (c.coords[verts][:, 0] * sgn > 0)]
        p = c.coords[foot]
        xz = p[:, [0, 2]]
        cen = xz.mean(axis=0)
        cov = np.cov((xz - cen).T)
        w_, v_ = np.linalg.eigh(cov)
        a = v_[:, np.argmax(w_)]
        if a[1] < 0:
            a = -a
        b = np.array([a[1], -a[0]])
        s_ = (xz - cen) @ a
        l_ = (xz - cen) @ b
        s0, s1 = s_.min() - 0.12, s_.max() + 0.2
        n_st, n_ring = 28, 28
        sts = np.linspace(s0, s1, n_st)
        top = c.SOLE + 0.02
        width, height, mid = [], [], []
        for st in sts:
            m = np.abs(s_ - st) < 0.18
            if m.sum() < 3:
                m = np.abs(s_ - np.clip(st, s_.min(), s_.max())) < 0.25
            width.append((l_[m].max() - l_[m].min()) / 2 + 0.13)
            mid.append((l_[m].max() + l_[m].min()) / 2)
            height.append(p[m, 1].max() - top + 0.12)
        width, height, mid = (np.convolve(np.pad(np.array(v), 2, mode='edge'), np.ones(5) / 5, mode='valid')
                              for v in (width, height, mid))
        # round off the toe and heel
        t = (sts - s0) / (s1 - s0)
        end = np.sqrt(np.clip(1 - ((t - 0.5) / 0.5) ** 6, 0.02, 1))
        width, height = width * end, np.maximum(height * end, 0.05)
        pos = []
        for i, st in enumerate(sts):
            for k in range(n_ring):
                th = np.pi * k / (n_ring - 1)
                cx, sy = np.cos(th), np.sin(th)
                x = np.sign(cx) * abs(cx) ** 0.7 * width[i]
                yy = top + abs(sy) ** 0.8 * height[i]
                q = cen + a * st + b * (mid[i] + x)
                pos.append([q[0], yy, q[1]])
        tris = []
        for i in range(n_st - 1):
            for k in range(n_ring - 1):
                p0 = i * n_ring + k
                p1 = p0 + n_ring
                tris += [(p0, p0 + 1, p1), (p1, p0 + 1, p1 + 1)]
        pos = np.array(pos)
        tris = np.array(tris)
        # outward-facing: test a triangle on top of the mid-foot against the foot's axis
        ti = ((n_st // 2) * (n_ring - 1) + n_ring // 2) * 2
        t0 = tris[ti]
        fn = np.cross(pos[t0[1]] - pos[t0[0]], pos[t0[2]] - pos[t0[0]])
        st = sts[n_st // 2]
        axis_pt = np.array([cen[0] + a[0] * st, top, cen[1] + a[1] * st])
        if np.dot(fn, pos[t0[0]] - axis_pt) < 0:
            tris = tris[:, [0, 2, 1]]
        anchor = foot[int(np.argmin(np.linalg.norm(p - self.H[f'foot.{side}'], axis=1)))]
        self.emit(f'boot_foot_{side}', 'boot', pos, tris, np.full(len(pos), anchor))
        # platform sole following the boot's footprint
        outline = [cen + a * st + b * (mid[i] + sgn2 * (width[i] + 0.1)) for sgn2 in (1,) for i, st in enumerate(sts)]
        outline += [cen + a * st + b * (mid[i] - (width[i] + 0.1)) for i, st in reversed(list(enumerate(sts)))]
        outline = np.array(outline)
        for _ in range(4):
            outline = (np.roll(outline, 1, 0) + outline * 2 + np.roll(outline, -1, 0)) / 4
        spos, stris = loft(outline, [(0.0, -0.03), (0.05, 0.0), (c.SOLE - 0.03, 0.0), (c.SOLE + 0.06, -0.06)])
        self.emit(f'sole_{side}', 'sole', spos, stris, np.full(len(spos), anchor))
        tpos, ttris = loft(outline, [(0.3, 0.012), (0.36, 0.012)])
        self.emit(f'tread_{side}', 'silver', tpos, ttris, np.full(len(tpos), anchor))

    def skirt(self):
        """Pleated mini: rings fitted around the hips' silhouette, flaring and
        pleating toward the hem."""
        c = self.c
        body = c.coords[c.base.group_verts('body')]
        dom = self.dom[c.base.group_verts('body')]
        ok = ~np.isin(dom, ('upperarm02', 'lowerarm01', 'lowerarm02', 'wrist')) & ~np.char.startswith(dom.astype(str), 'finger') \
            & ~np.char.startswith(dom.astype(str), 'metacarpal')
        body = body[ok]
        seg, rings = 144, 14
        th = np.linspace(-np.pi, np.pi, seg, endpoint=False)
        dirs = np.stack([np.sin(th), np.cos(th)], 1)
        ys = np.linspace(self.waist_y, self.hem_y, rings)
        R = np.zeros((rings, seg))
        for i, yy in enumerate(ys):
            sl = body[np.abs(body[:, 1] - yy) < 0.35]
            proj = sl[:, [0, 2]] - [0, 0.1]
            r = (proj @ dirs.T).max(axis=0)
            R[i] = r
        # smooth around, and never narrower lower down (skirts drape, they don't cling)
        for _ in range(4):
            R = (np.roll(R, 1, 1) + R * 2 + np.roll(R, -1, 1)) / 4
        R = np.maximum.accumulate(R, axis=0)
        down = np.linspace(0, 1, rings)[:, None]
        R = R + 0.12 + 0.35 * down ** 1.3
        pleats = 24
        saw = ((th / (2 * np.pi)) * pleats) % 1
        R = R + (np.abs(saw - 0.5) - 0.25)[None, :] * 0.22 * (0.15 + down)
        pos = np.zeros((rings * (seg + 1), 3))
        uv = np.zeros((rings * (seg + 1), 2))
        at = np.zeros(rings * (seg + 1))
        for i in range(rings):
            for k in range(seg + 1):
                kk = k % seg
                pos[i * (seg + 1) + k] = [np.sin(th[kk]) * R[i, kk], ys[i], np.cos(th[kk]) * R[i, kk] + 0.1]
                uv[i * (seg + 1) + k] = [k / seg * 12, (self.waist_y - ys[i]) * 1.0]
                at[i * (seg + 1) + k] = i / (rings - 1)
        tris = []
        for i in range(rings - 1):
            for k in range(seg):
                a = i * (seg + 1) + k
                b = a + seg + 1
                tris += [(a, b, a + 1), (b, b + 1, a + 1)]
        tris = np.array(tris)
        # weights: hips, easing toward each thigh near the hem
        verts = c.base.group_verts('body')
        verts = verts[np.isin(self.dom[verts], LEG + ('root', 'spine05', 'spine04'))]
        src = np.array([verts[int(np.argmin(np.linalg.norm(c.coords[verts] - p, axis=1)))] for p in pos])
        self.emit('skirt', 'skirt', pos, tris, src, uv, tri_normals(pos, tris))
        self.skirt_geo = (ys, th, R)  # ring heights, angles about (0, 0.1) in x/z, radii

    # -------------------------------------------------------------- textures
    def bake(self, out):
        sp, sn, suv, st = self.sock_bake
        mask, (P,) = paint.rasterize(suv, st, [sp], 1024)
        d = self.sock_top - P[..., 1]
        rib = 0.5 + 0.5 * np.sin(np.arctan2(P[..., 2], P[..., 0] - np.sign(P[..., 0]) * 1.6) * 70)
        col = np.ones(P.shape, np.float32) * 0.95 * (0.93 + 0.07 * rib[..., None])
        stripe = ((d > 0.22) & (d < 0.42)) | ((d > 0.58) & (d < 0.78))
        col[stripe] = [0.05, 0.05, 0.06]
        col = paint.dilate(col, mask, 6)
        Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).save(out / 'sock.jpg', quality=88)

        wp, wn, wuv, wt = self.sweater_bake
        mask, (P, N) = paint.rasterize(wuv, wt, [wp, wn], 2048)
        ang = np.arctan2(P[..., 0], P[..., 2])
        rib = 0.5 + 0.5 * np.sin(ang * 110 + np.sin(P[..., 1] * 3) * 0.4)
        knit = 0.5 + 0.5 * np.sin(P[..., 1] * 260)
        col = np.ones(P.shape, np.float32) * np.array([0.96, 0.955, 0.965]) * (0.9 + 0.06 * rib[..., None] + 0.04 * knit[..., None])
        claw = claw_print(size=1024)
        cx0, cy0, half = 0.0, self.H['spine02'][1] + 0.95, 1.05
        u = ((P[..., 0] - cx0) / (2 * half) + 0.5) * 1024
        v = ((cy0 - P[..., 1]) / (2 * half) + 0.5) * 1024
        front = (P[..., 2] > 0.4) & (N[..., 2] > 0.2) & (u >= 0) & (u < 1024) & (v >= 0) & (v < 1024)
        ink = np.zeros(P.shape[:2], np.float32)
        ink[front] = claw[v[front].astype(int), u[front].astype(int)]
        col = col * (1 - ink[..., None]) + np.array([0.04, 0.04, 0.05]) * ink[..., None]
        col = paint.dilate(col, mask, 8)
        Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).save(out / 'sweater.jpg', quality=88)


def claw_print(size=1024, seed=11):
    """Three torn claw marks, as an ink coverage mask (0..1)."""
    rng = np.random.default_rng(seed)
    img = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(img)
    for k, (x, top, bot, w) in enumerate(((-0.2, 0.22, 0.78, 0.075), (0.0, 0.18, 0.86, 0.085), (0.2, 0.23, 0.77, 0.075))):
        left, right = [], []
        for i in range(41):
            t = i / 40
            cx = (0.5 + x + np.sin(np.pi * t) * 0.02 * (k - 1)) * size
            cy = (top + (bot - top) * t) * size
            ww = w * size / 2 * (1 if t < 0.55 else (1 - (t - 0.55) / 0.45) ** 0.85) * (0.75 + t * 6 if t < 0.04 else 1)
            j = (rng.random() - 0.35) * 0.012 * size if i % 3 == 0 else 0
            left.append((cx - ww - j, cy))
            right.append((cx + ww + j, cy))
        d.polygon(left + right[::-1], fill=255)
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(img, np.float32) / 255


# ------------------------------------------------------------------ geometry utils

def tri_normals(pos, tris):
    n = np.zeros_like(pos)
    fn = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


def convex_hull(pts):
    pts = sorted(map(tuple, pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return np.array(lower[:-1] + upper[:-1])


def offset_polygon(poly, d, samples=72):
    """Resample a convex polygon evenly and push it outward by d (rounded)."""
    c = poly.mean(axis=0)
    ang = np.linspace(-np.pi, np.pi, samples, endpoint=False)
    rel = poly - c
    out = []
    for a in ang:
        dirv = np.array([np.cos(a), np.sin(a)])
        r = (rel @ dirv).max()
        out.append(c + dirv * (r + d))
    # smooth
    out = np.array(out)
    for _ in range(3):
        out = (np.roll(out, 1, 0) + out * 2 + np.roll(out, -1, 0)) / 4
    return out


def loft(poly, rings):
    """Closed prism through `poly` (x,z) at each (y, inset) ring, capped."""
    n = len(poly)
    c = poly.mean(axis=0)
    pos = []
    for y, inset in rings:
        for p in poly:
            q = c + (p - c) * (1 + inset / max(np.linalg.norm(p - c), 1e-6))
            pos.append([q[0], y, q[1]])
    tris = []
    for i in range(len(rings) - 1):
        for k in range(n):
            a = i * n + k
            b = i * n + (k + 1) % n
            tris += [(a, b, a + n), (b, b + n, a + n)]
    # outward-facing sides regardless of the polygon's winding
    P = np.array(pos)
    t0 = tris[0]
    fn = np.cross(P[t0[1]] - P[t0[0]], P[t0[2]] - P[t0[0]])
    flip = np.dot(fn, P[t0[0]] - np.array([c[0], P[t0[0]][1], c[1]])) < 0
    if flip:
        tris = [(a, cc, b) for a, b, cc in tris]
    # caps
    bottom = len(pos)
    pos.append([c[0], rings[0][0], c[1]])
    top = len(pos)
    pos.append([c[0], rings[-1][0], c[1]])
    last = (len(rings) - 1) * n
    for k in range(n):
        if flip:
            tris.append((bottom, k, (k + 1) % n))
            tris.append((top, last + (k + 1) % n, last + k))
        else:
            tris.append((bottom, (k + 1) % n, k))
            tris.append((top, last + k, last + (k + 1) % n))
    return np.array(pos), np.array(tris)
