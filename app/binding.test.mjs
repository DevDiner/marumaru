import { test } from 'node:test';
import assert from 'node:assert';
import { newSessionId, contextValueFor, sameSession } from './binding.mjs';

test('newSessionId is unique per call', () => {
  const a = newSessionId(); const b = newSessionId();
  assert.notEqual(a, b);
  assert.ok(a.length >= 16);
});

test('sameSession is true only when both proofs carry the SAME sessionId', () => {
  const sid = newSessionId();
  const worldSignal = sid;                     // World ID signal = sessionId
  const reclaimContext = contextValueFor(sid); // Reclaim context.contextAddress = sessionId
  assert.equal(sameSession({ worldSignal, reclaimContext, expected: sid }), true);
});

test('sameSession is false if the World signal differs (replayed World proof)', () => {
  const sid = newSessionId();
  assert.equal(sameSession({ worldSignal: 'other', reclaimContext: contextValueFor(sid), expected: sid }), false);
});

test('sameSession is false if the Reclaim context differs (replayed bank proof)', () => {
  const sid = newSessionId();
  assert.equal(sameSession({ worldSignal: sid, reclaimContext: 'other', expected: sid }), false);
});

test('contextValueFor is deterministic for a given sessionId', () => {
  const sid = 'abc123';
  assert.equal(contextValueFor(sid), contextValueFor(sid));
});
