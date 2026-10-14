# Changelog

## 1.0.1 — 2026-10-14

- **Lumiose Skyline** now uses the full city image (the original file was cut off, so the map had been painted in code). Prism Tower sits at the centre, where its beacon sweeps from.
- **Serpent tails:** Gyarados and Milotic use the tail fins from the ChatGPT sheets; the bodies stay drawn in code (the sheet pieces looked like separate beads) and the heads stay the real sprites.
- **Build fixes:** the serpent-sheet tool cut off the last piece of each sheet; maps that aren't clean pixel art are snapped to the set's 3×3 pixels and 40 colours.

## 1.0.0 — 2026-10-13 — browser edition

The PSP homebrew becomes a static web app for iPhone (Home Screen, landscape), Safari and Chrome.

- **Roster:** 42 fighters (23 ground, 8 water, 13 air; Charizard and Greninja in two environments), 168 moves plus Ultimates, 8 Mega/Primal forms with their own Ultimates, Deoxys formes, roles (Tank, Bruiser, Skirmisher, Zoner, Sustain).
- **Combat:** fixed 60 Hz deterministic sim; stamina with move tiers instead of most cooldowns; dodge roll with perfect dodges; clashes; type chart compressed for real time; statuses; wall slams; hit-stop, shake, speed lines; stun decay with Breakout; juggle limits.
- **Environments:** ground footwork with obstacles, water gliding with waterlines and sinking faints, air flight on a raised plane with drifting clouds; 19 unique traversals on R; three serpents (Gyarados, Milotic, Rayquaza) with path-following bodies that coil to attack.
- **12 arenas**, 4 per environment, each (except Indigo Plateau) with an interactive feature: Bell Tower bell, Mt. Chimney vents, Spear Pillar rifts, Cerulean inlets, Whirl Islands whirlpool, Sootopolis rain, Azure Bay waves, Kanto Skies wind lanes, Sky Pillar updrafts, Dragonspiral snow gusts, Lumiose beacon.
- **Modes:** Quick Battle and Tournament (4/8/16, saved after every match, resumable, championship screen) for Pokémon Battles (1v1, 99 s) and Trainer Battles (3v3 with switching, 4 min) in every environment; 11 trainers with teams for every environment; CPU Easy/Normal/Hard.
- **Fun systems:** Ultimate meter → Mega Evolution, Double Stamina overtime and sudden death, emotes with PMD portraits, Play of the Match replay.
- **Presentation:** everything in the world is pixel art at one texel per world unit with integer upscaling; PMDO particle, beam and weather sheets with type palette swaps; authored pixel sprites for telegraphs, shields, waves, meteors and more; full faint sequence (the PSP sprites' faint poses fill in for the 35 species SpriteCollab has no Faint for; a fainted Mega or Primal reverts to its base form); broadcast-style HUD; PlayStation button glyphs; touch controls with floating stick.
- **Audio:** PMDO battle sounds, the PSP build's sound effects, looping PMD music, ambience, low-HP beep; works with the silent switch on (audioSession playback).
- **Saves:** checksummed, versioned, backed up, recoverable; export/import code.
- **Offline:** service worker caches what you've played.
- **Balance:** AI-vs-AI tuning per environment with HP multipliers held to 0.8–1.25 so roles keep their shape; buffs and heal-over-time moves can no longer be kept up permanently.
- **Fixes found by the new checks before release:** instant area attacks never connected; single-pulse beams missed at range; pause → Settings left the game stuck paused; the championship screen's button did nothing; touch had no way to go back from menus; quick taps could be dropped; long CPU stun loops; pellet sprays stun-locked foes and cancelled every incoming attack; Dragon Dance, Swords Dance, Calm Mind, Coil and Aqua Ring lasted longer than their cooldowns; the save backup now keeps the previous copy as the brief asks; the effect caches no longer grow over a long session; the asset build no longer depended on files outside the source zip; Play of the Match replays diverged (raw stick values were simulated but rounded ones recorded, and the CPU picked replacements outside its inputs), so it was silently skipped; switching Pokémon in Trainer Battles could throw; the results screen could be replaced by the main menu when Play of the Match was skipped; Start pressed after the deciding knockout opened Pause, where Quit or Forfeit threw the result away (it now skips, and a pause at that point only offers Skip to results); Ho-Oh could revive teammates on every Ultimate.
