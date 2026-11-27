#!/usr/bin/env node
/*
 * Headless soak test for the Comet Alley sim.
 *
 *   node test/sim.test.js            40 seeded games
 *   node test/sim.test.js 200        200 seeded games
 *   node test/sim.test.js 1 17       1 game, starting at seed 17
 *
 * The sim script is pulled out of index.html and run in an empty VM
 * context (no window, no document), so any DOM access in the sim throws.
 * Math.random is replaced with a seeded generator inside that context
 * only. index.html itself is never modified.
 *
 * A game fails if:
 *   - a ball leaves the table above y = 640 (through a wall or the arc)
 *   - any numeric value in the sim state is NaN or infinite
 *   - the game runs past 600 simulated seconds
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var GAMES = parseInt(process.argv[2], 10) > 0 ? parseInt(process.argv[2], 10) : 40;
var FIRST_SEED = parseInt(process.argv[3], 10) || 1;
var DT = 1 / 60;
var MAX_SECONDS = 600;
var EXIT_Y = 640;

var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var m = html.match(/<script id="sim">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no <script id="sim"> found in index.html'); process.exit(1); }
var simSource = m[1];

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadSim(seed) {
  var ctx = vm.createContext({});
  vm.runInContext(simSource, ctx, { filename: 'index.html#sim' });
  ctx.__rand = mulberry32(seed);
  vm.runInContext('Math.random = __rand;', ctx);
  return vm.runInContext('makeSim()', ctx);
}

/* Table outline above the flippers: side walls at x = 10 and x = 390,
   closed on top by an arc of radius 190 centered on (200, 190). */
function outsideTable(b) {
  if (b.y >= 190) return b.x < 10 || b.x > 390;
  var dx = b.x - 200, dy = b.y - 190;
  return dx * dx + dy * dy > 190 * 190;
}

function findBadNumber(v, where) {
  if (typeof v === 'number') return isFinite(v) ? null : where + ' = ' + v;
  if (v && typeof v === 'object') {
    for (var k in v) {
      var r = findBadNumber(v[k], where + '.' + k);
      if (r) return r;
    }
  }
  return null;
}

function playGame(seed) {
  var sim = loadSim(seed);
  var input = mulberry32(seed ^ 0x9E3779B9);   // separate stream for the "player"
  var st = sim.st;
  var seen = [];                                // balls alive after the previous step
  var frame = 0;

  function fail(msg) {
    return { ok: false, seed: seed, msg: msg + ' (t=' + st.time.toFixed(2) + 's, frame ' + frame + ')' };
  }

  sim.newGame();
  while (!st.over) {
    frame++;
    // random flipper mashing: each bat changes state now and then
    if (input() < 0.08) sim.setFlipper(0, !sim.flippers[0].pressed);
    if (input() < 0.08) sim.setFlipper(1, !sim.flippers[1].pressed);
    if (sim.inLane() && input() < 0.1) sim.launch(input());

    sim.step(DT);
    sim.events.length = 0;

    var k, b, bad;
    for (k = 0; k < sim.balls.length; k++) {
      b = sim.balls[k];
      bad = findBadNumber(b, 'ball[' + k + ']');
      if (bad) return fail('NaN: ' + bad);
      if (b.y < EXIT_Y && outsideTable(b)) {
        return fail('ball left the table at x=' + b.x.toFixed(1) + ' y=' + b.y.toFixed(1));
      }
    }
    // a ball the sim removed must have gone out the bottom, not the sides or top
    for (k = 0; k < seen.length; k++) {
      if (sim.balls.indexOf(seen[k].ref) === -1 && seen[k].y < EXIT_Y) {
        return fail('ball removed above y=' + EXIT_Y + ', last seen x=' + seen[k].x.toFixed(1) + ' y=' + seen[k].y.toFixed(1));
      }
    }
    seen = sim.balls.map(function (q) { return { ref: q, x: q.x, y: q.y }; });

    bad = findBadNumber(st, 'st') || findBadNumber(sim.flippers, 'flippers');
    if (bad) return fail('NaN: ' + bad);
    if (st.time > MAX_SECONDS) return fail('game still running after ' + MAX_SECONDS + ' simulated seconds');
  }
  return { ok: true, seed: seed, score: st.score, time: st.time, bumps: st.bumps, mb: st.mbCount };
}

var failures = 0, totalTime = 0, longest = 0, top = 0;
for (var g = 0; g < GAMES; g++) {
  var res;
  try { res = playGame(FIRST_SEED + g); }
  catch (e) { res = { ok: false, seed: FIRST_SEED + g, msg: 'threw: ' + (e && e.stack || e) }; }
  if (res.ok) {
    totalTime += res.time; longest = Math.max(longest, res.time); top = Math.max(top, res.score);
    console.log('ok   seed ' + res.seed + '  score ' + res.score + '  ' + res.time.toFixed(1) + 's  bumpers ' + res.bumps + '  multiballs ' + res.mb);
  } else {
    failures++;
    console.log('FAIL seed ' + res.seed + '  ' + res.msg);
  }
}

console.log('');
console.log(GAMES + ' games, ' + failures + ' failed. Average ' + (totalTime / Math.max(1, GAMES - failures)).toFixed(1) +
  's, longest ' + longest.toFixed(1) + 's, top score ' + top + '.');
process.exit(failures ? 1 : 0);
