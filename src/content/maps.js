// Maps: 4 per environment. World units = map texels (1 texel per world unit, same density as sprites).
// User map images are 512x341 true-pixel art (3x3 grid downsampled), padded to 640 wide with mirrored edges
// so the view never runs off the art; `pad` shifts their authored coordinates.
const PAD = 64;
const R = (x0, y0, x1, y1, pad = PAD) => ({ x0: x0 + pad, y0, x1: x1 + pad, y1 });
const C = (x, y, r, pad = PAD) => ({ type: 'circle', x: x + pad, y, r });
const pt = (x, y, pad = PAD) => ({ x: x + pad, y });

export const MAPS = {
  // -------------------------------------------------------------------------------- ground
  indigo: {
    id: 'indigo', name: 'Indigo Plateau Stadium', region: 'Kanto', env: 'ground', img: 'indigo', size: [640, 420],
    play: { x0: 104, y0: 86, x1: 536, y1: 336 }, spawns: [{ x: 196, y: 214 }, { x: 444, y: 210 }],
    obstacles: [], feature: null, music: 'Boss Battle', ambience: 'stadium', fx: { crowd: true, ambient: 'confettiOnBigHits' },
    blurb: 'The Pokémon League stadium at sunset. The crowd roars on big hits.',
  },
  bell_tower: {
    id: 'bell_tower', name: 'Bell Tower Summit', region: 'Johto', env: 'ground', img: 'bell_tower', size: [640, 341],
    play: R(46, 44, 466, 290), obstacles: [C(44, 42, 12), C(468, 42, 12), C(48, 292, 12), C(464, 292, 12)],
    feature: 'bell', featureCfg: { x: 256 + PAD, y: 12, w: 70, r: 96 },
    music: 'Sacred Tower', ambience: 'wind_chimes', fx: { ambient: 'leaves' },
    blurb: 'The top of Ecruteak\'s ancient pagoda. Ring the bronze bell!',
  },
  mt_chimney: {
    id: 'mt_chimney', name: 'Mt. Chimney Crater', region: 'Hoenn', env: 'ground', img: 'mt_chimney', size: [640, 341],
    play: R(50, 42, 462, 292), obstacles: [C(54, 46, 24), C(458, 46, 22), C(52, 288, 24), C(456, 288, 24), C(256, 300, 10)],
    feature: 'vents', featureCfg: { vents: [pt(80, 62), pt(256, 52), pt(432, 62), pt(64, 168), pt(448, 168), pt(80, 276), pt(170, 284), pt(342, 284), pt(432, 276)] },
    music: 'Enraged Caldera', ambience: 'lava', fx: { ambient: 'embers', overlay: 'Heat_Wave' },
    blurb: 'A basalt plateau on the rim of the volcano. Watch for glowing vents.',
  },
  spear_pillar: {
    id: 'spear_pillar', name: 'Spear Pillar', region: 'Sinnoh', env: 'ground', img: 'spear_pillar', size: [640, 341],
    play: R(52, 40, 462, 296), obstacles: [C(50, 40, 14), C(464, 40, 14), C(50, 298, 16), C(464, 298, 16)],
    feature: 'rift', featureCfg: { portals: [pt(132, 100), pt(380, 240)] },
    music: 'Snowbound Path', ambience: 'mountain_wind', fx: { ambient: 'sparkles' },
    blurb: 'The ruined temple atop Mt. Coronet. Space-time rifts link two points.',
  },
  // -------------------------------------------------------------------------------- water
  cerulean_gym: {
    id: 'cerulean_gym', name: 'Cerulean Gym Pool', region: 'Kanto', env: 'water', img: 'cerulean_gym', size: [640, 341],
    play: R(46, 52, 466, 300), obstacles: [], feature: 'inlets',
    featureCfg: { inlets: [{ x: 46 + PAD, y: 116, dx: 1, dy: 0, len: 170, w: 20 }, { x: 466 + PAD, y: 236, dx: -1, dy: 0, len: 170, w: 20 }, { x: 466 + PAD, y: 116, dx: -1, dy: 0, len: 170, w: 20 }, { x: 46 + PAD, y: 236, dx: 1, dy: 0, len: 170, w: 20 }] },
    music: 'Luminous Spring', ambience: 'pool', fx: { ambient: 'ripples' },
    blurb: 'Misty\'s gym pool. The inlets push swimmers around.',
  },
  whirl_islands: {
    id: 'whirl_islands', name: 'Whirl Islands Lagoon', region: 'Johto', env: 'water', img: 'whirl_islands', size: [640, 341],
    play: R(42, 42, 470, 298), obstacles: [], feature: 'whirlpool', featureCfg: { x: 256 + PAD, y: 172, r: 150 },
    music: 'Castaway Cave', ambience: 'cave_water', fx: { ambient: 'ripples', drips: true },
    blurb: 'A sea-cave lagoon whose current drags everything to the center.',
  },
  sootopolis: {
    id: 'sootopolis', name: 'Sootopolis Crater Lake', region: 'Hoenn', env: 'water', img: 'sootopolis', size: [640, 341],
    play: R(40, 40, 472, 298), obstacles: [], feature: 'rain',
    music: 'Moonlit Courtyard', ambience: 'lake', fx: { ambient: 'ripples' },
    blurb: 'The sapphire lake inside a white crater. Rain showers boost Water moves.',
  },
  azure_bay: {
    id: 'azure_bay', name: 'Azure Bay', region: 'Kalos', env: 'water', img: 'azure_bay', size: [640, 341],
    play: R(44, 32, 468, 282), obstacles: [], feature: 'waves',
    music: 'Tropical Path', ambience: 'sea', fx: { ambient: 'ripples', gulls: true },
    blurb: 'A sunny Kalos bay. Waves sweep across from the open sea.',
  },
  // -------------------------------------------------------------------------------- air
  kanto_skies: {
    id: 'kanto_skies', name: 'Kanto Skies', region: 'Kanto', env: 'air', img: 'kanto_skies', size: [640, 384],
    play: R(44, 52, 468, 332), obstacles: [], feature: 'windlanes', featureCfg: { lanes: [0.28, 0.72] },
    music: 'Flyaway Cliffs', ambience: 'high_wind', fx: { ambient: 'clouds', clouds: 3 },
    blurb: 'High above Kanto. Ride the wind lanes for speed.',
  },
  sky_pillar: {
    id: 'sky_pillar', name: 'Sky Pillar', region: 'Hoenn', env: 'air', img: 'sky_pillar', size: [640, 341],
    play: R(44, 34, 468, 306), obstacles: [], feature: 'updrafts', featureCfg: { cols: [[0.3, 0.32], [0.7, 0.68]] },
    music: 'Sky Tower Summit', ambience: 'high_wind', fx: { ambient: 'clouds', clouds: 3 },
    blurb: 'Over the ancient tower in the sea. Updrafts lift and empower.',
  },
  dragonspiral: {
    id: 'dragonspiral', name: 'Dragonspiral Tower', region: 'Unova', env: 'air', img: 'dragonspiral', size: [640, 341],
    play: R(44, 34, 468, 306), obstacles: [], feature: 'gusts', ice: true,
    music: 'Treacherous Mountain', ambience: 'blizzard', fx: { ambient: 'snow', clouds: 2, overlay: 'Snow' },
    blurb: 'A snowy valley around the spiral tower. Gusts shove fighters aside.',
  },
  lumiose: {
    id: 'lumiose', name: 'Lumiose Skyline', region: 'Kalos', env: 'air', img: 'lumiose', size: [640, 341],
    play: R(44, 34, 468, 306), obstacles: [], feature: 'beacon', featureCfg: pt(256, 170),   // Prism Tower at the image centre
    music: 'Sky Tower', ambience: 'city_wind', fx: { ambient: 'clouds', clouds: 2, beacon: true },
    blurb: 'Dusk over Lumiose City. Prism Tower\'s beacon reveals the hidden.',
  },
};
export const MAPS_BY_ENV = { ground: ['indigo', 'bell_tower', 'mt_chimney', 'spear_pillar'], water: ['cerulean_gym', 'whirl_islands', 'sootopolis', 'azure_bay'], air: ['kanto_skies', 'sky_pillar', 'dragonspiral', 'lumiose'] };
