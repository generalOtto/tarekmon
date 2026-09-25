import { loadDb } from './data/load.js';
import { createScreen } from './engine/canvas.js';
import { SceneStack, startLoop } from './engine/loop.js';
import { ButtonState, attachInput } from './engine/input.js';

const db = await loadDb();

const screen = createScreen(document.getElementById('screen'));
const scenes = new SceneStack();
const input = new ButtonState();
attachInput(document.body, input);

// Placeholder scene — replaced by TitleScene/OverworldScene in later tasks
const placeholderScene = {
  x: 76,
  y: 68,
  flash: false,
  update() {
    const dir = input.direction();
    if (dir === 'up') this.y -= 1;
    else if (dir === 'down') this.y += 1;
    else if (dir === 'left') this.x -= 1;
    else if (dir === 'right') this.x += 1;
    // captured before endFrame() clears the edge, so draw() (which runs after
    // all ticks for the frame) can still see it
    this.flash = input.justPressed('a');
  },
  draw(ctx) {
    ctx.fillStyle = this.flash ? '#ffffff' : '#1f1a33';
    ctx.fillRect(this.x, this.y, 8, 8);
  },
};
scenes.push(placeholderScene);

startLoop({
  tick: dt => { scenes.update(dt); input.endFrame(); },
  render: () => { screen.clear('#9bbc0f'); scenes.draw(screen.ctx); },
});
