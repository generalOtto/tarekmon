export class SceneStack {
  constructor() { this.scenes = []; }
  get top() { return this.scenes[this.scenes.length - 1]; }
  push(s) { this.scenes.push(s); s.enter?.(); }
  pop() { const s = this.scenes.pop(); s?.exit?.(); return s; }
  replace(s) { this.pop(); this.push(s); }
  update(dt) { this.top?.update?.(dt); }
  draw(ctx) { this.top?.draw?.(ctx); }
  onButton(btn, pressed) { this.top?.onButton?.(btn, pressed); }
}

/** Fixed 60 Hz update, render every frame. `tick(dt)` and `render()` are injected. */
export function startLoop({ tick, render, raf = requestAnimationFrame, now = () => performance.now() }) {
  const STEP = 1 / 60; let acc = 0, last = now(), running = true;
  function frame() {
    if (!running) return;
    const t = now(); acc += Math.min(0.25, (t - last) / 1000); last = t;
    while (acc >= STEP) { tick(STEP); acc -= STEP; }
    render(); raf(frame);
  }
  raf(frame);
  return () => { running = false; };
}
