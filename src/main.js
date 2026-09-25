import { loadDb } from './data/load.js';
import { createScreen } from './engine/canvas.js';
import { SceneStack, startLoop } from './engine/loop.js';

const db = await loadDb();
console.log('species loaded:', db.species.length);

const screen = createScreen(document.getElementById('screen'));
const scenes = new SceneStack();

const placeholderScene = {
  draw(ctx) {
    ctx.fillStyle = '#1f1a33';
    ctx.fillRect(76, 68, 8, 8);
  },
};
scenes.push(placeholderScene);

startLoop({
  tick: dt => scenes.update(dt),
  render: () => { screen.clear('#9bbc0f'); scenes.draw(screen.ctx); },
});
