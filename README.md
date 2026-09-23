# white_monster
baddie

A one-page 3D site. A white monster can spins on a hologram projector. Press
**unleash the baddie** and the can charges up, dissolves into a swarm of
light, and re-forms as a goth baddie VRChat-style avatar. Press **back in the
can** to put her away.

**The can** is a fan recreation of the 16 fl oz Zero Ultra can, modelled from
real dimensions:
- the 66 mm body, with a stepped die-necked shoulder and rolled double seam
- a countersunk lid with a riveted pull tab and a scored tear panel
- a domed base with a standing ring

The wrap is painted in code: the claw logo, ZERO SUGAR, ULTRA, the side
wordmark, a nutrition panel and a barcode. The claw is metallic silver ink and
the whole wrap sits under a glossy varnish coat.

**The avatar** is an anime-style avatar in the spirit of VRChat models:
- **Look:** cel shading with ink outlines, big slit-pupil eyes, a smug fanged
  smirk, blunt bangs, black hair with white money pieces and a white under-layer,
  horns and a swaying devil tail.
- **Outfit:** spiked choker, chest harness over a corset and mesh top, flared goth
  sleeves, a tartan pleated skirt with chains, thigh-highs with garters and
  platform buckle boots.
- **Behaviour:** she holds her can up, follows your cursor, blinks, and has a
  nameplate over her head. She loads in T-posing like every VRChat avatar,
  then snaps into her pose.

## Run it

It's a static site with no build step. Serve the folder with any static file
server:

```sh
npx serve .
# or
python3 -m http.server
```

Then open the printed URL. Opening `index.html` directly from disk won't work,
because ES modules need to be served over http. GitHub Pages works as is.

Three.js (r186) comes from jsDelivr via an import map, and the fonts come from
Google Fonts. Everything else is procedural: every texture is painted on a
`<canvas>` at load time and the sound effects are synthesized with Web Audio.

### Using a downloaded can model instead

To use a premade model (Sketchfab has free Zero Ultra models, for example),
download it as `.glb`, put it in a `models/` folder, and set `CAN_MODEL_URL`
in `js/config.js`:

```js
export const CAN_MODEL_URL = 'models/zero-ultra.glb';
```

The model is scaled, centred and stood upright automatically. It's used for
both the big can and the one in her hand, and it gets the same dissolve
effect. Check the model's licence and credit its author here if it asks for
attribution.

## Controls

- **drag**: orbit
- **scroll / pinch**: zoom
- **tap the can**: it does a barrel roll
- **tap her**: she spins and the caption changes
- **sound on/off**: top-right chip, remembered per browser

Two URL flags help with recording and screenshots:

- `?mode=baddie`: start with her already out
- `?dt=0.05`: advance the animation by a fixed step per frame

## How it's built

| file | what it does |
| --- | --- |
| `js/main.js` | renderer, lights, bloom, camera framing, UI, and the transform timeline |
| `js/can.js` | lathe-turned can, pull tab and tear panel, plus the optional `.glb` loader |
| `js/label.js` | the can wrap: a colour canvas and a roughness/metalness canvas |
| `js/avatar.js` | the avatar: head, face decal, hair, outfit, arm rig, T-pose, nameplate |
| `js/face.js` | the anime face texture (eyes open and closed) |
| `js/toon.js` | cel shader and inverted-hull outlines used by the avatar |
| `js/geometry.js` | lathe limbs and swept, tapering tubes for hair, straps and fingers |
| `js/textures.js` | shared canvas helpers plus fabric and stage textures |
| `js/reveal.js` | shader patch behind the "hologram print" dissolve and the glowing seam |
| `js/particles.js` | surface-sampled particle swarm that flies from one shape to the other |
| `js/stage.js` | projector pedestal, light beam, embers, floor and sky |
| `js/audio.js` | can crack, riser, whoosh, boom and sparkle sounds |
| `js/config.js` | optional path to a downloaded can model |

The transform is one shared timeline. A seam sweeps down through the source
object and discards everything above it. Particles leave each point on the
surface as the seam passes it and spiral around the projector. They land on
the target just as its own seam sweeps up from the floor, so the swarm and
the reveal stay in sync.

Fan-made. Not affiliated with or endorsed by Monster Energy. The can artwork is
a hand-built recreation for a fan project.
