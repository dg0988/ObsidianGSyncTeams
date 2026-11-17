import { test } from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import { verifyActivation, verifyLicense, needsRefresh } from '../src/license';
import { findSharedDrive, listPermissions, addPermission } from '../src/drive-teams';
import { priceFor, MIN_USERS, MAX_USERS } from '../sales-worker/src/pricing.js';
import GSyncTeamsPlugin from '../src/main';

const enc = (s: string) => new TextEncoder().encode(s);
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const kp = nacl.sign.keyPair();
const pk = b64u(kp.publicKey);
function signed(prefix: string, payload: object, keys = kp) {
  const p = b64u(enc(JSON.stringify(payload)));
  return `${prefix}${p}.${b64u(nacl.sign.detached(enc(p), keys.secretKey))}`;
}

// ---- license keys -----------------------------------------------------------

test('license keys carry the number of users; 2 devices per user', () => {
  const lic = verifyLicense(signed('GST-', { n: 'Acme', t: 'teams', i: '2026-11-16', id: 'L1', s: 10 }), pk);
  assert.deepEqual(lic, { name: 'Acme', tier: 'teams', issued: '2026-11-16', id: 'L1', users: 10, devices: 20 });
  assert.equal(verifyLicense(signed('GST-', { n: 'Old', t: 'teams', id: 'L0' }), pk)?.devices, 6, 'keys without a user count are 3 users');
  assert.equal(verifyLicense(signed('GST-', { n: 'x', t: 'pro', id: 'L2' }), pk), null, 'other products rejected');
  assert.equal(verifyLicense(signed('GST-', { n: 'x', t: 'teams', id: 'L3' }, nacl.sign.keyPair()), pk), null, 'other signers rejected');
  assert.equal(verifyLicense('nonsense', pk), null);
});

test('activations are bound to the license and this device, and expire', () => {
  const lic = verifyLicense(signed('GST-', { n: 'Acme', t: 'teams', id: 'L1', s: 3 }), pk)!;
  const now = Date.now();
  const token = signed('GSA-', { l: 'L1', d: 'device-aaaa', iat: now, e: now + 1000 });
  assert.ok(verifyActivation(token, lic, 'device-aaaa', now, pk));
  assert.equal(verifyActivation(token, lic, 'device-bbbb', now, pk), null, 'another device can\'t reuse it');
  assert.equal(verifyActivation(token, { ...lic, id: 'L9' }, 'device-aaaa', now, pk), null, 'another license can\'t reuse it');
  assert.equal(verifyActivation(token, lic, 'device-aaaa', now + 2000, pk), null, 'expired');
  assert.equal(verifyActivation(token.replace('GSA-', 'GST-'), lic, 'device-aaaa', now, pk), null);
  const a = verifyActivation(token, lic, 'device-aaaa', now, pk)!;
  assert.equal(needsRefresh(a, now), false);
  assert.equal(needsRefresh(a, now + 31 * 24 * 3600 * 1000), true);
});

// ---- pricing ----------------------------------------------------------------

test('pricing: 3 users $49, 30 users $400, lower per-user price as users grow', () => {
  assert.equal(priceFor(3), 49);
  assert.equal(priceFor(30), 400);
  assert.equal(priceFor(2), null);
  assert.equal(priceFor(31), null);
  assert.equal(priceFor(4.5), null);
  let last = Infinity;
  for (let n = MIN_USERS; n <= MAX_USERS; n++) {
    const per = priceFor(n)! / n;
    assert.ok(per <= last + 0.01, `per-user price never goes up (n=${n})`);
    assert.ok(priceFor(n)! > (priceFor(n - 1) ?? 0), `more users always costs more in total (n=${n})`);
    last = per;
  }
});

// ---- Drive calls ------------------------------------------------------------

function fakeApi(responses: Record<string, unknown>) {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  const api = {
    version: 1,
    request: async (url: string, opts: { method?: string; body?: string } = {}) => {
      calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : undefined });
      const key = Object.keys(responses).find((k) => url.includes(k));
      return { json: key ? responses[key] : {} } as any;
    },
    ensureFolderPath: async (p: string) => `id:${p}`,
    folderAccess: async () => ({ canEdit: true, inSharedDrive: true, canShare: true }),
    folders: () => [{ id: 'main', local: '', remote: 'Notes' }],
    registerTeams: () => () => {},
  };
  return { api, calls };
}

test('Shared Drive lookup needs an exact name match', async () => {
  const { api } = fakeApi({ '/drives?': { drives: [{ id: 'd1', name: 'Acme Docs' }, { id: 'd2', name: 'Acme' }] } });
  assert.equal(await findSharedDrive(api, 'Acme'), 'd2');
  await assert.rejects(findSharedDrive(api, 'Acm'), /not found/);
});

test('permission calls support Shared Drives and report inherited access', async () => {
  const { api, calls } = fakeApi({
    '/permissions?fields': { permissions: [
      { id: 'p1', type: 'user', role: 'writer', emailAddress: 'a@acme.com', permissionDetails: [{ inherited: true }] },
      { id: 'p2', type: 'user', role: 'reader', emailAddress: 'b@acme.com', permissionDetails: [{ inherited: false }] },
    ] },
  });
  const people = await listPermissions(api, 'folder 1');
  assert.deepEqual(people.map((p) => [p.id, p.inherited]), [['p1', true], ['p2', false]]);
  await addPermission(api, 'f1', 'c@acme.com', 'commenter', false);
  const add = calls[calls.length - 1];
  assert.equal(add.method, 'POST');
  assert.ok(add.url.includes('supportsAllDrives=true') && add.url.includes('sendNotificationEmail=false'));
  assert.deepEqual(add.body, { type: 'user', role: 'commenter', emailAddress: 'c@acme.com' });
  assert.ok(calls[0].url.includes('/files/folder%201/permissions'));
});

// ---- plugging into GSync ----------------------------------------------------

test('the add-on registers with GSync only when licensed and activated, and unregisters otherwise', async () => {
  const store = new Map<string, string>();
  (globalThis as any).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }, setInterval: () => 0 };
  let registered: any = null;
  let unregistered = 0;
  const { api } = fakeApi({});
  api.registerTeams = ((ext: any) => { registered = ext; return () => { registered = null; unregistered++; }; }) as any;
  let gsync: any = { api };
  const app = { plugins: { getPlugin: (id: string) => (id === 'gsync' ? gsync : null) }, workspace: { onLayoutReady: () => {} } };
  const plugin = new GSyncTeamsPlugin(app as any, {} as any);

  assert.equal(plugin.connect(), 'unlicensed');
  assert.equal(registered, null);

  // Real keys are checked against the built-in public key; use a stub license for the rest.
  (plugin as any).license = () => ({ id: 'L1', name: 'Acme', users: 3, devices: 6, tier: 'teams', issued: '' });
  assert.equal(plugin.connect(), 'not-activated', 'a valid key alone is not enough');
  (plugin as any).activation = () => ({ licenseId: 'L1', device: 'd', issuedAt: Date.now(), expiresAt: Date.now() + 1e9 });
  assert.equal(plugin.connect(), 'ok');
  assert.ok(registered && typeof registered.resolveSharedDrive === 'function' && typeof registered.manageAccess === 'function');
  assert.equal(plugin.connect(), 'ok');
  assert.equal(unregistered, 0, 'connecting again does not re-register');

  gsync = { api: { ...api, version: 2 } };
  assert.equal(plugin.connect(), 'gsync-too-new');
  assert.equal(unregistered, 1);
  gsync = null;
  assert.equal(plugin.connect(), 'no-gsync');
  gsync = { api };
  assert.equal(plugin.connect(), 'ok', 'reconnects when GSync comes back');

  assert.ok(/^[a-f0-9]{32}$/.test(plugin.store.deviceId()));
  assert.equal(plugin.store.deviceId(), plugin.store.deviceId(), 'device id is stable');
});
