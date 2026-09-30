"""Minimal glTF 2.0 binary (.glb) writer with skinning support."""

import json
import struct

import numpy as np

FLOAT, UBYTE, USHORT, UINT = 5126, 5121, 5123, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def quantize_weights(w):
    """Skin weights as bytes that still sum to exactly 255 per vertex."""
    w = np.asarray(w, np.float64)
    w = w / np.maximum(w.sum(axis=1, keepdims=True), 1e-9)
    q = np.floor(w * 255).astype(np.int32)
    rest = 255 - q.sum(axis=1)
    order = np.argsort(-(w * 255 - q), axis=1)
    for k in range(4):
        q[np.arange(len(q)), order[:, k]] += (rest > k).astype(np.int32)
    return q.astype(np.uint8)


class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.doc = {
            'asset': {'version': '2.0', 'generator': 'white_monster tools/avatar'},
            'buffers': [], 'bufferViews': [], 'accessors': [], 'meshes': [], 'nodes': [],
            'materials': [], 'skins': [], 'scenes': [{'nodes': []}], 'scene': 0,
        }
        self._materials = {}

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data)}
        if target:
            view['target'] = target
        self.bin.extend(data)
        self.doc['bufferViews'].append(view)
        return len(self.doc['bufferViews']) - 1

    def accessor(self, arr, comp, kind, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        acc = {'bufferView': self._view(arr.tobytes(), target), 'componentType': comp, 'count': int(arr.shape[0]), 'type': kind}
        if minmax:
            acc['min'] = arr.min(axis=0).tolist()
            acc['max'] = arr.max(axis=0).tolist()
        if normalized:
            acc['normalized'] = True
        self.doc['accessors'].append(acc)
        return len(self.doc['accessors']) - 1

    def material(self, name):
        if name not in self._materials:
            self.doc['materials'].append({'name': name, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.6}})
            self._materials[name] = len(self.doc['materials']) - 1
        return self._materials[name]

    def mesh(self, name, pos, nrm, uv, idx, material, joints=None, weights=None, extra=None):
        attrs = {
            'POSITION': self.accessor(pos.astype(np.float32), FLOAT, 'VEC3', ARRAY_BUFFER, minmax=True),
            'NORMAL': self.accessor(nrm.astype(np.float32), FLOAT, 'VEC3', ARRAY_BUFFER),
        }
        if uv is not None:
            attrs['TEXCOORD_0'] = self.accessor(uv.astype(np.float32), FLOAT, 'VEC2', ARRAY_BUFFER)
        if joints is not None:
            attrs['JOINTS_0'] = self.accessor(joints.astype(np.uint8), UBYTE, 'VEC4', ARRAY_BUFFER)
            attrs['WEIGHTS_0'] = self.accessor(quantize_weights(weights), UBYTE, 'VEC4', ARRAY_BUFFER, normalized=True)
        for key, arr in (extra or {}).items():
            if key.startswith('COLOR_'):  # colours in 0..1 pack into normalized bytes
                arr = np.round(np.clip(arr, 0, 1) * 255).astype(np.uint8)
                attrs[key] = self.accessor(arr, UBYTE, f'VEC{arr.shape[1]}', ARRAY_BUFFER, normalized=True)
                continue
            arr = arr.astype(np.float32)
            kind = 'SCALAR' if arr.ndim == 1 else f'VEC{arr.shape[1]}'
            attrs[key] = self.accessor(arr, FLOAT, kind, ARRAY_BUFFER)
        idx = np.asarray(idx).reshape(-1)
        small = len(pos) < 65535
        prim = {
            'attributes': attrs,
            'indices': self.accessor(idx.astype(np.uint16 if small else np.uint32), USHORT if small else UINT, 'SCALAR',
                                     ELEMENT_ARRAY_BUFFER),
            'material': self.material(material),
        }
        self.doc['meshes'].append({'name': name, 'primitives': [prim]})
        return len(self.doc['meshes']) - 1

    def node(self, **kw):
        self.doc['nodes'].append({k: v for k, v in kw.items() if v is not None})
        return len(self.doc['nodes']) - 1

    def skeleton(self, names, parents, heads):
        """Joint nodes in bind pose (identity rotations). Returns (node ids, root node)."""
        ids = {}
        for n in names:
            p = parents[n]
            t = heads[n] - (heads[p] if p else 0)
            ids[n] = self.node(name=n, translation=[float(x) for x in t])
        for n in names:
            p = parents[n]
            if p:
                self.doc['nodes'][ids[p]].setdefault('children', []).append(ids[n])
        roots = [ids[n] for n in names if not parents[n]]
        ibm = np.zeros((len(names), 16), dtype=np.float32)
        for i, n in enumerate(names):
            m = np.eye(4, dtype=np.float32)
            m[:3, 3] = -heads[n]
            ibm[i] = m.T.reshape(-1)  # column-major
        skin = {'joints': [ids[n] for n in names], 'inverseBindMatrices': self.accessor(ibm, FLOAT, 'MAT4'), 'skeleton': roots[0]}
        self.doc['skins'].append(skin)
        return ids, roots, len(self.doc['skins']) - 1

    def write(self, path, scene_nodes):
        self.doc['scenes'][0]['nodes'] = scene_nodes
        while len(self.bin) % 4:
            self.bin.append(0)
        self.doc['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(self.doc, separators=(',', ':')).encode()
        while len(js) % 4:
            js += b' '
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A))
            f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942))
            f.write(self.bin)
