// Headless check of the table. Run with: node test/sim.test.js
// Plays seeded games with random flipper input and fails if a ball escapes,
// a value goes NaN, or a game never ends.
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/<script id="sim">([\s\S]*?)<\/script>/);
if (!match) { console.error('FAIL: sim script not found in index.html'); process.exit(1); }
const makeSim = new Function(match[1] + '; return makeSim;')();

const GAMES = 40;
const MAX_SECONDS = 600;
let failures = 0;

for (let seed = 1; seed <= GAMES; seed++) {
  // Seeded generator so every run plays the same games.
  let r = seed * 2654435761 >>> 0;
  const rnd = () => (r = (r * 1664525 + 1013904223) >>> 0) / 4294967296;
  const realRandom = Math.random;
  Math.random = rnd;

  const sim = makeSim();
  sim.newGame();
  let t = 0, problem = null, maxBalls = 0;
  const seen = {};

  while (!sim.st.over && t < MAX_SECONDS && !problem) {
    if (sim.inLane()) sim.launch(rnd());
    if (rnd() < 0.05) sim.setFlipper(0, rnd() < 0.5);
    if (rnd() < 0.05) sim.setFlipper(1, rnd() < 0.5);
    sim.step(1 / 60);
    t += 1 / 60;
    maxBalls = Math.max(maxBalls, sim.balls.length);
    for (const b of sim.balls) {
      if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) problem = 'non-finite ball value';
      else if (b.y < 640 && (b.x < 10 || b.x > 390)) problem = `ball outside walls at ${b.x.toFixed(1)}, ${b.y.toFixed(1)}`;
      else if (b.y < -5) problem = `ball above the arc at ${b.x.toFixed(1)}, ${b.y.toFixed(1)}`;
    }
    if (!Number.isFinite(sim.st.score)) problem = 'non-finite score';
    for (const e of sim.events) seen[e.t] = (seen[e.t] || 0) + 1;
    sim.events.length = 0;
  }
  Math.random = realRandom;

  if (!problem && !sim.st.over) problem = `game still running after ${MAX_SECONDS} simulated seconds`;
  if (problem) { failures++; console.error(`FAIL seed ${seed}: ${problem}`); }
  else console.log(`ok seed ${seed}: ${Math.round(t)}s, score ${sim.st.score}, max balls ${maxBalls}, surprises ${seen.surprise || 0}`);
}

if (failures) { console.error(`\n${failures} of ${GAMES} games failed`); process.exit(1); }
console.log(`\nAll ${GAMES} games passed`);
