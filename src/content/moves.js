// Move library: every move is data. Mechanics live in game/mechanics.js; effects reference PMD particle
// sheets from PMDCollab/RawAsset (names as in the PMDO recipes in audinowho/DumpAsset Data/Skill),
// optionally palette-swapped by type with "Name|Type". Sounds are PMDO battle sounds (DUN_*).
// Fields: id, name, type, cat (physical|special|status), tier (light|medium|heavy|sig|ult), power,
// cost/cd (default from tier), anim (SpriteCollab body animation), startup (ticks to contact),
// steps [{k: mechanic, at: ticks after contact, ...}], hitFx, status, sfx, ai {r:[min,max], kind}, desc.
import { TIER } from '../game/mechanics.js';

export const MOVES = {};
function mv(id, name, type, cat, tier, power, o) {
  const t = TIER[tier];
  MOVES[id] = Object.assign({ id, name, type, cat, tier, power, cost: t.cost, cd: t.cd, steps: [], ai: { r: [0, 60], kind: 'melee' } }, o);
}
const S = (k, o) => Object.assign({ k }, o);

// ---------------------------------------------------------------------------------------------- shared
mv('dragonclaw', 'Dragon Claw', 'Dragon', 'physical', 'light', 42, {
  anim: 'Attack', sfx: 'DUN_Fury_Cutter', hitFx: 'Fire_Spin_Front|Dragon', cost: 12,
  steps: [S('melee', { range: 30, arc: 2.0, lunge: 10, swipe: 'Metal_Claw|Dragon', swipeFT: 2, kb: 2.2, stun: 14 })],
  ai: { r: [0, 40], kind: 'melee' }, desc: 'Quick draconic claw swipe.',
});
mv('bulletpunch', 'Bullet Punch', 'Steel', 'physical', 'light', 34, {
  anim: 'Attack', startup: 9, sfx: 'DUN_Bullet_Punch', hitFx: 'Bullet_Punch', cost: 10,
  steps: [S('melee', { range: 26, arc: 1.8, lunge: 16, lungeT: 4, kb: 1.6, stun: 12 })],
  ai: { r: [0, 38], kind: 'melee' }, desc: 'The fastest jab in the game.',
});
mv('airslash', 'Air Slash', 'Flying', 'special', 'medium', 58, {
  anim: 'Shoot', sfx: 'DUN_Punishment', status: { flinch: 0.3 }, cost: 20, cd: 24,
  steps: [S('proj', { speed: 4.6, range: 210, r: 8, sprite: 'Wide_Slash|Flying', spriteFT: 3, castFx: 'Air_Slash_Particle', trail: 'Air_Slash_Particle', trailGap: 5 })],
  hitFx: 'Air_Slash_Slash', ai: { r: [40, 190], kind: 'proj' }, desc: 'A slicing blade of air. May flinch.',
});
mv('extrasensory', 'Extrasensory', 'Psychic', 'special', 'medium', 62, {
  anim: 'Shoot', sfx: 'DUN_Confusion', status: { flinch: 0.25 }, cost: 22, cd: 30,
  steps: [S('area', { where: 'target', r: 24, delay: 24, tele: 'psychic', burst: 'Psycho_Shift_Hit', shake: 1 })],
  ai: { r: [40, 220], kind: 'area' }, desc: 'A psychic burst detonates on the target after a short tell.',
});
mv('recover', 'Recover', 'Normal', 'status', 'heavy', 0, {
  anim: 'Charge', startup: 16, sfx: 'DUN_Absorb', cost: 34, cd: 420,
  steps: [S('buff', { heal: 0.24, fx: 'Circle_Tiny_Yellow', fxFollow: true }), S('fxonly', { at: 4, fx: 'Synthesis_Sparkle', fxFollow: true })],
  ai: { r: [120, 999], kind: 'heal' }, desc: 'Restores a quarter of max HP.',
});
mv('dragondance', 'Dragon Dance', 'Dragon', 'status', 'medium', 0, {
  anim: 'Rotate', startup: 14, sfx: 'DUN_Dragon_Dance', cost: 24, cd: 480,
  steps: [S('buff', { stats: { atk: 1.25, spe: 1.18 }, ticks: 300, fx: 'Dragon_Dance', fxFollow: true }), S('fxonly', { at: 6, fx: 'Stat_Red_Line', fxFollow: true })],
  ai: { r: [140, 999], kind: 'buff' }, desc: 'A mystic dance: Attack and Speed up (Rage).',
});
mv('closecombat', 'Close Combat', 'Fighting', 'physical', 'heavy', 100, {
  anim: 'MultiStrike', startup: 16, sfx: 'DUN_Close_Combat', cost: 36, cd: 90, hitFx: 'Close_Combat',
  steps: [S('melee', { range: 30, arc: 2.2, hits: 5, interval: 5, lunge: 14, kb: 3.2, stun: 18 }), S('fn', { at: 1, fn: (f) => f.addBuff('def', 0.85, 240, 'cc') })],
  ai: { r: [0, 36], kind: 'melee' }, desc: 'A flurry of blows. Lowers own Defense briefly.',
});
mv('quickattack', 'Quick Attack', 'Normal', 'physical', 'light', 34, {
  anim: 'Attack', startup: 8, sfx: 'DUN_Move_Start', cost: 11,
  steps: [S('dash', { dist: 90, ticks: 8, trail: 'Puff_White', trailGap: 2, hitR: 14, kb: 2, stun: 12 })],
  hitFx: 'Hit_Neutral', ai: { r: [30, 100], kind: 'dash' }, desc: 'A lightning-fast tackle.',
});
mv('skyuppercut', 'Sky Uppercut', 'Fighting', 'physical', 'medium', 72, {
  anim: 'Attack', startup: 14, sfxStart: 'DUN_Move_Start', sfx: 'DUN_Sky_Uppercut', cost: 24, cd: 33, hitFx: 'Sky_Uppercut',
  steps: [S('melee', { range: 28, arc: 1.8, lunge: 12, kb: 2.5, stun: 34, launch: 46 })],
  ai: { r: [0, 36], kind: 'melee' }, desc: 'An uppercut that launches the target into the air.',
});
mv('highjumpkick', 'High Jump Kick', 'Fighting', 'physical', 'heavy', 112, {
  anim: 'Kick', startup: 20, sfx: 'DUN_Punch', sfxStart: 'DUN_Move_Start', cost: 36, cd: 84, hitFx: 'Print_Foot',
  steps: [S('leap', { range: 120, ticks: 22, apex: 34, track: true, landR: 22, kb: 4.5, shake: 4, missRecoil: 0.14, landFx: 'Rock_Smash' })],
  ai: { r: [40, 120], kind: 'leap' }, desc: 'A soaring knee. Missing hurts the user.',
});
mv('xscissor', 'X-Scissor', 'Bug', 'physical', 'medium', 64, {
  anim: 'Attack', sfx: 'DUN_X-Scissor', cost: 22, cd: 30, hitFx: 'X_Scissor',
  steps: [S('proj', { speed: 4.2, range: 150, r: 10, boomerang: true, sprite: 'X_Scissor', spriteFT: 2, spin: true, from: 'center' })],
  ai: { r: [40, 150], kind: 'proj' }, desc: 'Hurls a crossed blade that flies back (Executioner).',
});
mv('zenheadbutt', 'Zen Headbutt', 'Psychic', 'physical', 'medium', 66, {
  anim: 'Attack', sfx: 'DUN_Zen_Headbutt', cost: 22, cd: 30, status: { flinch: 0.2 }, hitFx: 'Zen_Headbutt_Hit',
  steps: [S('dash', { dist: 80, ticks: 10, hitR: 16, trail: 'Zen_Headbutt', trailGap: 3, kb: 3, stun: 18 })],
  ai: { r: [20, 80], kind: 'dash' }, desc: 'A psychic-charged headbutt rush.',
});
mv('thunderbolt', 'Thunderbolt', 'Electric', 'special', 'medium', 70, {
  anim: 'Shoot', sfx: 'DUN_Shock_Wave', sfxStart: 'DUN_Move_Start', status: { para: 0.2 }, cost: 24, cd: 30, hitFx: 'Discharge_Hit',
  steps: [S('proj', { speed: 6.5, range: 230, r: 7, sprite: 'Charge_Beam_Shot', spriteFT: 2, trail: 'Spark', trailGap: 6, stun: 30, castFx: 'Spark' })],
  ai: { r: [40, 210], kind: 'proj' }, desc: 'A fast bolt that stuns on hit (Electro Wizard).',
});
mv('shadowball', 'Shadow Ball', 'Ghost', 'special', 'medium', 66, {
  anim: 'Shoot', sfx: 'DUN_Shadow_Ball', cost: 24, cd: 30, hitFx: 'Shadow_Force_Hit',
  steps: [S('proj', { speed: 3.4, range: 300, r: 9, bounce: 2, sprite: 'Shadow_Ball', spriteFT: 4, trail: 'Smoke_Purple', trailGap: 6 })],
  ai: { r: [40, 220], kind: 'proj' }, desc: 'A ghostly orb that bounces off walls (Moira\'s orb).',
});
mv('icebeam', 'Ice Beam', 'Ice', 'special', 'heavy', 84, {
  anim: 'Shoot', startup: 18, sfx: 'DUN_Ice_Beam', sfxStart: 'DUN_Ice_Beam_2', status: { slow: { chance: 1, mul: 0.55, ticks: 120 }, freeze: 0.08 }, cost: 32, cd: 78, hitFx: 'Ice_Shard_Hit',
  steps: [S('beam', { len: 200, width: 10, ticks: 26, interval: 9, beam: 'Column_White|Ice', stream: 'Ice_Pieces', streamFT: 3, streamGap: 3, track: 0.03, kb: 0.6 })],
  ai: { r: [40, 190], kind: 'beam' }, desc: 'A freezing ray that slows the target.',
});
mv('hydropump', 'Hydro Pump', 'Water', 'special', 'heavy', 96, {
  anim: 'Shoot', startup: 20, sfx: 'DUN_Hydro_Pump', cost: 36, cd: 96, hitFx: 'Hydro_Cannon',
  steps: [S('beam', { len: 210, width: 14, ticks: 30, interval: 10, beam: 'Column_Blue', stream: 'Water_Spout_Drop', streamFT: 3, streamGap: 2, streamSpeed: 7, track: 0.02, kb: 2.2 })],
  ai: { r: [40, 200], kind: 'beam' }, desc: 'A crushing high-pressure water jet.',
});
mv('swift', 'Swift', 'Normal', 'special', 'light', 30, {
  anim: 'Shoot', sfx: 'DUN_Swift', cost: 12,
  steps: [S('proj', { count: 3, spread: 0.32, speed: 3.6, range: 230, r: 6, homing: 0.06, sprite: 'Swift_Star', spriteFT: 3, trail: 'Swift_RSE', trailGap: 5 })],
  hitFx: 'Swift_RSE', ai: { r: [40, 220], kind: 'proj' }, desc: 'Star-shaped rays that home in.',
});
mv('psychic', 'Psychic', 'Psychic', 'special', 'heavy', 90, {
  anim: 'SpAttack', startup: 20, sfx: 'DUN_Confusion', sfxStart: 'DUN_Move_Start', cost: 34, cd: 84,
  steps: [S('area', { where: 'target', r: 34, delay: 18, tele: 'psychic', burst: 'Psych_Up|Psychic', zoneFx: 'Circle_Thick_Red_Out|Psychic', shake: 2, kb: 3 })],
  ai: { r: [40, 240], kind: 'area' }, desc: 'Telekinetic force crushes the target after a tell.',
});
mv('waterpulse', 'Water Pulse', 'Water', 'special', 'light', 38, {
  anim: 'Shoot', sfx: '_UNK_DUN_Water_Echo_2', status: { confuse: 0.1 }, cost: 12,
  steps: [S('proj', { speed: 4.2, range: 200, r: 9, sprite: 'Wave_Circle_Blue', spriteFT: 3, castFx: 'Circle_Small_Blue_In' })],
  hitFx: 'Hydro_Cannon', ai: { r: [40, 190], kind: 'proj' }, desc: 'A pulsing ring of water.',
});
mv('whirlpool', 'Whirlpool', 'Water', 'special', 'medium', 22, {
  anim: 'Shoot', sfx: 'DUN_Whirlpool', cost: 24, cd: 36,
  steps: [S('area', { where: 'target', r: 40, delay: 10, ticks: 150, interval: 30, pull: 0.32, zoneFx: 'Gust_Blue', zoneFT: 2, tele: 'water' })],
  ai: { r: [40, 220], kind: 'zone' }, desc: 'A whirlpool that drags the target to its center (Tornado).',
});
mv('discharge', 'Discharge', 'Electric', 'special', 'heavy', 88, {
  anim: 'Charge', startup: 18, sfx: 'DUN_Discharge', sfxStart: 'DUN_Discharge_2', status: { para: 0.3 }, cost: 34, cd: 84, hitFx: 'Discharge_Hit',
  steps: [S('area', { where: 'self', r: 58, burst: 'Discharge', shake: 3, kb: 3.5, kbOut: true }), S('fxonly', { at: 2, fx: 'Spark' })],
  ai: { r: [0, 56], kind: 'area' }, desc: 'A burst of electricity in all directions.',
});
mv('zapcannon', 'Zap Cannon', 'Electric', 'special', 'sig', 125, {
  anim: 'Shoot', startup: 40, windup: { t: 30, anim: 'Charge', fx: 'Charge_Beam_Charge' }, sfxStart: 'DUN_Charge_Beam_2', sfx: 'DUN_Flash_Cannon', status: { para: 1 }, hitFx: 'Shock_Wave',
  steps: [S('proj', { speed: 3.0, range: 260, r: 13, homing: 0.025, sprite: 'Shock_Wave', spriteFT: 2, trail: 'Spark', trailGap: 4, kb: 4, stun: 30 })],
  ai: { r: [60, 240], kind: 'proj' }, desc: 'Long charge, then a slow orb that always paralyzes (Sparky).',
});
mv('bite', 'Bite', 'Dark', 'physical', 'light', 38, {
  anim: 'Attack', sfx: 'DUN_Bite', status: { flinch: 0.2 }, cost: 12, hitFx: 'Bite',
  steps: [S('melee', { range: 26, arc: 1.8, lunge: 10, kb: 1.8, stun: 13 })],
  ai: { r: [0, 36], kind: 'melee' }, desc: 'A crunching bite. May flinch.',
});
mv('superpower', 'Superpower', 'Fighting', 'physical', 'heavy', 104, {
  anim: 'Attack', startup: 22, windup: { t: 10, anim: 'Charge', fx: 'Focus_Energy' }, sfx: 'DUN_Superpower', cost: 36, cd: 90, hitFx: 'Superpower',
  steps: [S('melee', { range: 32, arc: 2.0, lunge: 20, kb: 5.5, stun: 24 }), S('fn', { at: 1, fn: (f) => f.addBuff('atk', 0.85, 300, 'spow') })],
  ai: { r: [0, 40], kind: 'melee' }, desc: 'Massive strike; lowers own Attack briefly.',
});
mv('poisonjab', 'Poison Jab', 'Poison', 'physical', 'light', 40, {
  anim: 'Attack', sfx: 'DUN_Poison_Jab', status: { poison: 0.3 }, cost: 12, hitFx: 'Poison_Jab',
  steps: [S('melee', { range: 28, arc: 1.6, lunge: 14, kb: 1.8, stun: 13 })],
  ai: { r: [0, 38], kind: 'melee' }, desc: 'A venomous jab. May poison.',
});
mv('flashcannon', 'Flash Cannon', 'Steel', 'special', 'medium', 70, {
  anim: 'Shoot', sfx: 'DUN_Flash_Cannon', sfxStart: 'DUN_Flash_Cannon_2', cost: 24, cd: 33, hitFx: 'Flash_Cannon',
  steps: [S('proj', { speed: 5.2, range: 230, r: 10, sprite: 'Light_Ball_White', spriteFT: 2, castFx: 'Flash_Cannon_Release', trail: 'Flash_Cannon_Sparkle_Single', trailGap: 4, kb: 2.6 })],
  ai: { r: [40, 220], kind: 'proj' }, desc: 'A blast of gleaming steel light.',
});
mv('hydrocannon', 'Hydro Cannon', 'Water', 'special', 'ult', 190, {
  anim: 'Shoot', startup: 30, windup: { t: 20, anim: 'Charge', fx: 'Hydro_Cannon' }, sfx: 'DUN_Waterfall', sfxStart: 'DUN_Dragon_Dance', hitFx: 'Aqua_Tail_Splash',
  steps: [S('proj', { speed: 4.6, range: 260, r: 20, sprite: 'Water_Column_Ranger', spriteFT: 3, trail: 'Hydro_Cannon', trailGap: 2, kb: 7, stun: 34, pierce: true }), S('fxonly', { fx: 'Aqua_Tail_Splash' })],
  ai: { r: [40, 240], kind: 'proj' }, desc: 'Ultimate: a giant cannon blast of water.',
});
mv('rockslide', 'Rock Slide', 'Rock', 'physical', 'medium', 66, {
  anim: 'Shoot', sfx: 'DUN_Rock_Slide', status: { flinch: 0.25 }, cost: 24, cd: 33, hitFx: 'Rock_Pieces',
  steps: [S('proj', { count: 3, spread: 0.0, gap: 6, speed: 3.6, range: 210, r: 11, sprite: 'Rock_Piece_Rotating', spriteFT: 3, trail: 'Puff_Brown', trailGap: 14, kb: 3.5, roll: true, track: false })],
  ai: { r: [30, 200], kind: 'proj' }, desc: 'Boulders roll in a line and push back (Bowler).',
});

// ---------------------------------------------------------------------------------------------- Garchomp
mv('sandtomb', 'Sand Tomb', 'Ground', 'physical', 'medium', 18, {
  anim: 'Shoot', sfx: 'DUN_Sand_Tomb', cost: 22, cd: 36,
  steps: [S('area', { where: 'target', r: 36, delay: 12, ticks: 180, interval: 30, slow: 0.55, zoneFx: 'Sand_Tomb_Front', zoneFx2: 'Sand_Tomb_Back', zoneDy: -26, zoneFT: 1, tele: 'ground' })],
  ai: { r: [30, 200], kind: 'zone' }, desc: 'A sand vortex that slows and chips (Tornado).',
});
mv('dragonrush', 'Dragon Rush', 'Dragon', 'physical', 'sig', 110, {
  anim: 'Attack', startup: 22, windup: { t: 12, anim: 'Charge', fx: 'Dragon_Rush_Back' }, sfx: 'DUN_Dragon_Rush', sfxStart: '_UNK_DUN_Hurl_2', status: { flinch: 0.3 },
  steps: [S('dash', { dist: 180, ticks: 18, ramp: 0.6, hitR: 18, trail: 'Dragon_Rush_Front', trailGap: 3, kb: 5.5, stun: 26 })],
  hitFx: 'Dragon_Pulse_Charge', ai: { r: [60, 180], kind: 'dash' }, desc: 'A menacing charge that hits harder the farther it travels (Prince).',
});
mv('earthquake', 'Earthquake', 'Ground', 'physical', 'heavy', 96, {
  anim: 'Hop', startup: 22, sfx: 'DUN_Trapbust_Orb', cost: 36, cd: 96,
  steps: [S('area', { where: 'self', r: 74, burst: 'Circle_Green_Out|Ground', shake: 7, kb: 3, kbOut: true, crack: true }), S('fxonly', { fx: 'Rock_Pieces', fxAt: 'feet' }), S('fxonly', { at: 4, fx: 'Puff_Brown', fxAt: 'feet' })],
  hitFx: 'Rock_Pieces', ai: { r: [0, 70], kind: 'area' }, desc: 'A quake rips through everything nearby.',
});
mv('dracometeor', 'Draco Meteor', 'Dragon', 'special', 'ult', 70, {
  anim: 'SpAttack', startup: 26, windup: { t: 18, anim: 'Charge', fx: 'Charge_Up' }, sfxStart: 'DUN_Move_Start', sfx: 'DUN_Draco_Meteor',
  steps: [S('strikes', { n: 6, pattern: 'mixed', spread: 150, delay: 46, gap: 9, r: 34, oneHit: false, tele: 'meteor', fall: 'Draco_Meteor_Streaks', burst: 'Draco_Meteor_Explosion', kb: 4, shake: 5 })],
  ai: { r: [0, 300], kind: 'area' }, desc: 'Ultimate: meteors rain over a wide area (Rocket).',
});
// ---------------------------------------------------------------------------------------------- Metagross
mv('meteormash', 'Meteor Mash', 'Steel', 'physical', 'sig', 92, {
  anim: 'Attack', startup: 22, windup: { t: 12, anim: 'Charge', fx: 'Metal_Burst_Charge' }, sfx: 'DUN_Meteor_Mash', sfxStart: 'DUN_Feint_2',
  steps: [S('dash', { dist: 200, ticks: 22, pin: true, hitR: 18, slamPower: 70, trail: 'Meteor_Mash_Star', trailGap: 3, unstoppable: true })],
  hitFx: 'Focus_Blast_Hit', ai: { r: [30, 170], kind: 'dash' }, desc: 'Charges, pins the target and slams it into a wall (Reinhardt).',
});
mv('irondefense', 'Iron Defense', 'Steel', 'status', 'medium', 0, {
  anim: 'Charge', startup: 6, sfx: 'DUN_Mind_Reader', cost: 18, cd: 24, hold: true,
  steps: [S('barrier', { kind: 'front', ticks: 150, arc: 2.4, held: true, drain: 0.32, barrierFx: 'Screen_RSE_Gray' })],
  ai: { r: [0, 999], kind: 'defend' }, desc: 'Hold to raise a steel barrier that blocks attacks from the front, draining stamina.',
});
mv('hammerarm', 'Hammer Arm', 'Fighting', 'physical', 'ult', 150, {
  anim: 'Hop', startup: 30, sfxStart: '_UNK_DUN_Heave_Up', sfx: 'DUN_Hammer_Arm',
  steps: [S('leap', { range: 160, ticks: 30, apex: 60, track: true, landR: 64, kb: 6, shake: 9, cone: true, landFx: 'Hammer_Arm_Smoke', knockdown: 60 }), S('fxonly', { at: 30, fx: 'Hammer_Arm_Fist' })],
  ai: { r: [0, 160], kind: 'leap' }, desc: 'Ultimate: a leaping slam that knocks the foe down (Earthshatter).',
});
// ---------------------------------------------------------------------------------------------- Mewtwo
mv('psychocut', 'Psycho Cut', 'Psychic', 'physical', 'light', 36, {
  anim: 'Attack', sfx: 'DUN_Safeguard', cost: 12, hitFx: 'Psycho_Cut_Cut',
  steps: [S('proj', { speed: 5.4, range: 200, r: 8, sprite: 'Psycho_Cut_Shot', spriteFT: 3, castFx: 'Psycho_Cut_Hole' })],
  ai: { r: [30, 200], kind: 'proj' }, desc: 'A psychic blade flung at the foe.',
});
mv('barrier', 'Barrier', 'Psychic', 'status', 'medium', 0, {
  anim: 'Charge', startup: 4, sfx: 'DUN_Light_Screen', cost: 22, cd: 210,
  steps: [S('barrier', { kind: 'reflect', ticks: 60, all: true, barrierFx: 'Screen_RSE_Gray' })],
  ai: { r: [0, 999], kind: 'reflect' }, desc: 'For 1 s, reflects every projectile (Genji\'s Deflect).',
});
mv('psystrike', 'Psystrike', 'Psychic', 'special', 'sig', 125, {
  anim: 'SpAttack', startup: 26, windup: { t: 14, anim: 'Charge', fx: 'Psycho_Shift_Charge' }, sfx: 'DUN_Miracle_Eye',
  steps: [S('proj', { count: 5, spread: 0.18, speed: 5.2, range: 230, r: 9, sprite: 'Psycho_Cut_Shot', spriteFT: 3, kb: 3.5 }), S('fxonly', { fx: 'Psycho_Shift_Hit' })],
  hitFx: 'Psycho_Shift_Hit', ai: { r: [30, 200], kind: 'proj' }, desc: 'A fan of psychic waves that strike physically.',
});
mv('gravitywell', 'Psychic Gravity Well', 'Psychic', 'special', 'ult', 160, {
  anim: 'Charge', startup: 28, sfx: 'DUN_Gravity', sfxStart: 'DUN_Move_Start',
  steps: [S('area', { where: 'target', r: 70, delay: 18, ticks: 110, interval: 22, pull: 0.55, zoneFx: 'Gravity', zoneFT: 2, tele: 'psychic', lift: true, finisher: { power: 70, r: 70, burst: 'Psycho_Boost_Front' } })],
  ai: { r: [0, 240], kind: 'zone' }, desc: 'Ultimate: a gravity well that pulls the foe in and lifts them (Graviton Surge).',
});
// ---------------------------------------------------------------------------------------------- Charizard
mv('flamethrower', 'Flamethrower', 'Fire', 'special', 'heavy', 34, {
  anim: 'Shoot', startup: 18, sfx: 'DUN_Flamethrower_2', status: { burn: 0.1 }, cost: 34, cd: 78, hitFx: 'Flamethrower',
  steps: [S('beam', { len: 130, width: 16, ticks: 48, interval: 8, ramp: 0.28, track: 0.05, stream: 'Flamethrower_2', streamFT: 2, streamGap: 2, streamSpeed: 4.5, kb: 0.5 })],
  ai: { r: [20, 120], kind: 'beam' }, desc: 'A torrent of fire that ramps up the longer it stays on target (Inferno Dragon).',
});
mv('fireblast', 'Fire Blast', 'Fire', 'special', 'sig', 118, {
  anim: 'Shoot', startup: 24, windup: { t: 10, anim: 'Charge', fx: 'Flare_Blitz_Charge_Back' }, sfx: 'DUN_Fire_Blast_2', status: { burn: 0.3 },
  steps: [S('proj', { speed: 3.8, range: 240, r: 13, sprite: 'Weather_Ball_Fire_1', spriteFrames: [1], rot: Math.PI * 0.58, trail: 'Weather_Ball_Fire_3', trailGap: 3, trailDz: -12, kb: 7.5, stun: 26,
    // the five-pointed 大 burst of flames where it lands
    onHit: (p, o, S2) => { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 0.4; S2.later(i, () => S2.fxAt('Fire_Blast', o.x + Math.cos(a) * 15, o.y + Math.sin(a) * 11 + 6, { layer: 'front' })); } } })],
  hitFx: 'Flare_Blitz_Hit_Front', preload: ['Fire_Blast'], ai: { r: [40, 220], kind: 'proj' }, desc: 'A star-shaped blast with huge knockback (Fireball).',
});
mv('flareblitzmax', 'Flare Blitz Max', 'Fire', 'physical', 'ult', 160, {
  anim: 'Attack', startup: 22, windup: { t: 14, anim: 'Charge', fx: 'Flare_Blitz_Charge_Front' }, sfxStart: 'DUN_Flare_Blitz', sfx: 'DUN_Flare_Blitz_2', status: { burn: 0.5 },
  steps: [S('dash', { dist: 220, ticks: 20, ramp: 0.6, homing: 0.06, trail: 'Flamethrower', trailGap: 2, hitR: 20, kb: 7, stun: 34, unstoppable: true })],
  hitFx: 'Flare_Blitz_Hit_Front', ai: { r: [40, 220], kind: 'dash' }, desc: 'Ultimate: an unstoppable homing Flare Blitz.',
});
mv('flareblitzx', 'Blue Flare Blitz', 'Fire', 'physical', 'ult', 170, {
  anim: 'Attack', startup: 22, windup: { t: 14, anim: 'Charge', fx: 'Flare_Blitz_Charge_Front|Dragon' }, sfxStart: 'DUN_Flare_Blitz', sfx: 'DUN_Flare_Blitz_2', status: { burn: 0.5 },
  steps: [S('dash', { dist: 230, ticks: 20, ramp: 0.6, homing: 0.06, trail: 'Flamethrower|Dragon', trailGap: 2, hitR: 20, kb: 7, stun: 34, unstoppable: true })],
  hitFx: 'Flare_Blitz_Hit_Front|Dragon', ai: { r: [40, 230], kind: 'dash' }, desc: 'Ultimate: Mega Charizard X\'s blue-flame charge.',
});
// ---------------------------------------------------------------------------------------------- Blastoise
mv('watergun', 'Water Gun', 'Water', 'special', 'light', 32, {
  anim: 'Shoot', sfx: 'DUN_Water_Gun_2', cost: 11,
  steps: [S('proj', { count: 2, gap: 5, speed: 5.4, range: 200, r: 7, sprite: 'Water_Spout_Drop', spriteFT: 2, trail: 'Bubbles_Blue', trailGap: 5, from: 'head' })],
  hitFx: 'Hydro_Cannon', ai: { r: [30, 190], kind: 'proj' }, desc: 'Twin cannon shots of water.',
});
mv('hydropumpb', 'Hydro Pump', 'Water', 'special', 'heavy', 100, {
  anim: 'Shoot', startup: 18, sfx: 'DUN_Hydro_Pump', cost: 34, cd: 84, hitFx: 'Hydro_Cannon',
  steps: [S('beam', { len: 210, width: 16, ticks: 30, interval: 10, beam: 'Column_Blue', stream: 'Water_Spout_Drop', streamFT: 3, streamGap: 2, streamSpeed: 7, kb: 2.5, recoil: 0.9 })],
  ai: { r: [30, 200], kind: 'beam', escape: true }, desc: 'Twin cannons blast water — the recoil pushes Blastoise back to escape.',
});
mv('protect', 'Protect', 'Normal', 'status', 'medium', 0, {
  anim: 'Withdraw', startup: 3, sfx: 'DUN_Protect', cost: 22, cd: 240,
  steps: [S('barrier', { kind: 'protect', ticks: 60, heal: 0.04, barrierFx: 'Protect' })],
  ai: { r: [0, 999], kind: 'defend' }, desc: 'An invulnerable shell for 1 s that heals a little (Cryo-Freeze).',
});
mv('skullbash', 'Skull Bash', 'Normal', 'physical', 'sig', 118, {
  anim: 'Attack', startup: 30, windup: { t: 22, anim: 'Withdraw', fx: 'Charge_Up' }, sfx: 'DUN_Tackle', sfxStart: 'DUN_Move_Start',
  steps: [S('dash', { dist: 170, ticks: 14, hitR: 18, trail: 'Puff_White', trailGap: 3, kb: 6, stun: 28, unstoppable: true })],
  hitFx: 'Brave_Bird_Hit', ai: { r: [40, 170], kind: 'dash' }, desc: 'Tucks in to charge, then rushes headfirst.',
});
mv('hydrocannonb', 'Hydro Cannon Barrage', 'Water', 'special', 'ult', 46, {
  anim: 'Shoot', startup: 20, windup: { t: 14, anim: 'Charge', fx: 'Hydro_Cannon' }, sfx: 'DUN_Waterfall', sfxStart: 'DUN_Dragon_Dance',
  steps: [S('proj', { count: 8, gap: 7, speed: 5.0, range: 240, r: 11, jitter: 0.35, sprite: 'Hydro_Cannon', spriteFT: 3, trail: 'Bubbles_Blue', trailGap: 4, kb: 2.2, stun: 10, newSetEach: true, eachSfx: 'DUN_Water_Gun_2' })],
  hitFx: 'Aqua_Tail_Splash', ai: { r: [30, 230], kind: 'proj' }, desc: 'Ultimate: both cannons fire a rapid barrage (Pharah\'s Barrage).',
});
// ---------------------------------------------------------------------------------------------- Venusaur
mv('razorleaf', 'Razor Leaf', 'Grass', 'physical', 'light', 30, {
  anim: 'Shoot', sfx: 'DUN_Razor_Leaf', cost: 12,
  steps: [S('proj', { count: 3, spread: 0.22, speed: 4.6, range: 190, r: 6, sprite: 'Razor_Leaf', spriteFT: 2, castFx: 'Razor_Leaf_Charge' })],
  hitFx: 'Leaf_Storm_Hit', ai: { r: [30, 180], kind: 'proj' }, desc: 'A fan of spinning razor leaves.',
});
mv('leechseed', 'Leech Seed', 'Grass', 'status', 'medium', 8, {
  anim: 'Shoot', sfx: 'DUN_Leech_Seed', cost: 22, cd: 36,
  steps: [S('proj', { speed: 3.6, range: 190, r: 8, sprite: 'Seed_RSE', spriteFT: 3, onHit: 'leechseed' })],
  hitFx: 'Leech_Seed_Sprout', ai: { r: [30, 180], kind: 'proj' }, desc: 'Plants a seed that drains HP to heal Venusaur.',
});
mv('sleeppowder', 'Sleep Powder', 'Grass', 'status', 'medium', 0, {
  anim: 'Shake', startup: 14, sfx: 'DUN_Stun_Spore', cost: 26, cd: 300, status: { sleep: { chance: 1, ticks: 60 } },
  steps: [S('area', { where: 'aim', dist: 46, r: 40, delay: 6, ticks: 50, interval: 10, zoneFx: 'Spores_RSE_Green', zoneFx2: 'Cotton_Spore|Grass', zoneDy: -6, zoneFT: 3, keepSleep: true, onceStatus: true })],
  ai: { r: [0, 80], kind: 'zone' }, desc: 'A short sleep cloud in front (Freeze spell).',
});
mv('solarbeam', 'Solar Beam', 'Grass', 'special', 'sig', 128, {
  anim: 'Shoot', startup: 40, windup: { t: 30, anim: 'Charge', fx: 'Solar_Beam_Charge' }, sfx: 'DUN_HP_Drain_2', sfxStart: 'DUN_Protect',
  steps: [S('beam', { len: 260, width: 22, ticks: 22, interval: 22, beam: 'Beam_2', kb: 4, stun: 22 })],
  hitFx: 'Seed_Flare_Burst', ai: { r: [40, 250], kind: 'beam' }, desc: 'Gathers light, then fires a huge beam.',
});
mv('petalblizzard', 'Petal Blizzard', 'Grass', 'physical', 'ult', 26, {
  anim: 'Rotate', startup: 20, sfx: 'DUN_Leaf_Storm_3', sfxStart: 'DUN_Leaf_Storm_2',
  steps: [S('area', { where: 'self', follow: true, r: 84, ticks: 270, interval: 18, zoneFx: 'Petal_Dance_Front', zoneFT: 2, kb: 1.2, stun: 8 })],
  ai: { r: [0, 80], kind: 'zone' }, desc: 'Ultimate: a petal storm swirls around Venusaur.',
});
// ---------------------------------------------------------------------------------------------- Tyranitar
mv('crunch', 'Crunch', 'Dark', 'physical', 'medium', 64, {
  anim: 'Attack', sfx: 'DUN_Bite', cost: 20, cd: 27, hitFx: 'Crunch',
  steps: [S('melee', { range: 30, arc: 1.9, lunge: 12, kb: 2.6, stun: 18, defDown: true })],
  ai: { r: [0, 38], kind: 'melee' }, desc: 'Crushing fangs; lowers the target\'s Defense.',
});
mv('stoneedge', 'Stone Edge', 'Rock', 'physical', 'heavy', 96, {
  anim: 'Strike', startup: 22, sfx: 'DUN_Stone_Edge', cost: 36, cd: 90, crit: 0.2,
  steps: [S('line', { n: 7, start: 24, step: 24, gap: 3, r: 16, burst: 'Stone_Edge', kb: 3.5 })],
  hitFx: 'Rock_Pieces', ai: { r: [10, 170], kind: 'line' }, desc: 'Stone spikes erupt in a line. High critical rate.',
});
mv('megaroar', 'Fortified Earthquake', 'Ground', 'physical', 'ult', 130, {
  anim: 'Hop', startup: 24, sfx: 'DUN_Trapbust_Orb', sfxStart: 'DUN_Rock_Slide',
  steps: [S('area', { where: 'self', r: 96, burst: 'Circle_Green_Out|Rock', shake: 9, kb: 4.5, kbOut: true, crack: true }), S('line', { at: 4, n: 6, start: 30, step: 26, gap: 3, r: 18, burst: 'Stone_Edge', kb: 3, power: 50 })],
  hitFx: 'Rock_Pieces', ai: { r: [0, 120], kind: 'area' }, desc: 'Ultimate: Mega Tyranitar\'s quake and stone wave.',
});
// ---------------------------------------------------------------------------------------------- Scizor
mv('swordsdance', 'Swords Dance', 'Normal', 'status', 'medium', 0, {
  anim: 'Rotate', startup: 12, sfx: 'DUN_Swords_Dance_2', cost: 22, cd: 480,
  steps: [S('buff', { stats: { atk: 1.35 }, ticks: 300, fx: 'Swords_Dance', fxFollow: true })],
  ai: { r: [140, 999], kind: 'buff' }, desc: 'A frenetic dance that sharply raises Attack.',
});
mv('uturn', 'U-turn', 'Bug', 'physical', 'medium', 62, {
  anim: 'Attack', sfx: 'DUN_U-Turn', cost: 22, cd: 30, hitFx: 'U_Turn_Hit',
  steps: [S('dash', { dist: 110, ticks: 10, hitR: 16, trail: 'U_Turn_Travel', trailGap: 3, kb: 2.6, stun: 16, bounceBack: 80 })],
  ai: { r: [20, 110], kind: 'dash', escape: true }, desc: 'Strikes, then darts straight back out.',
});
mv('bulletblitz', 'Bullet Punch Blitz', 'Steel', 'physical', 'ult', 70, {
  anim: 'Attack', startup: 14, sfx: 'DUN_Bullet_Punch', sfxStart: 'DUN_Move_Start',
  steps: [S('dash', { dist: 120, ticks: 9, hitR: 18, chain: 5, homing: 0.25, trail: 'Bullet_Punch', trailGap: 2, kb: 2.5, stun: 22, invuln: true })],
  hitFx: 'Bullet_Punch', ai: { r: [0, 140], kind: 'dash' }, desc: 'Ultimate: five chained bullet dashes (Golden Knight).',
});
// ---------------------------------------------------------------------------------------------- Lucario
mv('bonerush', 'Bone Rush', 'Ground', 'physical', 'light', 16, {
  anim: 'Double', sfx: 'DUN_Cut', cost: 12, hitFx: 'Bonemarang_Hit',
  steps: [S('melee', { range: 30, arc: 2.0, hits: 3, interval: 5, lunge: 10, kb: 1.4, stun: 10, swipe: 'Bonemarang' })],
  ai: { r: [0, 38], kind: 'melee' }, desc: 'Strikes three times with a bone of aura.',
});
mv('aurasphere', 'Aura Sphere', 'Fighting', 'special', 'medium', 66, {
  anim: 'SpAttack', sfx: 'DUN_Aura_Sphere', cost: 24, cd: 30, hitFx: 'Focus_Blast_Hit',
  steps: [S('proj', { speed: 3.8, range: 260, r: 10, homing: 0.07, sprite: 'Aura_Sphere', spriteFT: 2, castFx: 'Aura_Sphere_Shoot', trail: 'Circle_Small_Blue_Out', trailGap: 7 })],
  ai: { r: [40, 240], kind: 'proj' }, desc: 'A homing sphere of aura.',
});
mv('extremespeed', 'Extreme Speed', 'Normal', 'physical', 'medium', 60, {
  anim: 'Attack', startup: 8, sfx: 'DUN_Fury_Attack', cost: 24, cd: 36,
  steps: [S('dash', { dist: 150, ticks: 7, hitR: 16, trail: 'Wood_Hammer_Smoke', trailGap: 2, kb: 3, stun: 18, resetOnHit: true, invuln: true })],
  hitFx: 'Hit_Neutral', ai: { r: [40, 150], kind: 'dash' }, desc: 'A blinding dash; its cooldown resets on hit (Swift Strike).',
});
mv('counter', 'Counter', 'Fighting', 'physical', 'medium', 70, {
  anim: 'Charge', startup: 3, sfx: 'DUN_Move_Start', cost: 20, cd: 150,
  steps: [S('barrier', { kind: 'counter', ticks: 40, power: 80, barrierFx: 'Charge_Up' })],
  ai: { r: [0, 60], kind: 'counter' }, desc: 'A parry stance: melee hits are reflected with double force.',
});
mv('aurastorm', 'Aura Storm', 'Fighting', 'special', 'ult', 34, {
  anim: 'SpAttack', startup: 26, windup: { t: 16, anim: 'Charge', fx: 'Aura_Sphere' }, sfx: 'DUN_Aura_Sphere',
  steps: [S('beam', { len: 280, width: 26, ticks: 60, interval: 8, track: 0.04, beam: 'Column_Blue', stream: 'Aura_Sphere', streamFT: 2, streamGap: 3, streamSpeed: 6, kb: 1.5 })],
  hitFx: 'Focus_Blast_Hit', ai: { r: [30, 270], kind: 'beam' }, desc: 'Ultimate: Mega Lucario\'s Aura Storm beam.',
});
// ---------------------------------------------------------------------------------------------- Raikou
mv('spark', 'Spark', 'Electric', 'physical', 'light', 36, {
  anim: 'QuickStrike', sfx: 'DUN_Spark', status: { para: 0.2 }, cost: 12, hitFx: 'Spark',
  steps: [S('dash', { dist: 70, ticks: 7, hitR: 15, trail: 'Spark', trailGap: 3, kb: 2, stun: 12 })],
  ai: { r: [20, 75], kind: 'dash' }, desc: 'An electrified tackle.',
});
mv('thunder3', 'Thunder', 'Electric', 'special', 'ult', 90, {
  anim: 'Charge', startup: 24, sfxStart: 'DUN_Move_Start', sfx: 'DUN_Shock_Wave', status: { para: 0.4 },
  steps: [S('strikes', { n: 3, pattern: 'lead', delay: 40, gap: 16, r: 30, tele: 'bolt', fall: 'Lightning_RSE', burst: 'Discharge', kb: 3, stun: 30, shake: 6 })],
  ai: { r: [0, 300], kind: 'area' }, desc: 'Ultimate: three telegraphed lightning strikes (Lightning).',
});
// ---------------------------------------------------------------------------------------------- Entei
mv('firefang', 'Fire Fang', 'Fire', 'physical', 'light', 40, {
  anim: 'Attack', sfx: '_UNK_DUN_Splash', status: { burn: 0.12, flinch: 0.1 }, cost: 12, hitFx: 'Fire_Fang_Hit',
  steps: [S('melee', { range: 28, arc: 1.8, lunge: 12, kb: 2, stun: 13, swipe: 'Fire_Fang_Fang' })],
  ai: { r: [0, 38], kind: 'melee' }, desc: 'Flaming fangs. May burn.',
});
mv('lavaplume', 'Lava Plume', 'Fire', 'special', 'heavy', 74, {
  anim: 'Charge', startup: 18, sfx: 'DUN_Lava_Plume', status: { burn: 0.3 }, cost: 34, cd: 90,
  steps: [S('area', { where: 'self', r: 56, burst: 'Lava_Plume_Smoke', shake: 3, kb: 3, kbOut: true }), S('fn', { at: 2, fn: 'lavapools' })],
  hitFx: 'Lava_Plume_Fire', ai: { r: [0, 60], kind: 'area' }, desc: 'Erupts and leaves molten pools around Entei (Molten Core).',
});
mv('firespin', 'Fire Spin', 'Fire', 'special', 'medium', 16, {
  anim: 'Shoot', sfx: 'DUN_Fire_Spin', cost: 24, cd: 36,
  steps: [S('area', { where: 'target', r: 32, delay: 10, ticks: 160, interval: 24, trap: true, zoneFx: 'Fire_Spin_Front', zoneFT: 1, tele: 'fire', status: { burn: 0.15 } })],
  ai: { r: [30, 200], kind: 'zone' }, desc: 'A vortex of fire that traps the target inside.',
});
mv('flareblitze', 'Flare Blitz', 'Fire', 'physical', 'sig', 125, {
  anim: 'Attack', startup: 24, windup: { t: 14, anim: 'Charge', fx: 'Flare_Blitz_Charge_Front' }, sfxStart: 'DUN_Flare_Blitz', sfx: 'DUN_Flare_Blitz_2', status: { burn: 0.2 },
  steps: [S('dash', { dist: 190, ticks: 19, ramp: 0.7, trail: 'Flamethrower', trailGap: 2, hitR: 19, kb: 5.5, stun: 26, recoil: 0.1 })],
  hitFx: 'Flare_Blitz_Hit_Front', ai: { r: [50, 190], kind: 'dash' }, desc: 'Blazing charge: more damage the farther it travels (Prince).',
});
mv('eruption', 'Eruption', 'Fire', 'special', 'ult', 64, {
  anim: 'Charge', startup: 24, sfx: 'EVT_Tower_Quake', sfxStart: 'DUN_Lava_Plume',
  steps: [S('fxonly', { fx: 'Eruption' }), S('strikes', { n: 8, pattern: 'mixed', spread: 200, delay: 34, gap: 7, r: 26, tele: 'lava', fall: 'Eruption_Rocks', burst: 'Lava_Plume_Fire', kb: 3, shake: 4, hpScale: true })],
  ai: { r: [0, 300], kind: 'area' }, desc: 'Ultimate: a volcano of magma rocks — stronger at high HP.',
});
// ---------------------------------------------------------------------------------------------- Suicune
mv('bubblebeam', 'Bubble Beam', 'Water', 'special', 'light', 13, {
  anim: 'Shoot', sfx: 'DUN_BubbleBeam', cost: 12, status: { slow: { chance: 0.25, mul: 0.7, ticks: 60 } },
  steps: [S('proj', { count: 4, gap: 3, jitter: 0.25, speed: 4.8, range: 190, r: 6, sprite: 'Bubbles_Blue', spriteFT: 3, newSetEach: true })],
  hitFx: 'Bubble_Pop_Blue', ai: { r: [30, 180], kind: 'proj' }, desc: 'A spray of bubbles. May slow.',
});
mv('aurorabeam', 'Aurora Beam', 'Ice', 'special', 'heavy', 82, {
  anim: 'SpAttack', startup: 18, sfx: 'DUN_Aurora_Beam', cost: 32, cd: 78, status: { slow: { chance: 1, mul: 0.5, ticks: 120 } },
  steps: [S('beam', { len: 220, width: 12, ticks: 24, interval: 8, beam: 'Column_Pink', stream: 'Aurora_Beam_Custom', streamFT: 2, streamGap: 2, streamSpeed: 6, kb: 0.8, track: 0.02 })],
  hitFx: 'Ice_Shard_Hit', ai: { r: [40, 210], kind: 'beam' }, desc: 'A rainbow-colored beam that slows.',
});
mv('mirrorcoat', 'Mirror Coat', 'Psychic', 'status', 'medium', 0, {
  anim: 'Charge', startup: 4, sfx: 'DUN_Light_Screen', cost: 22, cd: 300,
  steps: [S('barrier', { kind: 'reflect', ticks: 90, barrierFx: 'Screen_RSE_Pink' })],
  ai: { r: [0, 999], kind: 'reflect' }, desc: 'Reflects special projectiles back at the attacker (Monk).',
});
mv('calmmind', 'Calm Mind', 'Psychic', 'status', 'medium', 0, {
  anim: 'Charge', startup: 14, sfx: '_UNK_EVT_073', cost: 22, cd: 480,
  steps: [S('buff', { stats: { spa: 1.25, spd: 1.25 }, ticks: 300, heal: 0.04, fx: 'Circle_Thick_Red_In|Psychic', fxFollow: true })],
  ai: { r: [140, 999], kind: 'buff' }, desc: 'Focuses the mind: Sp. Atk and Sp. Def up.',
});
mv('surf', 'Surf', 'Water', 'special', 'ult', 150, {
  anim: 'RearUp', startup: 26, sfx: 'DUN_Surf',
  steps: [S('fn', { fn: 'surfwave' })],
  hitFx: 'Aqua_Tail_Splash', ai: { r: [0, 400], kind: 'area' }, desc: 'Ultimate: a huge wave sweeps the arena and pushes the foe.',
});
// ---------------------------------------------------------------------------------------------- Sceptile
mv('leafblade', 'Leaf Blade', 'Grass', 'physical', 'medium', 66, {
  anim: 'Strike', sfx: 'DUN_Leaf_Blade', sfxStart: 'DUN_Move_Start', cost: 20, cd: 24, crit: 0.2, hitFx: 'Leaf_Blade',
  steps: [S('melee', { range: 32, arc: 2.2, lunge: 18, kb: 2.6, stun: 16, swipe: 'Cut|Grass' })],
  ai: { r: [0, 44], kind: 'melee' }, desc: 'A sharp leaf slash with a high critical rate.',
});
mv('bulletseed', 'Bullet Seed', 'Grass', 'physical', 'light', 10, {
  anim: 'Shoot', sfx: 'DUN_Bullet_Seed', cost: 13,
  steps: [S('proj', { count: 5, gap: 4, jitter: 0.18, speed: 6.4, range: 190, r: 5, sprite: 'Bullet_Seed_Seed', spriteFT: 2, newSetEach: true, stun: 4 })],
  hitFx: 'Seed_Bomb_Blast', ai: { r: [30, 180], kind: 'proj' }, desc: 'Rapid-fire seeds.',
});
mv('leafstorm', 'Leaf Storm', 'Grass', 'special', 'sig', 18, {
  anim: 'Shoot', startup: 22, windup: { t: 10, anim: 'Charge', fx: 'Leaf_Storm_Shoot' }, sfx: 'DUN_Leaf_Storm_3', sfxStart: 'DUN_Leaf_Storm_2',
  steps: [S('proj', { count: 11, spread: 0.11, speed: 4.4, range: 200, r: 7, sprite: 'Leaf_Storm_Leaf_Rotating', spriteFT: 2, newSetEach: true, stun: 6 }), S('fn', { at: 1, fn: (f) => f.addBuff('spa', 0.8, 300, 'lstorm') })],
  hitFx: 'Leaf_Storm_Hit', ai: { r: [30, 180], kind: 'proj' }, desc: 'A wide volley of leaves (Arrows). Lowers Sp. Atk briefly.',
});
mv('frenzyplant', 'Frenzy Plant', 'Grass', 'physical', 'ult', 120, {
  anim: 'Strike', startup: 22, windup: { t: 12, anim: 'Charge', fx: 'Charge_Up' }, sfx: 'DUN_Frenzy_Plant', sfxStart: 'DUN_Wrap',
  steps: [S('line', { n: 9, start: 26, step: 24, gap: 3, r: 20, linger: 90, burst: 'Frenzy_Plant', kb: 1, stun: 60, root: true })],
  hitFx: 'Power_Whip_Hit_Front', ai: { r: [0, 210], kind: 'line' }, desc: 'Ultimate: giant roots erupt in a line and trap.',
});
// ---------------------------------------------------------------------------------------------- Blaziken
mv('firepunch', 'Fire Punch', 'Fire', 'physical', 'light', 40, {
  anim: 'Attack', sfx: 'DUN_Punch', status: { burn: 0.1 }, cost: 12, hitFx: 'Flamethrower',
  steps: [S('melee', { range: 28, arc: 1.8, lunge: 12, kb: 2, stun: 13, swipe: 'Print_Fist' })],
  ai: { r: [0, 38], kind: 'melee' }, desc: 'A fiery punch.',
});
mv('blazekick', 'Blaze Kick', 'Fire', 'physical', 'medium', 74, {
  anim: 'Kick', startup: 18, windup: { t: 8, anim: 'Charge', fx: 'Flare_Blitz_Charge_Back' }, sfx: 'DUN_Double_Kick', sfxStart: 'DUN_Flamethrower_2', status: { burn: 0.1 }, cost: 26, cd: 36, crit: 0.15,
  steps: [S('dash', { dist: 150, ticks: 12, hitR: 17, trail: 'Flamethrower', trailGap: 2, kb: 8.5, stun: 26 })],
  hitFx: 'Flare_Blitz_Hit_Front', ai: { r: [30, 150], kind: 'dash' }, desc: 'Rocket kick with huge knockback; wall slams deal bonus damage.',
});
mv('blastburn', 'Blast Burn', 'Fire', 'special', 'ult', 180, {
  anim: 'Charge', startup: 34, windup: { t: 24, anim: 'Charge', fx: 'Sacred_Fire_Pillar' }, sfx: 'DUN_Blast_Burn', sfxStart: '_UNK_DUN_Energy', status: { burn: 0.5 },
  steps: [S('area', { where: 'self', r: 96, burst: 'Explosion', shake: 10, kb: 7, kbOut: true, scorch: true }), S('fxonly', { ring: 8, ringR: 58, ringFx: 'Fire_Column_Ranger', ringGap: 1 }), S('fxonly', { at: 3, ring: 5, ringR: 28, ringFx: 'Blast_Burn' })],
  hitFx: 'Burned', preload: ['Fire_Column_Ranger', 'Blast_Burn'], ai: { r: [0, 90], kind: 'area' }, desc: 'Ultimate: a huge explosion around Blaziken.',
});
// ---------------------------------------------------------------------------------------------- Greninja
mv('aerialace', 'Aerial Ace', 'Flying', 'physical', 'light', 36, {
  anim: 'QuickStrike', sfx: 'DUN_Guillotine', cost: 12, hitFx: 'Slash_Blue_RSE',
  steps: [S('dash', { dist: 80, ticks: 7, hitR: 16, homing: 0.3, trail: 'Air_Slash_Particle', trailGap: 2, kb: 2, stun: 13 })],
  ai: { r: [10, 80], kind: 'dash' }, desc: 'A slash that never misses.',
});
mv('watershuriken', 'Water Shuriken', 'Water', 'special', 'medium', 20, {
  anim: 'Shoot', sfx: 'DUN_Ice_Shard', cost: 22, cd: 24,
  steps: [S('proj', { count: 3, gap: 5, spread: 0.12, speed: 6.2, range: 220, r: 7, sprite: 'Flame_Wheel|Water', spriteFT: 2, newSetEach: true, stun: 8 })],
  hitFx: 'Bubble_Pop_Blue', ai: { r: [30, 210], kind: 'proj' }, desc: 'Throws three water stars.',
});
mv('doubleteam', 'Double Team', 'Normal', 'status', 'medium', 0, {
  anim: 'Hop', startup: 8, sfx: 'DUN_Double_Team', cost: 24, cd: 360,
  steps: [S('summon', { kind: 'clones', n: 2, ticks: 300 })],
  ai: { r: [0, 999], kind: 'buff' }, desc: 'Two clones appear and copy its next attack weakly (Clone).',
});
mv('nightslash', 'Night Slash', 'Dark', 'physical', 'heavy', 90, {
  anim: 'QuickStrike', startup: 16, sfx: 'DUN_Night_Slash', cost: 32, cd: 72, crit: 0.25, hitFx: 'Night_Slash_Hit',
  steps: [S('blink', { to: 'behind', blinkFx: 'Shadow_Sneak_Shadow' }), S('melee', { range: 32, arc: 2.6, kb: 3.5, stun: 20, swipe: 'Cut_Dark' })],
  ai: { r: [0, 120], kind: 'blink' }, desc: 'Vanishes, then slashes from behind. High critical rate.',
});
mv('giantshuriken', 'Giant Water Shuriken', 'Water', 'special', 'ult', 160, {
  anim: 'Shoot', startup: 28, windup: { t: 18, anim: 'Charge', fx: 'Hydro_Cannon' }, sfx: 'DUN_Ice_Shard', sfxStart: 'DUN_Dragon_Dance',
  steps: [S('proj', { speed: 4.6, range: 320, r: 22, homing: 0.04, pierce: true, sprite: 'Flame_Wheel@2x|Water', giant: true, spriteFT: 2, trail: 'Bubbles_Blue', trailGap: 2, kb: 6, stun: 30 })],
  hitFx: 'Aqua_Tail_Splash', ai: { r: [30, 300], kind: 'proj' }, desc: 'Ultimate: a giant Water Shuriken (Ash-Greninja).',
});
// ---------------------------------------------------------------------------------------------- Infernape
mv('machpunch', 'Mach Punch', 'Fighting', 'physical', 'light', 36, {
  anim: 'Strike', startup: 8, sfx: 'DUN_Rage', cost: 12, hitFx: 'Print_Fist',
  steps: [S('dash', { dist: 80, ticks: 7, hitR: 15, invuln: true, trail: 'Puff_White', trailGap: 2, kb: 2, stun: 13 })],
  ai: { r: [10, 80], kind: 'dash' }, desc: 'A dashing jab, invulnerable while dashing (Bandit).',
});
mv('flamewheeli', 'Flame Wheel', 'Fire', 'physical', 'medium', 62, {
  anim: 'Rotate', startup: 14, sfx: 'DUN_Flame_Wheel', status: { burn: 0.15 }, cost: 22, cd: 30, hitFx: 'Flamethrower',
  steps: [S('dash', { dist: 130, ticks: 16, hitR: 15, trail: 'Flame_Wheel', trailGap: 2, kb: 3, stun: 16 })],
  ai: { r: [30, 130], kind: 'dash' }, desc: 'Rolls into the foe wrapped in fire.',
});
mv('flareblitzi', 'Flare Blitz', 'Fire', 'physical', 'sig', 116, {
  anim: 'Attack', startup: 22, windup: { t: 12, anim: 'Charge', fx: 'Flare_Blitz_Charge_Front' }, sfxStart: 'DUN_Flare_Blitz', sfx: 'DUN_Flare_Blitz_2', status: { burn: 0.2 },
  steps: [S('dash', { dist: 170, ticks: 17, ramp: 0.5, trail: 'Flamethrower', trailGap: 2, hitR: 17, kb: 5, stun: 24, recoil: 0.12 })],
  hitFx: 'Flare_Blitz_Hit_Front', ai: { r: [50, 170], kind: 'dash' }, desc: 'A blazing charge. Recoil.',
});
mv('blazechain', 'Blaze: Flare Blitz Chain', 'Fire', 'physical', 'ult', 64, {
  anim: 'Attack', startup: 18, windup: { t: 10, anim: 'Charge', fx: 'Fire_Spin_Front' }, sfxStart: 'DUN_Flare_Blitz', sfx: 'DUN_Flare_Blitz_2', status: { burn: 0.3 },
  steps: [S('buff', { stats: { atk: 1.2, spe: 1.2 }, ticks: 360 }), S('dash', { dist: 150, ticks: 12, chain: 4, homing: 0.2, hitR: 18, trail: 'Flamethrower', trailGap: 2, kb: 3, stun: 22, invuln: true })],
  hitFx: 'Flare_Blitz_Hit_Front', ai: { r: [0, 150], kind: 'dash' }, desc: 'Ultimate: Blaze ignites a chain of Flare Blitz dashes.',
});
// ---------------------------------------------------------------------------------------------- Darkrai
mv('feintattack', 'Feint Attack', 'Dark', 'physical', 'light', 36, {
  anim: 'QuickStrike', sfx: 'DUN_Feint_Attack', cost: 12, hitFx: 'Feint_Hit',
  steps: [S('blink', { to: 'front', dist: 30, blinkFx: 'Feint_Attack' }), S('melee', { range: 30, arc: 2.2, kb: 2, stun: 13 })],
  ai: { r: [0, 70], kind: 'melee' }, desc: 'Draws close unseen and strikes.',
});
mv('darkpulse', 'Dark Pulse', 'Dark', 'special', 'medium', 66, {
  anim: 'SpAttack', sfx: 'DUN_Radar_Orb', status: { flinch: 0.2 }, cost: 24, cd: 30,
  steps: [S('area', { where: 'self', r: 54, burst: 'Dark_Pulse_Front', kb: 3, kbOut: true }), S('proj', { speed: 4.2, range: 200, r: 9, sprite: 'Dark_Pulse_Particle', spriteFT: 3 })],
  hitFx: 'Dark_Pulse_Back', ai: { r: [0, 190], kind: 'proj' }, desc: 'A ring of dark aura plus a seeking wave.',
});
mv('darkvoid', 'Dark Void', 'Dark', 'status', 'heavy', 0, {
  anim: 'SpAttack', startup: 18, sfx: 'DUN_Confusion', cost: 34, cd: 240, status: { sleep: { chance: 1, ticks: 72 } },
  steps: [S('proj', { speed: 3.2, range: 210, r: 12, sprite: 'Dark_Void_Front', spriteFT: 2, reflectable: true })],
  hitFx: 'Dark_Void_Sparkle', ai: { r: [30, 200], kind: 'proj' }, desc: 'A void orb: short sleep, max 1.2 s, cannot chain (Sleep Dart).',
});
mv('nightmarefield', 'Nightmare Field', 'Ghost', 'special', 'ult', 20, {
  anim: 'SpAttack', startup: 22, sfx: 'DUN_Nightmare',
  steps: [S('area', { where: 'self', r: 999, ticks: 150, interval: 30, zoneFx: 'Curse', zoneFT: 5, silence: true, burst: 'Dark_Void_Back' })],
  ai: { r: [0, 400], kind: 'zone' }, desc: 'Ultimate: a nightmare field that blocks the foe\'s moves (EMP).',
});
// ---------------------------------------------------------------------------------------------- Pikachu
mv('nuzzle', 'Nuzzle', 'Electric', 'physical', 'light', 26, {
  anim: 'Attack', sfx: 'DUN_Attack', status: { para: 0.3 }, cost: 12, hitFx: 'Spark',
  steps: [S('melee', { range: 24, arc: 1.8, lunge: 14, kb: 1.4, stun: 12 })],
  ai: { r: [0, 34], kind: 'melee' }, desc: 'Rubs electrified cheeks on the foe. May paralyze.',
});
mv('thunderboltp', 'Thunderbolt', 'Electric', 'special', 'medium', 66, {
  anim: 'Shoot', sfx: 'DUN_Shock_Wave', sfxStart: 'DUN_Move_Start', status: { para: 0.2 }, cost: 24, cd: 30, hitFx: 'Discharge_Hit',
  steps: [S('proj', { speed: 6.8, range: 220, r: 7, sprite: 'Charge_Beam_Shot', spriteFT: 2, trail: 'Spark', trailGap: 5, stun: 32, castFx: 'Shock_Wave' })],
  ai: { r: [40, 210], kind: 'proj' }, desc: 'A fast bolt that stuns on hit.',
});
mv('electroball', 'Electro Ball', 'Electric', 'special', 'medium', 44, {
  anim: 'Shoot', sfx: 'DUN_Flash_Cannon', cost: 22, cd: 27, hitFx: 'Charge_Beam_Hit',
  steps: [S('proj', { speed: 4.4, range: 220, r: 9, sprite: 'Shock_Wave', spriteFT: 3, speedScale: true })],
  ai: { r: [40, 210], kind: 'proj' }, desc: 'An electric orb that hits harder the faster Pikachu moves.',
});
mv('irontail', 'Iron Tail', 'Steel', 'physical', 'heavy', 92, {
  anim: 'Swing', startup: 18, sfx: 'DUN_Move_Start', cost: 32, cd: 72, hitFx: 'Iron_Head',
  steps: [S('melee', { range: 34, arc: 3.2, lunge: 16, kb: 4.5, stun: 20, swipe: 'Wide_Slash|Steel' })],
  ai: { r: [0, 42], kind: 'melee' }, desc: 'A hard steel tail swing.',
});
mv('volttackle', 'Volt Tackle', 'Electric', 'physical', 'ult', 170, {
  anim: 'Attack', startup: 22, windup: { t: 14, anim: 'Charge', fx: 'Charge_Beam_Start' }, sfx: 'DUN_Charge_Beam_2', sfxStart: 'DUN_Discharge_2', status: { para: 0.5 },
  steps: [S('dash', { dist: 260, ticks: 22, homing: 0.07, ramp: 0.3, trail: 'Spark', trailGap: 2, hitR: 18, kb: 6, stun: 30, recoil: 0.15, unstoppable: true })],
  hitFx: 'Charge_Beam_Hit', ai: { r: [30, 260], kind: 'dash' }, desc: 'Ultimate: an electrified charge with recoil (Prince).',
});
// ---------------------------------------------------------------------------------------------- Meowth
mv('furyswipes', 'Fury Swipes', 'Normal', 'physical', 'light', 22, {
  anim: 'MultiStrike', sfx: 'DUN_Fury_Swipes', cost: 11, hitFx: 'Fury_Swipes',
  steps: [S('melee', { range: 24, arc: 2.0, lunge: 10, kb: 1.3, stun: 11, stacking: true })],
  ai: { r: [0, 34], kind: 'melee' }, desc: 'Scratches harder with each consecutive hit.',
});
mv('payday', 'Pay Day', 'Normal', 'physical', 'medium', 16, {
  anim: 'Shoot', sfx: 'DUN_Ice_Shard', cost: 22, cd: 27,
  steps: [S('proj', { count: 5, spread: 0.2, speed: 4.8, range: 180, r: 5, sprite: 'Pay_Day', spriteFT: 3, newSetEach: true, stun: 5, dropCoin: true })],
  hitFx: 'Swift_RSE', ai: { r: [30, 170], kind: 'proj' }, desc: 'Scatters coins; picked-up coins charge the Ultimate.',
});
mv('fakeout', 'Fake Out', 'Normal', 'physical', 'light', 30, {
  anim: 'Attack', startup: 6, sfx: 'DUN_Punch', sfxStart: 'DUN_Leer', cost: 12, hitFx: 'Sucker_Punch_Hit',
  steps: [S('melee', { range: 26, arc: 2.0, lunge: 16, kb: 1.6, stun: 12, fakeout: true })],
  ai: { r: [0, 36], kind: 'melee' }, desc: 'A sneaky slap: flinches if used right after entering or dodging.',
});
mv('jackpot', 'Pay Day Jackpot', 'Normal', 'physical', 'ult', 18, {
  anim: 'Rotate', startup: 16, sfx: 'DUN_Ice_Shard',
  steps: [S('proj', { count: 18, spread: 0.349, speed: 4.2, range: 220, r: 6, sprite: 'Pay_Day', spriteFT: 3, newSetEach: true, stun: 6, track: false, ring: true, dropCoin: true }), S('proj', { at: 18, count: 18, spread: 0.349, speed: 4.6, range: 220, r: 6, sprite: 'Pay_Day', spriteFT: 3, newSetEach: true, stun: 6, track: false, ring: true, ringOffset: 0.17 })],
  hitFx: 'Swift_RSE', ai: { r: [0, 200], kind: 'area' }, desc: 'Ultimate: a jackpot storm of coins in every direction.',
});
// ---------------------------------------------------------------------------------------------- Arbok
mv('gunkshot', 'Gunk Shot', 'Poison', 'physical', 'heavy', 98, {
  anim: 'Shoot', startup: 22, sfx: 'DUN_Gunk_Shot', sfxStart: 'DUN_Gunk_Shot_2', status: { poison: 0.4 }, cost: 34, cd: 84,
  steps: [S('proj', { speed: 4.0, range: 220, r: 11, sprite: 'Gunk_Shot', spriteFT: 3, trail: 'Gunk_Shot_Particle', trailGap: 4, kb: 3.5 })],
  hitFx: 'Gunk_Shot_Hit', ai: { r: [40, 210], kind: 'proj' }, desc: 'A filthy blob of garbage. Often poisons.',
});
mv('wrap', 'Wrap', 'Normal', 'physical', 'heavy', 34, {
  anim: 'Shoot', sfx: 'DUN_Wrap', cost: 30, cd: 72,
  steps: [S('proj', { speed: 6.0, range: 170, r: 9, sprite: 'Wrap_White_Front', spriteFT: 3, pull: 7.5, stun: 26, chainLine: true })],
  hitFx: 'Wrap_White_Back', ai: { r: [50, 165], kind: 'proj' }, desc: 'Lashes out and reels the foe in (Roadhog\'s hook).',
});
mv('glare', 'Glare', 'Normal', 'status', 'medium', 0, {
  anim: 'Charge', startup: 12, sfx: 'DUN_Leer_2', cost: 24, cd: 210, status: { para: { chance: 1, ticks: 150 } },
  steps: [S('cone', { range: 110, arc: 1.2, fx: 'Scary_Face' })],
  hitFx: 'Leer', ai: { r: [0, 105], kind: 'cone' }, desc: 'A paralyzing cone of menace (Flashbang).',
});
mv('coil', 'Coil', 'Poison', 'status', 'medium', 0, {
  anim: 'Charge', startup: 12, sfx: 'DUN_Conversion2', cost: 22, cd: 480,
  steps: [S('buff', { stats: { atk: 1.2, def: 1.2 }, ticks: 300, fx: 'Wrap_White_Front', fxFollow: true })],
  ai: { r: [140, 999], kind: 'buff' }, desc: 'Coils up: Attack and Defense up.',
});
mv('toxicpool', 'Toxic', 'Poison', 'special', 'ult', 24, {
  anim: 'Shoot', startup: 20, sfx: 'DUN_Toxic', status: { poison: { chance: 1, ticks: 360 } },
  steps: [S('area', { where: 'target', r: 70, delay: 14, ticks: 300, interval: 24, zoneFx: 'Sticky_Purple_Front', zoneFT: 3, slow: 0.75, tele: 'poison', burst: 'Shadow_Force_Front|Poison' })],
  ai: { r: [0, 300], kind: 'zone' }, desc: 'Ultimate: a toxic pool that badly poisons (Poison spell).',
});
// ---------------------------------------------------------------------------------------------- Weezing
mv('sludgebomb', 'Sludge Bomb', 'Poison', 'special', 'medium', 66, {
  anim: 'Shoot', sfx: 'DUN_Throw_Arc', status: { poison: 0.3 }, cost: 24, cd: 30,
  steps: [S('proj', { speed: 3.6, range: 230, r: 9, sprite: 'Poison_Ball_Ranger', spriteFT: 2, lob: { apex: 36, r: 30, burst: 'Bubbles_Purple' } })],
  hitFx: 'Bubbles_Purple', ai: { r: [40, 220], kind: 'lob' }, desc: 'A lobbed sludge bomb that splashes on landing.',
});
mv('smokescreen', 'Smokescreen', 'Normal', 'status', 'medium', 0, {
  anim: 'Shoot', sfx: 'DUN_Smokescreen', cost: 22, cd: 300,
  steps: [S('area', { where: 'self', r: 64, ticks: 240, interval: 999, zoneFx: 'Puff_Black', zoneFT: 3, smoke: true })],
  ai: { r: [0, 999], kind: 'smoke' }, desc: 'A smoke cloud hides Weezing and its target arrow.',
});
mv('toxicspikes', 'Toxic Spikes', 'Poison', 'status', 'medium', 10, {
  anim: 'Shoot', sfx: '_UNK_DUN_Rustle', cost: 22, cd: 240,
  steps: [S('summon', { kind: 'spikes', n: 4, spread: 56, ticks: 720, power: 12 })],
  ai: { r: [30, 220], kind: 'trap' }, desc: 'Scatters poison spikes around the foe (Junkrat traps).',
});
mv('willowisp', 'Will-O-Wisp', 'Fire', 'status', 'light', 6, {
  anim: 'Shoot', sfx: 'DUN_Fire_Spin', cost: 14, status: { burn: { chance: 1, ticks: 300 } },
  steps: [S('proj', { speed: 3.0, range: 200, r: 8, homing: 0.03, sprite: 'Grudge_Lights', spriteFT: 3, trail: 'Grudge_Lights', trailGap: 8 })],
  hitFx: 'Burned', ai: { r: [40, 190], kind: 'proj' }, desc: 'A sinister flame that burns.',
});
mv('explosion', 'Explosion', 'Normal', 'physical', 'ult', 230, {
  anim: 'Charge', startup: 48, windup: { t: 40, anim: 'Charge', fx: 'Charge_Up' }, sfx: 'DUN_Explosion', sfxStart: 'DUN_Self-Destruct',
  steps: [S('area', { where: 'self', r: 110, burst: 'Explosion', shake: 12, kb: 8, kbOut: true, scorch: true }), S('fxonly', { at: 2, ring: 6, ringR: 46, ringFx: 'Explosion', ringGap: 2 }), S('fxonly', { at: 8, ring: 9, ringR: 84, ringFx: 'Explosion', ringGap: 1 }), S('fn', { fn: (f, S2) => { S2.selfDamage(f, f.maxHp * 0.3); S2.ev({ e: 'flash' }); } })],
  ai: { r: [0, 100], kind: 'area' }, desc: 'Ultimate: a huge telegraphed blast that costs Weezing 30% HP (Self-Destruct).',
});
// ---------------------------------------------------------------------------------------------- Chansey
mv('doubleslap', 'Double Slap', 'Normal', 'physical', 'light', 18, {
  anim: 'Attack', sfx: 'DUN_Attack', cost: 11, hitFx: 'Force_Palm_Hand',
  steps: [S('melee', { range: 24, arc: 1.9, hits: 2, interval: 6, lunge: 8, kb: 1.6, stun: 12 })],
  ai: { r: [0, 34], kind: 'melee' }, desc: 'Two quick slaps.',
});
mv('eggbomb', 'Egg Bomb', 'Normal', 'physical', 'medium', 72, {
  anim: 'Shoot', sfx: 'DUN_Self-Destruct', cost: 24, cd: 30,
  steps: [S('proj', { speed: 3.4, range: 220, r: 9, sprite: 'Egg_Bomb_Egg', spriteFT: 2, lob: { apex: 40, r: 34, burst: 'Blast_Seed', zone: { healOwner: 0.06, healBlock: 180 } } })],
  hitFx: 'Blast_Seed', ai: { r: [40, 210], kind: 'lob' }, desc: 'An egg that heals Chansey in its blast and blocks foe healing (Biotic Grenade).',
});
mv('rollout', 'Rollout', 'Rock', 'physical', 'medium', 40, {
  anim: 'Rotate', startup: 12, sfx: 'DUN_Rollout', cost: 24, cd: 36, hitFx: 'Rock_Smash',
  steps: [S('dash', { dist: 120, ticks: 14, hitR: 15, trail: 'Hammer_Arm_Smoke', trailGap: 3, kb: 3, stun: 14, rollout: true })],
  ai: { r: [30, 120], kind: 'dash' }, desc: 'A rolling ball that speeds up with each hit (Wrecking Ball).',
});
mv('softboiled', 'Soft-Boiled', 'Normal', 'status', 'heavy', 0, {
  anim: 'Charge', startup: 16, sfx: 'DUN_Softboiled_2', cost: 34, cd: 360,
  steps: [S('buff', { heal: 0.26, fx: 'Soft_Boiled', fxFollow: true })],
  ai: { r: [100, 999], kind: 'heal' }, desc: 'Restores a quarter of max HP.',
});
mv('healingwave', 'Healing Wish', 'Fairy', 'status', 'ult', 0, {
  anim: 'Charge', startup: 18, sfx: 'DUN_Healing_Wish', sfxStart: 'DUN_Healing_Wish_2',
  steps: [S('buff', { regen: 0.05, ticks: 300, stats: { def: 1.4, spd: 1.4 }, fx: 'Healing_Wish_Charge', fxFollow: true, teamHeal: 0.15 })],
  ai: { r: [0, 999], kind: 'heal' }, desc: 'Ultimate: big heal over time and damage resistance; heals the bench a little.',
});
// ---------------------------------------------------------------------------------------------- Growlithe
mv('flamecharge', 'Flame Charge', 'Fire', 'physical', 'light', 36, {
  anim: 'Attack', startup: 8, sfx: 'DUN_Fire_Spin', cost: 12, hitFx: 'Flame_Wheel',
  steps: [S('dash', { dist: 120, ticks: 8, hitR: 14, trail: 'Lava_Plume_Fire', trailGap: 2, kb: 2.2, stun: 13, resetOnHit: true }), S('fn', { at: 1, fn: (f) => f.addBuff('spe', 1.1, 240, 'fcharge') })],
  ai: { r: [30, 120], kind: 'dash' }, desc: 'A blazing dash (Extreme Speed role); speeds up and resets on hit.',
});
mv('flamewheelg', 'Flame Wheel', 'Fire', 'physical', 'medium', 64, {
  anim: 'Rotate', startup: 14, sfx: 'DUN_Flame_Wheel', status: { burn: 0.15 }, cost: 22, cd: 30, hitFx: 'Flamethrower',
  steps: [S('dash', { dist: 130, ticks: 16, hitR: 14, trail: 'Flame_Wheel', trailGap: 2, kb: 3, stun: 16 })],
  ai: { r: [30, 130], kind: 'dash' }, desc: 'Rolls into the foe wrapped in fire.',
});
mv('roar', 'Roar', 'Normal', 'status', 'heavy', 24, {
  anim: 'Charge', startup: 16, sfx: 'DUN_Growl', cost: 30, cd: 90,
  steps: [S('cone', { range: 90, arc: 1.6, kb: 9, stun: 18, fx: 'Growl' })],
  ai: { r: [0, 85], kind: 'cone' }, desc: 'A cone of sound that blasts the foe away (Soundwave).',
});
mv('policepup', 'Flare Blitz Chase', 'Fire', 'physical', 'ult', 150, {
  anim: 'Attack', startup: 18, windup: { t: 10, anim: 'Charge', fx: 'Flare_Blitz_Charge_Front' }, sfxStart: 'DUN_Flare_Blitz', sfx: 'DUN_Flare_Blitz_2', status: { burn: 0.4 },
  steps: [S('dash', { dist: 300, ticks: 30, homing: 0.14, trail: 'Flamethrower', trailGap: 2, hitR: 17, kb: 5.5, stun: 30, unstoppable: true })],
  hitFx: 'Flare_Blitz_Hit_Front', ai: { r: [0, 300], kind: 'dash' }, desc: 'Ultimate: a Flare Blitz that hunts the foe down.',
});

// ============================================================================================== AIR
mv('freezedry', 'Freeze-Dry', 'Ice', 'special', 'medium', 64, {
  anim: 'Shoot', sfx: 'DUN_Ice_Beam_2', status: { freeze: 0.1 }, cost: 22, cd: 30, superVs: 'Water',
  steps: [S('proj', { speed: 4.8, range: 210, r: 9, sprite: 'Ice_Ball', spriteFT: 2, trail: 'Smoke_White', trailGap: 5 })],
  hitFx: 'Ice_Shard_Pieces', ai: { r: [40, 200], kind: 'proj' }, desc: 'Super-chilled shards — super effective on Water.',
});
mv('mistwall', 'Mist', 'Ice', 'status', 'medium', 0, {
  anim: 'Shoot', startup: 12, sfx: 'DUN_Pokemon_Trap', cost: 24, cd: 300,
  steps: [S('wall', { dist: 44, len: 86, thick: 12, ticks: 180, sprite: 'Ice_Pieces' })],
  ai: { r: [60, 999], kind: 'wall' }, desc: 'Raises an icy wall that blocks movement and projectiles for 3 s (Ice Wall).',
});
mv('hurricane', 'Hurricane', 'Flying', 'special', 'heavy', 96, {
  anim: 'SpAttack', startup: 22, sfx: 'DUN_Howling_Wind', status: { confuse: 0.3 }, cost: 36, cd: 90,
  steps: [S('proj', { speed: 2.6, range: 220, r: 18, sprite: 'Gust', spriteFT: 1, pierce: true, multiHit: 10, kb: 2, pullIn: 0.18 })],
  hitFx: 'Gust_Wind', ai: { r: [40, 210], kind: 'proj' }, desc: 'A raging tornado that drifts forward.',
});
mv('blizzard', 'Blizzard', 'Ice', 'special', 'ult', 24, {
  anim: 'SpAttack', startup: 22, sfx: 'DUN_Tailwind_2', sfxStart: 'DUN_Ice_Beam_2', status: { slow: { chance: 1, mul: 0.4, ticks: 60 } },
  steps: [S('area', { where: 'target', r: 84, delay: 16, ticks: 240, interval: 20, zoneFx: 'Ice_Pieces', zoneFT: 6, tele: 'ice', freezeEnd: 70, overlay: 'Snow' })],
  ai: { r: [0, 300], kind: 'zone' }, desc: 'Ultimate: a blizzard zone that slows, then freezes (Mei\'s Blizzard).',
});
mv('thundershock', 'Thunder Shock', 'Electric', 'special', 'light', 32, {
  anim: 'Shoot', sfx: 'DUN_Thunder_Shock', status: { para: 0.1 }, cost: 12,
  steps: [S('proj', { speed: 6.2, range: 180, r: 7, sprite: 'Charge_Beam_Shot', spriteFT: 2 })],
  hitFx: 'Spark', ai: { r: [30, 170], kind: 'proj' }, desc: 'A quick jolt.',
});
mv('drillpeckz', 'Drill Peck', 'Flying', 'physical', 'medium', 66, {
  anim: 'Attack', sfx: 'DUN_Fury_Attack', cost: 24, cd: 33, hitFx: 'Fury_Attack',
  steps: [S('dash', { dist: 120, ticks: 12, hitR: 16, trail: 'Gust_Wind', trailGap: 3, kb: 2.6, stun: 16 })],
  ai: { r: [30, 120], kind: 'dash' }, desc: 'A spinning drill dive.',
});
mv('thunderstorm', 'Thunder Storm', 'Electric', 'special', 'ult', 64, {
  anim: 'Charge', startup: 22, sfx: 'DUN_Shock_Wave', sfxStart: 'DUN_Move_Start', status: { para: 0.3 },
  steps: [S('strikes', { n: 10, pattern: 'mixed', spread: 160, delay: 36, gap: 27, r: 28, tele: 'bolt', fall: 'Lightning_RSE', burst: 'Discharge', kb: 2.5, stun: 24, shake: 4 })],
  ai: { r: [0, 400], kind: 'area' }, desc: 'Ultimate: a 5-second thunderstorm that clusters near the foe.',
});
mv('ember', 'Ember', 'Fire', 'special', 'light', 32, {
  anim: 'Shoot', sfx: 'DUN_Ember', status: { burn: 0.1 }, cost: 11,
  steps: [S('proj', { count: 2, gap: 4, speed: 5.0, range: 180, r: 7, sprite: 'Ember', spriteFT: 2, newSetEach: true })],
  hitFx: 'Flamethrower', ai: { r: [30, 170], kind: 'proj' }, desc: 'Small flames. May burn.',
});
mv('heatwave', 'Heat Wave', 'Fire', 'special', 'heavy', 88, {
  anim: 'SpAttack', startup: 20, sfx: 'DUN_Heat_Wave', sfxStart: 'DUN_Ember_2', status: { burn: 0.2 }, cost: 34, cd: 84,
  steps: [S('cone', { range: 140, arc: 1.5, kb: 3, stun: 16, fx: 'Fire_Spin_Front', wave: 'Ember' })],
  hitFx: 'Flamethrower', ai: { r: [0, 130], kind: 'cone' }, desc: 'A scorching wind blasts a wide cone.',
});
mv('skyattack', 'Sky Attack', 'Flying', 'physical', 'sig', 125, {
  anim: 'Attack', startup: 36, windup: { t: 26, anim: 'Charge', fx: 'Sky_Attack_Charge' }, sfx: 'DUN_Sky_Attack', sfxStart: 'DUN_Luminous_Orb', status: { flinch: 0.3 },
  steps: [S('dash', { dist: 220, ticks: 16, homing: 0.04, trail: 'Sky_Attack', trailGap: 2, hitR: 18, kb: 5.5, stun: 26 })],
  hitFx: 'Slash_Blue_RSE', ai: { r: [50, 220], kind: 'dash' }, desc: 'Glows while charging, then dives (Meteor Strike).',
});
mv('superskyattack', 'Super Sky Attack', 'Flying', 'physical', 'ult', 170, {
  anim: 'Attack', startup: 20, sfx: 'DUN_Sky_Attack', sfxStart: 'DUN_Luminous_Orb',
  steps: [S('leap', { range: 400, ticks: 64, offscreen: true, track: true, landR: 54, kb: 6.5, shake: 10, landFx: 'Sky_Attack', tele: 'shadow' })],
  ai: { r: [0, 400], kind: 'leap' }, desc: 'Ultimate: vanishes offscreen, then dives where its shadow falls.',
});
mv('acrobatics', 'Acrobatics', 'Flying', 'physical', 'medium', 62, {
  anim: 'QuickStrike', sfx: 'DUN_Thief', cost: 22, cd: 27, hitFx: 'Slash_Blue_RSE',
  steps: [S('dash', { dist: 120, ticks: 9, hitR: 16, homing: 0.12, trail: 'Air_Slash_Particle', trailGap: 2, kb: 2.6, stun: 16 })],
  ai: { r: [20, 120], kind: 'dash' }, desc: 'A nimble darting strike.',
});
mv('xscissorg', 'X-Scissor', 'Bug', 'physical', 'medium', 64, {
  anim: 'Attack', sfx: 'DUN_X-Scissor', cost: 22, cd: 30, hitFx: 'X_Scissor',
  steps: [S('proj', { speed: 4.2, range: 150, r: 10, boomerang: true, sprite: 'X_Scissor', spriteFT: 2, from: 'center' })],
  ai: { r: [40, 150], kind: 'proj' }, desc: 'A crossed blade that flies out and back (Executioner).',
});
mv('acrofurry', 'Acrobatics Flurry', 'Flying', 'physical', 'ult', 62, {
  anim: 'QuickStrike', startup: 14, sfx: 'DUN_Thief',
  steps: [S('dash', { dist: 140, ticks: 9, chain: 5, homing: 0.25, hitR: 18, trail: 'Air_Slash_Particle', trailGap: 2, kb: 2.4, stun: 22, invuln: true })],
  hitFx: 'Slash_Blue_RSE', ai: { r: [0, 160], kind: 'dash' }, desc: 'Ultimate: a flurry of chained acrobatic dives.',
});
mv('sacredfire', 'Sacred Fire', 'Fire', 'physical', 'heavy', 30, {
  anim: 'Shoot', startup: 20, sfx: 'DUN_Sacred_Fire', sfxStart: 'DUN_Sacred_Fire_2', status: { burn: 0.25 }, cost: 36, cd: 90, hitFx: 'Fire_Blast',
  steps: [S('beam', { len: 190, width: 18, ticks: 42, interval: 9, ramp: 0.3, track: 0.04, beam: 'Column_Red', stream: 'Fire_Column_Ranger', streamFT: 3, streamGap: 3, streamSpeed: 5, kb: 0.6 })],
  ai: { r: [30, 180], kind: 'beam' }, desc: 'A sacred fire ray that ramps up and burns (Inferno Tower).',
});
mv('bravebirdh', 'Brave Bird', 'Flying', 'physical', 'sig', 120, {
  anim: 'Attack', startup: 22, windup: { t: 12, anim: 'Charge', fx: 'Sky_Attack_Charge' }, sfx: 'DUN_Brave_Bird', sfxStart: 'DUN_Brave_Bird_2',
  steps: [S('dash', { dist: 190, ticks: 17, trail: 'Brave_Bird', trailGap: 2, hitR: 20, kb: 5, stun: 26, recoil: 0.12 })],
  hitFx: 'Brave_Bird_Hit', ai: { r: [60, 190], kind: 'dash' }, desc: 'A reckless flaming dive. Recoil.',
});
mv('rebirth', 'Sacred Rebirth', 'Fire', 'special', 'ult', 0, {
  anim: 'Charge', startup: 24, sfx: 'DUN_Sacred_Fire_2', sfxStart: 'DUN_Healing_Wish',
  steps: [S('fn', { fn: 'rebirth' })],
  ai: { r: [0, 999], kind: 'heal' }, desc: 'Ultimate: revives a fainted teammate at 50% once per Trainer Battle; otherwise a Sacred Fire inferno.',
});
mv('sacredinferno', 'Sacred Fire Inferno', 'Fire', 'physical', 'ult', 34, {
  anim: 'Shoot', startup: 22, sfx: 'DUN_Sacred_Fire', status: { burn: 0.5 },
  steps: [S('strikes', { n: 7, pattern: 'mixed', spread: 150, delay: 30, gap: 10, r: 30, tele: 'fire', fall: 'Sacred_Fire_Pillar', burst: 'Fire_Column_Ranger', kb: 2.5, stun: 18, shake: 3 })],
  ai: { r: [0, 400], kind: 'area' }, desc: 'Ultimate: pillars of sacred fire rain down.',
});
mv('fly', 'Fly', 'Flying', 'physical', 'heavy', 96, {
  anim: 'Attack', startup: 14, sfx: 'DUN_Fly', cost: 34, cd: 84,
  steps: [S('leap', { range: 300, ticks: 48, offscreen: true, track: true, landR: 32, kb: 4.5, shake: 5, landFx: 'Wing_Attack', tele: 'shadow' })],
  hitFx: 'Wing_Attack', ai: { r: [60, 300], kind: 'leap' }, desc: 'Rises offscreen, then strikes from above (Winston\'s Leap).',
});
mv('dracometeorsig', 'Draco Meteor', 'Dragon', 'special', 'sig', 54, {
  anim: 'SpAttack', startup: 28, windup: { t: 18, anim: 'Charge', fx: 'Charge_Up' }, sfxStart: 'DUN_Move_Start', sfx: 'DUN_Draco_Meteor',
  steps: [S('strikes', { n: 3, pattern: 'mixed', spread: 70, delay: 40, gap: 10, r: 30, oneHit: true, tele: 'meteor', fall: 'Draco_Meteor_Streaks', burst: 'Draco_Meteor_Explosion', kb: 4, shake: 4 }), S('fn', { at: 1, fn: (f) => f.addBuff('spa', 0.8, 300, 'draco') })],
  ai: { r: [30, 260], kind: 'area' }, desc: 'Meteors fall on the target (Rocket). Lowers Sp. Atk briefly.',
});
mv('meteorshower', 'Meteor Shower', 'Dragon', 'special', 'ult', 60, {
  anim: 'SpAttack', startup: 24, windup: { t: 16, anim: 'Charge', fx: 'Charge_Up' }, sfx: 'DUN_Draco_Meteor',
  steps: [S('strikes', { n: 12, pattern: 'random', spread: 400, delay: 40, gap: 9, r: 32, tele: 'meteor', fall: 'Draco_Meteor_Streaks', burst: 'Draco_Meteor_Explosion', kb: 3.5, shake: 4 })],
  ai: { r: [0, 400], kind: 'area' }, desc: 'Ultimate: a Draco Meteor shower over the whole arena.',
});
mv('dragonbreath', 'Dragon Breath', 'Dragon', 'special', 'light', 30, {
  anim: 'Shoot', sfx: 'DUN_Flamethrower', status: { para: 0.15 }, cost: 13,
  steps: [S('beam', { len: 90, width: 14, ticks: 18, interval: 9, stream: 'Flamethrower_2|Dragon', streamFT: 2, streamGap: 2, streamSpeed: 4.5, kb: 0.8 })],
  hitFx: 'Flamethrower|Dragon', ai: { r: [10, 85], kind: 'beam' }, desc: 'A short draconic breath. May paralyze.',
});
mv('dragonpulse', 'Dragon Pulse', 'Dragon', 'special', 'medium', 68, {
  anim: 'SpAttack', sfx: 'DUN_Dragon_Pulse', sfxStart: '_UNK_DUN_Mecha', cost: 24, cd: 30,
  steps: [S('proj', { speed: 4.8, range: 230, r: 11, sprite: 'Dragon_Pulse_Ball', spriteFT: 3, castFx: 'Dragon_Pulse_Charge', trail: 'Dragon_Pulse_Particle_Purple', trailGap: 4 })],
  hitFx: 'Circle_Purple_Out', ai: { r: [40, 220], kind: 'proj' }, desc: 'A shock wave of draconic energy.',
});
mv('lusterpurge', 'Luster Purge', 'Psychic', 'special', 'sig', 118, {
  anim: 'SpAttack', startup: 28, windup: { t: 16, anim: 'Charge', fx: 'Psycho_Shift_Charge' }, sfx: 'DUN_Psycho_Boost', sfxStart: 'DUN_Light_Screen',
  steps: [S('beam', { len: 300, width: 14, ticks: 18, interval: 18, beam: 'Beam', pierceWalls: true, kb: 3.5, stun: 22 })],
  hitFx: 'Psycho_Shift_Hit', ai: { r: [40, 290], kind: 'beam' }, desc: 'A piercing beam of light (Magic Archer).',
});
mv('giantpurge', 'Giant Luster Purge', 'Psychic', 'special', 'ult', 190, {
  anim: 'SpAttack', startup: 30, windup: { t: 20, anim: 'Charge', fx: 'Psycho_Shift_Charge' }, sfx: 'DUN_Psycho_Boost',
  steps: [S('beam', { len: 400, width: 34, ticks: 24, interval: 24, beam: 'Beam_2', pierceWalls: true, kb: 6, stun: 30 })],
  hitFx: 'Psycho_Shift_Hit', ai: { r: [30, 390], kind: 'beam' }, desc: 'Ultimate: Mega Latios\'s giant Luster Purge.',
});
mv('mistball', 'Mist Ball', 'Psychic', 'special', 'medium', 64, {
  anim: 'SpAttack', sfx: 'DUN_Light_Screen', cost: 24, cd: 36,
  steps: [S('proj', { speed: 4.0, range: 220, r: 10, sprite: 'Mist_Ball', spriteFT: 3, trail: 'Smoke_White', trailGap: 5, onEnd: 'mistcloud' })],
  hitFx: 'Smoke_White', ai: { r: [40, 210], kind: 'proj' }, desc: 'A mist orb that bursts into a blinding cloud hiding Latias.',
});
mv('giantmistball', 'Giant Mist Ball', 'Psychic', 'special', 'ult', 170, {
  anim: 'SpAttack', startup: 28, windup: { t: 18, anim: 'Charge', fx: 'Mist_Ball' }, sfx: 'DUN_Light_Screen',
  steps: [S('proj', { speed: 3.4, range: 320, r: 24, homing: 0.03, sprite: 'Mist_Ball@3x', giant: true, spriteFT: 3, trail: 'Smoke_White', trailGap: 3, kb: 6, stun: 30, onEnd: 'mistcloud' })],
  hitFx: 'Smoke_White', ai: { r: [30, 300], kind: 'proj' }, desc: 'Ultimate: Mega Latias\'s giant Mist Ball.',
});
mv('twister', 'Twister', 'Dragon', 'special', 'medium', 44, {
  anim: 'Shoot', sfx: 'DUN_Twister', status: { flinch: 0.2 }, cost: 24, cd: 36,
  steps: [S('area', { where: 'target', r: 44, delay: 10, ticks: 110, interval: 22, pull: 0.45, zoneFx: 'Gust_Purple', zoneFT: 1, tele: 'dragon' })],
  ai: { r: [30, 230], kind: 'zone' }, desc: 'A twister that pulls the foe in (Tornado).',
});
mv('extremespeedr', 'Extreme Speed', 'Normal', 'physical', 'medium', 60, {
  anim: 'Attack', startup: 8, sfx: 'DUN_Fury_Attack', cost: 24, cd: 36,
  steps: [S('dash', { dist: 170, ticks: 8, hitR: 18, trail: 'Wood_Hammer_Smoke', trailGap: 2, kb: 3, stun: 18, invuln: true })],
  hitFx: 'Hit_Neutral', ai: { r: [40, 170], kind: 'dash' }, desc: 'A blinding lunge across the sky.',
});
mv('dragonascent', 'Dragon Ascent', 'Flying', 'physical', 'sig', 125, {
  anim: 'Attack', startup: 16, sfx: 'DUN_Brave_Bird', sfxStart: 'DUN_Brave_Bird_2',
  steps: [S('leap', { range: 300, ticks: 54, offscreen: true, track: true, landR: 40, kb: 5.5, shake: 7, landFx: 'Brave_Bird_Hit|Dragon', tele: 'shadow' }), S('fn', { at: 1, fn: (f) => f.addBuff('def', 0.85, 240, 'dasc') })],
  hitFx: 'Brave_Bird_Hit|Dragon', ai: { r: [60, 300], kind: 'leap' }, desc: 'Rockets offscreen, then crashes down where you aim (Meteor Strike).',
});
mv('dragonascentmax', 'Dragon Ascent: Full Power', 'Flying', 'physical', 'ult', 200, {
  anim: 'Attack', startup: 16, sfx: 'DUN_Brave_Bird',
  steps: [S('leap', { range: 400, ticks: 60, offscreen: true, track: true, landR: 70, kb: 8, shake: 12, landFx: 'Draco_Meteor_Explosion', tele: 'shadow' })],
  ai: { r: [0, 400], kind: 'leap' }, desc: 'Ultimate: Mega Rayquaza\'s Dragon Ascent at full power.',
});
mv('psyshock', 'Psyshock', 'Psychic', 'special', 'light', 32, {
  anim: 'Shoot', sfx: 'DUN_Aura_Sphere', cost: 12, hitFx: 'Circle_Small_Purple_Out',
  steps: [S('proj', { count: 2, spread: 0.18, speed: 5.0, range: 200, r: 7, sprite: 'Magnet_Bomb|Psychic', spriteFT: 2, newSetEach: true })],
  ai: { r: [30, 190], kind: 'proj' }, desc: 'Twin psychic shards that strike physically.',
});
mv('psychoboost', 'Psycho Boost', 'Psychic', 'special', 'sig', 130, {
  anim: 'SpAttack', startup: 30, windup: { t: 18, anim: 'Charge', fx: 'Psycho_Boost_Back' }, sfx: 'DUN_Psycho_Boost', sfxStart: 'DUN_Blowback_Orb',
  steps: [S('beam', { len: 280, width: 16, ticks: 20, interval: 20, beam: 'Beam_Pink', kb: 4, stun: 24 }), S('fn', { at: 1, fn: (f) => f.addBuff('spa', 0.8, 360, 'pboost') })],
  hitFx: 'Psycho_Boost_Front', ai: { r: [40, 270], kind: 'beam' }, desc: 'A laser of pure psychic power (Void). Lowers Sp. Atk briefly.',
});
mv('psychoboostmax', 'Psycho Boost Max', 'Psychic', 'special', 'ult', 180, {
  anim: 'SpAttack', startup: 30, windup: { t: 20, anim: 'Charge', fx: 'Psycho_Boost_Back' }, sfx: 'DUN_Psycho_Boost',
  steps: [S('fn', { fn: 'formeboost' })],
  hitFx: 'Psycho_Boost_Front', ai: { r: [30, 300], kind: 'beam' }, desc: 'Ultimate: a maximum-power Psycho Boost shaped by the current forme.',
});
mv('wingattack', 'Wing Attack', 'Flying', 'physical', 'medium', 60, {
  anim: 'Attack', sfx: 'DUN_Wing_Attack_2', cost: 20, cd: 24, hitFx: 'Wing_Attack',
  steps: [S('melee', { range: 34, arc: 2.6, lunge: 14, kb: 2.6, stun: 15, swipe: 'Air_Slash_Slash' })],
  ai: { r: [0, 44], kind: 'melee' }, desc: 'A wide wing strike.',
});
mv('bravebirdstar', 'Brave Bird', 'Flying', 'physical', 'sig', 125, {
  anim: 'Attack', startup: 20, windup: { t: 10, anim: 'Charge', fx: 'Sky_Attack_Charge' }, sfx: 'DUN_Brave_Bird', sfxStart: 'DUN_Brave_Bird_2',
  steps: [S('dash', { dist: 200, ticks: 15, trail: 'Brave_Bird', trailGap: 2, hitR: 17, kb: 5, stun: 26, recoil: 0.15 })],
  hitFx: 'Brave_Bird_Hit', ai: { r: [60, 200], kind: 'dash' }, desc: 'A reckless dive with recoil (Meteor Strike).',
});
mv('bbbarrage', 'Brave Bird Barrage', 'Flying', 'physical', 'ult', 80, {
  anim: 'Attack', startup: 16, sfx: 'DUN_Brave_Bird',
  steps: [S('dash', { dist: 190, ticks: 14, chain: 3, homing: 0.1, trail: 'Brave_Bird', trailGap: 2, hitR: 18, kb: 4, stun: 24, invuln: true })],
  hitFx: 'Brave_Bird_Hit', ai: { r: [0, 200], kind: 'dash' }, desc: 'Ultimate: three Brave Bird dives in a row.',
});
mv('karatechop', 'Karate Chop', 'Fighting', 'physical', 'light', 36, {
  anim: 'Strike', sfx: 'DUN_Karate_Chop', cost: 11, crit: 0.2, hitFx: 'Print_Hand',
  steps: [S('melee', { range: 26, arc: 1.8, lunge: 12, kb: 1.8, stun: 13 })],
  ai: { r: [0, 36], kind: 'melee' }, desc: 'A chop with a high critical rate.',
});
mv('skydrop', 'Sky Drop', 'Flying', 'physical', 'heavy', 74, {
  anim: 'Attack', sfx: 'DUN_Deep_Fall', sfxStart: 'DUN_Thief', cost: 30, cd: 72,
  steps: [S('grab', { range: 34, lift: 40, slamPower: 74, lunge: 18 })],
  hitFx: 'Rock_Smash', ai: { r: [0, 40], kind: 'grab' }, desc: 'Grabs the foe, carries it up and slams it down. Ignores barriers.',
});
mv('hjkh', 'High Jump Kick', 'Fighting', 'physical', 'heavy', 110, {
  anim: 'Kick', startup: 20, sfx: 'DUN_Punch', sfxStart: '_UNK_DUN_Whip', cost: 36, cd: 84, hitFx: 'Print_Foot',
  steps: [S('leap', { range: 130, ticks: 22, apex: 34, track: true, landR: 22, kb: 4.5, shake: 4, missRecoil: 0.14, landFx: 'Rock_Smash' })],
  ai: { r: [40, 130], kind: 'leap' }, desc: 'A soaring knee. Missing hurts the user.',
});
mv('flyingpress', 'Flying Press', 'Fighting', 'physical', 'sig', 112, {
  anim: 'Hop', startup: 18, sfx: 'DUN_Assurance', dual: 'Flying',
  steps: [S('leap', { range: 170, ticks: 34, apex: 56, track: true, landR: 44, kb: 5, shake: 7, landFx: 'Wood_Hammer_Smoke' })],
  hitFx: 'Wood_Hammer_Smoke', ai: { r: [30, 170], kind: 'leap' }, desc: 'A body splash with a landing shockwave; Fighting and Flying at once.',
});
mv('toprope', 'Top-Rope Flying Press', 'Fighting', 'physical', 'ult', 190, {
  anim: 'Hop', startup: 18, sfx: 'DUN_Assurance', dual: 'Flying',
  steps: [S('leap', { range: 400, ticks: 62, offscreen: true, track: true, landR: 70, kb: 7, shake: 12, landFx: 'Hammer_Arm_Smoke', tele: 'shadow', crowdPop: true })],
  ai: { r: [0, 400], kind: 'leap' }, desc: 'Ultimate: a Flying Press from the top rope, offscreen — the crowd goes wild.',
});

// ============================================================================================== WATER
mv('waterspout', 'Water Spout', 'Water', 'special', 'heavy', 34, {
  anim: 'Shoot', startup: 20, sfx: 'DUN_Water_Spout', sfxStart: 'DUN_Water_Spout_2', cost: 36, cd: 90,
  steps: [S('fxonly', { fx: 'Water_Spout_Up' }), S('strikes', { n: 4, pattern: 'mixed', spread: 90, delay: 30, gap: 7, r: 26, tele: 'water', fall: 'Water_Spout_Drop', burst: 'Water_Column_Ranger', kb: 3, hpScale: true, oneHit: false })],
  ai: { r: [30, 260], kind: 'area' }, desc: 'Water bursts rain down — stronger at high HP.',
});
mv('originpulse', 'Origin Pulse', 'Water', 'special', 'sig', 105, {
  anim: 'Shoot', startup: 26, windup: { t: 14, anim: 'Charge', fx: 'Wave_Circle_Blue' }, sfx: 'DUN_Hydro_Pump',
  steps: [S('beam', { side: -1, len: 230, width: 12, ticks: 20, interval: 20, beam: 'Column_Blue', kb: 3, stun: 18 }), S('beam', { len: 250, width: 14, ticks: 20, interval: 20, beam: 'Column_Blue', kb: 3, stun: 18 }), S('beam', { side: 1, len: 230, width: 12, ticks: 20, interval: 20, beam: 'Column_Blue', kb: 3, stun: 18 })],
  hitFx: 'Hydro_Cannon', ai: { r: [30, 220], kind: 'beam' }, desc: 'Three glowing water beams fan out from Kyogre.',
});
mv('primalrain', 'Primal Downpour', 'Water', 'special', 'ult', 60, {
  anim: 'Shoot', startup: 24, sfx: 'DUN_Hydro_Pump', sfxStart: 'DUN_Move_Start',
  steps: [S('fn', { fn: 'rainfield' }), S('strikes', { n: 6, pattern: 'mixed', spread: 160, delay: 36, gap: 10, r: 30, tele: 'water', fall: 'Water_Spout_Drop', burst: 'Water_Column_Ranger', kb: 3.5, stun: 18 })],
  ai: { r: [0, 400], kind: 'area' }, desc: 'Ultimate: Primal Kyogre summons a heavy rain field that boosts Water moves.',
});
mv('aquatail', 'Aqua Tail', 'Water', 'physical', 'medium', 70, {
  anim: 'Swing', startup: 16, sfx: 'DUN_Aqua_Tail_3', sfxStart: 'DUN_Aqua_Tail_2', cost: 24, cd: 30, hitFx: 'Aqua_Tail_Splash',
  steps: [S('melee', { range: 46, arc: 4.6, kb: 4, stun: 18, swipe: 'Aqua_Tail_Wave' })],
  ai: { r: [0, 50], kind: 'melee' }, desc: 'Whips the whole body around in a wide arc.',
});
mv('waterfall', 'Waterfall', 'Water', 'physical', 'heavy', 92, {
  anim: 'RearUp', startup: 18, sfx: 'DUN_Waterfall', cost: 34, cd: 78, status: { flinch: 0.3 },
  steps: [S('dash', { dist: 120, ticks: 12, hitR: 20, trail: 'Water_Column_Ranger', trailGap: 3, kb: 4, stun: 22, launch: 30 })],
  hitFx: 'Aqua_Tail_Splash', ai: { r: [20, 120], kind: 'dash' }, desc: 'A rising rush up a column of water.',
});
mv('thrash', 'Thrash', 'Normal', 'physical', 'ult', 46, {
  anim: 'Attack', startup: 14, sfx: 'DUN_Rage',
  steps: [S('fn', { fn: 'thrash' })],
  hitFx: 'Hit_Neutral', preload: ['Rage', 'Puff_White'], ai: { r: [0, 200], kind: 'dash' }, desc: 'Ultimate: a 4-second unstoppable rampage that ends in confusion.',
});
mv('iceshard', 'Ice Shard', 'Ice', 'physical', 'light', 32, {
  anim: 'Shoot', startup: 9, sfx: 'DUN_Ice_Shard', cost: 11,
  steps: [S('proj', { speed: 6.4, range: 190, r: 7, sprite: 'Ice_Shard', spriteFT: 3 })],
  hitFx: 'Ice_Shard_Hit', ai: { r: [30, 180], kind: 'proj' }, desc: 'A swift shard of ice.',
});
mv('mistbubble', 'Mist', 'Ice', 'status', 'medium', 0, {
  anim: 'Charge', startup: 6, sfx: 'DUN_Pokemon_Trap', cost: 22, cd: 240,
  steps: [S('barrier', { kind: 'absorb', ticks: 120, r: 36, barrierFx: 'Smoke_White' })],
  ai: { r: [0, 999], kind: 'absorb' }, desc: 'A mist bubble absorbs incoming projectiles for 2 s (Defense Matrix).',
});
mv('bodyslam', 'Body Slam', 'Normal', 'physical', 'heavy', 92, {
  anim: 'Attack', startup: 18, sfx: 'EVT_Tackle', sfxStart: '_UNK_DUN_Whip', status: { para: 0.3 }, cost: 32, cd: 72,
  steps: [S('dash', { dist: 110, ticks: 14, hitR: 22, trail: 'Puff_White', trailGap: 3, kb: 5, stun: 22 })],
  hitFx: 'Hit_Neutral', ai: { r: [20, 110], kind: 'dash' }, desc: 'Slams the full body down. May paralyze.',
});
mv('sheercold', 'Sheer Cold', 'Ice', 'special', 'ult', 120, {
  anim: 'Charge', startup: 24, sfx: '_UNK_EVT_036', status: { freeze: { chance: 1, ticks: 90 } },
  steps: [S('fn', { fn: 'sheercold' })],
  hitFx: 'Ice_Shard_Hit', ai: { r: [0, 200], kind: 'area' }, desc: 'Ultimate: a slowly expanding ring that freezes for 1.5 s.',
});
mv('aeroblast', 'Aeroblast', 'Flying', 'special', 'sig', 110, {
  anim: 'Shoot', startup: 26, windup: { t: 14, anim: 'Charge', fx: 'Gust_Wind' }, sfx: 'DUN_Dragon_Rush', crit: 0.5,
  steps: [S('beam', { len: 260, width: 16, ticks: 22, interval: 22, beam: 'Column_White', stream: 'Gust_Wind', streamFT: 1, streamGap: 3, streamSpeed: 8, kb: 4.5, stun: 22 })],
  hitFx: 'Gust_Wind', ai: { r: [40, 250], kind: 'beam' }, desc: 'A vortex beam with a high critical-hit chance.',
});
mv('aerostorm', 'Aeroblast Storm', 'Flying', 'special', 'ult', 60, {
  anim: 'Shoot', startup: 24, windup: { t: 16, anim: 'Charge', fx: 'Gust_Wind' }, sfx: 'DUN_Dragon_Rush', crit: 0.4,
  steps: [S('beam', { len: 300, width: 16, ticks: 60, interval: 10, sweep: 0.012, beam: 'Column_White', stream: 'Gust_Wind', streamFT: 1, streamGap: 3, kb: 1.8, side: -0.5 }), S('beam', { len: 300, width: 16, ticks: 60, interval: 10, sweep: -0.012, beam: 'Column_White', kb: 1.8, side: 0.5, newSet: true }), S('beam', { len: 300, width: 16, ticks: 60, interval: 10, beam: 'Column_White', kb: 1.8, newSet: true })],
  hitFx: 'Gust_Wind', ai: { r: [30, 290], kind: 'beam' }, desc: 'Ultimate: three sweeping Aeroblast beams.',
});
mv('lightscreen', 'Light Screen', 'Psychic', 'status', 'medium', 0, {
  anim: 'Charge', startup: 4, sfx: 'DUN_Light_Screen_2', cost: 22, cd: 180,
  steps: [S('barrier', { kind: 'reflect', ticks: 90, barrierFx: 'Screen_RSE_Yellow' })],
  ai: { r: [0, 999], kind: 'reflect' }, desc: 'A shimmering screen reflects special projectiles (Mirror Coat role).',
});
mv('pumpvortex', 'Hydro Pump Vortex', 'Water', 'special', 'ult', 30, {
  anim: 'Rotate', startup: 20, sfx: 'DUN_Hydro_Pump',
  steps: [S('fn', { fn: 'vortex' })],
  hitFx: 'Hydro_Cannon', ai: { r: [0, 200], kind: 'area' }, desc: 'Ultimate: spinning water jets in every direction.',
});
mv('aquaring', 'Aqua Ring', 'Water', 'special', 'medium', 22, {
  anim: 'Charge', startup: 12, sfx: 'DUN_Aqua_Ring', cost: 24, cd: 600,
  steps: [S('area', { where: 'self', follow: true, r: 46, ticks: 300, interval: 30, heal: 0.02, zoneFx: 'Aqua_Ring', zoneFT: 2, kb: 1.5, stun: 6 })],
  ai: { r: [0, 999], kind: 'heal' }, desc: 'A veil of water heals over time and splashes nearby foes.',
});
mv('hypnosis', 'Hypnosis', 'Psychic', 'status', 'medium', 0, {
  anim: 'Shoot', startup: 16, sfx: 'DUN_Psybeam', cost: 26, cd: 420, status: { sleep: { chance: 1, ticks: 66 } },
  steps: [S('proj', { count: 1, speed: 3.6, range: 200, r: 12, sprite: 'Wave_Circle_Purple', spriteFT: 3, reflectable: true })],
  hitFx: 'Psych_Up|Psychic', ai: { r: [30, 190], kind: 'proj' }, desc: 'Hypnotic waves put the foe to sleep briefly.',
});
mv('coilm', 'Coil', 'Poison', 'status', 'medium', 30, {
  anim: 'Charge', startup: 10, sfx: 'DUN_Conversion2', cost: 22, cd: 480,
  steps: [S('buff', { stats: { atk: 1.2, def: 1.25, spa: 1.2 }, ticks: 300, fx: 'Wrap_White_Front', fxFollow: true }), S('area', { where: 'self', r: 40, burst: 'Wrap_White_Back', kb: 2, stun: 14, type: 'Water' })],
  ai: { r: [0, 999], kind: 'buff' }, desc: 'Coils tightly: stats up, and nearby foes are squeezed.',
});
mv('hydropumpm', 'Hydro Pump', 'Water', 'special', 'heavy', 104, {
  anim: 'Shoot', startup: 18, sfx: 'DUN_Hydro_Pump', cost: 34, cd: 84, hitFx: 'Hydro_Cannon',
  steps: [S('beam', { len: 220, width: 14, ticks: 30, interval: 10, beam: 'Column_Blue', stream: 'Water_Spout_Drop', streamFT: 3, streamGap: 2, streamSpeed: 7, track: 0.025, kb: 2.2 })],
  ai: { r: [30, 210], kind: 'beam' }, desc: 'A high-pressure water jet.',
});
mv('raindancefield', 'Rain Dance', 'Water', 'status', 'ult', 0, {
  anim: 'Rotate', startup: 20, sfx: 'DUN_Move_Start',
  steps: [S('fn', { fn: 'rainfield' }), S('buff', { regen: 0.04, ticks: 360, shield: 0.25, fx: 'Aqua_Ring', fxFollow: true })],
  ai: { r: [0, 999], kind: 'heal' }, desc: 'Ultimate: a rain field heals Milotic and grants an HP shield (Sound Barrier).',
});
mv('metalclaw', 'Metal Claw', 'Steel', 'physical', 'light', 38, {
  anim: 'Attack', sfx: 'DUN_Fury_Cutter', cost: 12, hitFx: 'Metal_Claw',
  steps: [S('melee', { range: 28, arc: 1.9, lunge: 12, kb: 1.8, stun: 13, swipe: 'Metal_Claw' })],
  ai: { r: [0, 38], kind: 'melee' }, desc: 'Steel claws rake the foe.',
});
mv('aquajet', 'Aqua Jet', 'Water', 'physical', 'medium', 56, {
  anim: 'Attack', startup: 8, sfx: 'DUN_Aqua_Tail', cost: 22, cd: 24, hitFx: 'Aqua_Tail_Splash',
  steps: [S('dash', { dist: 140, ticks: 9, hitR: 16, trail: 'Bubbles_Blue', trailGap: 2, invuln: true, kb: 2.6, stun: 15 })],
  ai: { r: [30, 140], kind: 'dash' }, desc: 'A jet-propelled dash, invulnerable while dashing (Bandit).',
});
mv('drillpecke', 'Drill Peck', 'Flying', 'physical', 'heavy', 22, {
  anim: 'Attack', startup: 14, sfx: 'DUN_Fury_Attack', cost: 32, cd: 72, hitFx: 'Fury_Attack',
  steps: [S('melee', { range: 30, arc: 1.6, hits: 6, interval: 6, lunge: 18, kb: 1.2, stun: 10, rampHits: 0.25 })],
  ai: { r: [0, 40], kind: 'melee' }, desc: 'A drilling beak that hits harder the longer it drills (Mighty Miner).',
});

// ---------------------------------------------------------------------------------------------- forme-specific
// Deoxys's Ultimate is shaped by its current forme (see sim 'formeboost').
mv('pb_normal', 'Psycho Boost Max', 'Psychic', 'special', 'ult', 190, { anim: 'SpAttack', steps: [S('beam', { len: 320, width: 26, ticks: 24, interval: 24, beam: 'Beam_Pink', kb: 6, stun: 30 })], hitFx: 'Psycho_Boost_Front' });
mv('pb_attack', 'Psycho Boost Max', 'Psychic', 'special', 'ult', 240, { anim: 'SpAttack', steps: [S('beam', { len: 360, width: 34, ticks: 24, interval: 24, beam: 'Beam_2|Psychic', kb: 8, stun: 30 })], hitFx: 'Psycho_Boost_Front' });
mv('pb_defense', 'Psycho Boost Max', 'Psychic', 'special', 'ult', 120, { anim: 'SpAttack', steps: [S('area', { where: 'self', r: 90, burst: 'Psycho_Boost_Front', kb: 6, kbOut: true, shake: 6 }), S('buff', { shield: 0.3, ticks: 300 })], hitFx: 'Psycho_Boost_Front' });
mv('pb_speed', 'Psycho Boost Max', 'Psychic', 'special', 'ult', 64, { anim: 'SpAttack', steps: [S('proj', { count: 3, gap: 10, speed: 7, range: 320, r: 12, homing: 0.1, sprite: 'Focus_Blast_Ball|Psychic', spriteFT: 2, newSetEach: true, kb: 3, stun: 18 })], hitFx: 'Psycho_Boost_Front' });

// Validation helper used by tools and tests.
export function moveFxNames(m) {
  const out = new Set();
  const add = (n) => { if (n && typeof n === 'string') out.add(n); };
  add(m.hitFx); if (m.windup) add(m.windup.fx); if (m.preload) m.preload.forEach(add);
  for (const s of m.steps) {
    for (const k of ['fx', 'hitFx', 'sprite', 'trail', 'castFx', 'zoneFx', 'zoneFx2', 'ringFx', 'burst', 'fall', 'swipe', 'stream', 'landFx', 'blinkFx', 'barrierFx', 'wave']) add(s[k]);
    if (s.lob) add(s.lob.burst);
    if (s.finisher) add(s.finisher.burst);
  }
  return [...out];
}
export function moveBeamNames(m) { return m.steps.filter((s) => s.beam).map((s) => s.beam); }
