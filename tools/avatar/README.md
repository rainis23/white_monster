# tools/avatar

Builds `models/avatar/` (her rigged `avatar.glb` and its textures) from
[MakeHuman](http://www.makehumancommunity.org/)'s CC0 assets. It's plain
Python with numpy and Pillow. MakeHuman itself isn't needed.

```sh
tools/avatar/fetch_makehuman.sh   # once: ~40 MB into tools/avatar/.cache
python3 tools/avatar/build.py     # ~1 minute, writes models/avatar/
```

The build is deterministic, so rebuilding without changes gives identical
files. `MH_DATA`, `MH_TARGETS` and `AVATAR_OUT` override the input and
output locations.

## Pipeline

| file | step |
| --- | --- |
| `mh.py` | readers for MakeHuman's base mesh, shape targets, skeleton, skin weights and `.mhclo` proxies |
| `build.py` | shapes her (macro sliders plus face/body targets), reduces the rig to 76 bones, and exports the body, eyes, lashes, face-makeup decal and skin texture |
| `paint.py` | UV-space rasteriser, face makeup, iris and lash textures |
| `garments.py` | offset shells of body regions (they keep the body's UVs and skin weights), hem rims, cylindrical UVs |
| `outfit.py` | fishnets, thigh-highs, cropped sweater, pleated skirt and platform boots, and their textures |
| `hair.py` | layered hair sheets that follow the scalp from a middle part and fall around her with collision, plus curtain bangs |
| `accessories.py` | horns, spiked choker, studded belt and chains, garters and piercings |
| `gltf.py` | a small GLB writer with skinning |

Everything is modelled in MakeHuman's units (decimetres) and exported in
metres, with her soles at y = 0. Every bone's rest rotation is the identity,
so `js/avatar.js` can pose her from joint positions alone.

## Materials

The GLB only carries material names. `js/avatar.js` builds the real
materials: `skin`, `face`, `eye`, `lash`, `fishnet`, `sock`, `sweater`,
`skirt`, `boot`, `sole`, `silver`, `leather`, `horn`, `hair` and `hairCap`.
