const test = require('node:test');
const assert = require('node:assert/strict');
const GiftLink = require('../js/gifts.js');

const KNOWN = { snack: ['dew', 'cookie', 'berry'], seed: ['glowberry', 'moonmint'], charm: ['heart', 'star', 'moon'] };
const TODAY = 20406;
const parcel = (over = {}) => GiftLink.make({ kind: 'snack', item: 'berry', n: 2, note: 'For your nest ♥', from: 'Ola', day: TODAY, ...over });
// the seal, worked out the same way, to hand-build codes that make() and encode() would never produce
const fnv = text => { let h = 0x811c9dc5; for (const b of Buffer.from('hatchstone-gift|' + text)) h = Math.imul(h ^ b, 0x01000193) >>> 0; return h.toString(36); };
const sealed = text => Buffer.from(text).toString('base64url') + '.' + fnv(text);
const reject = (code, why) => assert.throws(() => GiftLink.decode(code, KNOWN, TODAY), new RegExp(`^Error: ${why}$`));

test('a parcel survives the trip through a link', () => {
  const g = parcel({ note: 'Тримай ягідки 🫐 і обійми 👩‍👧', from: 'Віка' });
  const code = GiftLink.encode(g);
  assert.match(code, /^[A-Za-z0-9_-]+\.[0-9a-z]+$/);
  const back = GiftLink.decode(code, KNOWN, TODAY);
  assert.deepEqual(back, g);
  assert.match(g.id, /^[0-9a-z]{8}$/);
  assert.notEqual(parcel().id, parcel().id);
});

test('notes and names are plain words: no control or markup characters, capped length', () => {
  const g = parcel({ note: '<img src=x onerror=alert(1)>\u0007hi‮\nthere  ', from: '  <b>Bo</b>\u0000 ' });
  assert.equal(g.m, 'img src=x onerror=alert(1)hi there');
  assert.equal(g.f, 'bBo/b');
  assert.equal([...parcel({ note: '✦'.repeat(300) }).m].length, GiftLink.NOTE_MAX);
  assert.equal([...parcel({ from: 'x'.repeat(99) }).f].length, GiftLink.NAME_MAX);
  // the emoji joiner stays, so families and flags hold together
  assert.equal(GiftLink.clean('👩‍👧', 10), '👩‍👧');
});

test('a tampered or broken link is turned away', () => {
  const code = GiftLink.encode(parcel());
  const [b64, seal] = code.split('.');
  // more berries than were sent, with the old seal
  const json = Buffer.from(b64, 'base64url').toString().replace('"n":2', '"n":5');
  reject(Buffer.from(json).toString('base64url') + '.' + seal, 'seal');
  reject(code.slice(0, -1) + (code.endsWith('a') ? 'b' : 'a'), 'seal');
  reject(code.slice(0, 20), 'shape');
  reject('', 'shape');
  reject('not a code at all', 'shape');
  reject('x'.repeat(5000) + '.abc', 'shape');
  reject(Buffer.from('not json').toString('base64url') + '.' + fnv('not json'), 'shape');
});

test('schema, items, counts and dates are all checked', () => {
  // encode() seals whatever fields it's given, so each bad parcel arrives with a good seal
  const sealed = obj => GiftLink.encode(obj);
  const base = parcel();
  reject(sealed({ ...base, k: 'gem' }), 'item');
  reject(sealed({ ...base, i: 'gold' }), 'item');
  reject(sealed({ ...base, k: 'seed', i: 'berry' }), 'item');
  reject(sealed({ ...base, n: 0 }), 'count');
  reject(sealed({ ...base, n: 6 }), 'count');
  reject(sealed({ ...base, n: 1.5 }), 'count');
  reject(sealed({ ...base, k: 'seed', i: 'moonmint', n: 4 }), 'count');
  reject(sealed({ ...base, k: 'charm', i: 'heart', n: 2 }), 'count');
  reject(sealed({ ...base, m: 'x'.repeat(141) }), 'note');
  reject(sealed({ ...base, f: 'x'.repeat(25) }), 'note');
  reject(sealed({ ...base, v: 2 }), 'version');
  reject(sealed({ ...base, id: 'BAD id!' }), 'shape');
  reject(sealed({ ...base, d: TODAY + 5 }), 'shape');
  reject(sealed({ ...base, d: TODAY - GiftLink.MAX_AGE - 1 }), 'old');
  assert.equal(GiftLink.decode(sealed({ ...base, k: 'charm', i: 'moon', n: 1 }), KNOWN, TODAY).i, 'moon');
  // a note with markup sneaked past make() comes out clean
  assert.equal(GiftLink.decode(sealed({ ...base, m: '<script>hi</script>' }), KNOWN, TODAY).m, 'scripthi/script');
});

test('extra or missing fields are not a parcel', () => {
  reject(sealed(JSON.stringify({ ...parcel(), extra: 1 })), 'shape');
  const { m, ...noNote } = parcel();
  reject(sealed(JSON.stringify(noNote)), 'shape');
  reject(sealed('[1,2]'), 'shape');
  reject(sealed('null'), 'shape');
  assert.ok(m);
});

test('the same link only opens once on a device, and your own parcel never opens for you', () => {
  const ledger = {}, g = parcel(), mine = parcel();
  GiftLink.sent(ledger, mine);
  assert.equal(GiftLink.receive(ledger, mine, TODAY), 'mine');
  assert.equal(GiftLink.receive(ledger, g, TODAY), 'ok');
  assert.equal(GiftLink.receive(ledger, g, TODAY), 'again');
  assert.equal(GiftLink.receive(ledger, g, TODAY + 3), 'again');
  assert.deepEqual(ledger.got, [g.id]);
});

test('only a few parcels a day; the rest wait for tomorrow', () => {
  const ledger = {};
  for (let i = 0; i < GiftLink.DAY_CAP; i++) assert.equal(GiftLink.receive(ledger, parcel(), TODAY), 'ok');
  const late = parcel();
  assert.equal(GiftLink.receive(ledger, late, TODAY), 'full');
  // turned away today isn't remembered as opened: it still works tomorrow
  assert.equal(GiftLink.receive(ledger, late, TODAY + 1), 'ok');
  assert.equal(ledger.n, 1);
});

test('the ledgers stay small', () => {
  const ledger = {};
  for (let i = 0; i < 260; i++) GiftLink.sent(ledger, parcel());
  assert.equal(ledger.sent.length, 200);
});
