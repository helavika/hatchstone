const test = require('node:test');
const assert = require('node:assert/strict');
const { Peer, encodeSignal, decodeSignal } = require('../coop-link.js');

function makeDescription(type, sdp = 'v=0\r\na=fake') {
  return { type, sdp };
}

class FakeChannel {
  constructor(label, opts) {
    this.label = label;
    this.options = opts;
    this.readyState = 'connecting';
    this.bufferedAmount = 0;
    this.sent = [];
  }
  send(value) { this.sent.push(value); }
  close() { this.readyState = 'closed'; if (this.onclose) this.onclose(); }
  open() { this.readyState = 'open'; if (this.onopen) this.onopen(); }
}

class FakeConnection {
  static instances = [];
  constructor(config) {
    this.config = config;
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceGatheringState = 'new';
    this.connectionState = 'new';
    this.channels = [];
    this.closed = false;
    FakeConnection.instances.push(this);
  }
  createDataChannel(label, opts) {
    const channel = new FakeChannel(label, opts);
    this.channels.push(channel);
    return channel;
  }
  async createOffer() { return makeDescription('offer'); }
  async createAnswer() { return makeDescription('answer'); }
  async setLocalDescription(desc) {
    this.localDescription = desc;
    this.iceGatheringState = 'complete';
    if (this.onicegatheringstatechange) this.onicegatheringstatechange();
  }
  async setRemoteDescription(desc) { this.remoteDescription = desc; }
  close() { this.closed = true; this.connectionState = 'closed'; if (this.onconnectionstatechange) this.onconnectionstatechange(); }
}

function factory(config) { return new FakeConnection(config); }

function pair() {
  FakeConnection.instances.length = 0;
  const host = new Peer({ rtcFactory: factory });
  const guest = new Peer({ rtcFactory: factory });
  return { host, guest };
}

test('signal encoding is prefixed, bounded base64url JSON with strict shape', () => {
  const signal = { v: 1, type: 'offer', room: 'room_abc', sdp: 'v=0\r\na=x' };
  const code = encodeSignal(signal);
  assert.match(code, /^hatchstone1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeSignal(code), signal);
  assert.equal(globalThis.HatchstoneLink.Peer, Peer);
  assert.throws(() => decodeSignal('hatchstone1.!'), /signal/i);
  assert.throws(() => encodeSignal({ ...signal, extra: true }), /signal/i);
  assert.throws(() => encodeSignal({ ...signal, sdp: 'x'.repeat(20000) }), /SDP|signal/i);
});

test('constructor and import do not create a network connection', () => {
  FakeConnection.instances.length = 0;
  const peer = new Peer({ rtcFactory: factory });
  assert.equal(peer.role, null);
  assert.equal(peer.room, null);
  assert.equal(peer.connected, false);
  assert.equal(FakeConnection.instances.length, 0);
  peer.close('unused');
});

test('host creates one reliable ordered channel and returns a host invite', async () => {
  const { host } = pair();
  const invite = await host.host();
  assert.equal(host.role, 'host');
  assert.match(invite, /^hatchstone1\./);
  assert.equal(FakeConnection.instances.length, 1);
  assert.deepEqual(FakeConnection.instances[0].config, { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  assert.equal(FakeConnection.instances[0].channels.length, 1);
  assert.deepEqual(FakeConnection.instances[0].channels[0].options, { ordered: true });
  const decoded = decodeSignal(invite);
  assert.equal(decoded.type, 'offer');
  assert.equal(decoded.room, host.room);
  host.close();
});

test('join returns guest answer and accepts only matching answer', async () => {
  const { host, guest } = pair();
  const invite = await host.host();
  const answer = await guest.join(invite);
  assert.equal(guest.role, 'guest');
  assert.equal(guest.room, host.room);
  assert.equal(decodeSignal(answer).type, 'answer');
  await assert.rejects(() => host.accept(encodeSignal({ v: 1, type: 'answer', room: 'other', sdp: 'v=0' })), /room/i);
  await host.accept(answer);
  assert.equal(FakeConnection.instances[1].remoteDescription.type, 'offer');
  assert.equal(FakeConnection.instances[0].remoteDescription.type, 'answer');
  host.close(); guest.close();
});

test('messages use a versioned room envelope and send is bounded', async () => {
  const { host } = pair();
  await host.host();
  const channel = FakeConnection.instances[0].channels[0];
  channel.open();
  assert.equal(host.connected, true);
  const packet = { kind: 'move', x: 2 };
  assert.equal(host.send(packet), true);
  assert.deepEqual(JSON.parse(channel.sent[0]), { v: 1, room: host.room, payload: packet });
  channel.bufferedAmount = 1024 * 1024 + 1;
  assert.equal(host.send({ ok: true }), false);
  channel.bufferedAmount = 0;
  assert.equal(host.send(new Uint8Array([1])), false);
  channel.onmessage({ data: JSON.stringify({ v: 1, room: host.room, payload: { ok: true } }) });
  assert.equal(host.connected, true);
  host.close();
});

test('incoming wrong version, room, oversized, binary, and invalid payload are ignored', async () => {
  const messages = [];
  const { host } = pair();
  host.onMessage = packet => messages.push(packet);
  await host.host();
  const channel = FakeConnection.instances[0].channels[0];
  channel.open();
  for (const data of [
    JSON.stringify({ v: 2, room: host.room, payload: 1 }),
    JSON.stringify({ v: 1, room: 'wrong', payload: 1 }),
    JSON.stringify({ v: 1, room: host.room, payload: undefined }),
    JSON.stringify({ v: 1, room: host.room }),
    'x'.repeat(70000),
  ]) channel.onmessage({ data });
  channel.onmessage({ data: new ArrayBuffer(2) });
  assert.deepEqual(messages, []);
  host.close();
});

test('application callback exceptions do not escape or keep resources alive', async () => {
  const { host } = pair();
  host.onStatus = () => { throw new Error('status callback'); };
  host.onMessage = () => { throw new Error('message callback'); };
  host.onClose = () => { throw new Error('close callback'); };
  await host.host();
  const channel = FakeConnection.instances[0].channels[0];
  channel.open();
  channel.onmessage({ data: JSON.stringify({ v: 1, room: host.room, payload: true }) });
  assert.equal(host.connected, true);
  assert.doesNotThrow(() => host.close('callback-test'));
});

test('close is idempotent, cancels callbacks, and ignores stale channel events', async () => {
  const statuses = [];
  const closes = [];
  const { host } = pair();
  host.onStatus = status => statuses.push(status);
  host.onClose = reason => closes.push(reason);
  const invite = await host.host();
  const connection = FakeConnection.instances[0];
  const channel = connection.channels[0];
  const staleMessage = channel.onmessage;
  host.close('test-close');
  host.close('second');
  staleMessage({ data: JSON.stringify({ v: 1, room: host.room, payload: 1 }) });
  assert.deepEqual(closes, ['test-close']);
  assert.equal(host.connected, false);
  assert.ok(statuses.includes('closed'));
  assert.equal(invite.startsWith('hatchstone1.'), true);
});

test('wrong-role and duplicate channel lifecycle failures close the peer', async () => {
  const closes = [];
  const { host } = pair();
  host.onClose = reason => closes.push(reason);
  const invite = await host.host();
  await assert.rejects(() => host.join(invite), /role|state/i);
  const connection = FakeConnection.instances[0];
  connection.ondatachannel({ channel: new FakeChannel('second', {}) });
  assert.equal(host.connected, false);
  assert.equal(closes.length, 1);
});

test('close while ICE offer gathering is pending rejects and prevents late network use', async () => {
  let resolveLocal;
  class SlowConnection extends FakeConnection {
    async setLocalDescription(desc) {
      this.localDescription = desc;
      await new Promise(resolve => { resolveLocal = resolve; });
    }
  }
  const closes = [];
  const peer = new Peer({ rtcFactory: SlowConnection, onClose: reason => closes.push(reason) });
  const pending = peer.host();
  await new Promise(resolve => setImmediate(resolve));
  peer.close('cancelled');
  resolveLocal();
  await assert.rejects(pending, /closed|cancel/i);
  assert.deepEqual(closes, ['cancelled']);
});

test('close while ICE wait is pending cancels the bounded wait', async () => {
  class GatheringConnection extends FakeConnection {
    async setLocalDescription(desc) {
      this.localDescription = desc;
      this.iceGatheringState = 'gathering';
    }
  }
  const peer = new Peer({ rtcFactory: GatheringConnection });
  const pending = peer.host();
  await new Promise(resolve => setImmediate(resolve));
  peer.close('cancelled-ice');
  await assert.rejects(pending, /closed|cancel/i);
});

test('connection and channel failure paths close once', async () => {
  const closes = [];
  const { host } = pair();
  host.onClose = reason => closes.push(reason);
  await host.host();
  const connection = FakeConnection.instances[0];
  connection.connectionState = 'failed';
  const staleStateCallback = connection.onconnectionstatechange;
  staleStateCallback();
  staleStateCallback();
  assert.equal(closes.length, 1);
  assert.match(String(closes[0]), /failed/i);
});

test('channel errors and closes terminate the peer', async () => {
  const closes = [];
  const { host } = pair();
  host.onClose = reason => closes.push(reason);
  await host.host();
  const channel = FakeConnection.instances[0].channels[0];
  const staleClose = channel.onclose;
  channel.onerror();
  staleClose();
  assert.equal(closes.length, 1);
  assert.match(String(closes[0]), /channel-error/i);
});
