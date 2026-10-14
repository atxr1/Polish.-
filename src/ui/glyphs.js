// PlayStation (PSP-style) button glyphs as inline SVG. Used on touch buttons, prompts, menus and guides.
// Never show typed stand-ins like "[ ]" or "X" for buttons.
const FACE = {
  triangle: { col: '#3ddc97', path: '<path d="M16 8.6 L23.2 21 H8.8 Z" fill="none" stroke="COL" stroke-width="2.4" stroke-linejoin="round"/>' },
  circle: { col: '#ff5a6a', path: '<circle cx="16" cy="16" r="6.6" fill="none" stroke="COL" stroke-width="2.4"/>' },
  cross: { col: '#6ea8ff', path: '<path d="M10.6 10.6 L21.4 21.4 M21.4 10.6 L10.6 21.4" stroke="COL" stroke-width="2.6" stroke-linecap="round"/>' },
  square: { col: '#ff7ad9', path: '<rect x="10" y="10" width="12" height="12" rx="0.8" fill="none" stroke="COL" stroke-width="2.4"/>' },
};
const rim = (id) => `<defs><radialGradient id="g${id}" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#4a4a5c"/><stop offset="0.7" stop-color="#1c1c26"/><stop offset="1" stop-color="#0d0d14"/></radialGradient></defs>`;
let uid = 0;
export function face(name, size = 28) {
  const f = FACE[name]; const id = 'pb' + (uid++);
  return `<svg class="glyph glyph-${name}" width="${size}" height="${size}" viewBox="0 0 32 32" aria-label="${name}" role="img">${rim(id)}<circle cx="16" cy="16" r="14.5" fill="url(#g${id})" stroke="#5c5c70" stroke-width="1.2"/><circle cx="16" cy="16" r="13" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1"/>${f.path.replace(/COL/g, f.col)}</svg>`;
}
export function shoulder(letter, size = 28) {
  const w = size * 1.6, id = 'pb' + (uid++);
  return `<svg class="glyph glyph-${letter}" width="${w}" height="${size}" viewBox="0 0 52 32" aria-label="${letter} button" role="img"><defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55556a"/><stop offset="1" stop-color="#16161f"/></linearGradient></defs><path d="M6 27 Q4 27 4 24 V12 Q4 5 12 5 H40 Q48 5 48 12 V24 Q48 27 46 27 Z" fill="url(#g${id})" stroke="#6a6a80" stroke-width="1.2"/><text x="26" y="22" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="17" fill="#e8e8f0">${letter}</text></svg>`;
}
export function pill(label, size = 22) {
  const w = size * 2.9;
  return `<svg class="glyph glyph-pill" width="${w}" height="${size}" viewBox="0 0 64 22" aria-label="${label}" role="img"><rect x="1" y="3" width="62" height="16" rx="8" fill="#22222e" stroke="#6a6a80" stroke-width="1.2"/><text x="32" y="15.2" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="11" letter-spacing=".6" fill="#e8e8f0">${label}</text></svg>`;
}
export function dpad(dir = null, size = 28) {
  const hi = (d) => (dir === d ? '#ffd25a' : '#2a2a38');
  return `<svg class="glyph glyph-dpad" width="${size}" height="${size}" viewBox="0 0 32 32" aria-label="directional pad${dir ? ' ' + dir : ''}" role="img"><path d="M12 2 H20 V12 H30 V20 H20 V30 H12 V20 H2 V12 H12 Z" fill="#1b1b25" stroke="#6a6a80" stroke-width="1.2" stroke-linejoin="round"/><path d="M16 4.5 L19 9 H13 Z" fill="${hi('up')}"/><path d="M16 27.5 L19 23 H13 Z" fill="${hi('down')}"/><path d="M4.5 16 L9 13 V19 Z" fill="${hi('left')}"/><path d="M27.5 16 L23 13 V19 Z" fill="${hi('right')}"/></svg>`;
}
export function nub(size = 28) {
  const id = 'pb' + (uid++);
  return `<svg class="glyph glyph-nub" width="${size}" height="${size}" viewBox="0 0 32 32" aria-label="analog nub" role="img"><defs><radialGradient id="g${id}" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#7a7a8e"/><stop offset="1" stop-color="#22222c"/></radialGradient></defs><circle cx="16" cy="16" r="14" fill="#15151d" stroke="#5c5c70"/><circle cx="16" cy="16" r="9.5" fill="url(#g${id})"/><circle cx="16" cy="16" r="9.5" fill="none" stroke="#000" stroke-opacity=".4"/></svg>`;
}
// glyph for a logical button id
export function glyph(id, size) {
  switch (id) {
    case 'cross': case 'circle': case 'square': case 'triangle': return face(id, size);
    case 'L': case 'R': return shoulder(id, size);
    case 'start': return pill('START', size ? size * 0.8 : 22);
    case 'select': return pill('SELECT', size ? size * 0.8 : 22);
    case 'up': case 'down': case 'left': case 'right': return dpad(id, size);
    case 'dpad': return dpad(null, size);
    case 'stick': return nub(size);
    default: return '';
  }
}
// "✕ Confirm  ○ Back" style prompt row
export function prompt(pairs, size = 22) {
  // ○ / ✕ prompts are also tap targets (touch has no physical buttons): ○ goes back, ✕ confirms the focused item
  return `<span class="prompt">${pairs.map(([g, label]) => `<span class="prompt-item${g === 'circle' || g === 'cross' ? ' tap' : ''}" data-g="${g}"${g === 'circle' || g === 'cross' ? ' role="button" tabindex="-1"' : ''}>${glyph(g, size)}<span>${label}</span></span>`).join('')}</span>`;
}
// face-button -> move slot mapping (✕ first move, □ second, △ third, ○ fourth)
export const SLOT_BUTTON = ['cross', 'square', 'triangle', 'circle'];
