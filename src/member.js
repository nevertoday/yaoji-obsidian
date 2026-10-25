// 小小东会员：登录、会员状态、和会员站说话（GitHub 这些会员功能都经过它）。
// 会员站把这个插件当成今日待办的一种客户端（会员站 shitu.js 的 YAOJI_OBSIDIAN_CLIENT）：
// 请求不带网页来源，报一句 X-Yaoji-Client: obsidian；登录在浏览器里做，确认后跳回 obsidian://yaoji-auth，用一次性的码换会话（PKCE）。
// 会员能不能用某个功能由会员站判断，插件这边不做签名校验。
import * as obsidian from 'obsidian';

const { requestUrl } = obsidian;

export const MEMBER_BASE = 'https://vip.xiaoxiaodong.ai/api/yaoji';
export const AUTH_ACTION = 'yaoji-auth';
export const REDIRECT_URI = `obsidian://${AUTH_ACTION}`;
const LOGIN_WAIT_MS = 10 * 60 * 1000;

function base64Url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomText(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

// 只留插件要显示的几样（不存签名、用量这些）
function pickMember(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    email: String(value.email || ''),
    name: String(value.display_name || ''),
    active: value.active === true,
    expiresAt: String(value.membership_expires_at || '')
  };
}

export function memberError(code, message = '') {
  return Object.assign(new Error(message || code), { code });
}

export class MemberClient {
  // store：{ get() → 存着的会话（{ token, expiresAt, member }）或 null，set(会话或 null) }
  // base：会员站地址（开发时 data.json 里写 memberBase 换成本机假的会员站；界面上没有这一项）
  constructor(store, { base = () => MEMBER_BASE } = {}) {
    this.store = store;
    this.base = base;
    this.pending = null;
  }

  session() {
    const value = this.store.get();
    if (!value?.token) return null;
    if (value.expiresAt && Date.parse(value.expiresAt) <= Date.now()) return null;
    return value;
  }

  signedIn() {
    return Boolean(this.session());
  }

  member() {
    return this.session()?.member || null;
  }

  // 打开浏览器去会员站登录；回来的路在 finishLogin（插件注册的 obsidian://yaoji-auth）
  async startLogin() {
    const verifier = randomText(48);
    const state = randomText(24);
    this.pending = { verifier, state, at: Date.now() };
    const url = new URL(`${this.base()}/authorize`);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', await pkceChallenge(verifier));
    url.searchParams.set('code_challenge_method', 'S256');
    window.open(url.toString());
  }

  // 浏览器跳回 obsidian://yaoji-auth?code=…&state=…：state 对得上、没过期，才去换会话
  async finishLogin(params) {
    const pending = this.pending;
    this.pending = null;
    if (!pending || params?.state !== pending.state || Date.now() - pending.at > LOGIN_WAIT_MS || !params?.code) {
      throw memberError('login_mismatch');
    }
    const data = await this.post('/token', { code: params.code, code_verifier: pending.verifier, redirect_uri: REDIRECT_URI }, { auth: false });
    if (!data?.access_token) throw memberError('login_failed');
    const member = pickMember(data.member);
    this.store.set({ token: data.access_token, expiresAt: data.expires_at || '', member });
    return member;
  }

  // 会员状态（到期、续费后要变）：问一次会员站，存起来
  async refresh() {
    if (!this.signedIn()) return null;
    const data = await this.post('/session', {});
    const member = pickMember(data?.member || data);
    this.store.set({ ...this.session(), member });
    return member;
  }

  async logout() {
    if (this.signedIn()) await this.post('/logout', {}).catch(() => {});
    this.store.set(null);
  }

  // 和扩展的 MembershipClient 一样的样子：GithubIssues（拷来的 core/github-issues.js）直接用
  authorizedPost(path, body = {}) {
    return this.post(path, body);
  }

  async post(path, body = {}, { auth = true } = {}) {
    const headers = { 'X-Yaoji-Client': 'obsidian' };
    if (auth) {
      const session = this.session();
      if (!session) throw memberError('auth_required');
      headers.Authorization = `Bearer ${session.token}`;
    }
    let response;
    try {
      response = await requestUrl({
        url: `${this.base()}${path}`,
        method: 'POST',
        contentType: 'application/json',
        headers,
        body: JSON.stringify(body || {}),
        throw: false
      });
    } catch (error) {
      throw memberError('network', error?.message || '');
    }
    let data = null;
    try { data = response.json; } catch { data = null; }
    if (response.status === 401 && auth) {
      // 会话过期或在别处退出了：当作没登录
      this.store.set(null);
      throw memberError('auth_required');
    }
    if (response.status < 200 || response.status >= 300) throw memberError(String(data?.error || `http_${response.status}`));
    return data;
  }
}
