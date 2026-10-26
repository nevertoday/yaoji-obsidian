import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import './helpers/fake-obsidian.mjs';

const require = createRequire(import.meta.url);
const MarkdownParser = require('../src/vendor/markdown-parser.js');
const { TFile } = await import('obsidian');
const { Github } = await import('../src/github.js');
const G = globalThis.GithubIssues;
const AutoTick = require('../src/vendor/github-auto-tick.js');
// 拷来的 core 文件还没同步到带这些修正的那一版时，这几条先跳过（npm run sync-core 以后再跑）
const vendorSynced = typeof G.hasIssueUrl === 'function' && typeof AutoTick.replaceUrls === 'function';

const PATH = '日记/2026-10-25.md';
const U = (n) => `https://github.com/o/r/issues/${n}`;
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function makePlugin(files, server, { changeBeforeWrite = false } = {}) {
  const notices = [];
  const calls = [];
  const cleanups = [];
  let saves = 0;
  const plugin = {
    settings: { section: '### 事项', github: {} },
    parser: new MarkdownParser(),
    now: () => new Date(2026, 9, 25, 12),
    pathFor: (d) => `日记/${key(d)}.md`,
    fileAt: (p) => (p in files ? new TFile(p) : null),
    app: { vault: {
      read: async (f) => files[f.path],
      // changeBeforeWrite：读出来以后、写之前，别处（同步、手改）又改了这篇
      process: async (f, fn) => { if (changeBeforeWrite) files[f.path] += '\n'; files[f.path] = fn(files[f.path]); return files[f.path]; }
    } },
    saveSettings: async () => { saves += 1; },
    notify: (m) => { notices.push(m); return { hide() {} }; },
    // 和 Obsidian 一样：插件关掉时把登记过的都收掉
    register: (fn) => cleanups.push(fn),
    registerInterval: (id) => { cleanups.push(() => clearInterval(id)); return id; },
    registerDomEvent() {},
    member: {
      signedIn: () => true,
      authorizedPost: async (path, body) => { calls.push(path); return server(path, body); },
      post: async (path, body) => { calls.push(path); return server(path, body); }
    }
  };
  plugin.github = new Github(plugin);
  return { plugin, notices, calls, cleanups, saves: () => saves };
}

const closed = (numbers) => (path, body) => (path === '/github/status' ? { connected: true }
  : { issues: body.issues.map((i) => ({ ...i, state: numbers.includes(i.number) ? 'closed' : 'open', closedAt: 'T1' })) });

test('closing #1 ticks the to-do with #1, not the one with #12', { skip: !vendorSynced && 'vendor 还没同步' }, async () => {
  const files = { [PATH]: `### 事项\n- [ ] 修 B ${U(12)}\n- [ ] 修 A ${U(1)}\n` };
  const { plugin, notices } = makePlugin(files, closed([1]));
  await plugin.github.tick({ force: true });
  assert.match(files[PATH], /- \[ \] 修 B/);
  assert.match(files[PATH], /- \[x\] 修 A/);
  assert.equal(notices.length, 1);
});

test('a tick the file refused (changed between read and write) is not announced or remembered', async () => {
  const files = { [PATH]: `### 事项\n- [ ] 修 A ${U(1)}\n` };
  const { plugin, notices } = makePlugin(files, closed([1]), { changeBeforeWrite: true });
  await plugin.github.tick({ force: true });
  assert.doesNotMatch(files[PATH], /- \[x\]/);
  assert.deepEqual(plugin.settings.github.acted, {});
  assert.deepEqual(notices, []);
  // 写的那一下回答「没写」
  const tools = plugin.github.tools();
  assert.equal(await tools.api.updateFileContent(PATH, 'x', { expectedContent: 'not the file' }), false);
  assert.equal(await tools.api.updateFileContent('nope.md', 'x'), false);
});

test('issues swapped on GitHub (#1→#2, #2→#1) keep one address per to-do', { skip: !vendorSynced && 'vendor 还没同步' }, async () => {
  const files = { [PATH]: `### 事项\n- [ ] 一 ${U(1)}\n- [ ] 二 ${U(2)}\n` };
  const { plugin } = makePlugin(files, (path) => (path === '/github/status' ? { connected: true }
    : { issues: [{ repo: 'o/r', number: 1, state: 'open', movedTo: { url: U(2) } }, { repo: 'o/r', number: 2, state: 'open', movedTo: { url: U(1) } }] }));
  await plugin.github.tick({ force: true });
  assert.match(files[PATH], new RegExp(`一 ${U(2)}\\n`));
  assert.match(files[PATH], new RegExp(`二 ${U(1)}\\n`));
});

// 假时钟：每个 setTimeout 下一轮就到，时间往前走它等的那么久
function fakeClock() {
  const realNow = Date.now;
  const realSet = window.setTimeout;
  const realClear = window.clearTimeout;
  let now = realNow();
  let id = 0;
  const live = new Set();
  Date.now = () => now;
  window.setTimeout = (fn, ms = 0) => { const t = ++id; live.add(t); setImmediate(() => { if (!live.delete(t)) return; now += ms; fn(); }); return t; };
  window.clearTimeout = (t) => { live.delete(t); };
  return { live, restore() { Date.now = realNow; window.setTimeout = realSet; window.clearTimeout = realClear; } };
}

test('clicking 连接 GitHub three times runs one waiting loop (each click reopens the page)', async () => {
  const clock = fakeClock();
  try {
    const { plugin, calls, saves } = makePlugin({}, (path) => (path === '/github/connect' ? { url: 'https://github.com/login/oauth/authorize?x' }
      : path === '/github/status' ? { connected: true } : { repos: [] }));
    globalThis.__opened = [];
    const results = await Promise.all([plugin.github.connect(), plugin.github.connect(), plugin.github.connect()]);
    assert.equal(globalThis.__opened.length, 3);
    // 5 分钟、3 秒一次：一轮大约 100 次；三轮就是 300 次
    const status = calls.filter((c) => c === '/github/status').length;
    assert.ok(status <= 110, `status asked ${status} times`);
    // 连上了但还没选项目：清单隔一会儿才要一次，清单没变不写 data.json
    assert.ok(calls.filter((c) => c === '/github/repos').length <= 25);
    assert.ok(saves() <= 1, `saved ${saves()} times`);
    assert.equal(results[0], results[1]);
    assert.equal(plugin.github.connecting, null);
  } finally {
    clock.restore();
  }
});

test('unloading the plugin stops the connect loop and the first tick timer', async () => {
  const clock = fakeClock();
  try {
    const { plugin, calls, cleanups } = makePlugin({}, (path) => (path === '/github/connect' ? { url: 'https://github.com/x' }
      : path === '/github/status' ? { connected: false } : { repos: [] }));
    plugin.github.startTicking();
    assert.ok(plugin.github.firstTick);
    const waiting = plugin.github.connect();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    cleanups.forEach((fn) => fn());
    assert.equal(await waiting, null);
    assert.equal(plugin.github.firstTick, 0);
    const asked = calls.length;
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, asked);
    assert.equal(clock.live.size, 0);
  } finally {
    clock.restore();
  }
});
