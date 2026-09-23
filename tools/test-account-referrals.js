'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
function fixture() {
  const store = new Map([['ya_favs', '["keep"]'], ['ya_sess', '{"id":"member"}']]);
  const calls = [], notifications = [], toasts = [];
  const profile = { name: 'Member', referral_code: 'YA12345678', yaad_points: 50 };
  const db = {
    auth: {
      signInWithPassword: async args => { calls.push(args); return { data: { user: { id: 'member', email: args.email } } }; },
      signUp: async args => ({ data: { user: { id: 'member', email: args.email } } }),
    },
    from(table) {
      assert.equal(table, 'profiles');
      return { select() { return this; }, eq(key, id) { assert.equal(key, 'id'); assert.equal(id, 'member'); return this; },
        single: async () => ({ data: profile }) };
    },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: { ok: true, message: 'Credited' }, error: null }; },
  };
  const context = vm.createContext({
    console: { warn() {}, error() {} }, URL, URLSearchParams,
    supabase: { createClient: () => db },
    localStorage: { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) },
    sessionStorage: { getItem: () => null },
    location: new URL('https://example.test/?ad=keep#details'),
    history: { replaceState: (a,b,url) => { context.location = new URL(url, context.location); } },
    document: { hidden: true, getElementById: () => null },
    navigator: { serviceWorker: { controller: {}, ready: Promise.resolve({ showNotification: async (...args) => notifications.push(args) }) } },
    Notification: { permission: 'granted' },
    showToast: (...args) => toasts.push(args), CU: { id: 'member' },
  });
  context.window = context;
  vm.runInContext(source, context);
  return { context, db, store, calls, notifications, toasts, profile };
}
test('login and registration map profile fields without replacing authenticated identity', async () => {
  const f = fixture();
  f.profile.id = 'wrong-profile';
  f.profile.access_token = 'must-not-copy';
  const user = await f.context.sbLogin('member@example.test', 'password');
  assert.equal(user.id, 'member');
  assert.equal(user.referral_code, 'YA12345678');
  assert.equal(user.access_token, undefined);
  assert.equal((await f.context.sbRegister('New', 'member@example.test', '', '', 'password')).id, 'member');
  f.db.auth.signInWithPassword = async () => ({ error: { message: 'Denied' } });
  await assert.rejects(f.context.sbLogin('x', 'bad'), /Denied/);
});
test('notifications respect visibility and permission and contain async failures', async () => {
  const f = fixture();
  await f.context.sendPushNotification('Message', 'Hello', '/?ad=1');
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0][1].data.url, '/?ad=1');
  f.context.document.hidden = false;
  await f.context.sendPushNotification('Message', 'Hello');
  f.context.document.hidden = true; f.context.Notification.permission = 'denied';
  await f.context.sendPushNotification('Message', 'Hello');
  assert.equal(f.notifications.length, 1);
  f.context.Notification.permission = 'granted';
  f.context.navigator.serviceWorker.ready = Promise.reject(Error('Unavailable'));
  await assert.doesNotReject(f.context.sendPushNotification('Message', 'Hello'));
});
test('referral claims use saved attribution, correct RPC data, and preserve unrelated storage', async () => {
  const f = fixture();
  f.store.set('ya_ref', 'YA12345678');
  f.db.rpc = async () => ({ error: { message: 'Offline' } });
  await f.context.claimReferral('member');
  assert.equal(f.store.get('ya_ref'), 'YA12345678');
  f.db.rpc = async (name, args) => {
    assert.equal(name, 'send_referral');
    assert.equal(JSON.stringify(args), '{"p_code":"YA12345678"}');
    return { data: { ok: true, message: 'Credited' }, error: null };
  };
  f.context._REFERRAL_CODE = 'YA12345678';
  await f.context.claimReferral('member');
  assert.equal(f.context.getReferralCode(), null);
  assert.equal(f.store.get('ya_favs'), '["keep"]');
  assert.equal(f.store.get('ya_sess'), '{"id":"member"}');
  assert.equal(f.context.location.search, '?ad=keep');
  assert.equal(f.context.location.hash, '#details');
  assert.equal(f.toasts[0][0], 'Credited');
});
