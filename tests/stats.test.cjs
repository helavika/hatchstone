const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Anonymous play stats (js/stats.js): what goes to Umami is a word and a few numbers, never the nest or a name,
// and nothing goes at all without a site ID, with the setting off, locally or from a test browser.
function load({ site = 'abc', host = 'helavika.github.io', on = true, webdriver = false } = {}) {
  const sent = [];
  const ctx = {
    STAGING: false, LANG: 'uk', screen: { width: 390, height: 844 }, document: { referrer: '', hidden: false, addEventListener() {} },
    location: { hostname: host }, navigator: { webdriver }, opts: () => ({ stats: on }), performance: { now: () => 0 },
    save: { stars: { 1: 3, 2: 2 }, creatures: [{ name: 'Secret name', sp: 'x' }], me: { name: 'V' } }, persist() {}, addEventListener() {}, matchMedia: () => ({ matches: false }),
    window: {}, fetch: (url, o) => { sent.push({ url, body: JSON.parse(o.body) }); return Promise.resolve(); }, JSON, Math, Date, Set, String, Object,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/stats.js'), 'utf8').replace(/site: "[^"]*",/, `site: ${JSON.stringify(site)},`) + '\nthis.track = track; this.trackOnce = trackOnce; this.statsStart = statsStart; this.statAge = statAge;', ctx);
  return { ctx, sent };
}

test('an event is a name and a few numbers for Umami, nothing from the nest', () => {
  const { ctx, sent } = load();
  ctx.track('walk', { path: 'meadow', glowlings: 1 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://cloud.umami.is/api/send');
  const p = sent[0].body.payload;
  assert.equal(sent[0].body.type, 'event');
  assert.deepEqual([p.website, p.name, p.url, p.hostname], ['abc', 'walk', '/', 'helavika.github.io']);
  assert.deepEqual(p.data, { path: 'meadow', glowlings: 1 });
  ctx.statsStart();
  const all = JSON.stringify(sent);
  assert.ok(!all.includes('Secret name') && !all.includes('"V"'), 'no names leave the device');
  assert.ok(sent.some(s => s.body.payload.name === 'open' && s.body.payload.data.days === '0'));
});

test('nothing is sent without a site ID, with the setting off, locally, or from a test browser', () => {
  for (const o of [{ site: '' }, { on: false }, { host: 'localhost' }, { host: '127.0.0.1' }, { webdriver: true }]) {
    const { ctx, sent } = load(o); ctx.track('walk'); ctx.statsStart();
    assert.equal(sent.length, 0, JSON.stringify(o));
  }
});

test('a task counts once a session, and the days you have had the game come in rough steps', () => {
  const { ctx, sent } = load();
  ctx.trackOnce('do', { what: 'feed' }); ctx.trackOnce('do', { what: 'feed' }); ctx.trackOnce('do', { what: 'pet' });
  assert.equal(sent.length, 2);
  const D = 864e5;
  assert.deepEqual([0, 1, 3, 7, 10, 20, 90].map(d => ctx.statAge(0, d * D + 1)), ['0', '1', '2-3', '4-7', '8-14', '15-30', '31+']);
});
