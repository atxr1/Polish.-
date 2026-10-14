# Pokémon Arena — browser edition

A real-time arena fighter in pixel art for iPhone (landscape Home Screen web app), desktop Safari and Chrome.
42 fighters, 12 arenas over ground, water and air, Pokémon Battles (1v1) and Trainer Battles (3v3, switching),
Quick Battle and Tournament (4, 8 or 16 entrants). Personal, non-commercial fan project.

Live: https://atxr1.github.io/Polish.-/

## Build

Requirements: Bun, Python 3 with Pillow and NumPy, git, ffmpeg (audio step), zip. Playwright with Chromium for the tests.

```
bun tools/build.mjs --all        # fetch pinned sources → asset pipeline → site/ → arena-src-<version>.zip
bun tools/build.mjs              # just re-bundle the code into site/ (fast)
cd site && python3 -m http.server 8077
```

`tools/sources.json` pins every open-source input; `tools/fetch_sources.sh` clones them into `vendor/`.
The user-provided inputs (PSP build files, map paintings) live in `inputs/`.

## Checks

| Command | What it proves |
|---|---|
| `bun tools/validate.mjs` | every effect/sound/sprite reference exists, tier rules, and every move, Ultimate and Mega Ultimate of all 42 fighters runs to completion and connects in the real sim |
| `bun tools/replaycheck.mjs` | 24 CPU matches (every environment and format) replay to an identical final state, which Play of the Match depends on |
| `bun tools/shapelint.mjs` | the world renderer and effects use no vector shapes, gradients, blur or smoothing |
| `bun tools/harness.mjs --runs 300 --format both` | AI-vs-AI balance: win-rate spread, match-length medians, Ultimate timing, stamina per move, no stalls |
| `bun tests/serpent_metrics.mjs` | serpent speed, reversal time, turn radius, body length, coil timing |
| `node tests/contact.mjs` | contact sheets of every move of every fighter in each environment (`shots/contact/`) |
| `node tests/captures.mjs` | serpents, all traversals, every Mega/Primal sequence, all 12 maps mid-battle (`shots/captures/`) |
| `node tests/e2e.mjs` | Playwright at 844×390 and 932×430 with touch: every screen, all 12 mode combinations, touch, switching, pause, skips, tournament + reload + championship, save export/import, corrupt-save recovery |
| `node tests/soak.mjs 10` | 10-minute soak: frame time, heap and particle growth |
| `bun tools/sizes.mjs` | first-load and worst-case per-match download sizes |

URL test hooks (used by the tests only): `?test` exposes the app as `window.__app`, `?autoplay` lets the CPU play
your side, `?speed=N` runs the simulation N× faster, `?lab=1` opens the capture lab.

## Layout

`src/core` fixed step, RNG, util · `src/game` simulation (sim, fighter, mechanics = move library, serpent,
traversal, features, ai, content) · `src/content` data (species, moves, maps, trainers, balance) ·
`src/render` pixel renderer and effects · `src/ui` HUD, touch, screens, glyphs · `src/modes` battle, match/replay,
tournament · `src/audio` · `src/saves` · `src/platform` input · `src/dev` lab · `tools` build and analysis ·
`tests` · `docs` STATUS, DECISIONS, CHANGELOG, CONTENT, CREDITS.
