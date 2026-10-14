// Registers all content into the shared CONTENT registry.
import { CONTENT, prepSprite } from '../game/content.js';
import { SPECIES, ROSTER } from './species.js';
import { MOVES } from './moves.js';
import { TRAINERS } from './trainers.js';
import { MAPS } from './maps.js';

export function registerContent() {
  Object.assign(CONTENT.species, SPECIES);
  Object.assign(CONTENT.moves, MOVES);
  Object.assign(CONTENT.trainers, TRAINERS);
  Object.assign(CONTENT.maps, MAPS);
  CONTENT.roster = ROSTER;
  return CONTENT;
}
export function addSpriteMeta(id, meta) { CONTENT.sprites[id] = prepSprite(meta); }
// every sprite id a species can need (base, mega, formes)
export function spriteIdsFor(speciesId) {
  const s = SPECIES[speciesId], out = [s.sprite];
  if (s.mega) out.push(s.mega.sprite);
  if (s.formes) for (const f of Object.values(s.formes)) out.push(f.sprite);
  return out;
}
export { SPECIES, ROSTER, MOVES, TRAINERS, MAPS };
