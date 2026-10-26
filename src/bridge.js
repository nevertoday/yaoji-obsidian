// 给浏览器扩展「今日待办」连的本机接口（只在电脑版开，只听 127.0.0.1）。
// 接口和 Local REST API 里扩展用到的那几个一样，扩展只换地址和配对方式：
//   GET  /                     插件在不在、带的密钥对不对（密钥对了才说这个库叫什么）
//   POST /yaoji/pair           要一个密钥：Obsidian 里弹一句「允许」，点了才给
//   GET  /yaoji/config         日记放在哪、文件名、标题（扩展照这个写，不用再猜）
//   GET  /vault/<路径>          读笔记和附件（文字或图片）；路径以 / 结尾是列目录
//   PUT  /vault/<路径>          写笔记和附件，没有就建（文件夹一起建）
// 只认带了配对密钥的请求；网页（不是 chrome-extension:// 来的）一律拒绝，也不让它弹「允许」。
import * as obsidian from 'obsidian';
import { t } from './i18n.js';

const { Modal, Platform, TFile, TFolder, normalizePath } = obsidian;

export const BRIDGE_PORT = 27125;
// 应用商店里的今日待办。别的扩展 ID（自己装的开发版）也能连，但「允许」那一句和设置里都会写明不是商店里的
export const STORE_EXTENSION_ID = 'ebnjmpnagendlekalpopgeaiimdfpffi';
const PAIR_TIMEOUT_MS = 120 * 1000;
// 「允许」关掉了、两分钟没理：同一个扩展这么久不再问；连着这么多回都没理，就当点了「不允许」
const PAIR_COOLDOWN_MS = 30 * 1000;
const PAIR_DISMISS_LIMIT = 3;
// 配对只带一个名字；没带对密钥的请求一律最多收这么多，收不完就不等了
const MAX_SMALL_BODY_BYTES = 1024;
const PAIR_BODY_TIMEOUT_MS = 10 * 1000;
const MAX_BODY_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_BYTES = 10 * 1024 * 1024;
// 同时在办的请求最多这么多（扩展平时一次就几个），多的直接回 503，不排队、不收请求体
const MAX_IN_FLIGHT = 32;
const MAX_CONNECTIONS = 64;
const TEXT_FILE = /\.(md|markdown|txt)$/i;
// 能写的只有笔记和附件（扩展只写这些）；.js、.html 这些一概不写。
// .svg 留着：扩展的图片附件里有 svg（拖进来的、贴进来的）；Obsidian 用 <img> 显示它，里面的脚本不会跑
const WRITABLE_FILE = /\.(md|markdown|txt|png|jpe?g|gif|webp|svg|avif|bmp|pdf|mp3|m4a|mp4)$/i;
// 能读、能列出来的也只有笔记和附件：扩展读日记、读日记里引用的图片（含 heic、ico），别的（设置、脚本、密钥文件）不给
const READABLE_FILE = /\.(md|markdown|txt|png|jpe?g|gif|webp|svg|avif|bmp|heic|heif|ico|pdf|mp3|m4a|mp4)$/i;
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  avif: 'image/avif', bmp: 'image/bmp', heic: 'image/heic', heif: 'image/heif', ico: 'image/x-icon',
  pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4'
};

// 路径里不能有 ..，任何一段以点开头的都不碰：库的设置文件夹（一般叫 .obsidian，设置、插件、密钥都在那里；
// 磁盘不分大小写时 .OBSIDIAN 也是它）、回收站、.git（钩子能跑程序）都在里面。
// 冒号（盘符、NTFS 数据流）、控制字符、Windows 短文件名（OBSIDI~1 也可能指向 .obsidian）也不碰
// 控制字符（0–31、127）：逐个比字符码，不写在正则里（Obsidian 审核的检查不认正则里的控制字符）
function hasControlChar(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

// 扩展自己报的名字只是给人看的：去掉控制字符和改文字方向的字符（能把名字倒着显示、冒充别的），最多 40 个字
const BIDI_CODES = [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
export function cleanName(raw) {
  let out = '';
  for (const char of String(raw || '')) {
    const code = char.charCodeAt(0);
    if (code < 32 || (code >= 127 && code < 160) || BIDI_CODES.includes(code)) continue;
    out += char;
  }
  return Array.from(out.trim()).slice(0, 40).join('').trim();
}

export function cleanVaultPath(raw, configDir) {
  let decoded;
  try {
    decoded = String(raw || '').split('/').map((part) => decodeURIComponent(part)).join('/');
  } catch {
    return null;
  }
  const parts = decoded.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.some((part) => part.startsWith('.') || part.includes(':') || hasControlChar(part) || (part.length <= 12 && /~\d/.test(part)))) return null;
  const config = String(configDir || '').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!config || (parts[0] || '').toLowerCase() === config) return null;
  return parts.join('/');
}

export function originAllowed(origin) {
  return !origin || /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

export function writableFile(path) {
  return WRITABLE_FILE.test(String(path || ''));
}

export function readableFile(path) {
  return READABLE_FILE.test(String(path || ''));
}

// 比密钥时每一位都比完，不因为前几位就对不上而提早返回
export function sameToken(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (!x || x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function extensionId(origin) {
  return String(origin || '').replace(/^chrome-extension:\/\//, '');
}

export function isStoreExtension(origin) {
  return extensionId(origin) === STORE_EXTENSION_ID;
}

// 设置里「连着的浏览器」那一行：名字 · 是不是应用商店里的（不是就写扩展 ID 前 8 位）· 哪天连上的
export function browserSummary(browser = {}) {
  const id = extensionId(browser.origin);
  const source = !id ? ''
    : id === STORE_EXTENSION_ID ? t('应用商店里的今日待办')
      : t('不是应用商店里的（扩展 ID {id}）', { id: `${id.slice(0, 8)}…` });
  return [cleanName(browser.name) || 'Chrome', source, new Date(browser.at || Date.now()).toLocaleDateString()].filter(Boolean).join(' · ');
}

export function hostAllowed(host, port = BRIDGE_PORT) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function bodyError(status) {
  return Object.assign(new Error(status === 413 ? 'too large' : 'timeout'), { status });
}

export class Bridge {
  // port、pairBodyTimeoutMs 只给测试换（真用时端口总是 27125，扩展只认这个）
  constructor(plugin, { port = BRIDGE_PORT, pairBodyTimeoutMs = PAIR_BODY_TIMEOUT_MS } = {}) {
    this.plugin = plugin;
    this.port = port;
    this.pairBodyTimeoutMs = pairBodyTimeoutMs;
    this.server = null;
    this.sockets = new Set();
    this.inFlight = 0;
    this.pairing = null;
    // 配对按扩展 ID 分开记：一个扩展被拒、被冷着，不影响别的扩展（尤其商店里那个）
    this.cooldownUntil = new Map();
    this.dismissed = new Map();
    // 点过「不允许」的扩展 ID：这次打开插件期间不再弹窗（重启 Obsidian 或关开插件后才会再问）
    this.denied = new Set();
    this.portNoticeShown = false;
  }

  get app() { return this.plugin.app; }

  start() {
    if (!Platform.isDesktopApp || this.server) return;
    let http;
    try {
      http = window.require('http');
    } catch {
      return;
    }
    const server = http.createServer((req, res) => {
      if (this.inFlight >= MAX_IN_FLIGHT) {
        this.send(res, 503, { error: 'busy' });
        return;
      }
      this.inFlight += 1;
      res.once('close', () => { this.inFlight -= 1; });
      this.handle(req, res).catch((error) => {
        console.error('[今日待办] 本机接口出错', error);
        this.send(res, 500, { error: 'internal' });
      });
    });
    // 慢慢发请求头 / 请求体占着连接的：到点就断
    server.headersTimeout = 10 * 1000;
    server.requestTimeout = 60 * 1000;
    server.maxConnections = MAX_CONNECTIONS;
    // 记着每条连接：关插件时一起断开（server.close() 只是不接新的）
    server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.once('close', () => this.sockets.delete(socket));
    });
    server.on('listening', () => {
      this.port = server.address()?.port || this.port;
    });
    server.on('error', (error) => {
      // 端口被占（多半是另一个库也开着今日待办，也可能是别的程序）：这个库就不开接口，别的照常；说一次
      console.warn(`[今日待办] 本机接口 ${this.port} 开不了：${error?.code || error}`);
      if (error?.code === 'EADDRINUSE' && !this.portNoticeShown) {
        this.portNoticeShown = true;
        this.plugin.notify?.(t('浏览器连不到这个库：本机端口 {port} 被占用了（可能另一个库也开着今日待办）', { port: this.port }), [], 10000);
      }
      if (this.server === server) this.server = null;
    });
    server.listen(this.port, '127.0.0.1');
    this.server = server;
  }

  stop() {
    this.pairing?.modal?.close();
    const server = this.server;
    this.server = null;
    server?.close();
    // 开着的连接（keep-alive、正在传的）也一起断：关掉插件以后，谁也不能再借旧连接读写
    server?.closeAllConnections?.();
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }

  tokens() {
    return Array.isArray(this.plugin.settings.browsers) ? this.plugin.settings.browsers : [];
  }

  // 密钥要对，而且请求带着扩展来源时，得是当初配对的那个扩展（别的扩展拿到密钥也用不了）
  authorized(req) {
    const match = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
    if (!match) return false;
    const origin = String(req.headers.origin || '');
    return this.tokens().some((entry) => sameToken(entry.token, match[1]) && (!origin || !entry.origin || entry.origin === origin));
  }

  send(res, status, body, headers = {}) {
    if (res.headersSent || res.destroyed) return;
    const origin = res.yaojiOrigin;
    const cors = origin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      Vary: 'Origin'
    } : {};
    // 带着请求体又没收完（拒掉的、太大的）：回完就断开这条连接，不再接着收
    const req = res.req;
    const unread = req && !req.complete && (Number(req.headers['content-length']) > 0 || Boolean(req.headers['transfer-encoding']));
    const close = unread ? { Connection: 'close' } : {};
    if (body === undefined || body === null) {
      res.writeHead(status, { ...cors, ...close, ...headers });
      res.end();
      return;
    }
    const isJson = !(body instanceof Uint8Array) && typeof body !== 'string';
    const payload = isJson ? JSON.stringify(body) : body;
    res.writeHead(status, {
      'Content-Type': isJson ? 'application/json; charset=utf-8' : (headers['Content-Type'] || 'text/plain; charset=utf-8'),
      'Cache-Control': 'no-store',
      // 读出去的 svg、html 样的文字不会被当成网页跑
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      ...cors,
      ...close,
      ...headers
    });
    res.end(payload);
  }

  // 收请求体：先看声明的长度，收的时候再数，超了就不再攒（不先攒满再说）；timeoutMs 到了还没收完也不等。
  // drain：带对密钥的请求超了也读完扔掉再回 413（扩展看得到「太大」，不是「连不上」）；没带对的超了马上回、断开
  readBody(req, { limit, timeoutMs = 0, drain = false }) {
    return new Promise((resolve, reject) => {
      if (!drain && Number(req.headers['content-length']) > limit) {
        reject(bodyError(413));
        return;
      }
      const chunks = [];
      let size = 0;
      let timer = null;
      const fail = (error) => {
        window.clearTimeout(timer);
        req.removeAllListeners('data');
        reject(error);
      };
      if (timeoutMs) timer = window.setTimeout(() => fail(bodyError(408)), timeoutMs);
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size <= limit) {
          chunks.push(chunk);
          return;
        }
        chunks.length = 0;
        if (!drain) fail(bodyError(413));
      });
      req.on('end', () => {
        window.clearTimeout(timer);
        if (size > limit) reject(bodyError(413));
        else resolve(window.require('buffer').Buffer.concat(chunks));
      });
      req.on('error', fail);
    });
  }

  async handle(req, res) {
    const origin = String(req.headers.origin || '');
    if (!hostAllowed(String(req.headers.host || ''), this.port) || !originAllowed(origin)) {
      this.send(res, 403, { error: 'forbidden' });
      return;
    }
    res.yaojiOrigin = origin || '';
    if (req.method === 'OPTIONS') {
      this.send(res, 204, null);
      return;
    }
    const authed = this.authorized(req);
    // 没带对密钥的请求最多带 1 KB（配对只带一个名字），说得更多的不收
    if (!authed && Number(req.headers['content-length']) > MAX_SMALL_BODY_BYTES) {
      this.send(res, 413, { error: 'too_large' });
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
    const path = url.pathname;

    if (path === '/' && req.method === 'GET') {
      // 没带对密钥只说「是今日待办」，库叫什么不说
      this.send(res, 200, {
        service: 'yaoji-today',
        status: 'OK',
        version: this.plugin.manifest.version,
        ...(authed ? { vault: this.app.vault.getName() } : {}),
        authenticated: authed
      });
      return;
    }

    if (path === '/yaoji/pair' && req.method === 'POST') {
      await this.pair(req, res, origin);
      return;
    }

    if (!authed) {
      this.send(res, 401, { error: 'unauthorized' });
      return;
    }

    if (path === '/yaoji/config' && req.method === 'GET') {
      const settings = this.plugin.settings;
      this.send(res, 200, {
        folder: settings.folder,
        format: settings.format,
        section: settings.section,
        template: settings.template,
        today: this.plugin.pathFor(this.plugin.now())
      });
      return;
    }

    if (path === '/vault' || path.startsWith('/vault/')) {
      const raw = path.slice('/vault'.length);
      const vaultPath = cleanVaultPath(raw, this.app.vault.configDir);
      if (vaultPath === null) {
        this.send(res, 403, { error: 'forbidden_path' });
        return;
      }
      if (req.method === 'GET') {
        if (raw === '' || raw.endsWith('/')) {
          await this.list(res, vaultPath);
          return;
        }
        if (!readableFile(vaultPath)) {
          this.send(res, 403, { error: 'forbidden_type' });
          return;
        }
        await this.read(res, vaultPath);
        return;
      }
      if (req.method === 'PUT' && vaultPath) {
        if (!writableFile(vaultPath)) {
          this.send(res, 403, { error: 'forbidden_type' });
          return;
        }
        await this.write(req, res, vaultPath);
        return;
      }
    }
    this.send(res, 404, { error: 'not_found' });
  }

  // 列目录：只列文件夹和能读的笔记、附件
  async list(res, dir) {
    const folder = dir ? this.app.vault.getAbstractFileByPath(normalizePath(dir)) : this.app.vault.getRoot();
    if (!(folder instanceof TFolder)) {
      this.send(res, 404, { error: 'not_found' });
      return;
    }
    const files = folder.children
      .filter((child) => !child.name.startsWith('.') && (child instanceof TFolder || readableFile(child.name)))
      .map((child) => (child instanceof TFolder ? `${child.name}/` : child.name));
    this.send(res, 200, { files });
  }

  async read(res, path) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile) || !readableFile(file.name)) {
      this.send(res, 404, { error: 'not_found' });
      return;
    }
    if (TEXT_FILE.test(file.name)) {
      this.send(res, 200, await this.app.vault.read(file), { 'Content-Type': 'text/markdown; charset=utf-8' });
      return;
    }
    const data = new Uint8Array(await this.app.vault.readBinary(file));
    this.send(res, 200, data, { 'Content-Type': MIME[file.extension.toLowerCase()] || 'application/octet-stream' });
  }

  // 先收完、看过大小，再建文件夹、写文件：太大被拒的不会留下空文件夹
  async write(req, res, path) {
    const text = TEXT_FILE.test(path);
    let body;
    try {
      body = await this.readBody(req, { limit: text ? MAX_TEXT_BYTES : MAX_BODY_BYTES, drain: true });
    } catch (error) {
      this.send(res, error?.status || 400, { error: error?.status === 413 ? 'too_large' : 'bad_body' });
      return;
    }
    const target = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(target);
    if (existing && !(existing instanceof TFile)) {
      this.send(res, 409, { error: 'is_folder' });
      return;
    }
    await this.plugin.ensureFolder(target);
    if (text) {
      const content = body.toString('utf8');
      if (existing) await this.app.vault.modify(existing, content);
      else await this.app.vault.create(target, content);
    } else {
      const data = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      if (existing) await this.app.vault.modifyBinary(existing, data);
      else await this.app.vault.createBinary(target, data);
    }
    this.send(res, 204, null);
  }

  // 配对：同一时间只问一次；用户点「允许」才给密钥。
  // 点「不允许」：这个扩展这次不再问；关掉、两分钟没理、扩展那头不等了：这个扩展 30 秒内不再问，连着三回就当不允许
  async pair(req, res, origin) {
    if (!origin) {
      this.send(res, 403, { error: 'extension_only' });
      return;
    }
    const id = extensionId(origin);
    if (this.denied.has(id) || Date.now() < (this.cooldownUntil.get(id) || 0)) {
      this.send(res, 403, { error: 'pair_denied' });
      return;
    }
    if (this.pairing) {
      this.send(res, 409, { error: 'pairing_busy' });
      return;
    }
    // 先占住再收请求体（中间不能有 await）：一次只会有一个「允许」开着
    const pairing = { id, modal: null };
    this.pairing = pairing;
    try {
      let raw;
      try {
        raw = await this.readBody(req, { limit: MAX_SMALL_BODY_BYTES, timeoutMs: this.pairBodyTimeoutMs });
      } catch (error) {
        this.send(res, error?.status || 400, { error: 'bad_body' });
        return;
      }
      let name = '';
      try {
        name = cleanName(JSON.parse(raw.toString('utf8') || '{}').name);
      } catch { /* 名字只是给人看的 */ }

      const answer = await this.askPair(pairing, res);
      if (answer !== 'allow') {
        if (answer === 'deny') {
          this.denied.add(id);
        } else {
          const times = (this.dismissed.get(id) || 0) + 1;
          this.dismissed.set(id, times);
          if (times >= PAIR_DISMISS_LIMIT) this.denied.add(id);
          else this.cooldownUntil.set(id, Date.now() + PAIR_COOLDOWN_MS);
        }
        this.send(res, 403, { error: 'pair_denied' });
        return;
      }
      this.dismissed.delete(id);
      const token = randomToken();
      this.plugin.settings.browsers = [...this.tokens(), { token, origin, name: name || 'Chrome', at: Date.now() }];
      await this.plugin.saveSettings();
      this.plugin.refreshSettingsTab?.();
      this.send(res, 200, { token, vault: this.app.vault.getName() });
    } finally {
      if (this.pairing === pairing) this.pairing = null;
    }
  }

  // 弹「允许」，等回答：'allow' / 'deny' / 'dismiss'（关掉、超时、扩展那头断开）
  askPair(pairing, res) {
    return new Promise((resolve) => {
      const modal = new PairModal(this.app, this.app.vault.getName(), pairing.id, resolve);
      const timer = window.setTimeout(() => modal.close(), PAIR_TIMEOUT_MS);
      // 扩展那头不等了（页面关了、断开了）：弹窗跟着收起，免得点了「允许」密钥没人拿
      const gone = () => modal.close();
      res.once('close', gone);
      modal.onDone = () => {
        window.clearTimeout(timer);
        res.off('close', gone);
      };
      pairing.modal = modal;
      modal.open();
    });
  }
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// 「浏览器里的今日待办想连接这个库」：一句话，允许 / 不允许
class PairModal extends Modal {
  constructor(app, vaultName, id, resolve) {
    super(app);
    this.vaultName = vaultName;
    this.id = id;
    this.resolve = resolve;
    this.answered = false;
    this.onDone = null;
  }

  answer(value) {
    if (this.answered) return;
    this.answered = true;
    this.onDone?.();
    this.resolve(value);
  }

  onOpen() {
    this.modalEl.addClass('yaoji-pair-modal');
    this.contentEl.createEl('p', { cls: 'yaoji-pair-text', text: t('浏览器里的今日待办想连接「{vault}」', { vault: this.vaultName }) });
    // 不是商店里的那个扩展：写出它的 ID，不认识就别允许（连上以后它能读写这个库里的笔记）
    if (this.id !== STORE_EXTENSION_ID) {
      this.contentEl.createEl('p', { cls: 'yaoji-pair-warn', text: t('不是应用商店里的今日待办（扩展 ID {id}）。不认识就点「不允许」。', { id: this.id }) });
    }
    const row = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const deny = row.createEl('button', { text: t('不允许') });
    deny.addEventListener('click', () => { this.answer('deny'); this.close(); });
    const allow = row.createEl('button', { cls: 'mod-cta', text: t('允许') });
    allow.addEventListener('click', () => { this.answer('allow'); this.close(); });
    // 默认停在「不允许」：在 Obsidian 里打字时顺手按的回车不会把库交出去
    window.setTimeout(() => deny.focus(), 0);
  }

  onClose() {
    this.answer('dismiss');
    this.contentEl.empty();
  }
}
