# FriendLife

An island life sim inspired by *Tomodachi Life: Living the Dream* — but the residents are **your VRoid / VRM avatars** instead of Miis.

Residents live on a little island with houses, a café, a shop, a clinic, a park, a stage, a beach and a pier. They eat, sleep, wander, chat, make friends, fall in love, gossip, argue, prank each other, get jealous, hold grudges — and sometimes actually **fight**, get **hurt**, and end up at the clinic. **Dynamic weather** changes through the day: rain makes everything (and everyone) **wet and glossy**, puddles and ripples form, thunderstorms flash and rumble, snow piles up.

> Fan project. Not affiliated with Nintendo. No Nintendo assets are used.

## Running the game

**Windows:** download `FriendLife.exe` and double-click it. It is a portable app — nothing to install. Your island and imported files are saved automatically.

- Each push to GitHub builds the exe in **Actions → "Build Windows .exe" → Artifacts → FriendLife-windows**.
- Pushing a tag like `v0.1.0` also attaches `FriendLife.exe` to a GitHub Release.

**From source (any OS):**

```bash
npm install
npm start            # builds and opens the desktop app
npm run dist:win     # builds release/FriendLife.exe (works from Linux/macOS too)
npm run build        # web build in dist/ (serve it with any static file server)
```

## Playing

| | |
|---|---|
| Left-drag / right-drag / wheel | orbit / pan / zoom |
| Click a resident (or the list on the left) | open their panel |
| `Space` | pause · `1`–`4` speed · `Tab` next resident |
| `B` | build mode (place trees, benches, lamps… right-click removes) |
| `L` | library (imports) · `Esc` closes windows |

- **Problems** (thought bubbles over heads) are how residents ask you for help: they're hungry, have a crush and want advice on confessing, want to make up after a fight, want *revenge*, got hurt, got soaked, caught a cold, are heartbroken, bored, want new clothes… Solving them earns coins and levels them up.
- **Interact** from the side panel: talk, feed (find their favourite and hated foods!), give gifts, umbrellas, towels, first aid, medicine, comfort them, send them to the clinic, or **Set Up** an interaction between two residents (chat, compliment, joke, hug, gossip, dance-off, prank, argue, insult, apologize, confess, break up).
- **Shop** sells food and items. **News** is the island newspaper of everything that happened.
- **Settings** has the conflict level, romance toggle, weather control (dynamic or locked), time skip, audio, graphics, save export/import.

### Conflict & injuries

Conflict level (Settings): **Peaceful** · **Mild** (arguments, insults, pranks, jealousy, cold shoulders — never physical) · **Normal** (heated conflicts can become fist fights) · **Spicy** (short fuses, more brawls).

Conflicts come from personalities (temper, kindness, confidence…), relationships and grudges, mood (hunger, pain, being soaked), and the weather (rain and storms make people grumpy). They include arguments, insults, pranks that don't land, gossip, love-triangle jealousy, the cold shoulder, dance-off sore losers, breakups — and **fights**: jabs, punches, kicks, shoves and tackles, dodges and blocks, knock-downs and knock-outs. Friends may jump in and turn it into a **brawl**; kind bystanders may try to break it up; you can hit **✋ Stop Fight**.

Injuries: bruises, black eyes, split lips, broken noses, sprained ankles (residents limp), concussions (dizzy stars, bandage), broken arms (arm sling, can't fight). Running on wet ground can make residents slip; staying soaked too long can give them a cold. Injuries heal over time — faster with first aid or a trip to the clinic. Fights leave grudges, news headlines, and problems to resolve (make up, or… revenge).

### Weather

Sunny, partly cloudy, overcast, drizzle, rain, thunderstorm, snow and fog, changing on a forecast every few hours, plus a full day/night cycle. Rain soaks the island and the residents: surfaces darken and turn glossy, water streaks run down walls, puddles with rain ripples form on the ground, and **residents get a wet sheen** (VRM MToon materials get a glossy matcap/rim highlight; PBR materials get a wet shader). Characters dry off indoors or in the sun. Residents with an umbrella use it.

## Your own content

Everything is in **📦 Library** (or just **drag & drop files onto the window**). Use **🎁 Add sample content** to try every feature with bundled sample files.

The desktop app also reads a **`mods` folder** created next to `FriendLife.exe`:

```
mods/
  characters/   *.vrm          → residents' bodies
  outfits/      *.vrm          → clothing fitted onto residents
  textures/     *.png *.jpg    → wardrobe & island surfaces
  animations/   *.vrma *.json  → animations
```

### Characters (.vrm)

Export from **VRoid Studio** (`Export → VRM`, 0.x or 1.0 both work) or any VRM tool. Create a resident from it (Library → **＋ New resident**, or **✏️ Edit** an existing resident and pick *VRoid / VRM model*). Facial expressions (happy, angry, sad, surprised, relaxed, blinking, talking) use the model's VRM expressions.

### Outfits (.vrm)

Import a VRoid model *wearing the clothes you want* as an **Outfit**. FriendLife takes its clothing parts (Tops / Bottoms / Shoes / Onepiece / Accessory — you can tick exactly which parts) and re-binds them onto any resident's skeleton, keeping the clothes' modelled shape. In the 👕 Wardrobe you can hide the resident's own clothing parts so nothing pokes through.

Works best between VRoid models with similar body shapes. Clothing physics (spring bones) from the outfit file are not carried over — skirts/coats move rigidly with the body.

### Variations

The **👕 Wardrobe** lists every material slot of a resident's model and outfit. For each slot you can swap in a **texture**, apply a **colour tint**, or **hide** it. Save the result as a named **variant** of the character or outfit — any resident using that model can pick the variant. (Tip: export a texture from VRoid Studio, edit it, import it — it keeps the right UV layout.)

### Textures (.png / .jpg / .webp)

Used by the Wardrobe (above) and for re-skinning the island's **ground** and **paths** (Build → 🖼️ Surfaces, or the Library's texture tab).

### Animations (.vrma / .json)

- **.vrma** — the standard VRM Animation format (VRoid Hub, Blender VRM add-on, VRM Posing Desktop, etc.).
- **.json** — FriendLife keyframe animations. Make them in the **🎬 Studio** (pose bones with sliders at keyframes, preview live, save to the library), or write them by hand:

```json
{
  "name": "wave",
  "duration": 1.0,
  "loop": true,
  "base": "stand",
  "keys": [
    { "t": 0,    "pose": { "rightUpperArm": [0, 0, -62], "rightLowerArm": [0, 0, -40] } },
    { "t": 0.25, "pose": { "rightLowerArm": [0, 0, 5] } },
    { "t": 0.5,  "pose": { "rightLowerArm": [0, 0, -40] } },
    { "t": 0.75, "pose": { "rightLowerArm": [0, 0, 5] }, "hips": [0, 0.02, 0] }
  ]
}
```

Rotations are Euler degrees (X, Y, Z) relative to the T-pose in VRM 1.0 space (character faces +Z, its left hand points to +X). Bone names are the VRM humanoid names (`hips`, `spine`, `chest`, `upperChest`, `neck`, `head`, `left/rightShoulder`, `…UpperArm`, `…LowerArm`, `…Hand`, `…UpperLeg`, `…LowerLeg`, `…Foot`, `…Toes`). `hips` is a body offset measured in hip-heights (`[0, -0.46, 0]` ≈ sitting). `"base": "stand"` fills un-keyed bones with the relaxed standing pose (`"none"` = T-pose). Per-bone `"tracks": { "bone": [[t, [x, y, z]], …] }` also works.

In the Library you can **replace any built-in action** (idle, walk, run, dance, punch, kick, cry, sit, knockdown, …) with an imported animation, or tick **Idle emote** so residents perform it on their own.

## Project layout

```
electron/        desktop shell (window, mods folder, samples)
src/core/        library (IndexedDB + mods), helpers
src/engine/      renderer/sky/lighting, weather & particles, wet/snow materials, audio, effects
src/world/       island layout, buildings & props
src/characters/  VRM + doll avatars, outfits, animation system, built-in animations
src/sim/         residents, brain (daily routine), social interactions, fights, problems, data
src/ui/          HUD, panels, library, wardrobe, creator, studio, shop/news/settings/build
scripts/         build, sample generator, icon, headless tests
samples/         sample VRM character, VRM outfit and .vrma animation (generated, CC0)
```

Headless tests (need Playwright + Chromium): `node scripts/smoke.cjs`, `scripts/vrm-test.cjs`, `scripts/ui-test.cjs`, `scripts/sim-test.cjs` (simulates several days and prints the island news).

Built with [three.js](https://threejs.org) and [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) (both MIT), packaged with Electron.
