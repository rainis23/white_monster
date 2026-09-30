"""Tiny, dependency-light reader for MakeHuman's CC0 base mesh, shape targets,
skeleton, skin weights and proxy (.mhclo) files. Enough to build a posed-ready,
skinned character without running MakeHuman itself."""

import json
from collections import defaultdict
from pathlib import Path

import numpy as np


class BaseMesh:
    """base.obj: 19k verts in decimetres, quads, split into named groups."""

    def __init__(self, path):
        coords, uvs, faces = [], [], []
        group = None
        for line in open(path, encoding='utf-8'):
            if line.startswith('v '):
                coords.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                group = line.split()[1]
            elif line.startswith('f '):
                vs, ts = [], []
                for tok in line.split()[1:]:
                    parts = tok.split('/')
                    vs.append(int(parts[0]) - 1)
                    ts.append(int(parts[1]) - 1 if len(parts) > 1 and parts[1] else -1)
                faces.append((group, vs, ts))
        self.coords = np.array(coords, dtype=np.float64)
        self.uvs = np.array(uvs, dtype=np.float64)
        self.faces = faces
        self.groups = defaultdict(list)
        for i, (g, _, _) in enumerate(faces):
            self.groups[g].append(i)

    def group_verts(self, *names):
        out = set()
        for n in names:
            for fi in self.groups[n]:
                out.update(self.faces[fi][1])
        return np.array(sorted(out))


class Targets:
    def __init__(self, npz_path):
        self.z = np.load(npz_path)
        self.names = {k[len('targets/'):-len('.index')] for k in self.z.files if k.endswith('.index')}

    def has(self, name):
        return name in self.names

    def get(self, name):
        idx = self.z[f'targets/{name}.index'].astype(np.int64)
        vec = self.z[f'targets/{name}.vector'].astype(np.float64) * 1e-3
        return idx, vec

    def apply(self, coords, weights):
        out = coords.copy()
        for name, w in weights.items():
            if abs(w) < 1e-6:
                continue
            if not self.has(name):
                raise KeyError(f'unknown target {name}')
            idx, vec = self.get(name)
            out[idx] += vec * w
        return out


def _tri(value):
    """MakeHuman's min/average/max split of a 0..1 slider."""
    hi = max(0.0, value * 2 - 1)
    lo = max(0.0, 1 - value * 2)
    return lo, 1 - hi - lo, hi


def macro_weights(targets, gender=0.0, age=0.5, muscle=0.5, weight=0.5, height=0.5,
                  proportions=0.5, cup=0.5, firmness=0.5, race=None):
    """Reproduces MakeHuman's macro modifier blending (gender/age/muscle/weight
    plus height, proportions and breast targets)."""
    race = race or {'caucasian': 1.0}
    genders = {'female': 1 - gender, 'male': gender}
    if age < 0.5:
        young = max(0.0, (age - 0.1875) * 3.2)
        ages = {'baby': max(0.0, 1 - age * 5.333), 'child': max(0.0, min(1.0, 5.333 * age) - young), 'young': young, 'old': 0.0}
    else:
        old = max(0.0, age * 2 - 1)
        ages = {'baby': 0.0, 'child': 0.0, 'young': 1 - old, 'old': old}
    mlo, mav, mhi = _tri(muscle)
    muscles = {'minmuscle': mlo, 'averagemuscle': mav, 'maxmuscle': mhi}
    wlo, wav, whi = _tri(weight)
    weights = {'minweight': wlo, 'averageweight': wav, 'maxweight': whi}
    hlo, _, hhi = _tri(height)
    plo, _, phi = _tri(proportions)
    clo, cav, chi = _tri(cup)
    flo, fav, fhi = _tri(firmness)
    cups = {'mincup': clo, 'averagecup': cav, 'maxcup': chi}
    firms = {'minfirmness': flo, 'averagefirmness': fav, 'maxfirmness': fhi}

    out = defaultdict(float)
    for g, gv in genders.items():
        for a, av in ages.items():
            if gv * av == 0:
                continue
            for r, rv in race.items():
                out[f'macrodetails/{r}-{g}-{a}'] += rv * gv * av
            for m, mv in muscles.items():
                for w, wv in weights.items():
                    k = gv * av * mv * wv
                    if k == 0:
                        continue
                    base = f'{g}-{a}-{m}-{w}'
                    out[f'macrodetails/universal-{base}'] += k
                    out[f'macrodetails/height/{base}-minheight'] += k * hlo
                    out[f'macrodetails/height/{base}-maxheight'] += k * hhi
                    out[f'macrodetails/proportions/{base}-idealproportions'] += k * phi
                    out[f'macrodetails/proportions/{base}-uncommonproportions'] += k * plo
                    for c, cv in cups.items():
                        for f, fv in firms.items():
                            if c == 'averagecup' and f == 'averagefirmness':
                                continue
                            out[f'breast/{base}-{c}-{f}'] += k * cv * fv
    return {k: v for k, v in out.items() if v > 1e-6 and targets.has(k) and len(targets.get(k)[0])}


class Skeleton:
    def __init__(self, mhskel_path, weights_path):
        d = json.load(open(mhskel_path))
        self.joints = {k: np.array(v) for k, v in d['joints'].items()}
        self.bones = d['bones']
        w = json.load(open(weights_path))['weights']
        self.weights = {b: np.array(v) for b, v in w.items()}

    def joint_pos(self, coords, ref):
        return coords[self.joints[ref]].mean(axis=0)

    def bone_heads(self, coords):
        return {b: self.joint_pos(coords, info['head']) for b, info in self.bones.items()}

    def bone_tails(self, coords):
        return {b: self.joint_pos(coords, info['tail']) for b, info in self.bones.items()}


class Proxy:
    """A .mhclo proxy: every proxy vertex is a barycentric mix of three base
    vertices plus an offset scaled by the body's local size."""

    def __init__(self, path):
        path = Path(path)
        self.dir = path.parent
        refs, wts, offs = [], [], []
        self.scale = [None, None, None]
        self.obj_file = None
        self.material = None
        in_verts = False
        for line in open(path, encoding='utf-8'):
            words = line.split()
            if not words or words[0].startswith('#'):
                continue
            if in_verts and len(words) >= 9 and words[0].lstrip('-').isdigit():
                refs.append([int(x) for x in words[:3]])
                wts.append([float(x) for x in words[3:6]])
                offs.append([float(x) for x in words[6:9]])
                continue
            if in_verts and len(words) == 1 and words[0].isdigit():
                refs.append([int(words[0])] * 3)
                wts.append([1.0, 0.0, 0.0])
                offs.append([0.0, 0.0, 0.0])
                continue
            in_verts = False
            key = words[0]
            if key == 'obj_file':
                self.obj_file = self.dir / words[1]
            elif key == 'material':
                self.material = self.dir / words[1]
            elif key in ('x_scale', 'y_scale', 'z_scale'):
                self.scale['xyz'.index(key[0])] = (int(words[1]), int(words[2]), float(words[3]))
            elif key == 'verts':
                in_verts = True
        self.refs = np.array(refs)
        self.wts = np.array(wts)
        self.offs = np.array(offs)

    def fit(self, coords):
        s = np.ones(3)
        for axis, data in enumerate(self.scale):
            if data:
                a, b, den = data
                s[axis] = abs(coords[a, axis] - coords[b, axis]) / den
        return (coords[self.refs] * self.wts[:, :, None]).sum(axis=1) + self.offs * s


def read_obj(path):
    """Plain OBJ reader for proxy meshes (verts, uvs, faces with uv indices)."""
    v, vt, faces = [], [], []
    for line in open(path, encoding='utf-8'):
        if line.startswith('v '):
            v.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '):
            vt.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            vs, ts = [], []
            for tok in line.split()[1:]:
                p = tok.split('/')
                vs.append(int(p[0]) - 1)
                ts.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
            faces.append((None, vs, ts))
    return np.array(v), np.array(vt), faces
