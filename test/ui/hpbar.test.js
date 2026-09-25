import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hpColor, drawHpBar, Tween } from '../../src/ui/hpbar.js';

test('hpColor: green above half, yellow above a fifth, red otherwise', () => {
  assert.equal(hpColor(1), '#40c040');
  assert.equal(hpColor(0.51), '#40c040');
  assert.equal(hpColor(0.5), '#e0c040');
  assert.equal(hpColor(0.21), '#e0c040');
  assert.equal(hpColor(0.2), '#e04040');
  assert.equal(hpColor(0), '#e04040');
});

test('Tween: linear from → to over `frames` updates, then done', () => {
  const t = new Tween(40, 20, 4);
  assert.equal(t.value, 40); assert.equal(t.done, false);
  t.update(); assert.equal(t.value, 35);
  t.update(); t.update(); assert.equal(t.done, false);
  t.update(); assert.equal(t.value, 20); assert.equal(t.done, true);
  t.update(); assert.equal(t.value, 20);
  const z = new Tween(1, 2, 0);
  assert.equal(z.done, true); assert.equal(z.value, 2);
});

/** Fake ctx recording fillRect calls with the fillStyle in effect. */
function fakeCtx() {
  const rects = [];
  return { rects, fillStyle: null, fillRect(x, y, w, h) { rects.push({ x, y, w, h, style: this.fillStyle }); } };
}
const colored = ctx => ctx.rects.filter(r => ['#40c040', '#e0c040', '#e04040'].includes(r.style));

test('drawHpBar: colored fill is round(w * ratio), min 1 px while hp > 0, none at 0', () => {
  let ctx = fakeCtx(); drawHpBar(ctx, 10, 20, 48, 4, 0.5);
  assert.deepEqual(colored(ctx).map(r => [r.x, r.y, r.w, r.h]), [[10, 20, 24, 4]]);
  assert.equal(colored(ctx)[0].style, '#e0c040');
  ctx = fakeCtx(); drawHpBar(ctx, 0, 0, 48, 4, 0.001);
  assert.equal(colored(ctx)[0].w, 1);
  ctx = fakeCtx(); drawHpBar(ctx, 0, 0, 48, 4, 0);
  assert.equal(colored(ctx).reduce((s, r) => s + r.w, 0), 0);
  assert.ok(ctx.rects.length >= 2, 'outline + dark track still drawn');
});
