# white_monster
baddie

A one-page 3D site. A white energy-drink can spins on a hologram projector.
Press **unleash the baddie** and it charges up, dissolves into a swarm of
light, and re-forms as a goth baddie. Press **back in the can** to put her
back.

She has winged "siren" liner, black overlined lips, icy lilac contacts, white
money-piece streaks in long black hair, little devil horns, septum, snake
bites and a brow slit with a barbell, rhinestone face gems, a spiked choker
and cross chain, a lace-up corset over a sheer mesh top, a tartan mini with a
studded belt and chains, fishnets with a thigh garter, and platform buckle
boots. She holds her white monster up like a trophy and follows your cursor
with her eyes.

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
Google Fonts. Everything else is procedural: every texture (the can label, her
face, the fishnets, the corset, the tartan, the floor sigil) is painted on a
`<canvas>` at load time, and the sound effects are synthesized with Web Audio.
The repo has no image or audio files.

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
| `js/can.js` | lathe-turned can with a wrapped label, pull tab and rivet |
| `js/baddie.js` | the character: sculpted head, face decal, strand hair, outfit, idle animation |
| `js/textures.js` | canvas painters for every texture |
| `js/reveal.js` | shader patch behind the "hologram print" dissolve and the glowing seam |
| `js/particles.js` | surface-sampled particle swarm that flies from one shape to the other |
| `js/stage.js` | projector pedestal, light beam, embers, floor and sky |
| `js/audio.js` | can crack, riser, whoosh, boom and sparkle sounds |

The transform is one shared timeline. A seam sweeps down through the source
object and discards everything above it. Particles leave each point on the
surface as the seam passes it and spiral around the projector. They land on
the target just as its own seam sweeps up from the floor, so the swarm and
the reveal stay in sync.

Fan-made parody. Not affiliated with any energy drink brand.
