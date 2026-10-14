// Species: roster data. Stats come from Showdown's pokedex (src/data/dex.js); kits from content/moves.js.
// Adding a fighter = adding an entry here (plus its SpriteCollab sprite in tools/fighters list).
import { DEX } from '../data/dex.js';

export const ROSTER = {
  ground: ['garchomp', 'metagross', 'mewtwo', 'charizard', 'blastoise', 'venusaur', 'tyranitar', 'scizor', 'lucario', 'raikou', 'entei', 'suicune', 'sceptile', 'blaziken', 'greninja', 'infernape', 'darkrai', 'pikachu', 'meowth', 'arbok', 'weezing', 'chansey', 'growlithe'],
  air: ['articuno', 'zapdos', 'moltres', 'charizard', 'gliscor', 'ho_oh', 'salamence', 'latios', 'latias', 'rayquaza', 'deoxys', 'staraptor', 'hawlucha'],
  water: ['kyogre', 'gyarados', 'lapras', 'lugia', 'starmie', 'milotic', 'empoleon', 'greninja'],
};

const D = (id, o) => Object.assign({ id, dexKey: id.replace('_', ''), sprite: id, radius: 12, tune: { hp: 1, dmg: 1 } }, o);

const LIST = [
  // ------------------------------------------------------------------ ground
  D('garchomp', { role: 'Bruiser', kit: ['dragonclaw', 'sandtomb', 'dragonrush', 'earthquake'], ult: 'dracometeor', trav: 'dig', radius: 13 }),
  D('metagross', { role: 'Tank', kit: ['bulletpunch', 'meteormash', 'irondefense', 'zenheadbutt'], ult: 'hammerarm', trav: 'magnet', radius: 15 }),
  D('mewtwo', { role: 'Zoner', kit: ['psychocut', 'shadowball', 'barrier', 'psystrike'], ult: 'gravitywell', trav: 'levitate', radius: 12,
    mega: { name: 'Mega Mewtwo Y', sprite: 'mewtwo_mega', dexKey: 'mewtwomegay' } }),
  D('charizard', { role: 'Skirmisher', kit: ['dragonclaw', 'airslash', 'flamethrower', 'fireblast'], ult: 'flareblitzmax', radius: 13,
    mega: { name: 'Mega Charizard X', sprite: 'charizard_mega', dexKey: 'charizardmegax', ult: 'flareblitzx' } }),
  D('blastoise', { role: 'Tank', kit: ['watergun', 'hydropumpb', 'protect', 'skullbash'], ult: 'hydrocannonb', trav: 'shellslide', radius: 13 }),
  D('venusaur', { role: 'Tank/Zoner', kit: ['razorleaf', 'leechseed', 'sleeppowder', 'solarbeam'], ult: 'petalblizzard', trav: 'ingrain', radius: 14 }),
  D('tyranitar', { role: 'Bruiser', kit: ['crunch', 'rockslide', 'dragondance', 'stoneedge'], ult: 'megaroar', passive: 'sandstream', radius: 14,
    mega: { name: 'Mega Tyranitar', sprite: 'tyranitar_mega', dexKey: 'tyranitarmega', onMega: { unstoppable: 360 } } }),
  D('scizor', { role: 'Skirmisher', kit: ['bulletpunch', 'xscissor', 'swordsdance', 'uturn'], ult: 'bulletblitz', radius: 12 }),
  D('lucario', { role: 'Skirmisher', kit: ['bonerush', 'aurasphere', 'extremespeed', 'counter'], ult: 'aurastorm', passive: 'aura', radius: 11,
    mega: { name: 'Mega Lucario', sprite: 'lucario_mega', dexKey: 'lucariomega' } }),
  D('raikou', { role: 'Skirmisher', kit: ['spark', 'thunderbolt', 'discharge', 'extrasensory'], ult: 'thunder3', trav: 'voltdash', radius: 13 }),
  D('entei', { role: 'Bruiser', kit: ['firefang', 'lavaplume', 'firespin', 'flareblitze'], ult: 'eruption', radius: 14 }),
  D('suicune', { role: 'Sustain/Zoner', kit: ['bubblebeam', 'aurorabeam', 'mirrorcoat', 'calmmind'], ult: 'surf', trav: 'skim', radius: 13 }),
  D('sceptile', { role: 'Skirmisher', kit: ['leafblade', 'bulletseed', 'quickattack', 'leafstorm'], ult: 'frenzyplant', trav: 'leap', radius: 11 }),
  D('blaziken', { role: 'Skirmisher', kit: ['firepunch', 'blazekick', 'highjumpkick', 'skyuppercut'], ult: 'blastburn', passive: 'speedboost', radius: 11 }),
  D('greninja', { role: 'Skirmisher', kit: ['aerialace', 'watershuriken', 'doubleteam', 'nightslash'], ult: 'giantshuriken', trav: 'ninja', radius: 10 }),
  D('infernape', { role: 'Skirmisher', kit: ['machpunch', 'flamewheeli', 'closecombat', 'flareblitzi'], ult: 'blazechain', radius: 11 }),
  D('darkrai', { role: 'Zoner', kit: ['feintattack', 'darkpulse', 'darkvoid', 'shadowball'], ult: 'nightmarefield', passive: 'baddreams', trav: 'shadowdrift', radius: 11 }),
  D('pikachu', { role: 'Skirmisher', kit: ['nuzzle', 'thunderboltp', 'electroball', 'irontail'], ult: 'volttackle', trav: 'quickzig', radius: 9 }),
  D('meowth', { role: 'Skirmisher', kit: ['furyswipes', 'payday', 'fakeout', 'bite'], ult: 'jackpot', radius: 9 }),
  D('arbok', { role: 'Zoner', kit: ['gunkshot', 'wrap', 'glare', 'coil'], ult: 'toxicpool', radius: 11 }),
  D('weezing', { role: 'Zoner', kit: ['sludgebomb', 'smokescreen', 'toxicspikes', 'willowisp'], ult: 'explosion', levitate: true, float: true, radius: 13 }),
  D('chansey', { role: 'Sustain', kit: ['doubleslap', 'eggbomb', 'rollout', 'softboiled'], ult: 'healingwave', radius: 11 }),
  D('growlithe', { role: 'Skirmisher', kit: ['bite', 'flamecharge', 'flamewheelg', 'roar'], ult: 'policepup', radius: 9 }),
  // ------------------------------------------------------------------ air
  D('articuno', { role: 'Zoner', kit: ['icebeam', 'freezedry', 'mistwall', 'hurricane'], ult: 'blizzard', passive: 'misttrail', radius: 15 }),
  D('zapdos', { role: 'Zoner', kit: ['thundershock', 'drillpeckz', 'discharge', 'zapcannon'], ult: 'thunderstorm', radius: 15 }),
  D('moltres', { role: 'Bruiser', kit: ['ember', 'airslash', 'heatwave', 'skyattack'], ult: 'superskyattack', passive: 'firetrail', radius: 16 }),
  D('gliscor', { role: 'Skirmisher', kit: ['poisonjab', 'xscissorg', 'acrobatics', 'skyuppercut'], ult: 'acrofurry', trav: 'glide', radius: 12 }),
  D('ho_oh', { role: 'Sustain/Zoner', kit: ['extrasensory', 'sacredfire', 'bravebirdh', 'recover'], ult: 'rebirth', passive: 'rainbowtrail', radius: 17 }),
  D('salamence', { role: 'Bruiser', kit: ['dragonclaw', 'fly', 'dragondance', 'dracometeorsig'], ult: 'meteorshower', radius: 15 }),
  D('latios', { role: 'Zoner', kit: ['dragonbreath', 'dragonpulse', 'lusterpurge', 'zenheadbutt'], ult: 'giantpurge', trav: 'jet', levitate: true, radius: 14,
    mega: { name: 'Mega Latios', sprite: 'latios_mega', dexKey: 'latiosmega' } }),
  D('latias', { role: 'Skirmisher', kit: ['dragonbreath', 'mistball', 'recover', 'zenheadbutt'], ult: 'giantmistball', trav: 'refraction', levitate: true, radius: 13,
    mega: { name: 'Mega Latias', sprite: 'latias_mega', dexKey: 'latiasmega' } }),
  D('rayquaza', { role: 'Bruiser', kit: ['dragonclaw', 'twister', 'extremespeedr', 'dragonascent'], ult: 'dragonascentmax', passive: 'airlock', radius: 13,
    serpent: { segs: 8, len: 132, width: 20, tail: 10, headCut: 14, pal: 'rayquaza' }, speedMul: 1.12,
    mega: { name: 'Mega Rayquaza', sprite: 'rayquaza_mega', dexKey: 'rayquazamega' } }),
  D('deoxys', { role: 'Flex', kit: ['psyshock', 'psychoboost', 'recover', 'superpower'], ult: 'psychoboostmax', trav: 'deoxys', radius: 12,
    formes: {
      attack: { name: 'Attack Forme', sprite: 'deoxys_attack', dexKey: 'deoxysattack', hpMul: 0.82, dmgMul: 1.12 },
      defense: { name: 'Defense Forme', sprite: 'deoxys_defense', dexKey: 'deoxysdefense', armor: 0.72, speedMul: 0.86 },
      speed: { name: 'Speed Forme', sprite: 'deoxys_speed', dexKey: 'deoxysspeed', blink: 2 },
    } }),
  D('staraptor', { role: 'Skirmisher', kit: ['quickattack', 'wingattack', 'closecombat', 'bravebirdstar'], ult: 'bbbarrage', passive: 'intimidate', radius: 11 }),
  D('hawlucha', { role: 'Bruiser', kit: ['karatechop', 'skydrop', 'hjkh', 'flyingpress'], ult: 'toprope', trav: 'ropes', radius: 11 }),
  // ------------------------------------------------------------------ water
  D('kyogre', { role: 'Tank/Zoner', kit: ['waterpulse', 'whirlpool', 'waterspout', 'originpulse'], ult: 'primalrain', radius: 17,
    mega: { name: 'Primal Kyogre', sprite: 'kyogre_primal', dexKey: 'kyogreprimal', primal: true } }),
  D('gyarados', { role: 'Bruiser', kit: ['bite', 'aquatail', 'waterfall', 'dragondance'], ult: 'thrash', radius: 13,
    serpent: { segs: 8, len: 124, width: 20, tail: 11, headCut: 16, pal: 'gyarados' }, speedMul: 1.14 }),
  D('lapras', { role: 'Tank/Sustain', kit: ['iceshard', 'icebeam', 'mistbubble', 'bodyslam'], ult: 'sheercold', radius: 15 }),
  D('lugia', { role: 'Zoner', kit: ['extrasensory', 'whirlpool', 'aeroblast', 'recover'], ult: 'aerostorm', trav: 'dive', radius: 17 }),
  D('starmie', { role: 'Skirmisher/Zoner', kit: ['swift', 'psychic', 'lightscreen', 'hydropump'], ult: 'pumpvortex', trav: 'pinball', radius: 10 }),
  D('milotic', { role: 'Sustain', kit: ['aquaring', 'hypnosis', 'coilm', 'hydropumpm'], ult: 'raindancefield', radius: 12,
    serpent: { segs: 7, len: 112, width: 17, tail: 9, headCut: 13, pal: 'milotic' }, speedMul: 1.14 }),
  D('empoleon', { role: 'Bruiser', kit: ['metalclaw', 'aquajet', 'drillpecke', 'flashcannon'], ult: 'hydrocannon', trav: 'bellyslide', radius: 12 }),
];

export const SPECIES = {};
for (const s of LIST) {
  const dx = DEX[s.dexKey];
  if (!dx) throw new Error('no dex entry for ' + s.id);
  s.name = dx.name; s.num = dx.num; s.types = dx.types; s.base = dx.base; s.weight = dx.weight;
  s.kbMul = Math.max(0.6, Math.min(1.3, 1.45 - 0.33 * Math.log10(Math.max(2, s.weight))));
  s.envs = Object.keys(ROSTER).filter((e) => ROSTER[e].includes(s.id));
  if (s.mega) { const m = DEX[s.mega.dexKey]; s.mega.base = m.base; s.mega.types = m.types; s.mega.ult = s.mega.ult || s.ult; }
  if (s.formes) for (const fo of Object.values(s.formes)) { const m = DEX[fo.dexKey]; fo.base = m.base; fo.types = m.types; }
  SPECIES[s.id] = s;
}
export const ROLE_INFO = {
  Tank: 'Soaks damage and controls space.',
  Bruiser: 'Hits hard up close and takes hits back.',
  Skirmisher: 'Fast, mobile, picks its moments.',
  Zoner: 'Controls range with projectiles and zones.',
  Sustain: 'Outlasts with healing and protection.',
  Flex: 'Changes role on the fly.',
};
