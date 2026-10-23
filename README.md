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

| Keyboard & mouse (defaults) | |
|---|---|
| Left-drag / right-drag / wheel | rotate / pan / zoom (swap buttons in Controls) |
| `W` `A` `S` `D` / arrows · `Q` `E` · `Z` `X` | pan · rotate · zoom |
| Click a resident (or the list on the left) | select and follow them — rotating and zooming keep following; panning stops, `C` follows again |
| `Space` pause · `1`–`4` / `-` `=` speed · `Tab` / `` ` `` next / previous resident · `T` talk | |
| `B` build · `L` library · `M` shop · `N` news · `K` words · `U` studio · `O` settings · `Esc` back | |

| Gamepad (Xbox layout, defaults) | |
|---|---|
| Left stick | move the cursor (click anything: residents, buttons, sliders, menus) · `L-Stick` click toggles camera panning |
| Right stick | rotate the camera, or scroll the panel under the cursor |
| Ⓐ select · Ⓑ back/close · Ⓧ talk · Ⓨ pause | |
| LB / RB | previous / next resident |
| LT / RT | zoom out / in · `R-Stick` click follows the selected resident |
| D-pad | speed up/down · library · build mode |
| Start / View | settings / news |

Text boxes open an **on-screen keyboard** when you're using a gamepad (D-pad/stick to move, Ⓐ type, Ⓑ backspace, Ⓧ space, Ⓨ shift, LB/RB move the text cursor, Start done).

Every action can be rebound for keyboard/mouse (including middle and side mouse buttons) and gamepad in **Settings → 🎮 Controls & key bindings**, along with mouse button layout, camera speed, cursor speed, stick deadzone, invert-Y and when the on-screen keyboard appears. Controls are saved per computer.

- **Problems** (thought bubbles over heads) are how residents ask you for help: they're hungry, have a crush and want advice on confessing, want to make up after a fight, want *revenge*, got hurt, got soaked, caught a cold, are heartbroken, bored, want new clothes… Solving them earns coins and levels them up.
- **Interact** from the side panel: talk, feed (find their favourite and hated foods!), give gifts, umbrellas, towels, first aid, medicine, comfort them, send them to the clinic, or **Set Up** an interaction between two residents (chat, compliment, joke, hug, gossip, dance-off, prank, argue, insult, apologize, confess, break up).
- **Shop** sells food and items. **News** is the island newspaper of everything that happened.
- **Settings** has the conflict level, romance toggle, weather control (dynamic or locked), time skip, audio, graphics, save export/import.

### Conflict & injuries

Conflict level (Settings): **Peaceful** · **Mild** (arguments, insults, pranks, jealousy, cold shoulders — never physical) · **Normal** (heated conflicts can become fist fights) · **Spicy** (short fuses, more brawls).

Conflicts come from personalities (temper, kindness, confidence…), relationships and grudges, mood (hunger, pain, being soaked), and the weather (rain and storms make people grumpy). They include arguments, insults, pranks that don't land, gossip, love-triangle jealousy, the cold shoulder, dance-off sore losers, breakups — and **fights**: jabs, punches, kicks, shoves and tackles, dodges and blocks, knock-downs and knock-outs. Friends may jump in and turn it into a **brawl**; kind bystanders may try to break it up; you can hit **✋ Stop Fight**.

Injuries: bruises, black eyes, split lips, broken noses, sprained ankles (residents limp), concussions (dizzy stars, bandage), broken arms (arm sling, can't fight). Running on wet ground can make residents slip; staying soaked too long can give them a cold. Injuries heal over time — faster with first aid or a trip to the clinic. Fights leave grudges, news headlines, and problems to resolve (make up, or… revenge).

### Rooms (interiors)

Every house — plus the café, shop and clinic — has its own **room instance**. When residents go inside they really are inside: sleeping in bed, lounging on the sofa, cooking, eating at the table, reading, changing at the wardrobe, browsing shop racks, waiting at the clinic, sitting at café tables, and working behind the counter. Friends **visit each other's houses** and chat (or argue — or brawl in the café) indoors.

Look inside by **clicking a building**, the **🏠 Rooms** button (`H`), a resident's **👀 Look inside / 🏡 Their home** button, or just follow a selected resident — the camera goes in and out of buildings with them. **🎨 Decorate** any room: wall and floor colours or your own textures as wallpaper/flooring, furniture colour, and decorations (plants, lamps, piano, arcade machine, aquarium, giant teddy, guitar, trophy shelf). The window shows the weather outside, and lamps come on at night.

### The condo

The island has room for **10 houses**. When an 11th resident moves in, a **🏢 condo tower** appears behind the houses, and every later resident gets an apartment there (four per floor, as many floors as needed). Residents really walk through it: in the front door to the **lobby** (sofa, mailboxes), up the lift to **their floor's hallway**, and in through their own door (with their name on it). Neighbours bump into each other in the hallways and stop for a chat, hang out there, and visit each other's apartments. The condo also has an **indoor pool** that anyone can use — it's especially popular when it rains — with its own **Pool Lifeguard** job. Click the condo or use **🏠 Rooms** to look into the lobby, the pool, each floor and each apartment.

### Swimming & lifeguards

Residents go **swimming** at the beach (and in the condo pool): they change into their swimwear, stretch, wade in, swim the front crawl, tread water and float on their backs — and come out with the wet sheen. Swimming isn't risk free: cramps, tiredness, a full stomach, injuries, rain and especially storms can leave a swimmer **struggling** (🆘). Then:

- an **on-duty lifeguard** (beach 🛟 / condo pool 🏊) reacts at once, swims out and tows them back — the swimmer is hugely grateful and the island tips the lifeguard;
- otherwise a **brave bystander** might go in after a few seconds;
- you can **🛟 throw a Life Ring** (shop item, reusable) or **shout for help** from the resident's panel;
- if nobody comes, the waves eventually wash them ashore — with swallowed water, a dizzy spell and a fear of the water for days (and a news headline saying the island needs a lifeguard).

Residents swim more happily when a lifeguard is on duty, and lifeguards stay at their tower watching the water, call out warnings and get promotion credit for rescues.

### Daily routines & wardrobe mishaps

At **bedtime** residents brush their teeth, change into whatever they sleep in, maybe read a bit, then go to bed. In the **morning** they wake up (bright-eyed or groggy), stretch or yawn, get dressed, have breakfast and head out.

There's always a small chance of a **wardrobe mishap**: clothes **torn in a fight** (the most common), **forgetting to get dressed** (out in their pyjamas — or barefoot if they have no sleepwear), a **split seam** while exercising, a **coffee stain** at the café, a shirt **inside out**. Some aren't noticed right away, but other residents are quick to point them out ("Psst... you're still in your pajamas!"); then the resident gets embarrassed and usually goes straight home to change — or asks you what to do: go home and change, fix it with a **🧵 Sewing Kit**, or **own it** 😎. Changing into another outfit also fixes it.

**Wardrobe mishaps always leave underwear showing**: the parts you tick in the 👕 Wardrobe's **Mishap** column vanish while it lasts (otherwise clothes look torn / stained / are missing). Until it's mended or they change, it counts as an incomplete outfit.

### Underwear, incomplete & embarrassing outfits

- An outfit **named "Underwear"** can be changed into anywhere — everything else still needs the wardrobe at home.
- Wearing "Underwear", any outfit with **"Incomplete"** in its name, or having a mishap means **underwear shows**. Out in public (anywhere but their own home) and not swimming, others notice ("Uh, I can see your underwear!"). A man seeing a woman in her underwear — or a woman seeing a man — gets flustered and attracted (and may develop a crush); relatives don't.
- **Heading out the door** still in underwear (e.g. their "home" outfit) with no reason for it, residents usually notice and go back to the wardrobe first. How often they *don't* notice — and how often someone forgets to get dressed in the morning — is set with **⚙️ Settings → 🩲 Leave home in underwear** (default 5%, 0% = never).
- Anyone seen in an outfit they feel **embarrassed** in (or with underwear showing, unless they're proud of the look) covers up and goes home to put on something else. Swimming is the exception.

### Prior relations

Each resident's panel has a **Prior relations** section: say who on the island is a **relative** (parent, child, sibling, twin, cousin, grandparent, aunt/uncle, niece/nephew, estranged family), a **rival** (friendly, competitive, bitter, nemesis, ex-best friend, one-sided) or in a **relationship** (dating, engaged, married, ex — friendly or bitter, a secret crush, on-and-off). The other resident gets the matching side. It sets where their relationship starts, keeps pulling it back there, and changes what they do together: family chats and hugs (and never dates), siblings prank and bicker, rivals compete in dance-offs and argue, nemeses fight, spouses date and rarely break up, exes are awkward.

### Progression

**Island level** (🏝️ chip in the top bar — click it): earn island XP by solving residents' problems, feeding favourites, giving gifts, stopping fights, rescues, residents levelling up or getting promoted, new residents and every new day. Each level pays a coin bonus and unlocks things — Sewing Kits & Life Rings (Lv 2), Chef & Tailor jobs (3), a bigger daily allowance (4, 8, 12), Police & Paramedic jobs (5), shop discounts (6, 10), the Teacher job (7).

**Resident levels** now matter: every level means higher wages, faster promotions, safer swimming, more toughness in fights, more charm when confessing and a happier baseline. Level 5 residents throw **house parties** and invite friends over; level 8 residents are **island celebrities** with fans asking for autographs.

### Jobs

Give residents jobs from their panel (or when they ask for one): **Barista ☕, Shop Clerk 🛍️, Doctor 🩺, Gardener 🌷, Fisher 🎣, Performer 🎤, Lifeguard 🛟, Pool Lifeguard 🏊 (condo), Mail Carrier 📮, Chef 🍳, Tailor 🧵, Police Officer 👮, Paramedic 🚑, Teacher 📚**. Residents **on the clock keep working** — nobody can pull them into a chat or an argument, they snack at work instead of leaving to eat, and early shifts beat sleeping in (you can still set up interactions yourself).

Every job matters: the chef makes café meals fill people up and cooks dishes for your inventory; the tailor mends mishaps at the shop and sews Sewing Kits; police break up fights right away and keep tempers down; paramedics rush to hurt or knocked-out residents and treat them; the teacher's class in the park helps residents level up; the gardener harvests apples. Each has a shift, a weekly day off, a wage paid to the island, and promotions with new titles over time. Jobs suit some personalities better than others (★ rating) — residents in a job they dislike get unhappy and may ask to quit. Coworkers bond. On-duty perks: café visitors get happier, 10% off in the shop, much better clinic treatment, the performer entertains the plaza, the fisher brings fish to your inventory, the mail carrier delivers letters that bring residents closer, and more.

### Voices & words

Residents talk with a **built-in speech synthesizer** (eSpeak, rendered in a background worker), or optionally with your computer's own **system voices**. The **🎙️ Voice editor** (resident panel, or ✏️ Edit) sets:

- **Engine & voice:** built-in voice type (7 male, 5 female, croaky, retro, whisper) and accent (American, British, RP, Northern, West Midlands, Scottish), or a system voice.
- **Pitch** from ×0.25 (giant) to ×4 (chipmunk) on the built-in engine — the synth's own pitch is combined with playback-rate shifting so speed stays about the same. System voices stop at ×2.
- **Speed** and **volume** (Settings also has separate **master, voice, music and ambient & effects** volume sliders).
- **Intonation:** how much pitch *and* speed move through every sentence — stressed words rise and stretch, small words hurry, phrase ends lengthen, commas get a continuing rise, questions climb and statements fall. Higher settings stress more words, make bigger moves, split speech into shorter phrases and add longer pauses.
- **Emotion:** how strongly the resident's current mood shapes the line — happy bounces higher and quicker, in love sing-songs, sad sinks, slows and fades, angry punches stressed words, scared trembles and rushes, shy trails off, hurt yelps then strains, smug drawls. With no particular mood it adds lively emphasis.
- **Verbal tic** ("…, nya!") and how often, **stutter**, and whether they always use speech, babble or stay silent.
- **Babble:** tone, waveform, vowel colour, speed, pitch range, vibrato and breathiness — it follows the same intonation/emotion shape.

Presets: Cute, Deep, Giant, Robot, Squeaky, Chipmunk, Elderly, Whisper, Hyper, Dramatic, or 🎲 random; the test box can play a line in any mood. A name pronunciation is set in ✏️ Edit. Settings → Voices switches between *Speech* (for the selected resident or everyone nearby), cute *Babble*, or *Off*. The built-in synthesizer is eSpeak/meSpeak (GPL).

Like Tomodachi Life, residents ask you to **teach them words** (📖 bubbles): something tasty, a place to visit, a hobby, a cute animal, a scary thing, a song, a silly sound, a nickname, a compliment, an insult, a dream… They use your words in conversations, jokes, compliments and arguments ("You smell like *space tacos*!"). Add a pronunciation so the voices say it right. Manage all words in **📖 Words**, or use **📖 Teach word** on any resident.

### Moving around: collisions & IK

The stage and pier are walkable platforms — residents climb the stage's front step and stand on top. Buildings, trees, benches and other props are solid. **Foot IK** keeps feet planted on uneven ground (stage edges, steps, the pier, slopes) by lowering the hips and bending the knees, and residents **turn their heads** toward whoever they're talking to or fighting (Settings → *Foot IK & head tracking*).

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
  animations/   *.vrma *.fbx *.json  → animations (VRM Animation, Mixamo FBX, FriendLife JSON)
```

### Characters (.vrm)

Export from **VRoid Studio** (`Export → VRM`, 0.x or 1.0 both work) or any VRM tool. Create a resident from it (Library → **＋ New resident**, or **✏️ Edit** an existing resident and pick *VRoid / VRM model*). Facial expressions (happy, angry, sad, surprised, relaxed, blinking, talking) use the model's VRM expressions.

### Personal outfits (alternate models per resident)

Every resident has a **Closet** (side panel). Add outfits that belong only to them:

- **⬆ Import .vrm just for them** — e.g. the same VRoid character exported with different clothes or hair. These models are marked as personal and don't show up for other residents.
- **📦 Use a model from the Library** — any character model, optionally with a clothing overlay.
- **⧉ Copy current look** — then restyle it in the 👕 Wardrobe (texture swaps, tints, hidden parts are stored per outfit).

**Wear automatically when…** tag outfits with situations: **Swimming, Sleeping, Working, Exercising, Dancing, On a date, Visiting someone, At home, Snow, Rain, Evening, Morning, Sunny, Out and about, Everyday**. Activities come first (swimming, sleeping, working, exercising, dancing, a date), then being at home or visiting, then weather and time of day, then out and about, then everyday; if several outfits fit at that level — say one for rain and one for the evening on a rainy evening — the resident picks one at random (and keeps it while the situation lasts). Clothes live in the **wardrobe at home**: residents only change there. Before swimming, a work shift, exercising or dancing they go home for the right outfit first (then carry on), they change into sleepwear as part of the bedtime routine and get dressed in the morning, and if the weather turns or they're still in swimwear they now and then pop home to change. Pressing **Wear** in the closet sends them to their wardrobe too. Once a resident has more than one outfit, the **main look** gets the same settings (✏ next to it). Switching back to a recently worn outfit is instant.

**How it's perceived:** for each outfit (and the main look), set how the resident **feels** wearing it and how **everyone else sees** it — cute, elegant, sexy, cool, powerful, comfortable, sporty, professional, trendy, silly, scary, sloppy, embarrassing. Feelings affect their mood and confidence (feeling powerful hits harder in fights; feeling embarrassed makes them shy and unhappy) and they comment on it. Others react when they see it: compliments, flustered crushes, "nice fit!", laughing and teasing, keeping their distance from someone powerful or scary — and it shifts what they choose to do with each other (more compliments, more teasing, fewer fights). The two can disagree: if they think it's sexy and everyone thinks it's embarrassing, being laughed at hurts.

When a resident says *"I'm tired of my look"*, anything new counts: adding an outfit to their closet (any of the three ways), wearing a different closet outfit, restyling them in the 👕 Wardrobe, saving a variant, or changing their model in ✏️ Edit.

### Outfits (.vrm)

Import a VRoid model *wearing the clothes you want* as an **Outfit**. FriendLife takes its clothing parts (Tops / Bottoms / Shoes / Onepiece / Accessory — you can tick exactly which parts) and re-binds them onto any resident's skeleton, keeping the clothes' modelled shape. In the 👕 Wardrobe you can hide the resident's own clothing parts so nothing pokes through.

Works best between VRoid models with similar body shapes. Clothing physics (spring bones) from the outfit file are not carried over — skirts/coats move rigidly with the body.

### Variations

The **👕 Wardrobe** lists every part of a resident's model and outfit — one item per **texture**, so parts that share a material name (VRoid often names socks, bra and panties all "Onepiece_00_CLOTH") are separate items, numbered "(1/3)", "(2/3)"… with a small texture preview. For each item you can swap in a **texture**, apply a **colour tint**, **hide** it, mark it **Thin** (it turns see-through when wet) or **Mishap** (it can go missing in a wardrobe mishap). Save the result as a named **variant** of the character or outfit — any resident using that model can pick the variant. (Tip: export a texture from VRoid Studio, edit it, import it — it keeps the right UV layout.)

### Textures (.png / .jpg / .webp)

Used by the Wardrobe (above) and for re-skinning the island's **ground** and **paths** (Build → 🖼️ Surfaces, or the Library's texture tab).

### Animations (.vrma / .json)

- **.vrma** — the standard VRM Animation format (VRoid Hub, Blender VRM add-on, VRM Posing Desktop, etc.).
- **.fbx from [Mixamo](https://www.mixamo.com)** — download as *FBX*, with or without skin (tick *In Place* for walks and runs). The Mixamo skeleton is retargeted onto VRM and doll residents automatically. Files named like the action (`Walking.fbx`, `Punching.fbx`, `Hip Hop Dancing.fbx`, `Sitting.fbx`…) are mapped to that action on import.
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
src/world/       island layout, buildings & props, room instances (houses, café, shop, clinic, condo)
src/characters/  VRM + doll avatars, outfits, animation system, built-in animations
src/sim/         residents, brain (daily routine), room brain, social, fights, problems, jobs,
                 outfits (conditions, perception, mishaps), swimming & rescues, condo
src/ui/          HUD, panels, library, wardrobe, creator, studio, shop/news/settings/build
scripts/         build, sample generator, icon, headless tests
samples/         sample VRM character, VRM outfit and .vrma animation (generated, CC0)
```

Headless tests (need Playwright + Chromium): `node scripts/smoke.cjs`, `scripts/vrm-test.cjs`, `scripts/ui-test.cjs`, `scripts/sim-test.cjs` (simulates several days and prints the island news), `scripts/rooms-test.cjs`, `scripts/voice-test.cjs`, `scripts/life-test.cjs` (swimming & rescues, outfits & perception, mishaps, routines, the condo).

Built with [three.js](https://threejs.org) and [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) (both MIT), packaged with Electron.
