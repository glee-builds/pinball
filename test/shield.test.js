'use strict';
/*
 * Gloom Shield tests: a ball coming down the Rooftop Run channel from above passes
 * through the shield without counting; hits from below still count and still block
 * the ramp entrance.   node --test test/shield.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const load = require('./helpers/load');

const DT = 1 / 60;

const simSource = load.extractSim(load.readPage());
assert.ok(simSource !== null, 'no <script id="sim"> found in index.html');
const loadSim = load.makeLoader(simSource);

// Returns { sim, ball, log } with a showdown running and the shield up.
function shieldUp() {
  const sim = loadSim(7);
  sim.newGame();
  const log = [];
  const ball = sim.balls[0];
  function step(n) {
    for (let i = 0; i < n; i++) {
      sim.step(DT);
      for (const e of sim.events) log.push(e.t);
      sim.events.length = 0;
    }
  }
  // SETUP ONLY: two heroes already recruited; the third lamp recruits Tide and starts the showdown.
  sim.st.heroes[0] = sim.st.heroes[1] = true;
  sim.st.hideCd = 1e9; sim.st.mysT = 1e9;
  for (let k = 0; k < sim.rolls.length; k++) {
    ball.x = sim.rolls[k].x; ball.y = sim.rolls[k].y; ball.vx = 0; ball.vy = 0; ball.still = 0;
    step(10);
  }
  assert.ok(sim.st.boss, 'showdown did not start');
  ball.x = 200; ball.y = 500; ball.vx = 0; ball.vy = 0; ball.still = 0;
  step(10);
  assert.strictEqual(sim.shield.up, true, 'shield should be up');
  log.length = 0;
  return { sim, ball, log, step };
}

function put(b, x, y, vx, vy) {
  b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.ign = 0; b.hold = 0; b.still = 0;
}

test('a ball coming down the channel from above passes through the shield', () => {
  const g = shieldUp();
  const hp = g.sim.st.boss.hp;
  put(g.ball, 345, 205, 0, 50);
  // The boss may lose hp later from targets and bumpers lower down, so hp is checked the
  // moment the ball first gets below the shield.
  let n = 0;
  while (g.ball.y <= 320 && n++ < 180) g.step(1);
  assert.ok(g.ball.y > 320, 'ball should be below the shield, y=' + g.ball.y);
  assert.strictEqual(g.sim.st.boss.hp, hp);
  assert.ok(!g.log.includes('bossHit'), 'no bossHit expected before the ball is below the shield');
  g.step(180 - n);
  assert.strictEqual(g.sim.shield.hits, 0);
  assert.ok(!g.log.includes('shieldHit'), 'no shieldHit expected');
  assert.strictEqual(g.sim.shield.up, true);
});

test('balls sent up into the shield from below hit it and never enter the ramp', () => {
  for (const x of [302, 315, 327, 340, 352]) {
    const g = shieldUp();
    put(g.ball, x, 400, 0, -600);
    let rp = false;
    for (let i = 0; i < 12; i++) {   // first approach only: the shield is still up (3 hits drop it)
      g.step(1);
      if (g.ball.rp !== -1) rp = true;
      if (!g.sim.shield.up) break;
    }
    assert.ok(g.log.includes('shieldHit'), 'x ' + x + ': expected shieldHit');
    assert.ok(!rp && !g.log.includes('ramp'), 'x ' + x + ': ball got onto the ramp');
  }
});

test('three hits from below drop the shield, then a fast ball can enter the ramp', () => {
  const g = shieldUp();
  const hp = g.sim.st.boss.hp;
  let hits = 0, guard = 0;
  while (g.sim.shield.up && guard++ < 20) {
    put(g.ball, 327, 400, 0, -600);
    for (let i = 0; i < 30 && g.sim.shield.up; i++) {
      g.step(1);
      assert.strictEqual(g.ball.rp, -1, 'ball entered the ramp while the shield was up');
    }
  }
  assert.ok(g.log.includes('shieldDown'));
  assert.strictEqual(g.sim.shield.up, false);
  assert.ok(g.sim.st.boss.hp < hp, 'shield hits should hurt the boss');
  put(g.ball, 327, 400, 0, -900);
  for (let i = 0; i < 20 && g.ball.rp === -1; i++) g.step(1);
  assert.ok(g.ball.rp >= 0 || g.log.includes('ramp'), 'ball should enter the ramp once the shield is down');
});
