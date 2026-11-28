'use strict';
/*
 * Rule tests for the Comet Alley sim: the rules random play almost never reaches
 * (showdown win/escape, missions, Last Stand, locks and multiball, extra ball,
 * Rooftop Chase, match, newGame reset).
 *
 *   node --test test/rules.test.js
 *
 * Every scenario runs through the real sim (index.html <script id="sim"> loaded in
 * a Node vm context, Math.random seeded inside that context only). Balls are placed
 * with a position and velocity and sim.step(1/60) is called so that real collisions
 * and captures fire the rules. Where a test writes to sim.st directly, a comment
 * says so: those writes only set up a precondition that is slow to earn or switch
 * off a random prize, never the outcome under test.
 */
const test = require('node:test');
const assert = require('node:assert');
const { readPage, extractSim, mulberry32, makeLoader } = require('./helpers/load');

const DT = 1 / 60;

const simSource = extractSim(readPage());
assert.ok(simSource !== null, 'no <script id="sim"> found in index.html');
const loadSim = makeLoader(simSource);

function findBadNumber(v, where) {
  if (typeof v === 'number') return isFinite(v) ? null : where + ' = ' + v;
  if (v && typeof v === 'object') {
    for (const k in v) {
      const r = findBadNumber(v[k], where + '.' + k);
      if (r) return r;
    }
  }
  return null;
}

/* ---------- harness ---------- */

// g = { sim, st, log, active, park }
// While g.park is true, every ball that is not g.active and not busy (held, on a ramp)
// is put back at a quiet spot near the top of the table before each frame, so a test
// can keep balls alive (live play counts time) without them scoring by accident.
const SLOTS = [[200, 50], [140, 50], [260, 50], [100, 80]];
function busy(b) { return b.hold > 0 || b.rp >= 0 || b.lr > 0; }

function newGame(seed) {
  const sim = loadSim(seed);
  sim.newGame();
  return { sim: sim, st: sim.st, log: [], active: null, park: true };
}

function frame(g) {
  const sim = g.sim;
  if (g.park) {
    sim.balls.forEach(function (b, i) {
      if (b === g.active || busy(b)) return;
      const s = SLOTS[i % SLOTS.length];
      b.x = s[0]; b.y = s[1]; b.vx = 0; b.vy = 0; b.still = 0;
    });
  }
  sim.step(DT);
  for (let i = 0; i < sim.events.length; i++) {
    const e = sim.events[i];
    g.log.push({ t: e.t, v: e.v, x: e.x, y: e.y, time: sim.st.time });
  }
  sim.events.length = 0;
}

function run(g, secs) {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) frame(g);
}

function runUntil(g, pred, maxSecs, what) {
  const n = Math.ceil(maxSecs / DT);
  for (let i = 0; i < n; i++) {
    frame(g);
    if (pred()) return;
  }
  assert.fail('timed out after ' + maxSecs + 's waiting for ' + what);
}

function evs(g, name, from) {
  return g.log.slice(from || 0).filter(function (e) { return e.t === name; });
}
function names(g, from) { return g.log.slice(from || 0).map(function (e) { return e.t; }); }

function freeBall(g) {                      // waits out a Hideout hold if every ball is held
  if (!g.sim.balls.some(function (q) { return !busy(q); })) {
    runUntil(g, function () { return g.sim.balls.some(function (q) { return !busy(q); }); }, 3, 'a free ball');
  }
  return g.sim.balls.find(function (q) { return !busy(q); });
}
function put(b, x, y, vx, vy) {
  b.x = x; b.y = y; b.vx = vx || 0; b.vy = vy || 0;
  b.ign = 0; b.hold = 0; b.still = 0; b.h = 0; b.mg = false;
}

/* Precondition switches shared by the mode tests. */
function quiet(g) {
  // SETUP ONLY: a Hideout capture normally also awards a random mystery prize (one of
  // them queues an extra ball and starts multiball) and the mystery star can appear.
  // Switch both off so ball counts in these tests come only from the rules under test.
  g.st.hideCd = 1e9;
  g.st.mysT = 1e9;
}

/* Drive helpers: each places a ball and lets the real rule fire. */
function waitHideoutFree(g) {
  runUntil(g, function () { return g.sim.hideout.t === 0; }, 3, 'the Hideout to release its ball');
}
function capture(g) {                       // slow ball dropped on the Hideout circle
  waitHideoutFree(g);
  const mark = g.log.length, b = freeBall(g), h = g.sim.hideout;
  put(b, h.x, h.y, 0, 0);
  g.active = b;
  frame(g);
  g.active = null;
  assert.strictEqual(evs(g, 'hideout', mark).length, 1, 'Hideout capture did not fire');
  assert.ok(b.hold > 0, 'captured ball is not held');
  return mark;
}
function rampShot(g, i) {                   // fast ball crossing the entrance line upward
  const r = g.sim.ramps[i], b = freeBall(g), mark = g.log.length;
  put(b, (r.ex0 + r.ex1) / 2, r.ey + 4, 0, -(r.min + 400));
  g.active = b;
  runUntil(g, function () { return evs(g, 'ramp', mark).some(function (e) { return e.v === i; }); }, 3, 'ramp ' + i + ' crest');
  g.active = null;
  runUntil(g, function () { return b.rp < 0 && !(b.lr > 0); }, 5, 'the ball to leave ramp ' + i);
  return mark;
}
function bumperHit(g) {                     // ball dropped onto the centre bumper
  const bp = g.sim.bumpers[2], b = freeBall(g), mark = g.log.length;
  put(b, bp.x, bp.y - 45, 0, 300);
  g.active = b;
  runUntil(g, function () { return evs(g, 'bumper', mark).length > 0; }, 2, 'a bumper hit');
  g.active = null;
  return mark;
}
function dropHit(g, i) {                    // ball dropped onto drop target i
  const d = g.sim.drops[i], b = freeBall(g), mark = g.log.length;
  assert.strictEqual(d.down, false, 'drop ' + i + ' should be standing');
  put(b, d.x, d.y - 25, 0, 400);
  g.active = b;
  runUntil(g, function () { return evs(g, 'drop', mark).some(function (e) { return e.v === i; }); }, 2, 'drop ' + i);
  g.active = null;
  return mark;
}
function lightRolls(g) {                    // a slow ball placed on each top lamp
  const b = freeBall(g), mark = g.log.length;
  g.active = b;
  for (let k = 0; k < g.sim.rolls.length; k++) {
    put(b, g.sim.rolls[k].x, g.sim.rolls[k].y, 0, 0);
    runUntil(g, function () { return evs(g, 'roll', mark).some(function (e) { return e.v === k; }); }, 1, 'roll ' + k);
  }
  g.active = null;
  return mark;
}
function drainBalls(g, n) {                 // push n balls below the table; the sim removes them
  const bs = g.sim.balls.slice(0, n);
  assert.strictEqual(bs.length, n, 'not enough balls to drain');
  const was = g.park;
  g.park = false;
  bs.forEach(function (b) { b.y = 800; });
  run(g, 0.1);
  g.park = was;
}

/* Earn the full team without starting anything else running: Kite (ramp), Tide (three
   lamps), then a Hideout capture recruits Ember and the team starts the showdown. */
function startShowdown(g) {
  rampShot(g, 0);
  assert.deepStrictEqual(Array.from(g.st.heroes), [true, false, false]);
  const rm = lightRolls(g);
  assert.strictEqual(evs(g, 'hero', rm).length, 1);
  assert.deepStrictEqual(Array.from(g.st.heroes), [true, false, true]);
  const mark = capture(g);
  assert.strictEqual(evs(g, 'bossStart', mark).length, 1, 'bossStart did not fire');
  assert.strictEqual(g.st.mode, 'showdown');
  assert.deepStrictEqual(Array.from(g.st.heroes), [true, true, true]);
  return mark;
}
function winShowdown(g) {                   // real bumper hits until the boss falls
  const mark = g.log.length;
  let guard = 0;
  while (g.st.boss && guard++ < g.st.boss.max + 5) bumperHit(g);
  assert.strictEqual(evs(g, 'bossWin', mark).length, 1, 'bossWin did not fire');
  return mark;
}

/* Everything up to Last Stand being lit: a showdown win, then all three missions. */
function reachWizardLit(g) {
  quiet(g);
  startShowdown(g);
  waitHideoutFree(g);
  winShowdown(g);
  assert.strictEqual(g.st.bossWins, 1);
  // The three heroes are "ready" in the order they were recruited: Kite, Tide, Ember.
  assert.deepStrictEqual(Array.from(g.st.mq), [0, 2, 1]);
  const defs = g.sim.missionDefs;
  let mark = capture(g);                                   // starts Kite's mission
  assert.deepStrictEqual(evs(g, 'missionStart', mark).map(function (e) { return e.v; }), [0]);
  for (let k = 0; k < defs[0].need; k++) rampShot(g, 0);
  assert.strictEqual(g.st.missions[0], 3);
  mark = capture(g);                                       // starts Tide's mission
  assert.deepStrictEqual(evs(g, 'missionStart', mark).map(function (e) { return e.v; }), [2]);
  dropHit(g, 0); dropHit(g, 1); dropHit(g, 2);             // a full bank counts three steps
  runUntil(g, function () { return g.sim.drops.every(function (d) { return !d.down; }); }, 4, 'the bank to stand up');
  dropHit(g, 0); dropHit(g, 1);
  assert.strictEqual(g.st.missions[2], 3);
  mark = capture(g);                                       // starts Ember's mission
  assert.deepStrictEqual(evs(g, 'missionStart', mark).map(function (e) { return e.v; }), [1]);
  mark = g.log.length;
  for (let k = 0; k < defs[1].need; k++) bumperHit(g);
  assert.strictEqual(g.st.missions[1], 3);
  assert.strictEqual(evs(g, 'wizardLit', mark).length, 1, 'wizardLit did not fire');
  assert.strictEqual(g.st.wizLit, true);
  assert.strictEqual(g.st.mode, 'none');
}
function startWizard(g) {
  reachWizardLit(g);
  const mark = capture(g);
  assert.strictEqual(evs(g, 'wizardStart', mark).length, 1, 'wizardStart did not fire');
  assert.strictEqual(g.st.mode, 'wizard');
  assert.strictEqual(g.st.mb, true);
  assert.strictEqual(g.sim.balls.length + g.st.queue, 3, 'Last Stand should mean three balls');
  run(g, 2.5);                                             // queued balls feed in
  assert.strictEqual(g.sim.balls.length, 3);
  assert.strictEqual(g.st.queue, 0);
  return mark;
}

/* A seeded random game, as test/sim.test.js plays it. */
function randomGame(seed) {
  const g = newGame(seed);
  g.park = false;
  const input = mulberry32(seed ^ 0x9E3779B9);
  const sim = g.sim;
  let frames = 0;
  while (!g.st.over && frames++ < 600 * 60) {
    if (input() < 0.08) sim.setFlipper(0, !sim.flippers[0].pressed);
    if (input() < 0.08) sim.setFlipper(1, !sim.flippers[1].pressed);
    if (sim.inLane() && input() < 0.1) sim.launch(input());
    frame(g);
  }
  assert.ok(g.st.over, 'seeded game did not end');
  return g;
}

/* ---------- 1. newGame resets everything ---------- */

function snapshot(sim) {
  const st = JSON.parse(JSON.stringify(sim.st));
  return JSON.parse(JSON.stringify({
    st: st,
    guards: sim.lair.guards.map(function (q) { return q.lit; }),
    vaultT: sim.lair.vault.t,
    lairFlipper: { a: sim.lair.flipper.a, av: sim.lair.flipper.av, pressed: sim.lair.flipper.pressed },
    shield: { up: sim.shield.up, hits: sim.shield.hits },
    drops: sim.drops.map(function (d) { return d.down; }),
    segsOff: sim.segs.map(function (s) { return !!s.off; }),
    lanes: sim.lanes.map(function (l) { return l.t; }),
    rolls: sim.rolls.map(function (r) { return r.lit; }),
    targets: sim.targets.map(function (t) { return t.lit; }),
    hideoutT: sim.hideout.t,
    magnetT: sim.magnet.t,
    spinner: { a: sim.spinner.a, av: sim.spinner.av },
    balls: sim.balls.map(function (b) { return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, hold: b.hold, lv: b.lv, rp: b.rp, lr: b.lr, mg: b.mg }; })
  }));
}

test('1. newGame resets state and mutable geometry to a fresh sim', function () {
  const g = randomGame(11);
  const sim = g.sim;
  assert.ok(g.st.score > 0, 'the played game should have scored');

  // SETUP ONLY: dirty fields that random play rarely leaves behind, so the reset of
  // each one is actually exercised. Everything newGame is documented to reset.
  sim.lair.guards.forEach(function (q) { q.lit = true; });
  sim.lair.vault.t = 0.7;
  sim.shield.up = true; sim.shield.hits = 2;
  sim.drops[0].down = true;
  sim.lanes[1].t = 0.3;
  sim.rolls[0].lit = true;
  sim.targets[1].lit = true;
  sim.hideout.t = 0.5;
  sim.magnet.t = 0.4;
  sim.spinner.a = 1; sim.spinner.av = 5;
  const st = g.st;
  st.lockLit = true; st.locks = 1; st.banks = 2; st.extraLit = true; st.extra = 1;
  st.wizLit = true; st.wizards = 2; st.missions = [3, 2, 1]; st.mq = [1, 2];
  st.heroes = [true, true, false]; st.bossWins = 2; st.videoLit = true; st.vaultLit = true;
  st.lairOpen = true; st.magnet = true; st.tideIn = true; st.mode = 'wizard'; st.chain = 4;

  sim.newGame();
  const fresh = loadSim(99);
  fresh.newGame();
  const a = snapshot(sim), b = snapshot(fresh);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(sim.st.over, false);
  assert.strictEqual(sim.st.ball, 1);
  assert.strictEqual(sim.balls.length, 1);
});

/* ---------- 2. showdown won ---------- */

test('2. recruiting all three heroes starts a showdown; its full hp in damage wins it', function () {
  const g = newGame(2);
  quiet(g);
  const startMark = startShowdown(g);
  const hp = g.st.boss.hp, max = g.st.boss.max;
  assert.strictEqual(hp, max);
  const scoreBefore = g.st.score;
  waitHideoutFree(g);
  const mark = winShowdown(g);

  const hits = evs(g, 'bossHit', startMark);
  assert.ok(hits.length > 0);
  assert.strictEqual(hits[hits.length - 1].v, 0, 'killing blow reports 0 hp left');
  hits.slice(0, -1).forEach(function (e) { assert.ok(e.v > 0, 'boss died before the last hit'); });
  const order = names(g, startMark);
  assert.ok(order.lastIndexOf('bossHit') < order.indexOf('bossWin'), 'bossWin must follow the last hit');
  assert.strictEqual(evs(g, 'bossEscape', startMark).length, 0);
  assert.ok(evs(g, 'surprise', mark).some(function (e) { return e.v === 'boss'; }), 'boss surprise banner');
  assert.strictEqual(g.st.boss, null);
  assert.strictEqual(g.st.bossWins, 1);
  assert.deepStrictEqual(Array.from(g.st.heroes), [false, false, false]);
  assert.strictEqual(g.st.mode, 'none');
  assert.ok(g.st.score - scoreBefore >= 25000, 'victory pays at least 25000');
});

/* ---------- 3. showdown escapes ---------- */

test('3. a showdown not won within its live-play time limit ends in bossEscape', function () {
  const g = newGame(3);
  quiet(g);
  startShowdown(g);
  waitHideoutFree(g);

  // Time only runs while a ball is live: a ball sitting in the shooter lane does not
  // count. (Placing the ball is the setup; the timer value is what is checked.)
  g.park = false;
  put(freeBall(g), 375, 690, 0, 0);
  run(g, 0.5);
  const t0 = g.st.boss.t;
  run(g, 3);
  assert.strictEqual(g.st.boss.t, t0, 'boss timer moved with no live ball');
  g.park = true;

  const limit = g.st.boss.t;                      // live seconds left from here
  const startTime = g.st.time;
  const mark = g.log.length;
  runUntil(g, function () { return g.st.boss === null; }, limit + 3, 'the showdown to time out');
  const esc = evs(g, 'bossEscape', mark);
  assert.strictEqual(esc.length, 1, 'bossEscape should fire exactly once');
  assert.ok(Math.abs((esc[0].time - startTime) - limit) < 0.1, 'escape came at the time limit, not before or after');
  assert.strictEqual(evs(g, 'bossWin', mark).length, 0);
  assert.deepStrictEqual(Array.from(g.st.heroes), [false, false, false]);
  assert.strictEqual(g.st.bossWins, 0);
  assert.strictEqual(g.st.mode, 'none');
  assert.strictEqual(g.sim.shield.up, false, 'shield lowers when the showdown ends');
});

/* ---------- 4. hero mission ---------- */

test("4. a recruited hero's mission starts on a Hideout capture and completes after its steps", function () {
  const g = newGame(4);
  quiet(g);
  const def = g.sim.missionDefs[0];
  let mark = rampShot(g, 0);                                   // a ramp crest recruits Kite
  assert.deepStrictEqual(evs(g, 'missionReady', mark).map(function (e) { return e.v; }), [0]);
  assert.strictEqual(g.st.missions[0], 1);
  assert.strictEqual(g.st.mission, null, 'a ready mission does not start by itself');
  assert.strictEqual(evs(g, 'missionStart', mark).length, 0);

  mark = capture(g);
  assert.deepStrictEqual(evs(g, 'missionStart', mark).map(function (e) { return e.v; }), [0]);
  assert.strictEqual(g.st.missions[0], 2);
  assert.strictEqual(g.st.mission.i, 0);
  assert.strictEqual(g.st.mission.need, def.need);
  assert.strictEqual(g.st.mode, 'mission');

  mark = g.log.length;
  for (let k = 0; k < def.need; k++) {
    assert.strictEqual(evs(g, 'missionDone', mark).length, 0, 'finished before all steps');
    rampShot(g, 0);
  }
  const steps = evs(g, 'missionStep', mark).map(function (e) { return e.v; });
  assert.deepStrictEqual(steps, Array.from({ length: def.need }, function (_, k) { return k + 1; }));
  assert.deepStrictEqual(evs(g, 'missionDone', mark).map(function (e) { return e.v; }), [0]);
  assert.strictEqual(g.st.missions[0], 3);
  assert.strictEqual(g.st.mission, null);
  assert.strictEqual(g.st.missionsDone, 1);
  assert.ok(evs(g, 'surprise', mark).some(function (e) { return e.v === 'mission'; }));
  assert.strictEqual(g.st.mode, 'none');
});

/* ---------- 5. Last Stand ---------- */

test('5. Last Stand: lit by 3 missions + a showdown win, runs 3 balls with super jackpots, then ends cleanly', function () {
  const g = newGame(5);
  const mark = startWizard(g);                      // asserts wizardLit, wizardStart, 3 balls
  assert.ok(evs(g, 'wizardLit').length === 1);
  assert.strictEqual(evs(g, 'wizardStart').length, 1);
  assert.strictEqual(g.st.wizLit, false, 'wizLit is spent when Last Stand starts');
  assert.strictEqual(g.st.mission, null);
  assert.ok(g.st.save > 0, 'Last Stand grants a ball saver');
  const limit = g.st.wiz.t;
  const startTime = g.st.time;

  // A ramp crest during Last Stand is a super jackpot.
  const before = g.st.score, m2 = g.log.length;
  rampShot(g, 0);
  const sj = evs(g, 'superJackpot', m2);
  assert.strictEqual(sj.length, 1, 'ramp crest should emit superJackpot');
  assert.strictEqual(sj[0].v, 1);
  assert.strictEqual(g.st.wiz.jack, 1);
  assert.ok(evs(g, 'ramp', m2).length === 1, 'ramp still fires too');
  assert.ok(g.st.score - before >= 10000 * 3 * 2, 'super jackpot pays x3 (Last Stand) and x2 (multiball)');

  // It ends by its live-play time limit.
  const m3 = g.log.length;
  runUntil(g, function () { return g.st.wiz === null; }, limit + 3, 'Last Stand to time out');
  const end = evs(g, 'wizardEnd', m3);
  assert.strictEqual(end.length, 1, 'wizardEnd should fire exactly once');
  assert.strictEqual(end[0].v, 1, 'wizardEnd reports the super jackpots scored');
  assert.ok(Math.abs((end[0].time - startTime) - limit) < 0.2, 'ended at the time limit');
  assert.strictEqual(g.st.wizards, 1);
  assert.deepStrictEqual(Array.from(g.st.heroes), [false, false, false]);
  assert.deepStrictEqual(Array.from(g.st.missions), [0, 0, 0]);
  assert.deepStrictEqual(Array.from(g.st.mq), []);
  assert.strictEqual(g.st.mode, 'none');
  assert.strictEqual(g.st.wizLit, false);

  // Multiball outlasts the mode while more than one ball is left, and ends once at most one is.
  assert.strictEqual(g.sim.balls.length, 3);
  assert.strictEqual(g.st.mb, true);
  assert.strictEqual(evs(g, 'mbend', m3).length, 0, 'mbend is held back while 3 balls remain');
  drainBalls(g, 1);
  assert.strictEqual(g.sim.balls.length, 2);
  assert.strictEqual(evs(g, 'mbend', m3).length, 0, 'mbend must wait for one ball');
  assert.strictEqual(g.st.mb, true);
  drainBalls(g, 1);
  assert.strictEqual(g.sim.balls.length, 1);
  assert.strictEqual(evs(g, 'mbend', m3).length, 1, 'mbend fires once when one ball is left');
  assert.strictEqual(g.st.mb, false);
  assert.ok(mark >= 0);
});

/* ---------- 6. all balls lost during Last Stand ---------- */

test('6. losing every ball during Last Stand leaves a consistent game, and game over stops all modes', function () {
  const g = newGame(6);
  startWizard(g);
  g.park = false;
  const sim = g.sim, st = g.st;
  const mark = g.log.length;

  // First loss of all three balls: the 20 s Last Stand saver puts one back in play.
  drainBalls(g, 3);
  assert.strictEqual(evs(g, 'save', mark).length, 1, 'saver should replace the lost balls');
  assert.strictEqual(st.ball, 1);
  assert.ok(st.wiz, 'Last Stand survives the saver');
  assert.strictEqual(sim.balls.length, 1);

  // Keep losing everything. Ball number may only move on, and nothing may go bad.
  let lastBall = st.ball, iterations = 0;
  while (!st.over && iterations++ < 40) {
    sim.balls.slice().forEach(function (b) { b.y = 800; });
    frame(g); frame(g);
    assert.ok(st.ball >= lastBall && st.ball <= 3, 'ball number must only move on, max 3');
    lastBall = st.ball;
    assert.strictEqual(findBadNumber(st, 'st'), null);
    sim.balls.forEach(function (b) { assert.strictEqual(findBadNumber(b, 'ball'), null); });
  }
  assert.strictEqual(st.over, true, 'game should end after the third ball is lost');
  assert.strictEqual(st.ball, 3);
  assert.strictEqual(st.wiz, null, 'no Last Stand left running after game over');
  assert.strictEqual(st.boss, null);
  assert.strictEqual(st.mission, null);
  assert.strictEqual(st.video, null);
  assert.strictEqual(st.mode, 'none');
  assert.strictEqual(st.wizards, 1, 'the mode that ended at game over counts as finished');
  assert.deepStrictEqual(Array.from(st.heroes), [false, false, false]);
  assert.deepStrictEqual(Array.from(st.missions), [0, 0, 0]);
  assert.strictEqual(evs(g, 'wizardEnd', mark).length, 1, 'wizardEnd fires once at game over');
  assert.strictEqual(evs(g, 'over', mark).length, 1);
  assert.strictEqual(st.mb, false, 'multiball is over at game over');
  assert.ok(Number.isInteger(st.match) && st.match >= 0 && st.match <= 9);
  assert.strictEqual(findBadNumber(st, 'st'), null);
});

/* ---------- 7. shoot again ---------- */

test('7. a drain with an extra ball banked replays the same ball number and emits shootAgain', function () {
  const g = newGame(7);
  g.park = false;
  // SETUP ONLY: an extra ball is normally earned (2nd drop bank, 1st vault jackpot) and
  // collected at the Hideout; that takes a long time. luckyUsed stops the random 15%
  // lucky save from replacing the ball we are draining.
  g.st.extra = 1;
  g.st.luckyUsed = true;
  const mark = g.log.length;
  drainBalls(g, 1);
  const order = names(g, mark);
  assert.ok(order.indexOf('drain') >= 0 && order.indexOf('shootAgain') === order.indexOf('drain') + 1, 'drain then shootAgain: ' + order);
  assert.strictEqual(g.st.ball, 1, 'same ball number');
  assert.strictEqual(g.st.extra, 0, 'the extra ball is spent');
  assert.strictEqual(g.st.over, false);
  assert.strictEqual(g.sim.balls.length, 1);

  // Control: without an extra ball the next drain moves on to ball 2.
  g.st.luckyUsed = true;
  const m2 = g.log.length;
  drainBalls(g, 1);
  assert.strictEqual(g.st.ball, 2);
  assert.strictEqual(evs(g, 'shootAgain', m2).length, 0);
});

/* ---------- 8. lock and multiball ---------- */

test('8. both side targets light the lock; two locks start 3-ball multiball; it ends at one ball', function () {
  const g = newGame(8);
  quiet(g);
  const sim = g.sim, st = g.st;
  const b = freeBall(g);
  let mark = g.log.length;
  g.active = b;
  put(b, sim.targets[0].x + 22, sim.targets[0].y, -500, 0);
  runUntil(g, function () { return evs(g, 'target', mark).some(function (e) { return e.v === 0; }); }, 1, 'left side target');
  assert.strictEqual(st.lockLit, false, 'one target is not enough');
  put(b, sim.targets[1].x - 22, sim.targets[1].y, 500, 0);
  runUntil(g, function () { return evs(g, 'target', mark).some(function (e) { return e.v === 1; }); }, 1, 'right side target');
  g.active = null;
  assert.strictEqual(evs(g, 'lockLit', mark).length, 1);
  assert.strictEqual(st.lockLit, true);

  mark = capture(g);
  assert.deepStrictEqual(evs(g, 'lock', mark).map(function (e) { return e.v; }), [1]);
  assert.strictEqual(st.locks, 1);
  assert.strictEqual(evs(g, 'multiball', mark).length, 0);
  assert.strictEqual(st.mb, false);

  mark = capture(g);
  assert.deepStrictEqual(evs(g, 'lock', mark).map(function (e) { return e.v; }), [2]);
  assert.strictEqual(evs(g, 'multiball', mark).length, 1);
  assert.strictEqual(st.mb, true);
  assert.strictEqual(st.locks, 0);
  assert.strictEqual(st.lockLit, false);
  run(g, 2.5);                                           // queued balls feed in
  assert.strictEqual(sim.balls.length, 3, 'multiball is three balls');
  assert.strictEqual(st.queue, 0);

  mark = g.log.length;
  drainBalls(g, 1);
  assert.strictEqual(sim.balls.length, 2);
  assert.strictEqual(evs(g, 'mbend', mark).length, 0, 'two balls is still multiball');
  assert.strictEqual(st.mb, true);
  drainBalls(g, 1);
  assert.strictEqual(sim.balls.length, 1);
  assert.strictEqual(evs(g, 'mbend', mark).length, 1, 'mbend when one ball is left');
  assert.strictEqual(st.mb, false);
});

/* ---------- 9. Rooftop Chase ---------- */

test('9. Rooftop Chase: lit by spinner turns, started by a Hideout capture, freezes every ball, ends in time', function () {
  const g = newGame(9);
  quiet(g);
  const sim = g.sim, st = g.st, def = sim.videoDef;

  // Light it for real: a fast ball falling through the spinner turns it enough half
  // turns (videoDef.spins). A few passes at most.
  g.active = null;
  for (let tries = 0; tries < 4 && !st.videoLit; tries++) {
    const b = freeBall(g);
    put(b, sim.spinner.x, sim.spinner.y - 30, 0, 1500);
    g.active = b;
    run(g, 0.1);
    g.active = null;
    run(g, 6);
  }
  assert.strictEqual(evs(g, 'videoLit').length, 1, 'spinner should light Rooftop Chase');
  assert.strictEqual(st.videoLit, true);
  assert.strictEqual(st.video, null);

  // A second ball in play, moving, when the chase starts. SETUP ONLY: copied from the
  // first ball so the freeze can be seen on a ball that is not pinned in the Hideout.
  g.park = false;
  waitHideoutFree(g);
  const b1 = sim.balls[0];
  const b2 = Object.assign({}, b1);
  sim.balls.push(b2);
  put(b2, 250, 100, 80, 0);
  const mark = g.log.length, h = sim.hideout;
  put(b1, h.x, h.y, 0, 0);
  frame(g);
  assert.strictEqual(evs(g, 'videoStart', mark).length, 1, 'videoStart did not fire');
  assert.ok(st.video, 'st.video is set');
  assert.strictEqual(st.mode, 'video');
  assert.strictEqual(evs(g, 'missionStart', mark).length, 0, 'no mission starts under video');

  const pos = function () { return JSON.stringify(sim.balls.map(function (q) { return [q.x, q.y, q.vx, q.vy, q.hold]; })) + sim.hideout.t + JSON.stringify([sim.flippers[0].a, sim.flippers[1].a, sim.spinner.a]); };
  const frozen = pos();
  let secs = 0, moved = false;
  while (st.video && secs < def.t + 1) {
    if (!moved && secs > 1) {                           // a flipper press moves the hero, not the flippers
      sim.setFlipper(0, true); sim.setFlipper(0, false);
      sim.setFlipper(1, true); sim.setFlipper(1, false);
      moved = true;
    }
    frame(g);
    secs += DT;
    if (st.video) assert.strictEqual(pos(), frozen, 'balls, hold timers and flippers must stand still during the chase');
  }
  assert.strictEqual(st.video, null, 'chase must end within videoDef.t + 1 s (ran ' + secs.toFixed(2) + ')');
  assert.ok(secs <= def.t + 1);
  assert.ok(evs(g, 'videoMove', mark).length >= 2, 'flipper presses move the hero');
  assert.strictEqual(evs(g, 'videoEnd', mark).length, 1);
  assert.strictEqual(evs(g, 'videoEnd', mark)[0].v, evs(g, 'videoDodge', mark).length, 'videoEnd reports the dodges');
  assert.ok(evs(g, 'videoHit', mark).length <= def.maxHits);
  assert.strictEqual(st.videoLit, false);
  assert.strictEqual(st.mode, 'none');

  // Everything resumes: the Hideout then kicks its ball out.
  run(g, 1.5);
  assert.strictEqual(sim.hideout.t, 0);
  assert.strictEqual(b1.hold, 0);
});

/* ---------- 10. match ---------- */

function checkMatch(g, label) {
  const st = g.st;
  assert.strictEqual(st.over, true, label);
  assert.ok(Number.isInteger(st.match) && st.match >= 0 && st.match <= 9, label + ': match ' + st.match);
  assert.strictEqual(st.matchWin, st.match === Math.floor(st.score / 10) % 10, label + ': matchWin vs tens digit of ' + st.score);
  const ev = evs(g, 'match');
  assert.strictEqual(ev.length, 1, label + ': one match event');
  assert.strictEqual(ev[0].v, st.match * 10);
}

test('10. at game over st.match is a digit 0-9 and matchWin follows the tens-digit rule', function () {
  checkMatch(randomGame(21), 'random game 21');
  checkMatch(randomGame(22), 'random game 22');

  // Quick games: drain three balls with a chosen score so the tens digit varies.
  // SETUP ONLY: st.score is written so a range of tens digits is covered; a seeded
  // random draw makes the match digit.
  let wins = 0, losses = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = newGame(1000 + seed);
    g.park = false;
    g.st.score = seed * 10 + 5;
    let guard = 0;
    while (!g.st.over && guard++ < 30) {
      g.sim.balls.slice().forEach(function (b) { b.y = 800; });
      frame(g); frame(g);
    }
    checkMatch(g, 'quick game ' + seed);
    if (g.st.matchWin) wins++; else losses++;
  }
  assert.ok(wins > 0 && losses > 0, 'both outcomes should be seen (wins ' + wins + ', losses ' + losses + ')');
});
