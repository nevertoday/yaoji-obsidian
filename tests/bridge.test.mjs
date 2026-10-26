import test from 'node:test';
import assert from 'node:assert/strict';

// bridge.js 引了 obsidian：先给一个假的 obsidian 模块。Modal 记下开着的弹窗，测试里能点「允许」「不允许」
import { register, createRequire } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'obsidian') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(`
export class Modal {
  constructor(app) {
    this.app = app;
    this.els = [];
    const box = () => ({ addClass() {}, empty() {}, createEl: (tag, o = {}) => { const el = { tag, ...o, focus() {}, addEventListener: (ev, fn) => { el['on' + ev] = fn; } }; this.els.push(el); return el; }, createDiv: () => box() });
    this.modalEl = box();
    this.contentEl = box();
  }
  open() { globalThis.__modals.push(this); this.onOpen(); }
  close() { const i = globalThis.__modals.indexOf(this); if (i >= 0) globalThis.__modals.splice(i, 1); this.onClose(); }
  click(text) { this.els.find((el) => el.text === text).onclick(); }
}
export const Platform = { isDesktopApp: true };
export class TFile { constructor(p) { this.path = p; this.name = p.split('/').pop(); this.extension = this.name.includes('.') ? this.name.split('.').pop() : ''; } }
export class TFolder { constructor(p, children) { this.path = p; this.name = p.split('/').pop(); this.load = children; } get children() { return this.load(); } }
export const normalizePath = (p) => String(p).replace(/[\\/]+/g, '/').replace(/^\\/|\\/$/g, '') || '/';
`)}), shortCircuit: true };
  return next(specifier, context);
}`));
globalThis.__modals = [];
globalThis.window = { require: createRequire(import.meta.url), setTimeout, clearTimeout };
const {
  Bridge, STORE_EXTENSION_ID, browserSummary, cleanName, cleanVaultPath, hostAllowed, originAllowed, readableFile, sameToken, writableFile
} = await import('../src/bridge.js');

test('路径：能解码中文，不许 .. 和 .obsidian', () => {
  assert.equal(cleanVaultPath('/%E6%88%91/%E6%97%A5%E8%AE%B0/D-2026-10-25_%20%E5%91%A8%E6%97%A5.md', '.obsidian'), '我/日记/D-2026-10-25_ 周日.md');
  assert.equal(cleanVaultPath('/', '.obsidian'), '');
  assert.equal(cleanVaultPath('/a/../../etc/passwd', '.obsidian'), null);
  assert.equal(cleanVaultPath('/.obsidian/plugins/x/data.json', '.obsidian'), null);
  assert.equal(cleanVaultPath('/.my-config/plugins/x/data.json', '.my-config'), null);
  assert.equal(cleanVaultPath('/日记/a.md', ''), null);
  assert.equal(cleanVaultPath('/%E0%A4%A', '.obsidian'), null);
});

// 对抗测试里打穿过的：磁盘不分大小写时 .OBSIDIAN 就是 .obsidian（能写进插件文件夹 = 能在电脑上跑程序）
test('路径：以点开头的一段都不碰，大小写、编码、短文件名、冒号都绕不过去', () => {
  for (const raw of [
    '/.OBSIDIAN/plugins/evil/main.js', '/.Obsidian/community-plugins.json', '/%2eobsidian/app.json', '/%2EOBSIDIAN/app.json',
    '/Daily/%2e%2e/.obsidian/app.json', '//.obsidian/app.json', '/.git/hooks/post-commit', '/.trash/a.md', '/.TRASH/a.md',
    '/notes/.hidden/a.md', '/OBSIDI~1/plugins/x/main.js', '/C:/Windows/a.md', '/a.md:stream', '/a%00.md', '/a%0A.md',
    '/..%2f..%2fetc/passwd', '/..%5c..%5cetc/passwd', '/a/../../x.md', '/./a.md'
  ]) assert.equal(cleanVaultPath(raw, '.obsidian'), null, raw);
  assert.equal(cleanVaultPath('/MY-CONFIG/a.md', 'my-config'), null);
  assert.equal(cleanVaultPath('/日记/会议~记录.md', '.obsidian'), '日记/会议~记录.md');
  assert.equal(cleanVaultPath('/日记/2026 年度总结~第2版.md', '.obsidian'), '日记/2026 年度总结~第2版.md');
});

test('只能写笔记和附件', () => {
  for (const ok of ['日记/a.md', 'a.markdown', 'a.txt', '附件/a.PNG', 'a.jpeg', 'a.webp', 'a.svg', 'a.pdf', 'a.mp4']) assert.equal(writableFile(ok), true, ok);
  for (const bad of ['evil.js', 'evil.html', 'a.json', 'a.css', 'a.sh', 'a.md.exe', 'a', 'a.canvas']) assert.equal(writableFile(bad), false, bad);
});

test('密钥比较：长度、内容都要一样', () => {
  assert.equal(sameToken('abc', 'abc'), true);
  assert.equal(sameToken('abc', 'abd'), false);
  assert.equal(sameToken('abc', 'abcd'), false);
  assert.equal(sameToken('', ''), false);
});

test('只认扩展来的请求，网页不行；Host 只能是本机（防 DNS 重绑定）', () => {
  assert.equal(originAllowed('chrome-extension://abcdefghijklmnopabcdefghijklmnop'), true);
  assert.equal(originAllowed(''), true);
  assert.equal(originAllowed('https://evil.example'), false);
  assert.equal(originAllowed('null'), false);
  assert.equal(hostAllowed('127.0.0.1:27125'), true);
  assert.equal(hostAllowed('evil.example:27125'), false);
});

// ---------- 真开一个本机接口（随便一个空端口，不碰 27125）：对抗测试里打穿过的都在这里守着 ----------
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { setLanguage } from '../src/i18n.js';

const obs = await import('obsidian');
const STORE = `chrome-extension://${STORE_EXTENSION_ID}`;
const EVIL = `chrome-extension://${'a'.repeat(32)}`;
const OTHER = `chrome-extension://${'b'.repeat(32)}`;
const TOKEN = 'c'.repeat(64);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const modals = () => globalThis.__modals;

function makeVault() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'yaoji-bridge-'));
  const abs = (p) => path.join(base, p);
  const wrap = (p) => {
    let stat;
    try { stat = fs.statSync(abs(p)); } catch { return null; }
    if (stat.isDirectory()) return new obs.TFolder(p, () => fs.readdirSync(abs(p)).map((n) => wrap(p ? `${p}/${n}` : n)).filter(Boolean));
    return new obs.TFile(p);
  };
  const vault = {
    base, configDir: '.obsidian',
    getName: () => 'SecretVaultName',
    getRoot: () => wrap(''),
    getAbstractFileByPath: (p) => wrap(p),
    read: async (f) => fs.readFileSync(abs(f.path), 'utf8'),
    readBinary: async (f) => { const b = fs.readFileSync(abs(f.path)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
    create: async (p, c) => fs.writeFileSync(abs(p), c),
    modify: async (f, c) => fs.writeFileSync(abs(f.path), c),
    createBinary: async (p, d) => fs.writeFileSync(abs(p), Buffer.from(d)),
    modifyBinary: async (f, d) => fs.writeFileSync(abs(f.path), Buffer.from(d)),
    createFolder: async (p) => fs.mkdirSync(abs(p), { recursive: true })
  };
  return vault;
}

async function startBridge({ browsers = [{ token: TOKEN, origin: STORE, name: 'Chrome', at: 0 }], port = 0, ...options } = {}) {
  const vault = makeVault();
  const notices = [];
  const plugin = {
    app: { vault },
    manifest: { version: '0.1.2' },
    settings: { browsers, folder: 'Daily', format: 'YYYY-MM-DD', section: '### Todo', template: '' },
    pathFor: () => 'Daily/2026-10-25.md',
    now: () => new Date(),
    notify: (message) => notices.push(message),
    saveSettings: async () => {},
    refreshSettingsTab() {},
    async ensureFolder(p) { const dir = p.split('/').slice(0, -1).join('/'); if (dir) await vault.createFolder(dir); }
  };
  const bridge = new Bridge(plugin, { port, ...options });
  bridge.start();
  await new Promise((resolve, reject) => {
    bridge.server.once('listening', resolve);
    bridge.server.once('error', reject);
  });
  globalThis.__modals.length = 0;
  return { bridge, plugin, vault, notices, port: bridge.port };
}

// 手写请求：fetch 会改 Host / Origin
function request(port, { method = 'GET', path: p = '/', headers = {}, body, agent = false } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, agent, headers: { Host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    if (body !== undefined) r.write(body);
    r.end();
  });
}
const auth = (origin = STORE) => ({ Origin: origin, Authorization: `Bearer ${TOKEN}` });
const pair = (port, origin, name = 'Chrome') => request(port, { method: 'POST', path: '/yaoji/pair', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });

// 只发请求头、请求体先不发：用来把请求停在「收请求体」那一步
function parkedRequest(port, head) {
  const socket = net.connect(port, '127.0.0.1');
  let out = '';
  socket.on('data', (d) => { out += d; });
  socket.on('error', () => {});
  const done = new Promise((resolve) => socket.on('close', () => resolve(out)));
  socket.write(head);
  return { socket, done, output: () => out };
}
const pairHead = (port, origin, length) => `POST /yaoji/pair HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${origin}\r\nContent-Type: application/json\r\nContent-Length: ${length}\r\nConnection: close\r\n\r\n`;
const statusOf = (raw) => Number(String(raw).split(' ')[1]);

test('配对：一起来 8 个请求、请求体先压着，也只弹一个「允许」，别的马上回 409（不会叠出一摞弹窗）', async () => {
  const { bridge, port } = await startBridge();
  try {
    const body = JSON.stringify({ name: 'Chrome' });
    const parked = Array.from({ length: 8 }, () => parkedRequest(port, pairHead(port, EVIL, body.length)));
    await wait(150);
    for (const p of parked) p.socket.write(body);
    await wait(150);
    assert.equal(modals().length, 1);
    assert.equal(parked.filter((p) => statusOf(p.output()) === 409).length, 7);
    // 别的扩展这时来配：也是 409，不会再弹
    assert.equal((await pair(port, OTHER)).status, 409);
    assert.equal(modals().length, 1);
    modals()[0].click('不允许');
    const results = await Promise.all(parked.map((p) => p.done));
    assert.deepEqual(results.map(statusOf).sort(), [403, 409, 409, 409, 409, 409, 409, 409]);
    assert.equal(bridge.pairing, null);
    assert.equal(modals().length, 0);
  } finally {
    bridge.stop();
  }
});

test('配对：点过「不允许」的扩展这次不再弹；冷却只管那一个扩展，商店里的今日待办马上能连', async () => {
  const { bridge, plugin, port } = await startBridge({ browsers: [] });
  try {
    const rogue = pair(port, EVIL, 'Chrome');
    await wait(80);
    modals()[0].click('不允许');
    assert.equal((await rogue).status, 403);
    // 被拒的扩展再来：不弹窗，直接 403（过了冷却也一样）
    bridge.cooldownUntil.clear();
    assert.equal((await pair(port, EVIL)).status, 403);
    assert.equal(modals().length, 0);
    // 商店里的今日待办不受影响
    const real = pair(port, STORE, 'Chrome');
    await wait(80);
    assert.equal(modals().length, 1);
    modals()[0].click('允许');
    const ok = await real;
    assert.equal(ok.status, 200);
    assert.equal(JSON.parse(ok.body).token.length, 64);
    assert.deepEqual(plugin.settings.browsers.map((b) => b.origin), [STORE]);
  } finally {
    bridge.stop();
  }
});

test('配对：关掉弹窗只冷着那一个扩展 30 秒，连着关三回就当不允许', async () => {
  const { bridge, port } = await startBridge({ browsers: [] });
  try {
    for (let round = 1; round <= 3; round += 1) {
      bridge.cooldownUntil.clear();
      const asked = pair(port, EVIL);
      await wait(80);
      assert.equal(modals().length, 1, `第 ${round} 回`);
      modals()[0].close();
      assert.equal((await asked).status, 403);
      if (round < 3) {
        assert.equal((await pair(port, EVIL)).status, 403, '冷却中');
        assert.equal(modals().length, 0);
      }
    }
    bridge.cooldownUntil.clear();
    assert.equal((await pair(port, EVIL)).status, 403);
    assert.equal(modals().length, 0);
    assert.ok(bridge.denied.has('a'.repeat(32)));
    // 别的扩展照样能问
    const other = pair(port, OTHER);
    await wait(80);
    assert.equal(modals().length, 1);
    modals()[0].click('不允许');
    assert.equal((await other).status, 403);
  } finally {
    bridge.stop();
  }
});

test('配对：扩展那头断开了，弹窗跟着收起；请求体一直不来，到点就放开，不一直占着', async () => {
  const { bridge, port } = await startBridge({ browsers: [], pairBodyTimeoutMs: 200 });
  try {
    const body = JSON.stringify({ name: 'x' });
    const gone = parkedRequest(port, pairHead(port, EVIL, body.length) + body);
    await wait(100);
    assert.equal(modals().length, 1);
    gone.socket.destroy();
    await wait(100);
    assert.equal(modals().length, 0);
    assert.equal(bridge.pairing, null);

    const slow = parkedRequest(port, pairHead(port, OTHER, 100));
    await wait(50);
    assert.ok(bridge.pairing);
    assert.equal(statusOf(await slow.done), 408);
    assert.equal(bridge.pairing, null);
    assert.equal(modals().length, 0);
  } finally {
    bridge.stop();
  }
});

test('没带密钥的请求最多 1 KB：配对说得太长（声明的、或一边发一边超）直接 413，不弹窗、不先攒着', async () => {
  const { bridge, port } = await startBridge({ browsers: [] });
  try {
    const declared = await request(port, { method: 'POST', path: '/yaoji/pair', headers: { Origin: EVIL, 'Content-Length': String(40 * 1024 * 1024) } });
    assert.equal(declared.status, 413);
    assert.equal(declared.headers.connection, 'close');
    // 不声明长度（分块发）：收到第 1 KB 多一点就停
    const chunked = await new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/yaoji/pair', agent: false, headers: { Host: `127.0.0.1:${port}`, Origin: EVIL } }, (res) => { res.resume(); resolve(res.statusCode); });
      r.on('error', reject);
      r.write(Buffer.alloc(4096, 32));
      // 不 end：服务端得自己看出来太长
    });
    assert.equal(chunked, 413);
    assert.equal(modals().length, 0);
    assert.equal(bridge.pairing, null);
    // 别的接口没带密钥也一样：大请求体直接 413（没带密钥本来就 401，不收）
    const put = await request(port, { method: 'PUT', path: '/vault/a.md', headers: { Origin: EVIL, 'Content-Length': String(5 * 1024 * 1024) } });
    assert.equal(put.status, 413);
  } finally {
    bridge.stop();
  }
});

test('同时在办的请求有上限：压着 32 个，第 33 个回 503；放开后照常', async () => {
  const { bridge, port } = await startBridge();
  try {
    const head = `PUT /vault/a.md HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${STORE}\r\nAuthorization: Bearer ${TOKEN}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n`;
    const parked = Array.from({ length: 32 }, () => parkedRequest(port, `${head}x`));
    await wait(200);
    assert.equal(bridge.inFlight, 32);
    assert.equal((await request(port, { headers: auth() })).status, 503);
    for (const p of parked) p.socket.write('y');
    await Promise.all(parked.map((p) => p.done));
    await wait(50);
    assert.equal(bridge.inFlight, 0);
    assert.equal((await request(port, { headers: auth() })).status, 200);
  } finally {
    bridge.stop();
  }
});

test('关掉插件（stop）时开着的连接一起断：压着的请求、keep-alive 都不能再读写', async () => {
  const { bridge, vault, port } = await startBridge();
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  try {
    const first = await request(port, { headers: auth(), agent });
    assert.equal(first.status, 200);
    assert.notEqual(first.headers.connection, 'close', '平常的请求照样 keep-alive');
    const zombie = parkedRequest(port, `PUT /vault/zombie.md HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${STORE}\r\nAuthorization: Bearer ${TOKEN}\r\nContent-Length: 6\r\n\r\ntick `);
    await wait(80);
    assert.ok(bridge.sockets.size >= 2);
    bridge.stop();
    await zombie.done;
    assert.equal(zombie.socket.destroyed, true);
    assert.equal(fs.existsSync(path.join(vault.base, 'zombie.md')), false);
    assert.equal(bridge.sockets.size, 0);
    await assert.rejects(request(port, { headers: auth(), agent }));
  } finally {
    agent.destroy();
    bridge.stop();
  }
});

test('只读得到、列得出笔记和附件：secrets.json、tool.js 这些不给', async () => {
  const { bridge, vault, port } = await startBridge();
  try {
    fs.mkdirSync(path.join(vault.base, 'Daily'));
    fs.writeFileSync(path.join(vault.base, 'Daily/2026-10-25.md'), '- [ ] a');
    fs.writeFileSync(path.join(vault.base, 'pic.png'), 'png');
    fs.writeFileSync(path.join(vault.base, 'secrets.json'), '{"key":1}');
    fs.writeFileSync(path.join(vault.base, 'tool.js'), 'run()');
    fs.writeFileSync(path.join(vault.base, 'board.canvas'), '{}');
    assert.equal((await request(port, { path: '/vault/Daily/2026-10-25.md', headers: auth() })).body, '- [ ] a');
    const png = await request(port, { path: '/vault/pic.png', headers: auth() });
    assert.equal(png.status, 200);
    assert.equal(png.headers['content-type'], 'image/png');
    assert.equal(png.headers['x-content-type-options'], 'nosniff');
    for (const p of ['/vault/secrets.json', '/vault/tool.js', '/vault/board.canvas']) {
      const res = await request(port, { path: p, headers: auth() });
      assert.equal(res.status, 403, p);
      assert.equal(res.body.includes('run()') || res.body.includes('"key"'), false, p);
    }
    assert.deepEqual(JSON.parse((await request(port, { path: '/vault/', headers: auth() })).body).files.sort(), ['Daily/', 'pic.png']);
    for (const ok of ['a.md', 'a.txt', 'a.PNG', 'a.svg', 'a.heic', 'a.ico', 'a.pdf']) assert.equal(readableFile(ok), true, ok);
    for (const bad of ['a.json', 'a.js', 'a.html', 'a.canvas', 'a.base', 'a.csv', 'a']) assert.equal(readableFile(bad), false, bad);
  } finally {
    bridge.stop();
  }
});

test('写：太大被拒的不先建文件夹；svg 照样能写（扩展的图片附件有 svg）', async () => {
  const { bridge, vault, port } = await startBridge();
  try {
    const big = await request(port, { method: 'PUT', path: '/vault/newdir/big.md', headers: auth(), body: Buffer.alloc(11 * 1024 * 1024, 97) });
    assert.equal(big.status, 413);
    assert.equal(fs.existsSync(path.join(vault.base, 'newdir')), false);
    const svg = await request(port, { method: 'PUT', path: '/vault/%E9%99%84%E4%BB%B6/a.svg', headers: { ...auth(), 'Content-Type': 'image/svg+xml' }, body: '<svg/>' });
    assert.equal(svg.status, 204);
    assert.equal(fs.readFileSync(path.join(vault.base, '附件/a.svg'), 'utf8'), '<svg/>');
    const note = await request(port, { method: 'PUT', path: '/vault/Daily/2026-10-25.md', headers: auth(), body: '- [ ] b' });
    assert.equal(note.status, 204);
  } finally {
    bridge.stop();
  }
});

test('GET /：没带对密钥只说「是今日待办」，不说库名；带对了才说', async () => {
  const { bridge, port } = await startBridge();
  try {
    const anon = JSON.parse((await request(port, { headers: { Origin: EVIL } })).body);
    assert.equal(anon.service, 'yaoji-today');
    assert.equal(anon.authenticated, false);
    assert.equal('vault' in anon, false);
    const wrongExt = JSON.parse((await request(port, { headers: auth(EVIL) })).body);
    assert.equal('vault' in wrongExt, false, '别的扩展拿着密钥也不行');
    const mine = JSON.parse((await request(port, { headers: auth() })).body);
    assert.equal(mine.authenticated, true);
    assert.equal(mine.vault, 'SecretVaultName');
    // 网页、DNS 重绑定照旧拒
    assert.equal((await request(port, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await request(port, { headers: { Host: `evil.example:${port}` } })).status, 403);
  } finally {
    bridge.stop();
  }
});

test('端口被占：Obsidian 里说一次（跟着界面语言），不只在控制台', async () => {
  const first = await startBridge();
  const vault = makeVault();
  const notices = [];
  const plugin = { app: { vault }, manifest: { version: '0' }, settings: { browsers: [] }, notify: (m) => notices.push(m) };
  const second = new Bridge(plugin, { port: first.port });
  try {
    second.start();
    await wait(100);
    assert.equal(second.server, null);
    assert.equal(notices.length, 1);
    assert.match(notices[0], new RegExp(String(first.port)));
    second.start();
    await wait(100);
    assert.equal(notices.length, 1, '只说一次');
  } finally {
    second.stop();
    first.bridge.stop();
  }
});

test('设置里那一行：写出是不是应用商店里的、扩展 ID；名字去掉改方向的字符', () => {
  setLanguage('zh');
  assert.match(browserSummary({ origin: STORE, name: 'Chrome', at: 0 }), /^Chrome · 应用商店里的今日待办 · /);
  const rogue = browserSummary({ origin: EVIL, name: 'Chrome', at: 0 });
  assert.match(rogue, /不是应用商店里的（扩展 ID aaaaaaaa…）/);
  assert.equal(cleanName('Chr‮emo\u0007'), 'Chremo');
  assert.equal(cleanName('x'.repeat(100)).length, 40);
  assert.equal(browserSummary({ name: '', at: 0 }).startsWith('Chrome · '), true);
  setLanguage('en');
  assert.match(browserSummary({ origin: EVIL, name: 'Edge', at: 0 }), /^Edge · Not from the Chrome Web Store \(extension ID aaaaaaaa…\)/);
  setLanguage('zh');
});
