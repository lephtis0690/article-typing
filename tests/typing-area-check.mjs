import { fileURLToPath } from 'url';
import fs from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const uiCode = read('js/modules/30-ui-render.js');
const gameCode = read('js/modules/40-game.js');
const textCode = read('js/modules/10-texts.js');

for (const name of ['resetTypingAreaForIdle', 'isLikelyTaskTitleLeak', 'removeTaskTitleLeakFromTypingArea']) {
  if (!uiCode.includes(`function ${name}`)) throw new Error(`${name} was not found`);
}
if (!uiCode.includes('resetTypingAreaForIdle();')) {
  throw new Error('initDisplay should clear typingArea while idle');
}
if (!textCode.includes('resetTypingAreaForIdle')) {
  throw new Error('applySelectedText should clear typingArea via resetTypingAreaForIdle');
}
const forbiddenAssignments = [
  'typingArea.value = gameState.texts.currentTitle',
  'typingArea.value = selected.title',
  'typingArea.value = item.title',
  'typingArea.value = title',
];
for (const snippet of forbiddenAssignments) {
  if (uiCode.includes(snippet) || gameCode.includes(snippet) || textCode.includes(snippet)) {
    throw new Error(`typingArea must not receive task title: ${snippet}`);
  }
}
const leakGuards = (gameCode.match(/removeTaskTitleLeakFromTypingArea/g) || []).length;
if (leakGuards < 2) throw new Error('game input handlers should guard against task-title leakage');

console.log('OK: typing area title-leak guard smoke test passed');
