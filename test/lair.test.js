'use strict';
/*
 * Gloom's Lair (the upper table) and the upper main-field features: how the ball gets
 * up there, what only the lair flippers can do, and the clocks that stand still meanwhile.
 *
 *   node --test test/lair.test.js
 *
 * Same approach as rules.test.js: the real sim in a vm context, balls placed with a
 * position and velocity, sim.step(1/60) so the real collisions fire the rules.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DT = 1 / 60;
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const simSource = html.match(/<script id="sim">([\s\S]*?)<\/script>/)[1];

function loadSim() {
  const ctx = vm.createContext({});
  vm.runInContext(simSource, ctx, { filename: 'index.html#sim' });
  let a = 7;
  ctx.__rand = function () { a = (a * 16807) % 2147483647; return a / 2147483647; };
  vm.runInContext('Math.random = __rand;', ctx);
  const sim = vm.runInContext('makeSim()', ctx);
  sim.newGame();
  sim.st.mysT = 1e9;                        // SETUP ONLY: no mystery star wandering into the shots
  return sim;
}
function steps(sim, secs, until) {
  const log = [];
  for (let i = 0; i < Math.round(secs / DT); i++) {
    sim.step(DT);
    sim.events.forEach(function (e) { log.push(e); });
    sim.events.length = 0;
    if (until && until(log)) break;
  }
  return log;
}
function put(b, x, y, vx, vy, lv) {
  b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.ign = 0; b.hold = 0; b.still = 0; b.h = 0; b.lv = lv || 0; b.lr = 0; b.rp = -1;
}
function has(log, t) { return log.some(function (e) { return e.t === t; }); }
function rampUp(sim, i) {
  const r = sim.ramps[i], b = sim.balls[0];
  put(b, (r.ex0 + r.ex1) / 2, r.ey + 4, 0, -(r.min + 400));
  return steps(sim, 6, function (l) { return has(l, 'lairEnter') || (b.rp < 0 && b.lr === 0 && has(l, 'ramp')); });
}

test('the lair is lit at the start of a game and either ramp carries the ball up', function () {
  [0, 1].forEach(function (i) {
    const sim = loadSim();
    assert.strictEqual(sim.st.lairOpen, true);
    const log = rampUp(sim, i);
    assert.ok(has(log, 'ramp'), 'the ramp still scores');
    assert.ok(has(log, 'lairEnter'), 'ramp ' + i + ' did not reach the lair');
    assert.strictEqual(sim.balls[0].lv, 1);
    assert.strictEqual(sim.st.lairOpen, false, 'one visit per opening');
    assert.ok(sim.lairView(), 'the display should be showing the lair');
  });
});

test('no lair trip while more than one ball is in play', function () {
  const sim = loadSim();
  sim.st.mb = true; sim.st.queue = 1;        // SETUP ONLY: multiball under way
  const log = rampUp(sim, 0);
  assert.ok(!has(log, 'lairEnter'));
  assert.strictEqual(sim.st.lairOpen, true, 'the lair stays lit for later');
});

test('three ramp crests, a beacon hit or two top loops relight the lair', function () {
  let sim = loadSim();
  sim.st.lairOpen = false;                   // SETUP ONLY: lair spent
  for (let k = 0; k < 3; k++) rampUp(sim, k % 2);
  assert.strictEqual(sim.st.lairOpen, true, 'three crests');

  sim = loadSim(); sim.st.lairOpen = false;
  steps(sim, 0.05);
  const bc = sim.beacon, b = sim.balls[0];
  put(b, bc.x, bc.y + 30, 0, -300);
  let log = steps(sim, 0.3, function (l) { return has(l, 'beacon'); });
  assert.ok(has(log, 'beacon')); assert.strictEqual(sim.st.lairOpen, true, 'beacon');
  assert.strictEqual(sim.beacon.on, false, 'the beacon rests after a hit');

  sim = loadSim(); sim.st.lairOpen = false;
  const o = sim.orbit;
  for (let k = 0; k < 2; k++) {              // up the far left, then down the Rooftop Run channel
    put(sim.balls[0], 30, 230, 0, -900);
    steps(sim, 0.05);
    put(sim.balls[0], (o.x0 + o.x1) / 2, o.ty - 8, 0, 300);
    sim.balls[0].lt = 1;                      // SETUP ONLY: skip the ride around the arc
    log = steps(sim, 0.2, function (l) { return has(l, 'loop'); });
    assert.ok(has(log, 'loop'), 'loop ' + (k + 1));
  }
  assert.strictEqual(sim.st.loops, 2);
  assert.strictEqual(sim.st.lairOpen, true, 'two loops');
});

test('the Throne Ramp lights a guard, and only a lair ball can make it', function () {
  const sim = loadSim(), L = sim.lair, r = L.ramp, b = sim.balls[0];
  put(b, (r.ex0 + r.ex1) / 2, r.ey + 4, 0, -(r.min + 300), 1);
  const log = steps(sim, 6, function (l) { return has(l, 'throne') && b.rp < 0; });
  assert.ok(has(log, 'throne'));
  assert.strictEqual(L.guards.filter(function (q) { return q.lit; }).length, 1);
  assert.strictEqual(b.lv, 1, 'the Throne Ramp returns the ball to the lair floor');
  put(b, (r.ex0 + r.ex1) / 2, r.ey + 4, 0, -(r.min + 300), 0);   // the same spot on the main table is nothing special
  assert.ok(!has(steps(sim, 1), 'throne'));
});

test('a quick drain in the lair is saved once per visit; the next one rides back down', function () {
  const sim = loadSim(), b = sim.balls[0];
  rampUp(sim, 0);
  put(b, 185, 712, 0, 300, 1);
  let log = steps(sim, 0.1);
  assert.ok(has(log, 'lairSave')); assert.strictEqual(b.lv, 1);
  put(b, 185, 712, 0, 300, 1);
  log = steps(sim, 0.1);
  assert.ok(has(log, 'lairExit')); assert.strictEqual(b.lr, 2);
  steps(sim, 6, function () { return b.lr === 0; });
  assert.strictEqual(b.lv, 0); assert.ok(b.y > 400 && b.x < 80, 'lands by the left inlane');
  assert.strictEqual(sim.st.ball, 1, 'leaving the lair never costs a ball');
});

test('the main table clocks stand still while the ball is in the lair', function () {
  const sim = loadSim(), b = sim.balls[0];
  rampUp(sim, 0);
  sim.st.mission = { i: 0, n: 0, need: 2, t: 20 }; sim.st.mode = 'mission';   // SETUP ONLY: a mission running
  sim.st.save = 3;
  put(b, 200, 400, 0, 0, 1);
  const t0 = sim.st.mission.t;
  steps(sim, 1);
  assert.strictEqual(sim.st.mission.t, t0, 'mission clock paused');
  assert.strictEqual(sim.st.save, 3, 'ball saver paused');
});

test('lane change: a new flipper press moves the lit top lamps', function () {
  const sim = loadSim();
  put(sim.balls[0], 200, 500, 0, 0);
  sim.rolls[0].lit = true;                  // SETUP ONLY: one lamp lit
  sim.setFlipper(1, true); sim.setFlipper(1, false);
  assert.deepStrictEqual(Array.from(sim.rolls, function (r) { return r.lit; }), [false, true, false]);
  sim.setFlipper(0, true); sim.setFlipper(0, false);
  assert.deepStrictEqual(Array.from(sim.rolls, function (r) { return r.lit; }), [true, false, false]);
});
