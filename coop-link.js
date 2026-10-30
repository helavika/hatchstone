/* HatchstoneLink: bounded, dependency-free WebRTC data-channel transport. */
(function (root, makeApi) {
  const api = makeApi(root);
  if (root) root.HatchstoneLink = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SIGNAL_PREFIX = 'hatchstone1.';
  const SIGNAL_VERSION = 1;
  const MAX_SDP_BYTES = 16 * 1024;
  const MAX_CODE_BYTES = 32 * 1024;
  const MAX_MESSAGE_BYTES = 64 * 1024;
  const MAX_BUFFERED_AMOUNT = 1024 * 1024;
  const ICE_TIMEOUT_MS = 5000;
  const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const SIGNAL_KEYS = ['room', 'sdp', 'type', 'v'];

  function fail(message) { throw new Error(message); }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function ownKeysEqual(value, expected) {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value).sort();
    return keys.length === expected.length && keys.every((key, i) => key === expected.slice().sort()[i]);
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(text, 'utf8'));
    const encoded = unescape(encodeURIComponent(text));
    const result = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) result[i] = encoded.charCodeAt(i);
    return result;
  }

  function bytesToText(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('utf8');
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return decodeURIComponent(escape(text));
  }

  function base64UrlEncode(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function base64UrlDecode(text) {
    if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) fail('Invalid signaling code');
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    if (typeof Buffer !== 'undefined') {
      const bytes = Buffer.from(padded, 'base64');
      if (base64UrlEncode(bytes) !== text) fail('Invalid signaling code');
      return Uint8Array.from(bytes);
    }
    try {
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (base64UrlEncode(bytes) !== text) fail('Invalid signaling code');
      return bytes;
    } catch (_) {
      fail('Invalid signaling code');
    }
  }

  function validateSignal(signal) {
    if (!ownKeysEqual(signal, SIGNAL_KEYS) || signal.v !== SIGNAL_VERSION || (signal.type !== 'offer' && signal.type !== 'answer')) {
      fail('Invalid signaling signal shape');
    }
    if (typeof signal.room !== 'string' || !ROOM_RE.test(signal.room)) fail('Invalid signaling room');
    if (typeof signal.sdp !== 'string' || signal.sdp.length === 0 || utf8Bytes(signal.sdp).length > MAX_SDP_BYTES) {
      fail('Invalid signaling SDP');
    }
    return signal;
  }

  function encodeSignal(signal) {
    validateSignal(signal);
    const encoded = SIGNAL_PREFIX + base64UrlEncode(utf8Bytes(JSON.stringify(signal)));
    if (utf8Bytes(encoded).length > MAX_CODE_BYTES) fail('Signaling code is too large');
    return encoded;
  }

  function decodeSignal(code) {
    if (typeof code !== 'string' || !code.startsWith(SIGNAL_PREFIX) || utf8Bytes(code).length > MAX_CODE_BYTES) {
      fail('Invalid signaling code');
    }
    try {
      const signal = JSON.parse(bytesToText(base64UrlDecode(code.slice(SIGNAL_PREFIX.length))));
      return validateSignal(signal);
    } catch (error) {
      if (error && /^Invalid signaling/.test(error.message)) throw error;
      fail('Invalid signaling code');
    }
  }

  function randomRoom() {
    const bytes = new Uint8Array(12);
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') root.crypto.getRandomValues(bytes);
    else if (typeof require === 'function') {
      try {
        const crypto = require('crypto');
        bytes.set(crypto.randomBytes(bytes.length));
      } catch (_) {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return base64UrlEncode(bytes);
  }

  function jsonValueIsValid(value, seen, depth) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'object' || depth > 64 || seen.size > 20000) return false;
    if (!isPlainObject(value) && !Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    let valid = true;
    try {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (!jsonValueIsValid(item, seen, depth + 1)) { valid = false; break; }
        }
      } else {
        for (const key of Object.keys(value)) {
          if (!jsonValueIsValid(value[key], seen, depth + 1)) { valid = false; break; }
        }
      }
    } catch (_) { valid = false; }
    seen.delete(value);
    return valid;
  }

  function validPacket(value) {
    try { return jsonValueIsValid(value, new Set(), 0); } catch (_) { return false; }
  }

  class Peer {
    constructor(options = {}) {
      if (!isPlainObject(options)) fail('Peer options must be an object');
      this.onMessage = typeof options.onMessage === 'function' ? options.onMessage : function () {};
      this.onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
      this.onClose = typeof options.onClose === 'function' ? options.onClose : function () {};
      this._rtcFactory = options.rtcFactory;
      this.role = null;
      this.room = null;
      this.connected = false;
      this._pc = null;
      this._channel = null;
      this._channelSeen = false;
      this._accepted = false;
      this._closed = false;
      this._closeNotified = false;
      this._generation = 0;
      this._iceTimer = null;
      this._iceReject = null;
      this._status = null;
    }

    _invoke(name, value) {
      try { this[name](value); } catch (_) { /* application callbacks cannot break transport */ }
    }

    _setStatus(status) {
      if (this._status === status) return;
      this._status = status;
      this._invoke('onStatus', status);
    }

    _assertAlive(generation) {
      if (this._closed || generation !== this._generation) fail('Peer is closed');
    }

    _createConnection() {
      let Factory = this._rtcFactory;
      if (!Factory) Factory = root.RTCPeerConnection;
      if (!Factory) fail('RTCPeerConnection is unavailable');
      const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
      try {
        if (typeof Factory === 'function') {
          try { return new Factory(config); } catch (firstError) {
            try { return Factory(config); } catch (_) { throw firstError; }
          }
        }
        if (Factory && typeof Factory.create === 'function') return Factory.create(config);
        if (Factory && typeof Factory.RTCPeerConnection === 'function') return new Factory.RTCPeerConnection(config);
      } catch (error) { throw error; }
      fail('Invalid rtcFactory');
    }

    _installConnection(pc, generation) {
      this._pc = pc;
      pc.onconnectionstatechange = () => {
        if (this._closed || generation !== this._generation) return;
        const state = pc.connectionState;
        if (state === 'failed' || state === 'disconnected' || state === 'closed') this._fail('peer-' + state);
      };
      pc.oniceconnectionstatechange = () => {
        if (this._closed || generation !== this._generation) return;
        const state = pc.iceConnectionState;
        if (state === 'failed' || state === 'disconnected' || state === 'closed') this._fail('ice-' + state);
      };
      pc.ondatachannel = event => {
        if (this._closed || generation !== this._generation) return;
        const channel = event && event.channel;
        if (!channel || this._channelSeen) return this._fail('duplicate-data-channel');
        this._channelSeen = true;
        this._attachChannel(channel, generation);
      };
    }

    _attachChannel(channel, generation) {
      if (this._channel && this._channel !== channel) return this._fail('duplicate-data-channel');
      this._channel = channel;
      channel.onopen = () => {
        if (this._closed || generation !== this._generation || this._channel !== channel) return;
        this.connected = true;
        this._setStatus('connected');
      };
      channel.onmessage = event => {
        if (this._closed || generation !== this._generation || this._channel !== channel) return;
        this._receive(event && event.data);
      };
      channel.onerror = () => {
        if (!this._closed && generation === this._generation) this._fail('channel-error');
      };
      channel.onclose = () => {
        if (!this._closed && generation === this._generation) this._fail('channel-closed');
      };
      if (channel.readyState === 'open') {
        this.connected = true;
        this._setStatus('connected');
      }
    }

    _receive(data) {
      if (typeof data !== 'string' || utf8Bytes(data).length > MAX_MESSAGE_BYTES) return;
      let envelope;
      try { envelope = JSON.parse(data); } catch (_) { return; }
      if (!ownKeysEqual(envelope, ['v', 'room', 'payload']) || envelope.v !== 1 || envelope.room !== this.room || !validPacket(envelope.payload)) return;
      this._invoke('onMessage', envelope.payload);
    }

    _waitForIce(generation) {
      const pc = this._pc;
      if (pc.iceGatheringState === 'complete') return Promise.resolve();
      return new Promise((resolve, reject) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          if (this._iceTimer) { clearTimeout(this._iceTimer); this._iceTimer = null; }
          if (pc.onicegatheringstatechange === onState) pc.onicegatheringstatechange = null;
          if (pc.onicecandidate === onCandidate) pc.onicecandidate = null;
          if (this._iceReject === cancel) this._iceReject = null;
          resolve();
        };
        const cancel = () => {
          if (done) return;
          done = true;
          if (this._iceTimer) { clearTimeout(this._iceTimer); this._iceTimer = null; }
          if (pc.onicegatheringstatechange === onState) pc.onicegatheringstatechange = null;
          if (pc.onicecandidate === onCandidate) pc.onicecandidate = null;
          if (this._iceReject === cancel) this._iceReject = null;
          reject(new Error('Peer is closed'));
        };
        const onState = () => {
          if (this._closed || generation !== this._generation) return finish();
          if (pc.iceGatheringState === 'complete') finish();
        };
        const onCandidate = event => {
          if (this._closed || generation !== this._generation || !event || !event.candidate) finish();
        };
        pc.onicegatheringstatechange = onState;
        pc.onicecandidate = onCandidate;
        this._iceReject = cancel;
        this._iceTimer = setTimeout(finish, ICE_TIMEOUT_MS);
        if (pc.iceGatheringState === 'complete') finish();
      });
    }

    async host() {
      if (this._closed) fail('Peer is closed');
      if (this.role !== null) fail('Peer already has a role');
      this.role = 'host';
      this.room = randomRoom();
      const generation = ++this._generation;
      this._setStatus('connecting');
      try {
        const pc = this._createConnection();
        this._installConnection(pc, generation);
        const channel = pc.createDataChannel('hatchstone', { ordered: true });
        if (!channel) fail('Failed to create data channel');
        this._channelSeen = true;
        this._attachChannel(channel, generation);
        const offer = await pc.createOffer();
        this._assertAlive(generation);
        await pc.setLocalDescription(offer);
        this._assertAlive(generation);
        await this._waitForIce(generation);
        this._assertAlive(generation);
        const local = pc.localDescription || offer;
        return encodeSignal({ v: 1, type: 'offer', room: this.room, sdp: local.sdp });
      } catch (error) {
        if (this._closed) throw new Error('Peer is closed');
        this._fail('host-failed');
        throw error;
      }
    }

    async join(invite) {
      if (this._closed) fail('Peer is closed');
      if (this.role !== null) fail('Peer already has a role');
      const offer = decodeSignal(invite);
      if (offer.type !== 'offer') fail('Expected an offer invite');
      this.role = 'guest';
      this.room = offer.room;
      const generation = ++this._generation;
      this._setStatus('connecting');
      try {
        const pc = this._createConnection();
        this._installConnection(pc, generation);
        await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
        this._assertAlive(generation);
        const answer = await pc.createAnswer();
        this._assertAlive(generation);
        await pc.setLocalDescription(answer);
        this._assertAlive(generation);
        await this._waitForIce(generation);
        this._assertAlive(generation);
        const local = pc.localDescription || answer;
        return encodeSignal({ v: 1, type: 'answer', room: this.room, sdp: local.sdp });
      } catch (error) {
        if (this._closed) throw new Error('Peer is closed');
        this._fail('join-failed');
        throw error;
      }
    }

    async accept(answerCode) {
      if (this._closed) fail('Peer is closed');
      if (this.role !== 'host' || !this._pc) fail('Only a host can accept an answer');
      const answer = decodeSignal(answerCode);
      if (answer.type !== 'answer') fail('Expected an answer');
      if (answer.room !== this.room) fail('Answer room does not match invite');
      if (this._accepted) fail('Answer already accepted');
      const generation = this._generation;
      await this._pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      this._assertAlive(generation);
      this._accepted = true;
    }

    send(packet) {
      if (this._closed || !this.connected || !this._channel || this._channel.readyState !== 'open') return false;
      if (!validPacket(packet)) return false;
      const buffered = Number(this._channel.bufferedAmount);
      if (!Number.isFinite(buffered) || buffered > MAX_BUFFERED_AMOUNT) return false;
      let encoded;
      try { encoded = JSON.stringify({ v: 1, room: this.room, payload: packet }); } catch (_) { return false; }
      if (utf8Bytes(encoded).length > MAX_MESSAGE_BYTES) return false;
      try {
        this._channel.send(encoded);
        return true;
      } catch (_) { return false; }
    }

    _fail(reason) {
      if (this._closed) return;
      this._setStatus('failed');
      this.close(reason);
    }

    close(reason = 'closed') {
      if (this._closed) return;
      this._closed = true;
      this._generation++;
      this.connected = false;
      if (this._iceReject) {
        const rejectIce = this._iceReject;
        this._iceReject = null;
        rejectIce();
      }
      if (this._iceTimer) { clearTimeout(this._iceTimer); this._iceTimer = null; }
      const channel = this._channel;
      const pc = this._pc;
      this._channel = null;
      this._pc = null;
      if (channel) {
        channel.onopen = channel.onmessage = channel.onerror = channel.onclose = null;
        try { if (channel.readyState !== 'closed') channel.close(); } catch (_) {}
      }
      if (pc) {
        pc.onconnectionstatechange = pc.oniceconnectionstatechange = pc.onicegatheringstatechange = pc.onicecandidate = pc.ondatachannel = null;
        try { pc.close(); } catch (_) {}
      }
      this._setStatus('closed');
      if (!this._closeNotified) {
        this._closeNotified = true;
        this._invoke('onClose', reason);
      }
    }
  }

  return { Peer, encodeSignal, decodeSignal };
});
