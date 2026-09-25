export const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start'];
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'a', Z: 'a', x: 'b', X: 'b', Enter: 'start', ' ': 'a', Escape: 'b' };

export class ButtonState {
  constructor() { this.down = new Set(); this.pressed = new Set(); this.order = []; }
  set(btn, isDown) {
    if (isDown && !this.down.has(btn)) { this.down.add(btn); this.pressed.add(btn); this.order.push(btn); }
    if (!isDown) { this.down.delete(btn); this.order = this.order.filter(b => b !== btn); }
  }
  isDown(btn) { return this.down.has(btn); }
  justPressed(btn) { return this.pressed.has(btn); }
  direction() { for (let i = this.order.length - 1; i >= 0; i--) if (['up', 'down', 'left', 'right'].includes(this.order[i])) return this.order[i]; return null; }
  endFrame() { this.pressed.clear(); }
}

/** Wires keyboard + [data-btn] elements to a ButtonState. onAnyPress fires once for audio unlock. */
export function attachInput(root, state, { onAnyPress } = {}) {
  let first = true; const fire = () => { if (first) { first = false; onAnyPress?.(); } };
  window.addEventListener('keydown', e => { const b = KEYMAP[e.key]; if (b) { e.preventDefault(); if (!e.repeat) state.set(b, true); fire(); } });
  window.addEventListener('keyup', e => { const b = KEYMAP[e.key]; if (b) state.set(b, false); });
  for (const el of root.querySelectorAll('[data-btn]')) {
    const b = el.dataset.btn;
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); state.set(b, true); el.classList.add('held'); fire(); });
    const up = () => { state.set(b, false); el.classList.remove('held'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  window.addEventListener('blur', () => { for (const b of BUTTONS) state.set(b, false); });
}
