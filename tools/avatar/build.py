"""Builds models/avatar/: the White Monster baddie.

MakeHuman's CC0 base mesh is shaped into a young adult woman with long legs
and a slim, big-eyed face, rigged with MakeHuman's CC0 skeleton (reduced to
the bones we actually pose), then made up, dressed, given hair and hardware.
See tools/avatar/README.md.
"""

import os
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from mh import BaseMesh, Targets, Skeleton, Proxy, macro_weights, read_obj  # noqa: E402
from gltf import GLB  # noqa: E402
import paint  # noqa: E402
from outfit import Outfit  # noqa: E402
from hair import Hair, strand_texture  # noqa: E402
from accessories import Accessories  # noqa: E402
from PIL import Image  # noqa: E402
from types import SimpleNamespace  # noqa: E402

MH_DATA = Path(os.environ.get('MH_DATA', HERE / '.cache/makehuman/makehuman/data'))
MH_TARGETS = Path(os.environ.get('MH_TARGETS', HERE / '.cache/targets.npz'))
OUT = Path(os.environ.get('AVATAR_OUT', HERE.parent.parent / 'models/avatar'))

UNIT = 0.1  # MakeHuman works in decimetres; the glb is in metres
SOLE = 0.75  # platform boot sole height; she stands on top of it

# Body + face shaping on top of the macro sliders.
SHAPE = {
    # face: big eyes, small nose, full lips, soft V jaw, pointed elf ears
    'eyes/l-eye-scale-incr': 0.8, 'eyes/r-eye-scale-incr': 0.8,
    'eyes/l-eye-height2-incr': 0.5, 'eyes/r-eye-height2-incr': 0.5,
    'eyes/l-eye-corner2-up': 0.35, 'eyes/r-eye-corner2-up': 0.35,
    'nose/nose-scale-horiz-decr': 0.45, 'nose/nose-volume-decr': 0.35, 'nose/nose-point-up': 0.3,
    'nose/nose-scale-vert-decr': 0.2,
    'mouth/mouth-upperlip-volume-incr': 0.25, 'mouth/mouth-lowerlip-volume-incr': 0.25,
    'mouth/mouth-cupidsbow-incr': 0.3, 'mouth/mouth-scale-horiz-decr': 0.1,
    'chin/chin-width-decr': 0.6, 'chin/chin-height-decr': 0.2, 'chin/chin-prominent-decr': 0.2,
    'cheek/l-cheek-bones-incr': 0.3, 'cheek/r-cheek-bones-incr': 0.3,
    'head/head-invertedtriangular': 0.6, 'head/head-scale-horiz-decr': 0.2, 'head/head-fat-decr': 0.7,
    'cheek/l-cheek-volume-decr': 0.5, 'cheek/r-cheek-volume-decr': 0.5,
    'cheek/l-cheek-inner-decr': 0.3, 'cheek/r-cheek-inner-decr': 0.3,
    'chin/chin-bones-decr': 0.3, 'chin/chin-triangle': 0.3,
    'neck/neck-scale-horiz-decr': 0.25,
    'ears/l-ear-shape-pointed': 1.0, 'ears/r-ear-shape-pointed': 1.0,
    'ears/l-ear-scale-vert-incr': 0.4, 'ears/r-ear-scale-vert-incr': 0.4,
    # body: hourglass, long legs
    'measure/measure-waist-circ-decr': 0.55,
    'hip/hip-scale-horiz-incr': 0.25,
    'buttocks/buttocks-volume-incr': 0.3,
    'measure/measure-thigh-circ-incr': 0.35,
    'stomach/stomach-pregnant-decr': 0.35,
    'armslegs/upperlegs-height-incr': 0.25,
    'armslegs/lowerlegs-height-incr': 0.2,
    'measure/measure-upperarm-circ-decr': 0.2,
}

# Bones kept in the exported rig; everything else folds into its nearest kept ancestor.
KEEP = {
    'root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head',
    'eye.L', 'eye.R',
}
for s in ('L', 'R'):
    KEEP |= {f'pelvis.{s}', f'upperleg01.{s}', f'upperleg02.{s}', f'lowerleg01.{s}', f'lowerleg02.{s}', f'foot.{s}',
             f'clavicle.{s}', f'shoulder01.{s}', f'upperarm01.{s}', f'upperarm02.{s}', f'lowerarm01.{s}',
             f'lowerarm02.{s}', f'wrist.{s}'}
    KEEP |= {f'metacarpal{i}.{s}' for i in range(1, 5)}
    KEEP |= {f'finger{i}-{j}.{s}' for i in range(1, 6) for j in range(1, 4)}


def vertex_normals(coords, faces):
    n = np.zeros_like(coords)
    for _, vs, _ in faces:
        p = coords[vs]
        if len(vs) == 4:
            fn = np.cross(p[2] - p[0], p[3] - p[1])
        else:
            fn = np.cross(p[1] - p[0], p[2] - p[0])
        n[vs] += fn
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


def assemble(faces, coords, uvs, normals):
    """Triangulate faces and split verts on uv seams. Returns arrays + source vertex ids."""
    keymap = {}
    src_v, src_t, idx = [], [], []
    for _, vs, ts in faces:
        tri = [(0, 1, 2), (0, 2, 3)] if len(vs) == 4 else [(0, 1, 2)]
        for a, b, c in tri:
            for k in (a, b, c):
                key = (vs[k], ts[k])
                if key not in keymap:
                    keymap[key] = len(src_v)
                    src_v.append(vs[k])
                    src_t.append(ts[k])
                idx.append(keymap[key])
    src_v = np.array(src_v)
    src_t = np.array(src_t)
    uv = uvs[src_t].copy() if uvs is not None and len(uvs) else None
    if uv is not None:
        uv[:, 1] = 1 - uv[:, 1]
    return coords[src_v], normals[src_v], uv, np.array(idx).reshape(-1, 3), src_v


class Rig:
    def __init__(self, skel, coords):
        self.skel = skel
        bones = skel.bones
        self.names = [n for n in bones if n in KEEP]
        # parents first
        order, seen = [], set()

        def visit(n):
            if n in seen:
                return
            p = bones[n]['parent']
            if p:
                visit(p)
            seen.add(n)
            order.append(n)

        for n in self.names:
            visit(n)
        self.names = [n for n in order if n in KEEP]
        self.index = {n: i for i, n in enumerate(self.names)}

        def kept(n):
            while n not in KEEP:
                n = bones[n]['parent']
            return n

        self.fold = {n: kept(n) for n in bones}
        self.parents = {n: (kept(bones[n]['parent']) if bones[n]['parent'] else None) for n in self.names}
        self.heads = {n: skel.joint_pos(coords, bones[n]['head']) * UNIT for n in self.names}
        self.tails = {n: skel.joint_pos(coords, bones[n]['tail']) * UNIT for n in self.names}

        nverts = len(coords)
        dense = np.zeros((nverts, len(self.names)), dtype=np.float32)
        for bone, pairs in skel.weights.items():
            if bone not in self.fold:
                continue
            j = self.index[self.fold[bone]]
            dense[pairs[:, 0].astype(int), j] += pairs[:, 1]
        self.dense = dense

    def top4(self, dense):
        order = np.argsort(-dense, axis=1)[:, :4]
        w = np.take_along_axis(dense, order, axis=1)
        s = w.sum(axis=1, keepdims=True)
        empty = s[:, 0] == 0
        s[s == 0] = 1
        w = w / s
        order[empty] = self.index['root']
        w[empty] = [1, 0, 0, 0]
        return order, w

    def for_base(self, src_v):
        return self.top4(self.dense[src_v])

    def for_proxy(self, proxy):
        mixed = (self.dense[proxy.refs] * proxy.wts[:, :, None]).sum(axis=1)
        return self.top4(mixed)


def landmarks(base, coords, skel):
    """Face landmarks (model units, decimetres) for painting makeup."""
    J = lambda ref: skel.joint_pos(coords, ref)  # noqa: E731
    lm = {'eye_center': {}, 'face': {}}
    for side, S, sign in (('l', 'L', 1), ('r', 'R', -1)):
        ec = J(f'eye.{S}____head')
        lm['eye_center'][side] = ec

        def row(strip):
            vs = base.group_verts(f'helper-{side}-eyelashes-{strip}')
            p = coords[vs]
            d = np.linalg.norm(p[:, :2] - ec[:2], axis=1)
            roots = p[d <= np.median(d)]
            roots = roots[np.argsort(roots[:, 0] * sign)]
            # thin to ~9 evenly spaced points
            k = np.linspace(0, len(roots) - 1, 9).astype(int)
            return [(float(x), float(y)) for x, y in roots[k][:, :2]]

        lid, lower = row(2), row(1)
        inner, outer = np.array(lid[0]), np.array(lid[-1])
        width = np.linalg.norm(outer - inner)
        ey = ec[1]
        lm['face'][S] = {
            'lid': lid,
            'lower': lower,
            # low, straight-ish inner brow rising to a sharp arch over the outer iris
            'brow': [(sign * (abs(inner[0]) - 0.02), ey + 0.15 * width / 0.3),
                     (ec[0] + sign * 0.07, ey + 0.23 * width / 0.3),
                     (outer[0] + sign * 0.06, ey + 0.12 * width / 0.3)],
            'cheek': (ec[0] + sign * 0.08, ey - 0.42),
        }
    lm['eye_y'] = float((lm['eye_center']['l'][1] + lm['eye_center']['r'][1]) / 2)
    # lips from the centreline profile: the outermost surface point per height
    cl = J('oris03.L____tail')
    top_ref = J('oris05____head')[1]
    body = coords[base.group_verts('body')]
    mid = body[(np.abs(body[:, 0]) < 0.015) & (body[:, 1] > cl[1] - 0.4) & (body[:, 1] < top_ref + 0.1)]
    mid = mid[np.argsort(mid[:, 1])]
    outer = np.array([p for p in mid if p[2] >= mid[np.abs(mid[:, 1] - p[1]) < 0.012][:, 2].max() - 1e-6])
    ys, zs = outer[:, 1], outer[:, 2]
    up = (ys > cl[1] - 0.03) & (ys < top_ref)
    y_up = ys[up][np.argmax(zs[up])]
    lo = (ys > cl[1] - 0.25) & (ys < cl[1] - 0.05)
    y_lo, z_lo = ys[lo][np.argmax(zs[lo])], zs[lo].max()
    between = (ys > y_lo) & (ys < y_up)
    seam_y = ys[between][np.argmin(zs[between])] if between.any() else (y_lo + y_up) / 2
    below = (ys < y_lo) & (zs < z_lo - 0.045)
    bottom_y = ys[below].max() if below.any() else y_lo - 0.06
    # mouth corners: where the inside of the mouth (well behind the lips' front surface) ends sideways
    reg = body[(np.abs(body[:, 1] - seam_y) < 0.12) & (np.abs(body[:, 0]) < 0.4) & (body[:, 2] > cl[2] - 0.35)]
    front = np.array([reg[(np.abs(reg[:, 0] - q[0]) < 0.015) & (np.abs(reg[:, 1] - q[1]) < 0.015)][:, 2].max() for q in reg])
    inner = reg[reg[:, 2] < front - 0.06]
    reach = np.abs(inner[:, 0]).max()
    corner_x = 0.9 * reach
    corner_y = inner[np.abs(inner[:, 0]) > 0.8 * reach][:, 1].mean()
    lm['face']['mouth'] = {
        'left': (float(-corner_x), float(corner_y)),
        'right': (float(corner_x), float(corner_y)),
        'top': (0.0, float(top_ref - 0.012)),
        'seam': (0.0, float(seam_y)),
        'bottom': (0.0, float(bottom_y)),
    }
    lm['face']['tattoo'] = (float(lm['eye_center']['l'][0] + 0.12), lm['eye_y'] - 0.3)
    lm['chin_y'] = float(J('special04____tail')[1] - 0.25)
    lm['face_z'] = float(J('eye.L____head')[2] - 0.35)
    return lm


def bake_skin(pos, nrm, uv, tris, rig, lm, size=2048):
    """Porcelain skin with subtle tone variation, flushed knees/elbows/knuckles,
    and black nails."""
    mask, (P, N) = paint.rasterize(uv, tris, [pos, nrm], size)
    base = np.array([0.95, 0.87, 0.85], dtype=np.float32)
    noise = paint.fbm(P * 35.0, 4, seed=1)
    col = base * (0.955 + 0.07 * noise[..., None])
    blush = np.array([0.93, 0.72, 0.74], dtype=np.float32)
    for bone, r in (('lowerleg01.L', 0.09), ('lowerleg01.R', 0.09), ('lowerarm01.L', 0.06), ('lowerarm01.R', 0.06)):
        d = np.linalg.norm(P - rig.heads[bone], axis=-1)
        k = np.clip(1 - d / r, 0, 1)[..., None] * 0.35
        col = col * (1 - k) + blush * k
    for s in ('L', 'R'):
        for f in range(2, 6):
            d = np.linalg.norm(P - rig.heads[f'finger{f}-1.{s}'], axis=-1)
            k = np.clip(1 - d / 0.015, 0, 1)[..., None] * 0.25
            col = col * (1 - k) + blush * k
        # nails: the back of each fingertip
        thumb = rig.tails[f'finger1-3.{s}']
        center = rig.heads[f'metacarpal2.{s}']
        for f in range(1, 6):
            head, tail = rig.heads[f'finger{f}-3.{s}'], rig.tails[f'finger{f}-3.{s}']
            axis = tail - head
            L = np.linalg.norm(axis)
            axis = axis / L
            lateral = rig.tails[f'finger5-3.{s}'] - rig.tails[f'finger2-3.{s}']
            dorsal = np.cross(axis, lateral)
            dorsal /= np.linalg.norm(dorsal)
            if np.dot(dorsal, thumb - center) > 0:
                dorsal = -dorsal
            rel = P - head
            t = rel @ axis
            radial = np.linalg.norm(rel - t[..., None] * axis, axis=-1)
            nail = (t > L * 0.35) & (t < L * 1.25) & (radial < 0.011) & ((N @ dorsal) > 0.35)
            col[nail] = [0.035, 0.03, 0.04]
    col = paint.dilate(col, mask, 8)
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))


def build():
    base = BaseMesh(MH_DATA / '3dobjs/base.obj')
    targets = Targets(MH_TARGETS)
    weights = macro_weights(targets, gender=0.0, age=0.5, muscle=0.5, weight=0.52, height=0.62, proportions=1.0,
                            cup=0.5, firmness=0.6)
    for k, v in SHAPE.items():
        if not targets.has(k):
            raise KeyError(k)
        weights[k] = weights.get(k, 0) + v
    coords = targets.apply(base.coords, weights)

    body_faces = [base.faces[i] for i in base.groups['body']]
    ground = coords[base.group_verts('body')][:, 1].min()
    coords[:, 1] -= ground - SOLE

    skel = Skeleton(MH_DATA / 'rigs/default.mhskel', MH_DATA / 'rigs/default_weights.mhw')
    rig = Rig(skel, coords)

    glb = GLB()
    joint_ids, roots, skin = glb.skeleton(rig.names, rig.parents, rig.heads)

    scene = list(roots)
    normals = vertex_normals(coords, body_faces)
    pos, nrm, uv, idx, src = assemble(body_faces, coords, base.uvs, normals)
    j, w = rig.for_base(src)
    scene.append(glb.node(name='body', mesh=glb.mesh('body', pos * UNIT, nrm, uv, idx, 'skin', j, w), skin=skin))
    pos_body, nrm_body, uv_body, idx_body = pos, nrm, uv, idx

    eyes = Proxy(MH_DATA / 'eyes/high-poly/high-poly.mhclo')
    ev, evt, ef = read_obj(eyes.obj_file)
    # drop the cornea shell (it maps to the texture's transparent corner disc)
    ef = [f for f in ef if not all(evt[t][0] > 0.85 and evt[t][1] < 0.15 for t in f[2])]
    ecoords = eyes.fit(coords)
    en = vertex_normals(ecoords, ef)
    pos, nrm, uv, idx, src = assemble(ef, ecoords, evt, en)
    ej, ew = rig.for_proxy(eyes)
    scene.append(glb.node(name='eyes', mesh=glb.mesh('eyes', pos * UNIT, nrm, uv, idx, 'eye', ej[src], ew[src]), skin=skin))

    OUT.mkdir(parents=True, exist_ok=True)

    lm = landmarks(base, coords, skel)
    # the ears: the vertices their translate targets move rigidly. The hair maps the skull without them,
    # so her elf ears poke out through it
    ears = []
    for side in 'lr':
        idx, vec = targets.get(f'ears/{side}-ear-trans-up')
        m = np.linalg.norm(vec, axis=1)
        ears.append(idx[m > 0.7 * m.max()])
    lm['ear_verts'] = np.sort(np.concatenate(ears))

    # face makeup decal: the front of the head, duplicated a hair's width out
    fc = paint.FaceCanvas(center=(0.0, lm['eye_y'] - 0.28), half=0.9, size=2048)
    face_faces = []
    for fi in base.groups['body']:
        vs = base.faces[fi][1]
        p = coords[vs]
        if p[:, 1].min() < lm['chin_y'] - 0.1 or np.abs(p[:, 0]).max() > 0.95:
            continue
        if (normals[vs][:, 2] < -0.3).any() or p[:, 2].min() < lm['face_z']:
            continue
        face_faces.append(base.faces[fi])
    fpos, fnrm, _, fidx, fsrc = assemble(face_faces, coords, None, normals)
    fpos = fpos + fnrm * 0.004
    fuv = fc.uv(fpos)
    fj, fw = rig.for_base(fsrc)
    scene.append(glb.node(name='face', mesh=glb.mesh('face', fpos * UNIT, fnrm, fuv, fidx, 'face', fj, fw), skin=skin))
    paint.paint_face(fc, lm['face']).save(OUT / 'face.png', optimize=True)

    # eyelashes from the base mesh's lash helper strips, re-UV'd along the lid
    for side, sign in (('l', 1), ('r', -1)):
        for strip, name in ((2, 'upper'), (1, 'lower')):
            g = f'helper-{side}-eyelashes-{strip}'
            faces = [base.faces[fi] for fi in base.groups[g]]
            lpos, lnrm, _, lidx, lsrc = assemble(faces, coords, None, vertex_normals(coords, faces))
            ec = lm['eye_center'][side]
            rel = lpos[:, :2] - ec[:2]
            ang = np.arctan2(rel[:, 1], rel[:, 0] * sign)
            dist = np.linalg.norm(rel, axis=1)
            u = (ang - ang.min()) / (np.ptp(ang) + 1e-9)
            v = (dist - dist.min()) / (np.ptp(dist) + 1e-9)
            if name == 'lower':
                v = v * 1.8  # shorter lower lashes (the texture tips fade to nothing)
            lj, lw = rig.for_base(lsrc)
            scene.append(glb.node(name=f'lash_{side}_{name}',
                                  mesh=glb.mesh(f'lash_{side}_{name}', lpos * UNIT, lnrm, np.stack([u, v], 1), lidx, 'lash', lj, lw),
                                  skin=skin))
    paint.lash_texture().save(OUT / 'lash.png', optimize=True)
    paint.iris_texture(MH_DATA / 'eyes/materials/brown_eye.png').save(OUT / 'eye.jpg', quality=88)

    bake_skin(pos_body * UNIT, nrm_body, uv_body, idx_body, rig, lm).save(OUT / 'skin.jpg', quality=90)

    ctx = SimpleNamespace(base=base, coords=coords, normals=normals, rig=rig, glb=glb, skin=skin, scene=scene,
                          assemble=assemble, vertex_normals=vertex_normals, UNIT=UNIT, SOLE=SOLE, lm=lm)
    outfit = Outfit(ctx)
    outfit.build()
    outfit.bake(OUT)

    hair = Hair(ctx, outfit)
    cards = hair.build()
    n = hair.emit('hair', 'hair', cards)
    cap_faces, _ = hair.cap()
    top = hair.C

    def cap_uv(pos, src):
        rel = pos - top
        return np.stack([np.arctan2(rel[:, 0], rel[:, 2]) * 2, -rel[:, 1] * 1.5], 1)

    outfit.emit_shell('hair_cap', 'hairCap', cap_faces, 0.06, smooth=1, uv=cap_uv)
    strand_texture().save(OUT / 'hair.png', optimize=True)
    print(f'hair: {len(cards)} cards, {n} triangles')
    print(f'accessories: {Accessories(ctx, outfit, hair).build()} triangles')

    glb.write(OUT / 'avatar.glb', scene)
    h = (coords[base.group_verts('body')][:, 1].max()) * UNIT
    print(f'wrote {OUT / "avatar.glb"}: height {h:.3f} m, {len(rig.names)} bones')
    return base, coords, rig


if __name__ == '__main__':
    build()
