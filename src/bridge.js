// 给浏览器扩展「今日待办」连的本机接口（只在电脑版开，只听 127.0.0.1）。
// 接口和 Local REST API 里扩展用到的那几个一样，扩展只换地址和配对方式：
//   GET  /                     插件在不在、这个库叫什么、带的密钥对不对
//   POST /yaoji/pair           要一个密钥：Obsidian 里弹一句「允许」，点了才给
//   GET  /yaoji/config         日记放在哪、文件名、标题（扩展照这个写，不用再猜）
//   GET  /vault/<路径>          读文件（文字或图片）；路径以 / 结尾是列目录
//   PUT  /vault/<路径>          写文件，没有就建（文件夹一起建）
// 只认带了配对密钥的请求；网页（不是 chrome-extension:// 来的）一律拒绝，也不让它弹「允许」。
import * as obsidian from 'obsidian';
import { t } from './i18n.js';

const { Modal, Platform, TFile, TFolder, normalizePath } = obsidian;

export const BRIDGE_PORT = 27125;
const PAIR_TIMEOUT_MS = 120 * 1000;
const MAX_BODY_BYTES = 50 * 1024 * 1024;
const TEXT_FILE = /\.(md|markdown|txt|csv|json|canvas|base)$/i;
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  avif: 'image/avif', bmp: 'image/bmp', pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4'
};

// 路径里不能有 ..，也不碰 .obsidian（设置、插件、密钥都在那里）
export function cleanVaultPath(raw) {
  let decoded;
  try {
    decoded = String(raw || '').split('/').map((part) => decodeURIComponent(part)).join('/');
  } catch {
    return null;
  }
  const parts = decoded.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part === '.')) return null;
  if (parts[0] === '.obsidian' || parts[0] === '.trash') return null;
  return parts.join('/');
}

export function originAllowed(origin) {
  return !origin || /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

export function hostAllowed(host) {
  return host === `127.0.0.1:${BRIDGE_PORT}` || host === `localhost:${BRIDGE_PORT}`;
}

export class Bridge {
  constructor(plugin) {
    this.plugin = plugin;
    this.server = null;
    this.pairing = null;
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
      this.handle(req, res).catch((error) => {
        console.error('[今日待办] 本机接口出错', error);
        this.send(res, 500, { error: 'internal' });
      });
    });
    server.on('error', (error) => {
      // 端口被占（多半是另一个库也开着今日待办）：这个库就不开接口，别的照常
      console.warn(`[今日待办] 本机接口 ${BRIDGE_PORT} 开不了：${error?.code || error}`);
      this.server = null;
    });
    server.listen(BRIDGE_PORT, '127.0.0.1');
    this.server = server;
  }

  stop() {
    this.pairing?.modal?.close();
    this.server?.close();
    this.server = null;
  }

  tokens() {
    return Array.isArray(this.plugin.settings.browsers) ? this.plugin.settings.browsers : [];
  }

  authorized(req) {
    const match = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
    return !!match && this.tokens().some((entry) => entry.token === match[1]);
  }

  send(res, status, body, headers = {}) {
    if (res.headersSent) return;
    const origin = res.yaojiOrigin;
    const cors = origin ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      Vary: 'Origin'
    } : {};
    if (body === undefined || body === null) {
      res.writeHead(status, { ...cors, ...headers });
      res.end();
      return;
    }
    const isJson = !(body instanceof Uint8Array) && typeof body !== 'string';
    const payload = isJson ? JSON.stringify(body) : body;
    res.writeHead(status, {
      'Content-Type': isJson ? 'application/json; charset=utf-8' : (headers['Content-Type'] || 'text/plain; charset=utf-8'),
      'Cache-Control': 'no-store',
      ...cors,
      ...headers
    });
    res.end(payload);
  }

  readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(Object.assign(new Error('too large'), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(window.require('buffer').Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  async handle(req, res) {
    const origin = String(req.headers.origin || '');
    if (!hostAllowed(String(req.headers.host || '')) || !originAllowed(origin)) {
      this.send(res, 403, { error: 'forbidden' });
      return;
    }
    res.yaojiOrigin = origin || '';
    if (req.method === 'OPTIONS') {
      this.send(res, 204, null);
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${BRIDGE_PORT}`);
    const path = url.pathname;

    if (path === '/' && req.method === 'GET') {
      this.send(res, 200, {
        service: 'yaoji-today',
        status: 'OK',
        version: this.plugin.manifest.version,
        vault: this.app.vault.getName(),
        authenticated: this.authorized(req)
      });
      return;
    }

    if (path === '/yaoji/pair' && req.method === 'POST') {
      await this.pair(req, res, origin);
      return;
    }

    if (!this.authorized(req)) {
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
      const vaultPath = cleanVaultPath(raw);
      if (vaultPath === null) {
        this.send(res, 403, { error: 'forbidden_path' });
        return;
      }
      if (req.method === 'GET') {
        await (raw === '' || raw.endsWith('/') ? this.list(res, vaultPath) : this.read(res, vaultPath));
        return;
      }
      if (req.method === 'PUT' && vaultPath) {
        await this.write(req, res, vaultPath);
        return;
      }
    }
    this.send(res, 404, { error: 'not_found' });
  }

  async list(res, dir) {
    const folder = dir ? this.app.vault.getAbstractFileByPath(normalizePath(dir)) : this.app.vault.getRoot();
    if (!(folder instanceof TFolder)) {
      this.send(res, 404, { error: 'not_found' });
      return;
    }
    const files = folder.children
      .filter((child) => !child.name.startsWith('.'))
      .map((child) => (child instanceof TFolder ? `${child.name}/` : child.name));
    this.send(res, 200, { files });
  }

  async read(res, path) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) {
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

  async write(req, res, path) {
    let body;
    try {
      body = await this.readBody(req);
    } catch (error) {
      this.send(res, error?.status || 400, { error: 'bad_body' });
      return;
    }
    const target = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(target);
    if (existing && !(existing instanceof TFile)) {
      this.send(res, 409, { error: 'is_folder' });
      return;
    }
    await this.plugin.ensureFolder(target);
    const contentType = String(req.headers['content-type'] || '');
    const text = TEXT_FILE.test(target) || contentType.startsWith('text/');
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

  // 配对：同一时间只问一次；用户点「允许」才给密钥，点「不允许」、关掉、两分钟没理都算不允许
  async pair(req, res, origin) {
    if (!origin) {
      this.send(res, 403, { error: 'extension_only' });
      return;
    }
    if (this.pairing) {
      this.send(res, 409, { error: 'pairing_busy' });
      return;
    }
    let name = '';
    try {
      name = String(JSON.parse((await this.readBody(req)).toString('utf8') || '{}').name || '').slice(0, 60);
    } catch { /* 名字只是给人看的 */ }

    const allowed = await new Promise((resolve) => {
      const modal = new PairModal(this.app, this.app.vault.getName(), resolve);
      const timer = window.setTimeout(() => modal.close(), PAIR_TIMEOUT_MS);
      this.pairing = { modal };
      modal.onDone = () => window.clearTimeout(timer);
      modal.open();
    });
    this.pairing = null;
    if (!allowed) {
      this.send(res, 403, { error: 'pair_denied' });
      return;
    }
    const token = randomToken();
    this.plugin.settings.browsers = [...this.tokens(), { token, origin, name: name || 'Chrome', at: Date.now() }];
    await this.plugin.saveSettings();
    this.plugin.refreshSettingsTab?.();
    this.send(res, 200, { token, vault: this.app.vault.getName() });
  }
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// 「浏览器里的今日待办想连接这个库」：一句话，允许 / 不允许
class PairModal extends Modal {
  constructor(app, vaultName, resolve) {
    super(app);
    this.vaultName = vaultName;
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
    const row = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const deny = row.createEl('button', { text: t('不允许') });
    deny.addEventListener('click', () => { this.answer(false); this.close(); });
    const allow = row.createEl('button', { cls: 'mod-cta', text: t('允许') });
    allow.addEventListener('click', () => { this.answer(true); this.close(); });
    window.setTimeout(() => allow.focus(), 0);
  }

  onClose() {
    this.answer(false);
    this.contentEl.empty();
  }
}
