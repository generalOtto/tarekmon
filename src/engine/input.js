export const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'start'];
const DIRS = ['up', 'down', 'left', 'right'];
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'a', Z: 'a', x: 'b', X: 'b', Enter: 'start', ' ': 'a', Escape: 'b', '1': 'debug1' };

/**
 * Tracks per-button down/pressed state.
 *
 * `justPressed(btn)` is a one-tick edge: true only for the tick(s) between the
 * `set(btn, true)` that pressed it and the next `endFrame()` call, which clears
 * it. Since `endFrame()` runs at the end of every tick (see main.js), and a
 * render/`draw()` always happens after all ticks for that frame, scenes must
 * read `justPressed` inside `update()` — reading it in `draw()` will see it
 * already cleared. Capture what you need into scene state during `update()`
 * if `draw()` needs to react to it.
 */
export class ButtonState {
  constructor() { this.down = new Set(); this.pressed = new Set(); this.order = []; }
  set(btn, isDown) {
    if (isDown && !this.down.has(btn)) { this.down.add(btn); this.pressed.add(btn); this.order.push(btn); }
    if (!isDown) { this.down.delete(btn); this.order = this.order.filter(b => b !== btn); }
  }
  isDown(btn) { return this.down.has(btn); }
  justPressed(btn) { return this.pressed.has(btn); }
  direction() { for (let i = this.order.length - 1; i >= 0; i--) if (DIRS.includes(this.order[i])) return this.order[i]; return null; }
  /** Held direction first; justPressed catches a tap released before this tick ran. */
  pressedDirection() { return this.direction() ?? DIRS.find(b => this.justPressed(b)) ?? null; }
  endFrame() { this.pressed.clear(); }
}

/** Wires keyboard + [data-btn] elements to a ButtonState. onAnyPress fires once for audio unlock. */
export function attachInput(root, state, { onAnyPress } = {}) {
  let first = true; const fire = () => { if (first) { first = false; onAnyPress?.(); } };
  window.addEventListener('keydown', e => { const b = KEYMAP[e.key]; if (b) { e.preventDefault(); if (!e.repeat) state.set(b, true); fire(); } });
  window.addEventListener('keyup', e => { const b = KEYMAP[e.key]; if (b) state.set(b, false); });
  for (const el of root.querySelectorAll('[data-btn]')) {
    const b = el.dataset.btn;
    // No setPointerCapture here: capturing the pointer on the first button
    // would keep delivering pointerup/pointerleave to that element even after
    // a thumb slides onto a neighboring d-pad button, so the roll below
    // (pointerleave on this button, pointerenter on the next) never fires.
    el.addEventListener('pointerdown', e => { e.preventDefault(); state.set(b, true); el.classList.add('held'); fire(); });
    // Lets a thumb roll from one d-pad button to another: releases this
    // button, and pointerenter on the next button (still held, buttons > 0)
    // presses it.
    el.addEventListener('pointerenter', e => { if (e.buttons > 0) { state.set(b, true); el.classList.add('held'); fire(); } });
    const up = () => { state.set(b, false); el.classList.remove('held'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  window.addEventListener('blur', () => { for (const b of BUTTONS) state.set(b, false); });
}
