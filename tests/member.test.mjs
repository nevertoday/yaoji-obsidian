import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/fake-obsidian.mjs';

const { MemberClient, MEMBER_BASE, safeMemberBase } = await import('../src/member.js');

globalThis.__requestUrl = async (options) => ({ status: 200, json: { access_token: `TOK-${JSON.parse(options.body).code}`, expires_at: '', member: { email: 'a@b' } } });

function client(base) {
  let saved = null;
  const c = new MemberClient({ get: () => saved, set: (value) => { saved = value; } }, base ? { base: () => base } : {});
  return { c, get saved() { return saved; } };
}

async function startLogin(c) {
  globalThis.__opened = [];
  await c.startLogin();
  return new URL(globalThis.__opened[0]).searchParams.get('state');
}

test('a stray obsidian://yaoji-auth with a wrong state does not cancel the sign-in in progress', async () => {
  const m = client();
  const state = await startLogin(m.c);
  await assert.rejects(m.c.finishLogin({ code: 'evil', state: 'x' }), { code: 'login_mismatch' });
  await assert.rejects(m.c.finishLogin({ code: 'evil' }), { code: 'login_mismatch' });
  await m.c.finishLogin({ code: 'ok', state });
  assert.equal(m.saved.token, 'TOK-ok');
  // 用过一次就作废
  await assert.rejects(m.c.finishLogin({ code: 'again', state }), { code: 'login_mismatch' });
  assert.equal(m.saved.token, 'TOK-ok');
});

test('clicking 登录 twice: the first browser tab can still finish; at most 3 wait at once; old ones expire', async () => {
  const m = client();
  const first = await startLogin(m.c);
  await startLogin(m.c);
  await m.c.finishLogin({ code: 'first', state: first });
  assert.equal(m.saved.token, 'TOK-first');

  const n = client();
  const states = [];
  for (let i = 0; i < 4; i += 1) states.push(await startLogin(n.c));
  await assert.rejects(n.c.finishLogin({ code: 'c', state: states[0] }), { code: 'login_mismatch' });
  await n.c.finishLogin({ code: 'c', state: states[1] });

  const o = client();
  const realNow = Date.now;
  try {
    const state = await startLogin(o.c);
    const at = realNow();
    Date.now = () => at + 11 * 60 * 1000;
    await assert.rejects(o.c.finishLogin({ code: 'late', state }), { code: 'login_mismatch' });
    assert.equal(o.saved, null);
  } finally {
    Date.now = realNow;
  }
});

test('memberBase override: only localhost / 127.0.0.1 over http or the official https site', async () => {
  assert.equal(safeMemberBase(''), MEMBER_BASE);
  assert.equal(safeMemberBase('http://localhost:8787/api/yaoji'), 'http://localhost:8787/api/yaoji');
  assert.equal(safeMemberBase('http://127.0.0.1/api/yaoji/'), 'http://127.0.0.1/api/yaoji');
  assert.equal(safeMemberBase('https://vip.xiaoxiaodong.ai/api/yaoji-dev'), 'https://vip.xiaoxiaodong.ai/api/yaoji-dev');
  for (const bad of ['http://evil.example', 'https://evil.example/api/yaoji', 'http://vip.xiaoxiaodong.ai/api/yaoji', 'javascript:alert(1)//',
    'http://localhost.evil.com', 'http://localhost@evil.com', 'http://127.0.0.1:80@evil.com/', 'https://vip.xiaoxiaodong.ai.evil.com', 'file:///etc/passwd', 'not a url']) {
    assert.equal(safeMemberBase(bad), MEMBER_BASE, bad);
  }
  // 换成别人的地址：登录页和请求都还是去正式会员站
  const m = client('http://evil.example');
  const state = await startLogin(m.c);
  assert.ok(globalThis.__opened[0].startsWith(`${MEMBER_BASE}/authorize?`));
  const urls = [];
  const real = globalThis.__requestUrl;
  globalThis.__requestUrl = async (options) => { urls.push(options.url); return real(options); };
  try {
    await m.c.finishLogin({ code: 'c', state });
    await m.c.post('/github/status');
  } finally {
    globalThis.__requestUrl = real;
  }
  assert.ok(urls.every((url) => url.startsWith('https://vip.xiaoxiaodong.ai/')), urls.join(' '));
});

test('a session whose expiry date cannot be read counts as expired; an empty one never expires', () => {
  const make = (value) => new MemberClient({ get: () => value, set() {} });
  assert.equal(make({ token: 't', expiresAt: 'tomorrow-ish' }).signedIn(), false);
  assert.equal(make({ token: 't', expiresAt: '2000-01-01T00:00:00Z' }).signedIn(), false);
  assert.equal(make({ token: 't', expiresAt: '2999-01-01T00:00:00Z' }).signedIn(), true);
  assert.equal(make({ token: 't', expiresAt: '' }).signedIn(), true);
});
