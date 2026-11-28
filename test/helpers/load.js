'use strict';
/*
 * Shared loader for the test files. Reads index.html, pulls out the sim script
 * body, and runs it in a fresh Node vm context with a seeded Math.random.
 * Not a test file: the CI glob is test/*.test.js, which does not match this.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PAGE = path.join(__dirname, '..', '..', 'index.html');

// The whole index.html as text.
function readPage() {
  return fs.readFileSync(PAGE, 'utf8');
}

// The body of <script id="sim">, or null if the page has no such script.
function extractSim(html) {
  const m = html.match(/<script id="sim">([\s\S]*?)<\/script>/);
  return m ? m[1] : null;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns loadSim(seed): each call runs the sim source in a new empty vm context
// (no window, no document), seeds Math.random inside that context only, and
// returns the object makeSim() builds.
function makeLoader(simSource) {
  return function loadSim(seed) {
    const ctx = vm.createContext({});
    vm.runInContext(simSource, ctx, { filename: 'index.html#sim' });
    ctx.__rand = mulberry32(seed);
    vm.runInContext('Math.random = __rand;', ctx);
    return vm.runInContext('makeSim()', ctx);
  };
}

module.exports = { readPage, extractSim, mulberry32, makeLoader };
