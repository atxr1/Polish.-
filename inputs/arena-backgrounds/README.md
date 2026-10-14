# Arena Backgrounds

Ten finished 1536 × 1024 landscape PNG backgrounds for a 2D battle game.

| File | Setting | Battle mode |
| --- | --- | --- |
| images/01_bell_tower.png | Autumn pagoda rooftop | Ground |
| images/02_mt_chimney.png | Volcanic plateau | Ground |
| images/03_spear_pillar.png | Ruined mountain temple | Ground |
| images/04_cerulean_gym.png | Indoor turquoise pool | Water |
| images/05_whirl_islands.png | Sea-cave lagoon | Water |
| images/06_sootopolis.png | White-crater sapphire lake | Water |
| images/07_azure_bay.png | Sunny coastal bay | Water |
| images/08_sky_pillar.png | Ocean and distant island tower | Air |
| images/09_dragonspiral_tower.png | Snowy valley and spiral tower | Air |
| images/10_lumiose_city.png | Circular city at dusk | Air |

## Import

- Keep the 3:2 aspect ratio and use nearest-neighbor / point filtering to retain crisp pixels.
- Place characters, move effects, gameplay clouds, shadows, and UI in separate layers above the background.
- Use the ground and water maps as environmental backdrops. Keep collision geometry separate from the artwork.
- Use the aerial maps as far-below scenery. Their middle areas are free of clouds for the game's own cloud layer.
- Keep PNG files. JPEG compression would damage the flat colors and hard edges.

## Files and validation

All ten PNGs have verified dimensions of 1536 × 1024, indexed palettes containing no more than 40 used colors, and a uniform 3 × 3 pixel grid. The 1024-pixel height clips the last art-pixel row to one screen pixel, because 1024 is not divisible by three. There is no interpolation or dithering in the final export.

The artwork was created and revised with built-in image generation. Technical PNG export enforces the limited palette and pixel grid. The specifications folder contains the full generation and final revision prompts. assets.json contains dimensions, color counts, file sizes, and SHA-256 checksums for every PNG.

## Replacement (2026-10-14)

`images/10_lumiose_city.png` was truncated in the original delivery (the build fell back to a map painted in code). The user supplied the full image again: the overhead-tower version that matches the final revision prompt. It is a plain RGB render without a clean pixel grid, so `tools/build_assets.py` snaps it to the set's 3×3 art pixels and 40 colours.
