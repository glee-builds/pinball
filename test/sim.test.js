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
 *   - a ball outside the shooter lane stays below speed 10 for over 3 s
 *     (the sim nudges a stopped ball after 2.5 s, so this means the nudge failed)
 *   - a ball outside the shooter lane stays within 15 units of one spot
 *     for over 10 s (trapped, even if it is jiggling)
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
var STOP_SPEED = 10;        // below this a ball counts as stopped
var STOP_SECONDS = 3.0;     // stopped for longer than this fails
var TRAP_RADIUS = 15;       // a ball staying inside this radius counts as trapped
var TRAP_SECONDS = 10;      // trapped for longer than this fails

function inShooterLane(b) { return b.x > 360 && b.y > 600; }

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

var EV = { lockLit: 0, lock: 0, multiball: 0, kickback: 0, lane0: 0, lane1: 0, lane2: 0, lane3: 0, spin: 0, drop: 0, bank: 0, orbit: 0, hideout: 0, hero: 0, bossStart: 0, bossWin: 0, bossEscape: 0, alley: 0, bossSurprise: 0, ramp0: 0, ramp1: 0, rampFail: 0, relay: 0,
  missionReady: 0, missionStart: 0, missionDone: 0, missionFail: 0, wizardLit: 0, wizardStart: 0, superJackpot: 0, wizardEnd: 0,
  lairOpen: 0, lairEnter: 0, guard: 0, vaultLit: 0, vault0: 0, vault1: 0, lairExit: 0,
  shieldUp: 0, shieldHit: 0, shieldDown: 0, magnet: 0, extraLit: 0, extraBall: 0, shootAgain: 0, match: 0, matchWin: 0, videoLit: 0, videoStart: 0, videoHit: 0, videoDodge: 0, videoEnd: 0, chain: 0,
  encore: 0, hustle: 0, rally: 0, superskill: 0 };
var VIDEO_MAX = 22;          // a video mode longer than this many simulated seconds fails

function playGame(seed) {
  var sim = loadSim(seed);
  var input = mulberry32(seed ^ 0x9E3779B9);   // separate stream for the "player"
  var st = sim.st;
  var seen = [];                                // balls alive after the previous step
  var track = [];                               // per-ball {ref, slow, ax, ay, trap} for the stuck checks
  var frame = 0;
  var videoStart = -1;                          // st.time when the running video mode began

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
    for (var ei = 0; ei < sim.events.length; ei++) {
      var ev = sim.events[ei];
      if (ev.t === 'surprise') { if (ev.v === 'alley') EV.alley++; else if (ev.v === 'boss') EV.bossSurprise++; else if (ev.v === 'superskill') EV.superskill++; }
      else if (ev.t === 'combo2') EV[ev.v]++;
      else if (ev.t === 'lane') EV['lane' + ev.v]++;
      else if (ev.t === 'ramp') EV['ramp' + ev.v]++;
      else if (ev.t === 'vault') EV['vault' + ev.v]++;
      else if (EV[ev.t] !== undefined) EV[ev.t]++;
    }
    sim.events.length = 0;
    if (st.video) { if (videoStart < 0) videoStart = st.time; if (st.time - videoStart > VIDEO_MAX) return fail('video mode ran past ' + VIDEO_MAX + ' simulated seconds'); }
    else videoStart = -1;

    var k, b, bad;
    for (k = 0; k < sim.balls.length; k++) {
      b = sim.balls[k];
      bad = findBadNumber(b, 'ball[' + k + ']');
      if (bad) return fail('NaN: ' + bad);
      if (b.h > 0) {
        if (b.x < 0 || b.x > 400 || b.y < sim.top || b.y > 720) {
          return fail('path ball left the area at x=' + b.x.toFixed(1) + ' y=' + b.y.toFixed(1) + ' h=' + b.h.toFixed(2));
        }
      } else if (b.lv === 1) {
        var L = sim.lair, mg = sim.R - 1;
        if (b.x < L.x0 + mg || b.x > L.x1 - mg || b.y < L.y0 + mg || b.y > L.y1 - mg) {
          return fail('lair ball left the lair at x=' + b.x.toFixed(1) + ' y=' + b.y.toFixed(1));
        }
      } else if (b.y < EXIT_Y && outsideTable(b)) {
        return fail('ball left the table at x=' + b.x.toFixed(1) + ' y=' + b.y.toFixed(1));
      }
    }
    // a ball the sim removed must have gone out the bottom, not the sides or top
    for (k = 0; k < seen.length; k++) {
      if (sim.balls.indexOf(seen[k].ref) === -1 && (seen[k].y < EXIT_Y || seen[k].lv !== 0)) {
        return fail('ball removed above y=' + EXIT_Y + ', last seen x=' + seen[k].x.toFixed(1) + ' y=' + seen[k].y.toFixed(1));
      }
    }
    // stuck checks, tracked per ball object across frames
    var nextTrack = [];
    for (k = 0; k < sim.balls.length; k++) {
      b = sim.balls[k];
      var tr = null, j;
      for (j = 0; j < track.length; j++) if (track[j].ref === b) { tr = track[j]; break; }
      if (!tr) tr = { ref: b, slow: 0, ax: b.x, ay: b.y, trap: 0 };
      nextTrack.push(tr);
      if (st.video) continue;                  // video mode freezes every ball: stuck timers neither advance nor reset
      if (inShooterLane(b)) {
        tr.slow = 0; tr.trap = 0; tr.ax = b.x; tr.ay = b.y;
        continue;
      }
      if (Math.sqrt(b.vx * b.vx + b.vy * b.vy) < STOP_SPEED) tr.slow += DT; else tr.slow = 0;
      if (tr.slow > STOP_SECONDS) {
        return fail('ball stopped for over ' + STOP_SECONDS + 's at x=' + b.x.toFixed(1) + ' y=' + b.y.toFixed(1));
      }
      var ddx = b.x - tr.ax, ddy = b.y - tr.ay;
      if (Math.sqrt(ddx * ddx + ddy * ddy) > TRAP_RADIUS) { tr.ax = b.x; tr.ay = b.y; tr.trap = 0; }
      else tr.trap += DT;
      if (tr.trap > TRAP_SECONDS) {
        return fail('ball trapped within ' + TRAP_RADIUS + ' units for over ' + TRAP_SECONDS + 's at x=' + b.x.toFixed(1) + ' y=' + b.y.toFixed(1));
      }
    }
    track = nextTrack;
    seen = sim.balls.map(function (q) { return { ref: q, x: q.x, y: q.y, lv: q.lv }; });

    bad = findBadNumber(st, 'st') || findBadNumber(sim.flippers, 'flippers') ||
          findBadNumber(sim.orbit, 'orbit') || findBadNumber(sim.hideout, 'hideout') ||
          findBadNumber(sim.lanes, 'lanes') || findBadNumber(sim.kickback, 'kickback') ||
          findBadNumber(sim.spinner, 'spinner') || findBadNumber(sim.drops, 'drops') || findBadNumber(sim.ramps, 'ramps') || findBadNumber(sim.lair, 'lair') ||
          findBadNumber(sim.missionDefs, 'missionDefs') ||
          findBadNumber(sim.shield, 'shield') || findBadNumber(sim.magnet, 'magnet') || findBadNumber(sim.videoDef, 'videoDef');
    if (bad) return fail('NaN: ' + bad);
    if (st.time > MAX_SECONDS) return fail('game still running after ' + MAX_SECONDS + ' simulated seconds');
  }
  if (st.matchWin) EV.matchWin++;
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
console.log('Events over ' + GAMES + ' games: orbit ' + EV.orbit + ', hideout ' + EV.hideout + ', hero ' + EV.hero +
  ', bossStart ' + EV.bossStart + ', bossWin ' + EV.bossWin + ', bossEscape ' + EV.bossEscape +
  ', surprise alley ' + EV.alley + ', surprise boss ' + EV.bossSurprise +
  ', lockLit ' + EV.lockLit + ', lock ' + EV.lock + ', multiball ' + EV.multiball + ', kickback ' + EV.kickback +
  ', lane0 ' + EV.lane0 + ', lane1 ' + EV.lane1 + ', lane2 ' + EV.lane2 + ', lane3 ' + EV.lane3 +
  ', ramp0 ' + EV.ramp0 + ', ramp1 ' + EV.ramp1 + ', rampFail ' + EV.rampFail + ', relay ' + EV.relay +
  ', spin ' + EV.spin + ', drop ' + EV.drop + ', bank ' + EV.bank +
  ', missionReady ' + EV.missionReady + ', missionStart ' + EV.missionStart + ', missionDone ' + EV.missionDone + ', missionFail ' + EV.missionFail +
  ', wizardLit ' + EV.wizardLit + ', wizardStart ' + EV.wizardStart + ', superJackpot ' + EV.superJackpot + ', wizardEnd ' + EV.wizardEnd +
  ', lairOpen ' + EV.lairOpen + ', lairEnter ' + EV.lairEnter + ', guard ' + EV.guard + ', vaultLit ' + EV.vaultLit +
  ', vault0 ' + EV.vault0 + ', vault1 ' + EV.vault1 + ', lairExit ' + EV.lairExit + '.');
console.log('Round 6 events over ' + GAMES + ' games: shieldUp ' + EV.shieldUp + ', shieldHit ' + EV.shieldHit + ', shieldDown ' + EV.shieldDown +
  ', magnet ' + EV.magnet + ', extraLit ' + EV.extraLit + ', extraBall ' + EV.extraBall + ', shootAgain ' + EV.shootAgain +
  ', match ' + EV.match + ', matchWin ' + EV.matchWin + ', videoLit ' + EV.videoLit + ', videoStart ' + EV.videoStart +
  ', videoHit ' + EV.videoHit + ', videoDodge ' + EV.videoDodge + ', videoEnd ' + EV.videoEnd + ', chain ' + EV.chain +
  ', encore ' + EV.encore + ', hustle ' + EV.hustle + ', rally ' + EV.rally + ', superskill ' + EV.superskill + '.');
process.exit(failures ? 1 : 0);
