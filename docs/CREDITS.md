# Credits

Pokémon and all related names are © Nintendo, Creatures Inc. and GAME FREAK inc. This is a personal, non-commercial fan project, not affiliated with or endorsed by them.

## Open-source and community sources

| Source | Commit | License | Used for |
|---|---|---|---|
| [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab) | `240addb02e92` | CC BY-NC 4.0 (per-sprite credits in credits.txt / sprite_config) | fighter sprites and portraits |
| [PMDCollab/RawAsset](https://github.com/PMDCollab/RawAsset) | `03c80dad9379` | PMDO assets (see repo); non-commercial fan use | particle sheets, beams, BG overlays, fonts, music, sounds |
| [audinowho/DumpAsset](https://github.com/audinowho/DumpAsset) | `3e767571f9dd` | PMDO data (see repo) | move animation recipes (Data/Skill) |
| [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown) | `3a766f2cfb5e` | MIT | base stats, types, learnsets, type chart |
| [google/fonts](https://github.com/google/fonts) | `66928797f271` | SIL Open Font License 1.1 | Barlow / Barlow Condensed / Barlow Semi Condensed (self-hosted subsets) |
| [KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX) | `aab7e2b6b908` | MIT | tiny synthesized UI sounds (vendored buildSamples) |
| [keithclark/ZzFXM](https://github.com/keithclark/ZzFXM) | `cb07fa9ca36a` | MIT | reference only |
| [KennethJAllen/proper-pixel-art](https://github.com/KennethJAllen/proper-pixel-art) | `4de0dda5ba06` | MIT | pinned for pixel-grid recovery (the current maps and serpent sheets are snapped by the build's own block sampling) |

## Your files

- PSP build assets (`inputs/psp/`): sunset stadium title art (also the app icon), trainer portraits, court and water tiles, Poké Ball banners, Kanto island map, the 25 PSP sound effects, and the faint frames of the PSP fighter sprites (`inputs/psp/faint/`, themselves drawn from the SpriteCollab sprites credited below) for the 35 species whose SpriteCollab sheet has no Faint animation.
- Arena paintings (`inputs/arena-backgrounds/`, made by the user with ChatGPT): Bell Tower, Mt. Chimney, Spear Pillar, Cerulean Gym, Whirl Islands, Sootopolis, Azure Bay, Sky Pillar, Dragonspiral, Lumiose City — reduced to their true pixel density at build time.
- Serpent tail fins for Gyarados and Milotic (`inputs/serpents/`, made by the user with ChatGPT).
- Indigo Plateau Stadium and Lumiose Skyline: painted in code (`tools/paint_maps.py`).

## Fighter sprites and portraits

PMD Sprite Repository (PMDCollab/SpriteCollab), CC BY-NC 4.0 and the licenses listed per sprite. Per-species artists: [CREDITS-SPRITES.md](CREDITS-SPRITES.md) (also on the in-game Credits screen).

## Effects, fonts and battle sounds

- Particle, beam and weather sheets, the PMD pixel font: PMDCollab/RawAsset.
- Move effect recipes (particles, timings, sounds per move): PMD Origins data, audinowho/DumpAsset.
- Battle sounds (`DUN_*`), menu sounds and fanfares: PMD Origins audio from audinowho/DumpAsset (Content/Sound).
- Authored pixel art in `src/render/pixelart.js` and `src/render/serpentArt.js` (telegraphs, shields, waves, meteors, serpent bodies, clouds, confetti, status icons).
- `effects.raw` from the PSP build is not used.

## Music

Looping tracks from the PMD Origins music set (audinowho/DumpAsset, Content/Music), transcoded to AAC with their loop points:

- **Title** — Floating Continent Arges - Introduction — Zwei: The Arges Adventure (Falcom Sound Team jdk)
- **Boss Battle** — Versus Boss — Pokémon Mystery Dungeon: Red Rescue Team (Arata Iiyoshi, Atsuhiro Ishizuna)
- **Boss Battle 2** — Battlefield - Drenched in Red — Etrian Odyssey (Yuzo Koshiro)
- **Final Battle** — Final Battle - Demon Lord Vesper — Zwei: The Arges Adventure (Falcom Sound Team jdk)
- **Champion Road** — Mythical Land Serpentina — Zwei: The Arges Adventure (Falcom Sound Team jdk)
- **Sky Tower Summit** — Sky Tower Summit — Pokémon Mystery Dungeon: Red Rescue Team (Arata Iiyoshi, Atsuhiro Ishizuna)
- **Sky Tower** — Sky Tower — Pokémon Mystery Dungeon: Red Rescue Team (Arata Iiyoshi, Atsuhiro Ishizuna)
- **Flyaway Cliffs** — Road to Where the Dragon Sleeps — Zwei: The Arges Adventure (Falcom Sound Team jdk)
- **Enraged Caldera** — Supiri Ancient Labyrinth — Zwei: The Arges Adventure (Falcom Sound Team jdk)
- **Sacred Tower** — Claiomh=Solais -someone's folkrore- — Fantascape Act.1 (Arata Iiyoshi)
- **Castaway Cave** — Thirty Years I've Been Sailing the Sea ~ Castaway Cave — Pokémon Mystery Dungeon: Origins (Skelothan)
- **Tropical Path** — Drenched Bluff — Pokémon Mystery Dungeon: Explorers of Sky (Arata Iiyoshi, Hideki Sakamoto, Keisuke Ito, Yoshihiro Maeda, Ken-ichi Saito)
- **Luminous Spring** — Pavel Gardens — Zwei: The Arges Adventure (Falcom Sound Team jdk)
- **Thunderstruck Pass** — Amp Plains — Pokémon Mystery Dungeon: Explorers of Sky (Arata Iiyoshi, Hideki Sakamoto, Keisuke Ito, Yoshihiro Maeda, Ken-ichi Saito)
- **Moonlit Courtyard** — Star Cave — Pokémon Mystery Dungeon: Explorers of Sky (Arata Iiyoshi, Hideki Sakamoto, Keisuke Ito, Yoshihiro Maeda, Ken-ichi Saito)
- **Relic Tower** — Dark Temple of Espina — Zwei: The Arges Adventure (Falcom Sound Team jdk)
- **Snowbound Path** — Sky Peak Snowfield — Pokémon Mystery Dungeon: Explorers of Sky (Arata Iiyoshi, Hideki Sakamoto, Keisuke Ito, Yoshihiro Maeda, Ken-ichi Saito)
- **Guildmaster** — The First Layer — Made in Abyss (Kevin Penkin)
- **Aftermath** — We're Back... And Now... — Pokémon Mystery Dungeon: Gates to Infinity (Keisuke Ito, Yasuhiro Kawagoe)
- **Demonstration** — Random Dungeon Theme 2 — Pokémon Mystery Dungeon: Explorers of Sky (Arata Iiyoshi, Hideki Sakamoto, Keisuke Ito, Yoshihiro Maeda, Ken-ichi Saito)
- **Summit** — Floating Continent Arges (Super Arrange) — Zwei: The Arges Adventure (Falcom Sound Team jdk)
- **Treacherous Mountain** — Chasm Cave — Pokémon Mystery Dungeon: Explorers of Sky (Arata Iiyoshi, Hideki Sakamoto, Keisuke Ito, Yoshihiro Maeda, Ken-ichi Saito)

## Code and tools

- ZzFX by Frank Force (MIT): a few synthesized UI sounds.
- Barlow, Barlow Condensed, Barlow Semi Condensed by Jeremy Tribby (SIL OFL 1.1), self-hosted subsets.
- Smogon pokemon-showdown (MIT): Pokédex stats, types, learnsets, type chart.
- Built with Bun, Python (Pillow, NumPy), ffmpeg; tested with Playwright (Chromium).
