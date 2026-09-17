import test from 'node:test';
import assert from 'node:assert/strict';
import { attribute, channelFrom, deviceFrom, cleanUtm, hostOf } from '../lib/attribution.js';

test('webmail is read as email even though the host contains google', () => {
  assert.equal(channelFrom({ referrer: 'https://mail.google.com/mail/u/0/' }), 'email');
  assert.equal(channelFrom({ referrer: 'https://www.google.com/search?q=air+con' }), 'organic');
});

test('channel matches on label boundaries, not bare substrings', () => {
  assert.equal(channelFrom({ referrer: 'https://notgoogleatall.co.uk/blog' }), 'referral');
  assert.equal(channelFrom({ referrer: 'https://news.google.com/' }), 'organic');
});

test('a click id outranks the referrer', () => {
  assert.equal(
    channelFrom({ referrer: 'https://www.google.com/', utm: { gclid: 'abc123' } }),
    'paid',
  );
});

test('directories are their own channel', () => {
  assert.equal(channelFrom({ referrer: 'https://www.checkatrade.com/trades/x' }), 'directory');
});

test('no referrer and no campaign is direct', () => {
  assert.equal(channelFrom({}), 'direct');
});

test('devices split three ways', () => {
  assert.equal(deviceFrom('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148'), 'mobile');
  assert.equal(deviceFrom('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceFrom('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'desktop');
  assert.equal(deviceFrom(''), 'unknown');
});

test('only known campaign keys survive', () => {
  const clean = cleanUtm({ utm_source: 'google', ref: 'x', 'drop; me': '1', gclid: 'g1' });
  assert.deepEqual(clean, { utm_source: 'google', gclid: 'g1' });
});

test('hostOf strips www and survives rubbish', () => {
  assert.equal(hostOf('https://www.bing.com/search'), 'bing.com');
  assert.equal(hostOf('not a url'), '');
});

test('attribute returns the whole derived set at once', () => {
  const out = attribute({
    referrer: 'https://www.bing.com/search?q=aircon',
    utm: { utm_campaign: 'summer' },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36',
  });
  assert.deepEqual(out, {
    channel: 'organic',
    referrer_host: 'bing.com',
    device: 'mobile',
    utm: { utm_campaign: 'summer' },
  });
});
