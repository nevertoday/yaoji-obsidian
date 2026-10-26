// 发到 GitHub（docs/github-issue-plan.md）：把一件事发成用户自己项目里的一个问题。
// GitHub 授权由小小东会员站代管（会员站 yaoji-github.js），插件只和会员站说话。
//
// 这里放两样：
// - 纯函数（测试也用）：从任务里拼出标题、正文、附件；认出任务里已经发过的问题地址；项目颜色；发完后把地址接到任务后面。
// - 和会员站说话的那几下（status / connect / repos / send），用的是 MembershipClient 的扩展会话。
(function initGithubIssues(globalScope) {
  'use strict';

  const tr = (text, vars) => (typeof globalScope.t === 'function'
    ? globalScope.t(text, vars)
    : String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)));

  const ISSUE_URL_RE = /https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/(\d+)(?![\w/])/g;
  // 项目颜色：8 个，和主题协调的中等饱和度（ui-tokens.css 的 --repo-1 … --repo-8），浅色深色都看得清
  const REPO_COLORS = 8;
  const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;
  const CONNECT_POLL_MS = 2000;
  const MAX_IMAGES = 8;
  const MAX_DOCS = 8;
  // 和会员站一样的上限：每张图 8 MB、每个文档 5 MB、加起来 32 MB（发之前先在这边说清楚，不让用户等半天再失败）
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  const MAX_DOC_BYTES = 5 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

  // ---------- 纯函数 ----------

  function parseIssueUrl(value) {
    const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/(\d+)\/?$/.exec(String(value || '').trim());
    return match ? { repo: match[1], number: Number(match[2]), url: `https://github.com/${match[1]}/issues/${match[2]}` } : null;
  }

  // 任务文字里所有的问题地址（发过的；以后「关了自动打勾」也靠它）
  function findIssueUrls(text) {
    const out = [];
    for (const match of String(text || '').matchAll(ISSUE_URL_RE)) {
      out.push({ repo: match[1], number: Number(match[2]), url: match[0] });
    }
    return out;
  }

  // 这段文字里有没有这个问题地址：整个地址对上才算（#1 不算在 #12 里；Obsidian 插件对抗测试时发现）
  function hasIssueUrl(text, url) {
    return Boolean(url) && findIssueUrls(text).some((issue) => issue.url === url);
  }

  // 项目颜色：用户点色块换过的用他选的；没换过的按名字算一个，同一个项目在哪台电脑上都是同一个颜色
  function repoColor(fullName, chosen = {}) {
    const picked = Number(chosen?.[fullName]);
    if (Number.isInteger(picked) && picked >= 1 && picked <= REPO_COLORS) return picked;
    let hash = 0;
    for (const ch of String(fullName || '').toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return (hash % REPO_COLORS) + 1;
  }

  function nextColor(current) {
    return (Number(current) % REPO_COLORS) + 1;
  }

  // 一行文字里给人看的部分：去掉附件、已经发过的问题地址、Markdown 记号
  function plainLine(line) {
    const converted = globalScope.TodoPlainText?.convertText
      ? globalScope.TodoPlainText.convertText(line).text
      : String(line || '');
    return converted.replace(ISSUE_URL_RE, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * 一件事 → 问题的草稿。
   * todo：{ text, children }；parseImages：TaskImageViewer.parseImages（把 ![[图片]]、文档抽出来）；
   * tags：config.github.tags（项目 → 标签），标题里去掉这些标签
   * 返回 { title, body, images, docs }：标题是第一行；正文是其余几行，子任务写成 GitHub 的勾选清单；
   * images / docs 是附件引用（{ kind, src, alt, name }），发送时再读出内容。
   */
  function buildDraft(todo, { parseImages, tags, routes: given = null } = {}) {
    const raw = String(todo?.text || '');
    const parsed = typeof parseImages === 'function' ? parseImages(raw) : { text: raw, images: [], docs: [] };
    const lines = String(parsed.text || '').split('\n');
    // 标题里不带配给项目的标签（#日记 是给插件看的「发到哪」，日记里原样留着）
    const routes = given || (tags ? tagRoutes(tags) : null);
    const titleLine = (line) => (routes ? stripRouteTags(plainLine(line), routes) : plainLine(line));
    const firstIndex = lines.findIndex((line) => titleLine(line));
    const title = firstIndex >= 0 ? titleLine(lines[firstIndex]).slice(0, 256) : '';
    const rest = firstIndex >= 0 ? lines.slice(firstIndex + 1) : [];
    const bodyLines = rest.map((line) => (globalScope.TodoPlainText?.convertText ? globalScope.TodoPlainText.convertText(line).text : line).replace(ISSUE_URL_RE, '').replace(/[ \t]+$/, ''));
    const images = [...(parsed.images || [])];
    const docs = [...(parsed.docs || [])];
    const checklist = [];
    const visit = (items, depth) => {
      for (const child of Array.isArray(items) ? items : []) {
        const childParsed = typeof parseImages === 'function' ? parseImages(String(child?.text || '')) : { text: String(child?.text || ''), images: [], docs: [] };
        images.push(...(childParsed.images || []));
        docs.push(...(childParsed.docs || []));
        const words = plainLine(String(childParsed.text || '').split('\n').find((line) => line.trim()) || '');
        if (words) checklist.push(`${'  '.repeat(depth)}- [${child?.checked ? 'x' : ' '}] ${words}`);
        visit(child?.children, depth + 1);
      }
    };
    visit(todo?.children, 0);
    const body = [bodyLines.join('\n').replace(/^\n+|\n+$/g, ''), checklist.join('\n')].filter(Boolean).join('\n\n');
    return {
      title,
      body,
      images: images.slice(0, MAX_IMAGES),
      docs: docs.slice(0, MAX_DOCS),
      skipped: Math.max(0, images.length - MAX_IMAGES) + Math.max(0, docs.length - MAX_DOCS)
    };
  }

  // ---------- 标签：任务里写了项目的标签，加好就发到那个项目（GitHub 问题 #5） ----------
  // 写法和 Obsidian 一样：# 后面写到空格或标点为止；前面是行首、空白、左括号或中文标点（「日历点不开，#日记」也算；
  // 网址里的 #锚点 不算）；全是数字的不算（#42 是问题编号）。不分大小写。
  const TAG_STOP = '\\s#.,!?;:，。！？；：、()（）【】\\[\\]{}<>"\'“”‘’`|';
  const TAG_BEFORE = '\\s(（【\\[，。、；：！？';
  const TAG_RE = new RegExp(`(^|[${TAG_BEFORE}])#([^${TAG_STOP}]{1,40})`, 'gu');
  const TAG_CLEAN_RE = new RegExp(`[${TAG_STOP}]`, 'gu');
  const MAX_TAGS_PER_REPO = 8;

  // 设置里输入的标签：去掉开头的 #、标点和空白；全是数字的不收
  function cleanTag(value) {
    const tag = String(value || '').trim().replace(/^#+/, '').replace(TAG_CLEAN_RE, '').slice(0, 40);
    return tag && !/^\d+$/.test(tag) ? tag : '';
  }

  const tagKey = (value) => cleanTag(value).toLocaleLowerCase();

  // 文字里所有的标签：[{ tag, start, end }]，start 指着 #
  function findTags(text) {
    const out = [];
    for (const match of String(text || '').matchAll(TAG_RE)) {
      const tag = match[2];
      if (/^\d+$/.test(tag)) continue;
      const start = match.index + match[1].length;
      out.push({ tag, start, end: start + 1 + tag.length });
    }
    return out;
  }

  // 项目名当标签（GitHub 问题 #16 方案 A）：连上的项目，名字（owner/ 后面那段）自动就是标签，不用先设置。
  // 名字里有标签写不进去的字（如 my.repo 的点）、全是数字、两个项目同名时，不当标签（同名的可以在设置里配别名）
  function nameTag(fullName, allNames = [], counts = null) {
    const short = String(fullName || '').split('/').pop();
    if (!short || cleanTag(short) !== short) return '';
    const key = short.toLocaleLowerCase();
    const same = counts ? counts.get(key) || 0
      : (Array.isArray(allNames) ? allNames : []).filter((name) => String(name).split('/').pop().toLocaleLowerCase() === key).length;
    return same > 1 ? '' : short;
  }

  // 标签 → 项目：Map(标签小写 → { repo, tag, byName })；一个标签只认第一个项目。
  // tags：config.github.tags（{ 'owner/repo': ['日记', …] }，设置里配的别名，先认）；
  // repos：连上的项目全名，名字自动当标签；off：config.github.nameTagsOff（{ 'owner/repo': true } = 这个项目的名字不当标签）
  function tagRoutes(tags, { repos = [], off = {} } = {}) {
    const routes = new Map();
    for (const [repo, list] of Object.entries(tags && typeof tags === 'object' ? tags : {})) {
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !Array.isArray(list)) continue;
      for (const tag of list) {
        const key = tagKey(tag);
        if (key && !routes.has(key)) routes.set(key, { repo, tag: cleanTag(tag) });
      }
    }
    // 上千个项目时先数一遍同名的，不要每个项目都把全部再扫一遍（GitHub 问题 #20）
    const counts = new Map();
    for (const repo of Array.isArray(repos) ? repos : []) {
      const key = String(repo).split('/').pop().toLocaleLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const repo of Array.isArray(repos) ? repos : []) {
      if (off?.[repo] === true) continue;
      const tag = nameTag(repo, repos, counts);
      const key = tag.toLocaleLowerCase();
      if (tag && !routes.has(key)) routes.set(key, { repo, tag, byName: true });
    }
    return routes;
  }

  // 这件事该发到哪：文字里第一个配了项目的标签（问题地址、附件不算）
  function routeOf(text, routes) {
    if (!routes?.size) return null;
    // 问题地址换成一个不算空白的字：地址后面紧跟的 #… 不会被当成标签
    const clean = String(text || '').replace(ISSUE_URL_RE, '\u0001');
    for (const found of findTags(clean)) {
      const route = routes.get(found.tag.toLocaleLowerCase());
      if (route) return { ...route, written: found.tag };
    }
    return null;
  }

  // 去掉配了项目的标签（标题用）；别的 # 原样
  function stripRouteTags(line, routes) {
    const value = String(line || '');
    const found = findTags(value).filter((item) => routes?.has(item.tag.toLocaleLowerCase()));
    if (!found.length) return value;
    let out = '';
    let last = 0;
    for (const item of found) {
      out += value.slice(last, item.start);
      last = item.end;
    }
    return (out + value.slice(last)).replace(/\s+/g, ' ').trim();
  }

  // 设置里给一个项目换一组标签：清理、去重；同一个标签挪到这个项目（一个标签只对一个项目）
  function setRepoTags(tags, repo, list) {
    const keys = new Set();
    const mine = [];
    for (const tag of Array.isArray(list) ? list : []) {
      const clean = cleanTag(tag);
      const key = clean.toLocaleLowerCase();
      if (!clean || keys.has(key) || mine.length >= MAX_TAGS_PER_REPO) continue;
      keys.add(key);
      mine.push(clean);
    }
    const next = {};
    for (const [name, others] of Object.entries(tags && typeof tags === 'object' ? tags : {})) {
      if (name === repo || !Array.isArray(others)) continue;
      const kept = others.filter((tag) => !keys.has(tagKey(tag)));
      if (kept.length) next[name] = kept;
    }
    if (mine.length) next[repo] = mine;
    return next;
  }

  // 同一件事的编号：日期 + 去掉问题地址后的文字（几台电脑上算出来一样；会员站靠它只建一个问题）
  function autoSendKey(dateKey, text) {
    const words = String(text || '').replace(ISSUE_URL_RE, ' ').replace(/\s+/g, ' ').trim();
    let a = 0x811c9dc5;
    let b = 0x01000193;
    for (const ch of words) {
      const code = ch.codePointAt(0);
      a = Math.imul(a ^ code, 0x01000193) >>> 0;
      b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
    }
    const day = String(dateKey || '').replace(/[^0-9-]/g, '').slice(0, 10) || 'day';
    return `tag:${day}:${a.toString(36)}${b.toString(36)}`;
  }

  // 列表里该自动发的事：没打勾、没发过、写了配了项目的标签、去掉标签后还有标题；[{ todo, repo, tag, key }]
  function autoSendCandidates(todos, routes, dateKey) {
    const out = [];
    if (!routes?.size) return out;
    const walk = (items) => {
      for (const todo of Array.isArray(items) ? items : []) {
        if (!todo) continue;
        const text = String(todo.text || '');
        if (!todo.checked && !findIssueUrls(text).length) {
          const route = routeOf(text, routes);
          if (route && buildDraft({ text }, { tags: { [route.repo]: [route.tag] } }).title) {
            out.push({ todo, repo: route.repo, tag: route.tag, key: autoSendKey(dateKey, text) });
          }
        }
        walk(todo.children);
      }
    };
    walk(todos);
    return out;
  }

  // 发过的事后来改了标签（GitHub 问题 #16）：标签指向的项目和问题所在的项目不一样 → 问一句「改发到 …？」
  // [{ todo, issue, repo, tag, key }]；key 带 move: 前缀，和自动发的分开记
  function retagCandidates(todos, routes, dateKey) {
    const out = [];
    if (!routes?.size) return out;
    const walk = (items) => {
      for (const todo of Array.isArray(items) ? items : []) {
        if (!todo) continue;
        const text = String(todo.text || '');
        const issue = findIssueUrls(text)[0];
        if (!todo.checked && issue) {
          const route = routeOf(text, routes);
          if (route && route.repo.toLowerCase() !== issue.repo.toLowerCase()) {
            out.push({ todo, issue, repo: route.repo, tag: route.tag, key: `move:${autoSendKey(dateKey, text)}` });
          }
        }
        walk(todo.children);
      }
    };
    walk(todos);
    return out;
  }

  // ---------- 第 3 轮：问题关了自动打勾 ----------

  // 列表里还没打勾、带着问题地址的事（每件只认第一个地址）：[{ todoId, repo, number, url }]
  function openIssueTodos(todos) {
    const out = [];
    const walk = (items) => {
      for (const todo of Array.isArray(items) ? items : []) {
        if (!todo) continue;
        if (!todo.checked) {
          const issue = findIssueUrls(todo.text)[0];
          if (issue) out.push({ todoId: todo.id, ...issue });
        }
        walk(todo.children);
      }
    };
    walk(todos);
    return out;
  }

  // 要问会员站的问题（同一个问题只问一次）
  function issuesToAsk(entries) {
    const seen = new Set();
    return entries.filter((entry) => !seen.has(entry.url) && seen.add(entry.url)).map(({ repo, number }) => ({ repo, number }));
  }

  // 该打勾的：问题关了，而且这一次关闭还没处理过（acted 记着 { 地址: 关闭时间 }）。
  // 处理过的不再动：用户手动改回未完成、或点了撤销，下次不会又被勾上；问题重开后再关（关闭时间变了）才算新的一次
  // 关掉时选的是「没打算做」或「重复」：事情并没有做完，不替用户打勾，牌子上说一声，留给他自己决定
  const NOT_DONE_REASONS = new Set(['not_planned', 'duplicate']);
  function closedAsDone(state) {
    return state?.state === 'closed' && !NOT_DONE_REASONS.has(String(state.stateReason || ''));
  }

  function todosToTick(entries, states, acted = {}) {
    const byKey = new Map((Array.isArray(states) ? states : []).map((item) => [`${item.repo}#${item.number}`, item]));
    return entries.filter((entry) => {
      const state = byKey.get(`${entry.repo}#${entry.number}`);
      return closedAsDone(state) && acted[entry.url] !== (state.closedAt || 'closed');
    }).map((entry) => ({ ...entry, closedAt: byKey.get(`${entry.repo}#${entry.number}`).closedAt || 'closed' }));
  }

  // 任务下面那块小牌子：项目名 #42，后面跟着 GitHub 上的状态（开着的不多说）
  function issueBadge(issue, state) {
    const name = String(issue?.repo || '').split('/').pop();
    let status = 'open';
    if (state?.state === 'deleted') status = 'deleted';
    else if (state?.state === 'closed') {
      const reason = String(state.stateReason || '');
      status = reason === 'not_planned' ? 'not_planned' : reason === 'duplicate' ? 'duplicate' : 'done';
    }
    const label = { open: '', done: tr('已完成'), not_planned: tr('不做了'), duplicate: tr('重复了'), deleted: tr('已删除') }[status];
    return { name, number: issue?.number, status, label };
  }

  // GitHub 上的状态记在本机（localStorage，新标签页和侧边栏共用）：列表一画出来牌子就是上次看到的样子，不等网络
  const STATES_MIRROR_KEY = 'yaoji.githubIssueStates';
  const STATES_LIMIT = 400;
  function readIssueStates() {
    try {
      const value = JSON.parse(globalScope.localStorage?.getItem(STATES_MIRROR_KEY) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function issueState(url) {
    return readIssueStates()[url] || null;
  }

  // states: 会员站 issues-state 回来的 [{ repo, number, state, stateReason, closedAt }]；看不了的（unknown）不记。
  // 删掉的（deleted）也记：牌子写「已删除」，右键能重新发
  function rememberIssueStates(states) {
    const known = { ...readIssueStates() };
    let changed = false;
    for (const item of Array.isArray(states) ? states : []) {
      if (!item?.repo || !item.number || !['open', 'closed', 'deleted'].includes(item.state)) continue;
      const url = `https://github.com/${item.repo}/issues/${item.number}`;
      const next = item.state === 'deleted'
        ? { state: 'deleted', stateReason: '', closedAt: '' }
        : { state: item.state, stateReason: String(item.stateReason || ''), closedAt: String(item.closedAt || '') };
      // 关掉的：谁关的、最后一条留言（会员站带回来的；没问过是 null，问过没有留言是 ''）
      if (item.state === 'closed') {
        const before = known[url];
        const asked = typeof item.note === 'string';
        next.closedBy = String(item.closedBy || (asked ? '' : before?.closedBy || ''));
        next.note = asked ? item.note : (before?.closedAt === next.closedAt ? before?.note ?? null : null);
        next.noteBy = String(asked ? item.noteBy || '' : before?.noteBy || '');
      }
      const before = known[url];
      if (before && JSON.stringify(before) === JSON.stringify(next)) continue;
      delete known[url];
      known[url] = next;
      changed = true;
    }
    if (!changed) return false;
    const keys = Object.keys(known);
    for (const key of keys.slice(0, Math.max(0, keys.length - STATES_LIMIT))) delete known[key];
    try { globalScope.localStorage?.setItem(STATES_MIRROR_KEY, JSON.stringify(known)); } catch { /* 记不下就下次再问 */ }
    return true;
  }

  // 自动打了勾、用户还没看过的（新标签页和侧边栏共用）：列表上面那行「GitHub 上完成了 3 件 · 看看」
  const UNSEEN_KEY = 'yaoji.githubDoneUnseen';
  function readUnseen() {
    try {
      const value = JSON.parse(globalScope.localStorage?.getItem(UNSEEN_KEY) || '[]');
      return Array.isArray(value) ? value.filter((url) => parseIssueUrl(url)) : [];
    } catch {
      return [];
    }
  }

  function writeUnseen(list) {
    try {
      const unique = [...new Set(list)].slice(-50);
      if (unique.length) globalScope.localStorage?.setItem(UNSEEN_KEY, JSON.stringify(unique));
      else globalScope.localStorage?.removeItem(UNSEEN_KEY);
    } catch { /* 记不下就不提醒 */ }
  }

  // 过滤：一行属于哪一类（开着 / 完成 / 不做）
  function badgeGroup(status) {
    if (status === 'done') return 'done';
    if (status === 'not_planned' || status === 'duplicate' || status === 'deleted') return 'not';
    return 'open';
  }

  // 最近发过的项目排在最前（最多 5 个），列表里有几十个项目时不用从头找
  function recentRepos(recent, lastRepo, list) {
    const names = new Set((Array.isArray(list) ? list : []).map((repo) => repo.fullName));
    const out = [];
    for (const name of [lastRepo, ...(Array.isArray(recent) ? recent : [])]) {
      if (name && names.has(name) && !out.includes(name)) out.push(name);
    }
    return out.slice(0, 5);
  }

  // 右键菜单顶上那一行「找项目」（GitHub 问题 #20 方案 A）：上千个项目里打两三个字就找到。
  // 认名字开头、组织/名字、名字里每一段的首字母（odt → obsidian-daily-todo）、名字或组织里含着这几个字。
  // 同样好的：最近用过的在前，再按最近有推送的、再按字母。返回 [{ fullName, mark: [开始, 结束] }]，mark 是名字里要标出来的那几个字
  function searchRepos(list, query, { recent = [], limit = 6 } = {}) {
    const q = String(query || '').trim().toLocaleLowerCase();
    if (!q) return [];
    const order = new Map((Array.isArray(recent) ? recent : []).map((name, index) => [name, index]));
    const found = [];
    for (const repo of Array.isArray(list) ? list : []) {
      const full = String(repo?.fullName || '');
      if (!full) continue;
      const lowerFull = full.toLocaleLowerCase();
      const slash = lowerFull.indexOf('/');
      const owner = lowerFull.slice(0, slash);
      const name = lowerFull.slice(slash + 1);
      const initials = name.split(/[-_.\s]+/).filter(Boolean).map((part) => part[0]).join('');
      let score = 0;
      let mark = null;
      if (name === q) { score = 100; mark = [0, q.length]; }
      else if (name.startsWith(q)) { score = 80; mark = [0, q.length]; }
      else if (q.includes('/') && lowerFull.startsWith(q)) { score = 75; mark = [0, Math.max(0, q.length - slash - 1)]; }
      else if (q.length >= 2 && initials.startsWith(q)) { score = 60; }
      else if (name.includes(q)) { score = 40; const at = name.indexOf(q); mark = [at, at + q.length]; }
      else if (lowerFull.includes(q)) { score = owner.includes(q) ? 20 : 30; }
      if (!score) continue;
      found.push({ fullName: full, mark, score, recent: order.has(full) ? order.get(full) : Infinity, pushed: Date.parse(repo.pushedAt || '') || 0 });
    }
    found.sort((a, b) => b.score - a.score || a.recent - b.recent || b.pushed - a.pushed || a.fullName.localeCompare(b.fullName));
    return found.slice(0, limit).map(({ fullName, mark }) => ({ fullName, mark }));
  }

  // 没打字时补满菜单：最近用过的在前，其余按最近有推送的（会员站带回 pushedAt；没有就按字母）
  function activeOrder(list) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => (Date.parse(b?.pushedAt || '') || 0) - (Date.parse(a?.pushedAt || '') || 0)
      || String(a?.fullName).localeCompare(String(b?.fullName)));
  }

  function pushRecent(recent, repo) {
    return [repo, ...(Array.isArray(recent) ? recent : []).filter((name) => name && name !== repo)].slice(0, 5);
  }

  // 问题正文最后一行小字（D4）
  function footer(date) {
    return tr('来自今日待办 · {date}', { date });
  }

  // 发完以后：问题地址接在任务第一行后面（存的是裸网址，显示时缩成带项目颜色的 #42）
  function appendIssueUrl(text, url) {
    const raw = String(text || '');
    if (!url || hasIssueUrl(raw, url)) return raw;
    const lines = raw.split('\n');
    const index = Math.max(0, lines.findIndex((line) => line.trim()));
    lines[index] = `${lines[index].replace(/[ \t]+$/, '')}${lines[index].trim() ? ' ' : ''}${url}`;
    return lines.join('\n');
  }

  // 问题搬走了（GitHub 上转移、或者「改发到」）：任务里的老地址换成新的（GitHub 问题 #15）
  function replaceIssueUrl(text, from, to) {
    if (!from || !to || from === to) return String(text || '');
    return replaceIssueUrls(text, [{ from, to }]);
  }

  // 几个问题一起搬（#1→#2、#2→#1 这样对换也行）：一遍扫过去，每个地址只按原来的样子换一次，换上去的不会再被换走；
  // 只认整个问题地址（#1 不碰 #12）。moves：[{ from, to }] 或 Map（老地址 → 新地址）
  function replaceIssueUrls(text, moves) {
    const raw = String(text || '');
    const map = moves instanceof Map ? moves : new Map((Array.isArray(moves) ? moves : []).map((move) => [move?.from, move?.to]));
    if (!map.size) return raw;
    return raw.replace(ISSUE_URL_RE, (whole) => {
      const to = map.get(whole);
      return to && typeof to === 'string' ? to : whole;
    });
  }

  // 会员站说哪些问题搬走了（movedTo）：[{ from: 老地址, to: { repo, number, url } }]；
  // 再把要问的那几件和问回来的状态都换成新地址，后面打勾、牌子照常按新地址走
  function applyMoves(entries, states) {
    const moves = [];
    const byKey = new Map();
    for (const item of Array.isArray(states) ? states : []) {
      const to = parseIssueUrl(item?.movedTo?.url);
      if (!to || !item.repo || !item.number) continue;
      const from = `https://github.com/${item.repo}/issues/${item.number}`;
      if (from === to.url) continue;
      moves.push({ from, to });
      byKey.set(from, to);
    }
    if (!moves.length) return { moves, entries: Array.isArray(entries) ? entries : [], states: Array.isArray(states) ? states : [] };
    const nextStates = states.map((item) => {
      const to = byKey.get(`https://github.com/${item.repo}/issues/${item.number}`);
      if (!to) return item;
      const { movedTo, ...rest } = item;
      return { ...rest, repo: to.repo, number: to.number };
    });
    const urls = new Map(moves.map((move) => [move.from, move.to.url]));
    const nextEntries = (Array.isArray(entries) ? entries : []).map((entry) => {
      const to = byKey.get(entry.url);
      return to ? { ...entry, repo: to.repo, number: to.number, url: to.url, text: replaceIssueUrls(entry.text, urls) } : entry;
    });
    return { moves, entries: nextEntries, states: nextStates };
  }

  const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' };

  // 会员站认的图片格式；文件没带类型时按扩展名猜
  function imageMime(type, src) {
    const given = String(type || '').toLowerCase();
    if (Object.values(IMAGE_MIME).includes(given)) return given;
    if (given.startsWith('image/')) return '';
    const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(String(src || ''))?.[1]?.toLowerCase();
    return IMAGE_MIME[ext] || '';
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^,]*,/, ''));
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(blob);
    });
  }

  // ---------- 和会员站说话 ----------

  class GithubIssues {
    constructor({ client, chromeApi } = {}) {
      this.client = client || null;
      this.chrome = chromeApi || globalScope.chrome;
    }

    requireClient() {
      if (!this.client) {
        const error = new Error(tr('请先登录小小东账号'));
        error.code = 'auth_required';
        throw error;
      }
      return this.client;
    }

    status() {
      return this.requireClient().authorizedPost('/github/status');
    }

    repos() {
      return this.requireClient().authorizedPost('/github/repos');
    }

    disconnect() {
      return this.requireClient().authorizedPost('/github/disconnect');
    }

    issuesState(issues) {
      return this.requireClient().authorizedPost('/github/issues-state', { issues });
    }

    // 底栏「问题」：这些项目里还开着的问题（会员站最多看 12 个项目、每个 30 个）
    openIssues(repos = []) {
      return this.requireClient().authorizedPost('/github/open-issues', { repos: repos.slice(0, 12) });
    }

    // 打开 GitHub 授权页，等会员站那边连上了就关掉它（和 Google Drive 备份同一种做法）
    async connect({ isCancelled } = {}) {
      const client = this.requireClient();
      const result = await client.authorizedPost('/github/connect');
      const url = String(result?.url || '');
      if (!url.startsWith('https://github.com/')) throw Object.assign(new Error(tr('暂时连不上 GitHub')), { code: 'github_unavailable' });
      const tabs = this.chrome?.tabs;
      const tab = await tabs?.create?.({ url, active: true });
      const deadline = Date.now() + CONNECT_TIMEOUT_MS;
      let closedChecks = 0;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, CONNECT_POLL_MS));
        if (isCancelled?.()) break;
        const state = await this.status().catch((error) => {
          if (error?.code === 'auth_required') throw error;
          return null;
        });
        if (state?.connected) {
          // 第一次连：会员站把人带去「选项目」页，等用户勾完再关
          const repos = await this.repos().catch(() => null);
          if (repos?.repos?.length) {
            if (tab?.id !== undefined) await tabs?.remove?.(tab.id)?.catch?.(() => {});
            return { ...state, repos: repos.repos };
          }
        }
        const open = tab?.id === undefined || !tabs?.get ? true : await tabs.get(tab.id).then(() => true, () => false);
        if (!open && ++closedChecks > 2) return state?.connected ? { ...state, repos: [] } : null;
      }
      return null;
    }

    // 附件读出内容：库里的图片 / 文档用 Obsidian（或本机）读，网页图片直接取（取不到的写成链接留在正文里）。
    // missing：读不出来或 GitHub 显示不了的（HEIC 等），由面板问一句「不带它们发送」；太大的直接报错
    async readAttachments(draft, { api, notePath = '' } = {}) {
      const images = [];
      const docs = [];
      const links = [];
      const missing = [];
      let total = 0;
      const nameOf = (item, fallback) => (item.name || item.alt || String(item.src).split('/').pop() || fallback).slice(0, 120);
      const tooLarge = (code) => Object.assign(new Error(code), { code });
      const read = async (item) => {
        if (item.kind === 'url') {
          const response = await fetch(item.src);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.blob();
        }
        if (!api?.getBinaryFileContent) throw new Error('no api');
        return api.getBinaryFileContent(item.src, item.notePath || notePath);
      };
      for (const item of draft.images || []) {
        let blob = null;
        try {
          blob = await read(item);
        } catch {
          if (item.kind === 'url') links.push(`![${item.alt || ''}](${item.src})`);
          else missing.push(nameOf(item, 'image'));
          continue;
        }
        // GitHub 上显示不了的格式（HEIC 等）不带，免得整个问题发不出去
        const mime = imageMime(blob.type, item.src);
        if (!mime) {
          missing.push(nameOf(item, 'image'));
          continue;
        }
        if (blob.size > MAX_IMAGE_BYTES) throw tooLarge('image_too_large');
        total += blob.size;
        images.push({ name: nameOf(item, 'image.png'), mime, base64: await blobToBase64(blob) });
      }
      for (const item of draft.docs || []) {
        let blob = null;
        try {
          blob = await read(item);
        } catch {
          missing.push(nameOf(item, 'file'));
          continue;
        }
        if (blob.size > MAX_DOC_BYTES) throw tooLarge('doc_too_large');
        total += blob.size;
        docs.push({ name: nameOf(item, 'file.txt'), mime: blob.type || 'text/plain', base64: await blobToBase64(blob) });
      }
      if (total > MAX_TOTAL_BYTES) throw tooLarge('attachments_too_large');
      return { images, docs, links, missing };
    }

    // 改发到（GitHub 问题 #15）：back 是搬之前那一个，撤销时带上（上次是复制过去的，会员站把原来那个重新打开）
    move({ repo, number, to, back = null }) {
      const payload = { repo, number, to, toNote: tr('搬到了 {ref}'), fromNote: tr('从 {ref} 搬过来'), ...(back ? { back } : {}) };
      return this.requireClient().authorizedPost('/github/move', payload, { timeoutMs: 60000 });
    }

    async send({ repo, title, body, footer: foot, images = [], docs = [], dedupeKey = '' }) {
      // 图片多时会员站要一张张存进项目，等得久一点；按标签自动发的带上 dedupeKey，同一件事会员站只建一个
      const payload = { repo, title, body, footer: foot, images, docs, ...(dedupeKey ? { dedupeKey } : {}) };
      return this.requireClient().authorizedPost('/github/issue', payload, { timeoutMs: 180000 });
    }
  }

  // 会员站的错误码 → 一句给人看的话
  function errorMessage(error) {
    const code = String(error?.code || '');
    const map = {
      auth_required: tr('请先登录小小东账号'),
      membership_required: tr('发到 GitHub 是会员功能'),
      github_not_connected: tr('还没有连接 GitHub'),
      github_reconnect_required: tr('GitHub 授权已失效，请重新连接'),
      github_not_configured: tr('发到 GitHub 还没有开放'),
      repo_not_allowed: tr('没有这个项目的权限，请在 GitHub 上把它勾选进来'),
      repo_empty: tr('这个项目还是空的，先在里面提交一次再发图片'),
      issues_disabled: tr('这个项目关掉了问题（Issues）'),
      repo_archived: tr('这个项目已归档，只能看不能写'),
      attachments_too_large: tr('附件加起来超过 32 MB，去掉几张再发'),
      request_too_large: tr('附件加起来超过 32 MB，去掉几张再发'),
      image_too_large: tr('有图片超过 8 MB'),
      doc_too_large: tr('有文档超过 5 MB'),
      too_many_images: tr('一次最多 8 张图片'),
      github_rate_limited: tr('GitHub 说太频繁了，过一会儿再发'),
      request_timeout: tr('发送超时，请再试一次'),
      network_error: tr('连不上网络，请检查后再试')
    };
    if (map[code]) return map[code];
    // GitHub 没收下（正文太长、标题不合规等）：把它说的原话带上
    if (code === 'github_rejected') {
      const detail = String(error?.details?.detail || '').trim();
      return detail ? tr('GitHub 没收下：{detail}', { detail }) : tr('GitHub 没收下，改一改再发');
    }
    return tr('没发出去，请再试一次');
  }

  const api = {
    GithubIssues,
    parseIssueUrl,
    findIssueUrls,
    repoColor,
    nextColor,
    buildDraft,
    footer,
    appendIssueUrl,
    hasIssueUrl,
    replaceIssueUrl,
    replaceIssueUrls,
    applyMoves,
    openIssueTodos,
    issuesToAsk,
    todosToTick,
    closedAsDone,
    issueBadge,
    readIssueStates,
    issueState,
    rememberIssueStates,
    recentRepos,
    pushRecent,
    searchRepos,
    activeOrder,
    readUnseen,
    writeUnseen,
    badgeGroup,
    UNSEEN_KEY,
    imageMime,
    errorMessage,
    cleanTag,
    tagKey,
    findTags,
    tagRoutes,
    nameTag,
    retagCandidates,
    routeOf,
    stripRouteTags,
    setRepoTags,
    autoSendKey,
    autoSendCandidates,
    REPO_COLORS
  };
  globalScope.GithubIssues = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
