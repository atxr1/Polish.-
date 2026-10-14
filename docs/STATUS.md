# Status — handoff for the next update session

**Version 1.0.0 (2026-10-13).** Complete and playable; published to https://atxr1.github.io/Polish.-/ from `main`
of `atxr1/Polish.-`. Source lives on the `src` branch of the same repository and in `arena-src-1.0.0.zip`.

## Start here
1. `git clone -b src https://github.com/atxr1/Polish.- arena && cd arena` (or unzip the source zip).
2. `bun tools/build.mjs --all` — fetches the pinned sources (tools/sources.json), rebuilds every asset into `site/`, writes the zip.
3. `cd site && python3 -m http.server 8077`, open `http://localhost:8077/` (`?lab=1` for the capture lab).
4. Before shipping a change: `bun tools/validate.mjs && bun tools/replaycheck.mjs && bun tools/shapelint.mjs && node tests/e2e.mjs`; for balance changes `bun tools/harness.mjs --runs 300 --format both` (and `bun tools/tune.mjs` to re-even win rates).
5. Publish: copy `site/` to the root of `main` (keep `.nojekyll`), push, then load the live URL and check the version stamp in `app.js?v=`.

## Where things are
- Content data: `src/content/` (species, moves, maps, trainers, balance multipliers). How to add content: `docs/CONTENT.md`.
- Simulation: `src/game/` (sim, fighter, mechanics = the move library, serpent, traversal, features, ai).
- Rendering: `src/render/` (world, fx, gfx loader, authored pixel art, serpent art). HUD and menus: `src/ui/`.
- Tests and captures write to `shots/` (contact sheets, captures, e2e screenshots, soak report).

## Last verification (2026-10-14)
- Content validator: every reference resolves; all 229 move/Ultimate/Mega-Ultimate runs complete and connect; no buff or heal-over-time outlasts its cooldown.
- Replay determinism: 24 CPU matches (every environment and format) replay to identical end states (`tools/replaycheck.mjs`).
- Shape lint: 0 violations.
- Balance (`tools/harness.mjs`, Normal vs Normal, 0 errors, 0 stalls):
  - Pokémon Battles, 1,100 matches per environment (balanced round-robin): medians ground 53.7 s, water 59.1 s, air 51.2 s; every fighter 41–56 %; first Ultimate at ~51–53 s.
  - Trainer Battles, 600 matches per environment: medians ground 2.9 min, water 3.1 min, air 2.8 min.
- Playwright e2e at 844×390 and 932×430 with touch, including a real Play of the Match; 10-minute soak.
- Captures reviewed: contact sheets for every move, serpents, traversals, Mega sequences, faint sequences, all 12 maps.

## Known limits / next steps
- **Serpent bodies** are authored procedurally. When the user brings the ChatGPT body sheets (brief Appendix C), drop them in `inputs/serpents/<gyarados|milotic|rayquaza>.png` and run `python3 -I tools/serpent_sheets.py` (chroma-key, pixel-grid recovery, palette quantize, slice 3×2): the game picks them up from `site/assets/serpents/index.json` automatically.
- **Missing Mega sprites** in SpriteCollab (Venusaur, Blastoise, Gyarados, Scizor, Sceptile, Blaziken, Salamence, Metagross, Garchomp): those fighters use Ultimate moves instead of Mega Evolution. New sprite sheets from ChatGPT could add them (`species.js` → `mega`).
- Headless Chromium can't decode AAC, so automated runs are silent; sound must be checked on a real device.
- **Trainer team strength varies.** Each fighter is balanced 1v1, but whole teams differ: in Trainer Battles, team win rates range about 24–76 % (ground), 29–68 % (water) and 20–87 % (air; Nurse Joy's Ho-Oh/Latias/Articuno team is strongest, Paul's weakest). A per-team handicap or team edits are the next step if that matters.
- **Deoxys formes** have no faint pose of their own (no PSP sprite); they use Sleep.
- Only the user can verify on the iPhone: Home Screen install, landscape layout, sound with the silent switch on, touch feel, frame rate, save persistence.
