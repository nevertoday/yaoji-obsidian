// 发到 GitHub、问题关了自动打勾（会员功能，和浏览器扩展同一套：core/github-issues.js、core/github-auto-tick.js 是从扩展拷来的）。
// GitHub 授权由小小东会员站代管，插件只和会员站说话（member.js）。
import * as obsidian from 'obsidian';
import TodoPlainText from './vendor/todo-plain-text.js';
import G from './vendor/github-issues.js';
import AutoTick from './vendor/github-auto-tick.js';
import { t } from './i18n.js';
import { dateKey } from './today.js';

const { FuzzySuggestModal, TFile, moment } = obsidian;

const REPOS_TTL_MS = 24 * 60 * 60 * 1000;
const STATUS_TTL_MS = 5 * 60 * 1000;
const TICK_EVERY_MS = 10 * 60 * 1000;
const TICK_MIN_GAP_MS = 2 * 60 * 1000;
const CONNECT_WAIT_MS = 5 * 60 * 1000;
const CONNECT_POLL_MS = 3000;
// 连上了、项目清单还是空的（还在 GitHub 上选给哪些项目）：清单隔这么久才再要一次
const CONNECT_REPOS_EVERY_MS = 15000;
const FIRST_TICK_MS = 15000;
const ACTED_LIMIT = 300;

// 拷来的 github-issues.js 拼标题、正文时会找 TodoPlainText（去掉 Markdown 记号）
window.TodoPlainText = window.TodoPlainText || TodoPlainText;

export const ISSUE_URL_RE = /https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/(\d+)(?![\w/])/g;

function keepLatest(map, limit) {
  const entries = Object.entries(map || {});
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - limit)));
}

export class Github {
  constructor(plugin) {
    this.plugin = plugin;
    this.api = new G.GithubIssues({ client: plugin.member, chromeApi: {} });
    this.statusCache = null;
    this.statusAt = 0;
    this.lastTick = 0;
    this.ticking = false;
    // 「连接 GitHub」那一轮等待：同一时间只有一轮，再点一下接着等这一轮
    this.connecting = null;
    this.firstTick = 0;
    this.stopped = false;
    // 插件关掉时：等着连 GitHub 的那一轮、开头那一下打勾都停掉
    plugin.register?.(() => this.stop());
  }

  stop() {
    this.stopped = true;
    this.stopConnecting();
    if (this.firstTick) window.clearTimeout(this.firstTick);
    this.firstTick = 0;
  }

  stopConnecting() {
    const run = this.connecting;
    if (!run) return;
    run.cancelled = true;
    if (run.timer) window.clearTimeout(run.timer);
    run.wake?.();
    this.connecting = null;
  }

  get settings() {
    const settings = this.plugin.settings;
    settings.github = { recent: [], repos: null, reposAt: 0, acted: {}, ...(settings.github || {}) };
    return settings.github;
  }

  // 连没连 GitHub（五分钟内问过就用上次的）；没登录返回 null
  async status({ fresh = false } = {}) {
    if (!this.plugin.member.signedIn()) return null;
    if (!fresh && this.statusCache && Date.now() - this.statusAt < STATUS_TTL_MS) return this.statusCache;
    this.statusCache = await this.api.status();
    this.statusAt = Date.now();
    return this.statusCache;
  }

  cachedStatus() {
    return this.plugin.member.signedIn() ? this.statusCache : null;
  }

  // 能发了：登录了、连着 GitHub、本机有项目清单
  ready() {
    return Boolean(this.cachedStatus()?.connected && this.repoList().length);
  }

  repoList() {
    return Array.isArray(this.settings.repos) ? this.settings.repos : [];
  }

  // onlyIfChanged：清单和原来一样就不写 data.json（连接时一遍遍问，别一遍遍存）
  async refreshRepos({ fresh = false, onlyIfChanged = false } = {}) {
    if (!fresh && this.repoList().length && Date.now() - Number(this.settings.reposAt || 0) < REPOS_TTL_MS) return this.repoList();
    const result = await this.api.repos();
    const before = JSON.stringify(this.settings.repos ?? null);
    this.settings.repos = (Array.isArray(result?.repos) ? result.repos : [])
      .filter((repo) => repo.hasIssues !== false)
      .map((repo) => ({ fullName: repo.fullName, pushedAt: repo.pushedAt || '' }));
    this.settings.reposAt = Date.now();
    if (!onlyIfChanged || JSON.stringify(this.settings.repos) !== before) await this.plugin.saveSettings();
    return this.repoList();
  }

  // 启动时：问一下连没连、项目清单旧了就在后台更新（右键从不等网络）
  async warm() {
    try {
      const state = await this.status();
      if (state?.connected) await this.refreshRepos();
    } catch (error) {
      console.debug('[今日待办] GitHub 状态没取到', error);
    }
  }

  // 去会员站要一个 GitHub 授权页的地址，在浏览器里打开
  async openConnectPage() {
    const result = await this.plugin.member.post('/github/connect', {});
    const url = String(result?.url || '');
    if (!url.startsWith('https://github.com/')) throw Object.assign(new Error('github_unavailable'), { code: 'github_unavailable' });
    if (!this.stopped) window.open(url);
  }

  // 打开 GitHub 授权页（浏览器里），等会员站那边连上。
  // 同一时间只等一轮：已经在等时再点「连接 GitHub」，只再开一次授权页（上一页可能关掉了），接着等同一轮、时间重新算；插件关掉就停
  connect() {
    const running = this.connecting;
    if (running) {
      return this.openConnectPage().then(() => {
        running.deadline = Date.now() + CONNECT_WAIT_MS;
        return running.promise;
      });
    }
    const run = { cancelled: false, timer: 0, wake: null, deadline: 0, promise: null };
    this.connecting = run;
    run.promise = (async () => {
      try {
        await this.openConnectPage();
        run.deadline = Date.now() + CONNECT_WAIT_MS;
        let reposAt = 0;
        while (!run.cancelled && Date.now() < run.deadline) {
          await new Promise((resolve) => {
            run.wake = resolve;
            run.timer = window.setTimeout(resolve, CONNECT_POLL_MS);
          });
          if (run.cancelled) return null;
          const state = await this.status({ fresh: true }).catch(() => null);
          // 连上了：要项目清单（还空着就隔一会儿再要，清单没变不写 data.json）
          if (!run.cancelled && state?.connected && Date.now() - reposAt >= CONNECT_REPOS_EVERY_MS) {
            reposAt = Date.now();
            const repos = await this.refreshRepos({ fresh: true, onlyIfChanged: true }).catch(() => []);
            if (repos.length) return state;
          }
        }
        return run.cancelled ? null : this.status({ fresh: true }).catch(() => null);
      } finally {
        if (this.connecting === run) this.connecting = null;
      }
    })();
    return run.promise;
  }

  async disconnect() {
    await this.api.disconnect();
    this.statusCache = null;
    this.settings.repos = null;
    this.settings.reposAt = 0;
    await this.plugin.saveSettings();
  }

  // 选项目：最近用过的在前，其余按最近有推送的；打字就是 Obsidian 自己的模糊搜索（上千个也一样快）
  pickRepo() {
    const list = this.repoList();
    const recent = this.settings.recent.filter((name) => list.some((repo) => repo.fullName === name));
    const ordered = [...recent, ...G.activeOrder(list).map((repo) => repo.fullName).filter((name) => !recent.includes(name))];
    // 等菜单收起、这一下点击结束再开：不然鼠标正压在窗口的第一项上，同一下点击就把它选了
    return new Promise((resolve) => window.setTimeout(() => new RepoModal(this.plugin.app, ordered, resolve).open(), 120));
  }

  // 一件事发成一个问题：标题是第一行，其余几行和子任务是正文；发完问题地址接在这件事后面
  async send({ file, todo, path }) {
    const repo = await this.pickRepo();
    if (!repo) return;
    const draft = G.buildDraft(todo, {});
    if (!draft.title) return;
    // 「正在发到」一直挂到有结果，有了结果就换成结果那一句（同一件事只说一遍）
    const sending = this.plugin.notify(t('正在发到 {repo}…', { repo: repo.split('/').pop() }), [], 0);
    let result;
    try {
      result = await this.api.send({ repo, title: draft.title, body: draft.body, footer: t('来自今日待办 · {date}', { date: moment().format('MM/DD') }) });
    } catch (error) {
      sending?.hide();
      this.plugin.notify(this.errorText(error), [], 8000);
      return;
    }
    sending?.hide();
    const issue = G.parseIssueUrl(result?.url);
    if (!issue) {
      this.plugin.notify(this.errorText({ code: 'github_unavailable' }), [], 8000);
      return;
    }
    await this.plugin.editTodoText(file, path, todo.text, (text) => G.appendIssueUrl(text, issue.url));
    this.settings.recent = G.pushRecent(this.settings.recent, repo);
    await this.plugin.saveSettings();
    this.plugin.notify(t('发到了 {repo} #{number}', { repo: repo.split('/').pop(), number: issue.number }), [{
      label: t('在 GitHub 打开'), run: () => window.open(issue.url)
    }], 8000);
  }

  errorText(error) {
    const code = String(error?.code || '');
    if (code === 'auth_required') return t('请先登录小小东账号');
    if (code === 'membership_required') return t('发到 GitHub 是会员功能');
    if (code === 'github_not_connected' || code === 'github_reconnect_required') return t('先在设置里连接 GitHub');
    if (code === 'network') return t('连不上小小东会员站，稍后再试');
    return t('没发出去，稍后再试');
  }

  // onRefused：这一回写日记被拒了（文件刚被改过、找不到）时叫一声
  tools({ onRefused } = {}) {
    const plugin = this.plugin;
    return {
      parser: plugin.parser,
      title: plugin.settings.section,
      formatter: { format: (date) => ({ fullPath: plugin.pathFor(date) }) },
      api: {
        getFileContent: async (path) => {
          const file = plugin.fileAt(path);
          if (!file) throw Object.assign(new Error('file_not_found'), { status: 404 });
          return plugin.app.vault.read(file);
        },
        // 和扩展一样：读出来以后文件又被改过就不写（下一轮再来）。写没写进去要说：没写返回 false，不能算打了勾
        updateFileContent: async (path, content, { expectedContent } = {}) => {
          const file = plugin.fileAt(path);
          if (!(file instanceof TFile)) { onRefused?.(); return false; }
          let wrote = false;
          await plugin.app.vault.process(file, (current) => {
            if (expectedContent !== undefined && current !== expectedContent) return current;
            wrote = true;
            return content;
          });
          if (!wrote) onRefused?.();
          return wrote;
        }
      }
    };
  }

  // GitHub 上问题关了 → 日记里打勾（今天和最近 14 天）；关成「不打算做」「重复」的不替人打勾
  async tick({ force = false } = {}) {
    if (this.stopped || this.ticking || !this.plugin.member.signedIn()) return;
    if (!force && Date.now() - this.lastTick < TICK_MIN_GAP_MS) return;
    this.ticking = true;
    this.lastTick = Date.now();
    try {
      const state = await this.status().catch(() => null);
      if (!state?.connected) return;
      const tools = this.tools();
      const entries = await AutoTick.diaryEntries(tools, { today: this.plugin.now() });
      if (!entries.length) return;
      const result = await this.api.issuesState(G.issuesToAsk(entries).slice(0, 50));
      // 在 GitHub 上搬走了的：先把日记里的老地址换成新的，再按新地址打勾。
      // 一篇日记一次换好，每件事都从原来的地址换（#1→#2、#2→#1 对换也不乱）
      const moved = G.applyMoves(entries, result?.issues);
      const moves = new Map(moved.moves.map((move) => [move.from, move.to.url]));
      const unmoved = new Set();
      for (const filePath of new Set(entries.filter((item) => moves.has(item.url)).map((item) => item.filePath))) {
        let refused = false;
        await AutoTick.replaceUrls(this.tools({ onRefused: () => { refused = true; } }), filePath, moves).catch(() => { refused = true; });
        // 地址没换成：这篇里的事这一轮先不勾（日记里还是老地址，按新地址找不到），下一轮再来
        if (refused) unmoved.add(filePath);
      }
      const acted = this.settings.acted || {};
      const tick = G.todosToTick(moved.entries, moved.states, acted).filter((entry) => !unmoved.has(entry.filePath));
      if (!tick.length) return;
      let done = 0;
      const retry = new Set();
      for (const entry of tick) {
        let refused = false;
        const ticked = await AutoTick.setChecked(this.tools({ onRefused: () => { refused = true; } }), entry.filePath, entry.url, true)
          .catch(() => { refused = true; return false; });
        // 真写进去了才算「已打勾」；没写成的不记成处理过，下一轮再来
        if (refused) retry.add(entry.url);
        else if (ticked) done += 1;
      }
      const next = { ...acted };
      for (const entry of tick) {
        if (retry.has(entry.url)) continue;
        delete next[entry.url];
        next[entry.url] = entry.closedAt;
      }
      this.settings.acted = keepLatest(next, ACTED_LIMIT);
      await this.plugin.saveSettings();
      if (done) this.plugin.notify(t('GitHub 上关了 {count} 件，已打勾', { count: done }), [], 6000);
    } catch (error) {
      console.debug('[今日待办] 查 GitHub 问题没成', error);
    } finally {
      this.ticking = false;
    }
  }

  startTicking() {
    this.plugin.registerInterval(window.setInterval(() => this.tick(), TICK_EVERY_MS));
    this.plugin.registerDomEvent(window, 'focus', () => this.tick());
    if (this.firstTick) window.clearTimeout(this.firstTick);
    this.firstTick = window.setTimeout(() => { this.firstTick = 0; this.tick(); }, FIRST_TICK_MS);
  }

  issueOf(text) {
    return G.findIssueUrls(String(text || ''))[0] || null;
  }

  todayKey() {
    return dateKey(this.plugin.now());
  }
}

// 选项目：上面一行「找项目」，下面是项目名（同名的带上组织）
class RepoModal extends FuzzySuggestModal {
  constructor(app, names, resolve) {
    super(app);
    this.names = names;
    this.resolve = resolve;
    this.chosen = false;
    this.setPlaceholder(t('找项目'));
  }

  getItems() {
    return this.names;
  }

  getItemText(name) {
    return name;
  }

  onChooseItem(name) {
    this.chosen = true;
    this.resolve(name);
  }

  onClose() {
    // 选了以后 onChooseItem 在 onClose 之后才来：等一下再算「没选」
    window.setTimeout(() => { if (!this.chosen) this.resolve(null); }, 0);
  }
}
