# Decisions

Why things are the way they are. Newest first within each section.

## Simulation and determinism
- **Fixed 60 Hz simulation, seeded mulberry32 RNG.** Every random choice (damage roll, status chance, AI timing) comes from the match seed, so a match is fully reproducible from its seed and its input log.
- **Play of the Match re-simulates from the start instead of keeping rolling snapshots.** The brief suggests a snapshot every second; the sim costs ~0.012 ms per tick, so replaying a 4-minute Trainer Battle from tick 0 takes ~0.2 s and needs no snapshot code to keep in sync. The replay starts 5 s (300 ticks) before the final knockout.
- **The CPU influences the match only through inputs** (including its aim error, whether it fell for a Substitute decoy and which Pokémon it sends in after a knockout), so recorded inputs replay CPU sides exactly. The live sim is fed the same quantized inputs the log stores (stick axes in 1/127 steps), and the live match and the replay share one input-application function. `tools/replaycheck.mjs` replays 24 CPU matches across every environment and format and requires identical end states.
- **The presentation layer advances on simulation ticks** (HUD timers, world animation clock, effects), so banners and animations run at the same speed at 60 Hz, 120 Hz or during slow motion, and freeze while paused.
- **Button presses are latched until a simulated tick consumes them**, and a press that starts and ends between two frames still counts, so quick taps are never lost.

## Combat
- **Stamina tiers** follow the brief: Light 10–14 / no cooldown, Medium 18–26 / 0.3–0.6 s, Heavy 30–40 / 1.2–2.0 s, Signature 45–55 / 3–4 s, at most one Signature per fighter. `tools/validate.mjs` enforces this. **Exception:** utility moves (buffs, shields, heals, counters, sleep, Roar-type pushes) keep longer cooldowns (2.5–10 s), and a buff, shield or heal-over-time lasts at most two-thirds of its cooldown (validator rule), so none can be kept up permanently. Held shields (Iron Defense) are limited by their stamina drain instead.
- **Dodge costs 12 stamina with a 0.35 s cooldown** (21 ticks), 13 invulnerable ticks out of a 22-tick roll. A hit that arrives during the first 9 ticks of the roll is a perfect dodge (slow motion, a gold flash and a short counter window).
- **Stamina regenerates 28/s starting 0.4 s after a spend, halved while attacking or hurt, doubled in overtime.**
- **Damage formula:** `power × 0.17 × (Atk+100)/(Def+100) × STAB 1.2 × type × roll(0.92–1.08) × per-fighter multiplier`. The +100 offsets compress the gap between weak and strong base stats so small Pokémon (Pikachu, Meowth) stay viable. HP = (260 + 1.3 × base HP) × multiplier. Damage is scaled per environment and format so matches land in the target lengths: Pokémon Battles ground 1, water 1, air 0.88 (45–75 s); Trainer Battles ground 1.18, water 1.25, air 0.86 (2.5–4 minutes).
- **Per-environment balance multipliers** (`src/content/balance.js`) are written by `tools/tune.mjs`, which plays AI-vs-AI rounds and nudges each fighter's strength (HP × damage) toward a 50 % win rate. HP takes 30 % of the adjustment and stays within 0.8–1.25 so roles keep their shape (a weak-statted Meowth hits harder rather than becoming a second Chansey); the rest goes into damage. Kits and move numbers stay as designed; the multiplier only evens out the matchup spread.
- **Type chart compressed for real time:** ×1.5 / ×1.75 / ×0.7 / ×0.5 / ×0 as in the brief.
- **Stun decay ("Breakout").** Each fighter has a stun load that grows while staggered and drains twice as fast while free. Above ~0.8 s of near-continuous stagger, new hits lose their stun; once it reaches zero the fighter breaks out with a short stagger-immunity window (hits still deal damage). Launches are limited to two re-launches while airborne, capped at ~30 units high. This stops CPU or player loops (e.g. repeated Sky Uppercuts) from locking anyone for seconds.
- **Volleys don't stun-lock:** in a multi-hit volley (every pellet can connect: Bubble Beam, Bullet Seed, Pay Day…) the pellets before the last deal damage without interrupting the target (always for light moves; heavier volleys may set their own stun), and the last pellet flinches and rolls the side effect once. Spread shots whose pellets share one hit (Swift, Razor Leaf, Psycho Cut) connect once with the move's full stun, knockback and side effect. Found by the balance harness: Suicune's Bubble Beam kept CPU foes permanently staggered from range.
- **Weighted projectile clashes:** projectiles of comparable power cancel each other; a much stronger one (over 1.5×) pushes through a weaker one and loses that much weight; giant projectiles always win against normal ones. Found by the balance harness: a stream of tiny Bubble Beam pellets was cancelling every incoming attack.
- **Beams hit as soon as the growing beam reaches the target**, then at most once per interval.
- **Areas are evaluated on the tick they are created** (an earlier off-by-one made instant areas such as Earthquake miss).
- **Mega Evolution:** the first Ultimate of a Mega-capable fighter is the Mega Evolution itself (1 s skippable sequence, short invulnerability, a non-damaging shockwave that makes space, +6 % HP, boosted stats). Later charges fire the Mega-only Ultimate. In Trainer Battles only one Pokémon per team can Mega Evolve; teammates that can't fire their base Ultimate instead.
- **Ultimate meter** fills from damage dealt (64 × fraction of the foe's max HP), damage taken (36 ×) and time (0.7/s), which lands the first Ultimate at ~45–55 s of fighting.
- **Ho-Oh's Sacred Rebirth** revives a fainted teammate at 50 % once per Trainer Battle (later charges, and every charge in a Pokémon Battle, unleash the Sacred Fire inferno). Reviving on every charge let Nurse Joy's air team win 88 % of its matches.
- **Serpent hurtbox** is the head plus the front third of the body while uncoiled; coiled, the whole sprite is the hurtbox.

## Rendering
- **One texel per world unit**, integer upscale `k = max(2, floor(canvas height / 220))` (iPhone landscape → k = 3, about 562 × 260 world units visible), devicePixelRatio capped at 2, smoothing off everywhere. `tools/shapelint.mjs` fails the build on vector shapes, gradients, blur or smoothing in the world renderer and effects; the HUD and menus are vector UI by design (brief §10).
- **Air battles share one raised plane:** the map, distant clouds and shadows sit on the ground plane; fighters, projectiles, beams, zones and effects are drawn 18 units higher; near clouds and weather pass over everything.
- **Serpent bodies** are a path-following chain (Gyarados 8 segments / 124 units, Milotic 7 / 112, Rayquaza 8 / 132). The body is drawn as overlapping cross-section discs — silhouettes first, fills on top — so only the outer edge is outlined and it reads as one continuous tube, with species patterns (fins, rings, scale colours) on the joints. The head is cut from the real SpriteCollab frame. ChatGPT body sheets (Appendix C prompts) plug in through `serpentArt.setSheet()` when supplied.
- **Giant projectiles** (Giant Water Shuriken, Giant Mist Ball) use Scale2x/Scale3x versions of the PMDO sheets generated at build time — never runtime scaling.
- **Tall eruption sheets** (Stone Edge, Frenzy Plant, fire/water columns, Sky Uppercut) are anchored at their base so they rise from the ground.
- **Falling meteors** (Draco Meteor, Meteor Shower, Eruption) are authored pixel meteors; PMDO's streak sheet is too faint at this scale.
- **Iron Defense** is an authored 2.5D steel shield arc around the fighter, depth-sorted with the scene.
- **HUD panels fade back** to 35 % when a fighter is underneath them.
- **Faint poses:** a species without a SpriteCollab Faint plays the PSP sprite's faint slot (35 of 42), extracted once by `tools/psp_faint.py` into `inputs/psp/faint/` and merged into the fighter atlas by `tools/build_sprites.py`. A fainted Mega or Primal reverts to its base form with a white flash, as in the games, so it uses the base sprite's faint pose; a Ho-Oh revive brings it back in base form. Deoxys formes have no PSP sprite and fall back to Sleep.
- **Indigo Plateau Stadium is painted in code** (no source painting was supplied). Lumiose Skyline uses the user's image with the tower seen from directly overhead (their second, side-view tower version breaks the straight-down camera); it isn't clean pixel art, so the build snaps it to 3×3 art pixels and 40 colours like the rest of the set. The code-painted Lumiose remains only as a fallback.
- **Serpent sheets are used piece by piece** (`inputs/serpents/use.json`): only pieces that beat the drawn-in-code art ship. Sheet body segments are stamped once per joint and read as beads, while the code-drawn body is one continuous tube, so the bodies stay drawn in code.

## UI and platform
- **PlayStation glyphs are inline SVG** everywhere; on touch devices the ✕ / ○ prompts are also tap targets (○ = back, ✕ = confirm), because touch has no physical buttons.
- **Pause sub-screens** (Settings, Controls) render inside the pause layer, and touch settings apply live.
- **Tapping the arena skips** the faint sequence, the Mega sequence and Play of the Match (✕ also works).
- **Fonts are self-hosted** Barlow subsets (Google Fonts can't be fetched from the build environment and shouldn't be a runtime dependency offline).
- **Music is AAC (.m4a) with loop points;** Safari and Chrome decode it. Headless Chromium used by the tests can't, which only silences music in tests.
- **Service worker:** network-first for the page, cache-first for versioned assets; the cache name carries the build stamp so every update replaces old files.

## Saves
- Separate checksummed keys for settings, records, tournament and last setup, each with a schema version and migrations. Writes go to a temp key, are verified, then swapped in; the copy being replaced is kept as `.bak`. A damaged main copy recovers from an interrupted write's verified temp copy if there is one, otherwise from the previous copy (losing at most the last change). Both copies damaged → defaults, never a crash.
- Export/Import is a copyable `ARENA1-<checksum>-<base64>` code; a bad code is rejected and changes nothing.

## Content
- **Trainer teams** use each trainer's canon Pokémon first, then themed fills from the environment's eligible list (e.g. Jessie & James' air team uses Gliscor/Deoxys/Moltres as "stolen" picks).
- **Moves** come from each species' real learnset (Gen 1–6, Showdown data) or famous anime moves; effects come from PMDO particle sheets (RawAsset) or authored pixel art. `effects.raw` from the PSP build is not used.
