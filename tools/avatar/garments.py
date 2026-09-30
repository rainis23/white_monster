"""Garments built as smoothed offset shells of regions of the body mesh.
A shell keeps the body's UV layout (so textures can be baked in the same
atlas) and its skin weights (so it deforms with her)."""

from collections import defaultdict

import numpy as np


def face_mask(base, coords, face_ids, keep):
    """Filter faces by a per-vertex predicate that sees positions (N,3)."""
    out = []
    for fi in face_ids:
        vs = base.faces[fi][1]
        if keep(coords[vs]).all():
            out.append(fi)
    return out


def neighbours(faces):
    nb = defaultdict(set)
    for _, vs, _ in faces:
        n = len(vs)
        for i in range(n):
            nb[vs[i]].add(vs[(i + 1) % n])
            nb[vs[i]].add(vs[(i - 1) % n])
    return nb


def boundary_loops(faces):
    count = defaultdict(int)
    for _, vs, _ in faces:
        for i in range(len(vs)):
            e = tuple(sorted((vs[i], vs[(i + 1) % len(vs)])))
            count[e] += 1
    adj = defaultdict(list)
    for (a, b), c in count.items():
        if c == 1:
            adj[a].append(b)
            adj[b].append(a)
    loops, seen = [], set()
    for s in adj:
        if s in seen:
            continue
        loop, prev, cur = [s], None, s
        seen.add(s)
        while True:
            nxt = [n for n in adj[cur] if n != prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            loop.append(cur)
            seen.add(cur)
        loops.append(loop)
    return loops


def shell(base, coords, normals, face_ids, offset, smooth=0, min_gap=None, grow=None):
    """Offset + Taubin-smoothed copy of the chosen body faces.

    offset   distance along the body normal (model units)
    smooth   smoothing iterations (loosens the fit and erases body detail)
    min_gap  keep at least this far outside the body after smoothing
    grow     optional per-vertex extra offset: f(positions) -> (N,)
    Returns (positions dict vertex->xyz, faces)."""
    faces = [base.faces[i] for i in face_ids]
    verts = sorted({v for _, vs, _ in faces for v in vs})
    P = {v: coords[v] + normals[v] * offset for v in verts}
    if grow is not None:
        extra = grow(np.array([coords[v] for v in verts]))
        for v, e in zip(verts, extra):
            P[v] = P[v] + normals[v] * e
    nb = neighbours(faces)
    for _ in range(smooth):
        for lam in (0.5, -0.53):
            Q = {}
            for v in verts:
                ns = nb[v]
                avg = np.mean([P[n] for n in ns], axis=0)
                Q[v] = P[v] + lam * (avg - P[v])
            P = Q
    if min_gap is not None:
        for v in verts:
            d = np.dot(P[v] - coords[v], normals[v])
            if d < min_gap:
                P[v] = P[v] + normals[v] * (min_gap - d)
    return P, faces


def to_coords(coords, P):
    out = coords.copy()
    for v, p in P.items():
        out[v] = p
    return out


def rim(faces, P, coords, normals, depth):
    """A thin band that turns each open edge of a shell back toward the body,
    so hems and cuffs read as fabric with thickness. Returns (positions,
    triangles, source vertex ids)."""
    pos, tris, src = [], [], []
    for loop in boundary_loops(faces):
        if len(loop) < 3:
            continue
        base_i = len(pos)
        for v in loop:
            outer = P[v]
            inner = outer - normals[v] * depth
            pos += [outer, inner]
            src += [v, v]
        n = len(loop)
        for i in range(n):
            a, b = base_i + 2 * i, base_i + 2 * ((i + 1) % n)
            tris += [(a, b, a + 1), (b, b + 1, a + 1)]
    return np.array(pos), np.array(tris), np.array(src)


def cylinder_uv(pos, origin, axis, ref, scale):
    """u around an axis (unwrapped), v along it, both in world-ish units * scale."""
    axis = axis / np.linalg.norm(axis)
    ref = ref - axis * np.dot(ref, axis)
    ref /= np.linalg.norm(ref)
    side = np.cross(axis, ref)
    rel = pos - origin
    h = rel @ axis
    ang = np.arctan2(rel @ side, rel @ ref)
    r = np.linalg.norm(rel - np.outer(h, axis), axis=1)
    return np.stack([(ang / (2 * np.pi) + 0.5) * 2 * np.pi * np.median(r) * scale, h * scale], axis=1)
