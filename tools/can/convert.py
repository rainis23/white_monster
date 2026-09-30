"""Converts the "White Monster 3D Scan" by Laser Design (CC-BY-4.0,
https://sketchfab.com/3d-models/white-monster-3d-scan-62f9706628244398804e23adeb2bc982)
into the web assets in models/can/:

  can.glb       the scanned mesh in metres, standing on y = 0 around the y axis,
                the Monster claw facing +z (geometry only, material "can")
  can_4k.jpg    the scan's 8192px colour texture downscaled for desktop
  can_2k.jpg    ... and for phones

usage: python3 tools/can/convert.py <sketchfab glTF download: folder or .zip>
"""

import json
import sys
import tempfile
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'avatar'))
from gltf import GLB  # noqa: E402

OUT = HERE.parent.parent / 'models/can'


def load(folder):
    doc = json.loads((folder / 'scene.gltf').read_text())
    buf = (folder / doc['buffers'][0]['uri']).read_bytes()
    types = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}
    sizes = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}

    def accessor(i):
        a = doc['accessors'][i]
        v = doc['bufferViews'][a['bufferView']]
        off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        n = sizes[a['type']]
        return np.frombuffer(buf, types[a['componentType']], a['count'] * n, off).reshape(a['count'], n).squeeze()

    prim = doc['meshes'][0]['primitives'][0]
    pos = accessor(prim['attributes']['POSITION']).astype(np.float64)
    nrm = accessor(prim['attributes']['NORMAL']).astype(np.float64)
    uv = accessor(prim['attributes']['TEXCOORD_0']).astype(np.float64)
    idx = accessor(prim['indices']).astype(np.int64).reshape(-1, 3)
    # the Sketchfab root node's matrix (column-major) turns the scan upright
    m = np.array(doc['nodes'][0]['matrix']).reshape(4, 4).T
    pos = pos @ m[:3, :3].T + m[:3, 3]
    nrm = nrm @ m[:3, :3].T
    image = folder / doc['images'][0]['uri']
    return pos, nrm, uv, idx, image


def main(src):
    src = Path(src)
    with tempfile.TemporaryDirectory() as tmp:
        if src.suffix == '.zip':
            zipfile.ZipFile(src).extractall(tmp)
            src = Path(tmp)
        pos, nrm, uv, idx, image = load(src)
        OUT.mkdir(parents=True, exist_ok=True)
        Image.MAX_IMAGE_PIXELS = None
        tex = Image.open(image).convert('RGB')
        for size, name, q in ((4096, 'can_4k.jpg', 82), (2048, 'can_2k.jpg', 85)):
            tex.resize((size, size), Image.LANCZOS).save(OUT / name, quality=q, optimize=True, progressive=True)

    # millimetres -> metres, base on the floor, axis through the origin (the claw already faces +z)
    pos = pos * 0.001
    lo, hi = pos.min(axis=0), pos.max(axis=0)
    pos -= [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)

    glb = GLB()
    glb.doc['asset']['copyright'] = 'White Monster 3D Scan by Laser Design (CC-BY-4.0)'
    mesh = glb.mesh('can', pos, nrm, uv, idx, 'can')
    glb.write(OUT / 'can.glb', [glb.node(name='can', mesh=mesh)])
    h = pos[:, 1].max()
    r = np.hypot(pos[:, 0], pos[:, 2]).max()
    print(f'wrote {OUT}: {len(pos)} vertices, {len(idx)} triangles, height {h:.4f} m, radius {r:.4f} m')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
