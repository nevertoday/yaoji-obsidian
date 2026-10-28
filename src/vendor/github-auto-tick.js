// GitHub 上问题关了 → 日记里打勾（新标签页、侧边栏、后台共用；GitHub 问题 #8 方案 A）
//
// - diaryEntries：今天和最近 14 天的日记里，没打勾、带着问题地址的事 [{ filePath, dateKey, url, repo, number, text }]
// - setChecked：在那篇日记里把带着这个地址的那件事勾上 / 改回未完成（读出来、改一个勾、整段写回，和「带到今天」同一种写法）；
//   真写进去了才返回 true
// - replaceUrl / replaceUrls：问题搬走了，老地址换成新地址
// - barkItem：推到手机的那一条（标题说结果，正文是那件事的字）
// 页面上今天这一篇还是走 TodoManager（要有打勾的样子、能撤销）；后台没有页面，直接改日记文件。
(function initGithubAutoTick(globalScope) {
  'use strict';

  const G = () => globalScope.GithubIssues;
  const PAST_DAYS = 14;
  const keyOfDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // tools：{ api, parser, formatter, title }；today：那一天中午（normalizeDate）；skipPaths：页面自己管的那一篇
  async function diaryEntries(tools, { today, days = PAST_DAYS, includeToday = true, skipPaths = [] } = {}) {
    if (!tools?.api || !tools.parser || !tools.formatter || !tools.title || !G()) return [];
    const skip = new Set(skipPaths.filter(Boolean));
    const entries = [];
    for (let offset = includeToday ? 0 : 1; offset <= days; offset += 1) {
      const date = new Date(today);
      date.setDate(date.getDate() - offset);
      const file = tools.formatter.format(date);
      if (skip.has(file.fullPath)) continue;
      let content = '';
      try {
        content = await tools.api.getFileContent(file.fullPath);
      } catch {
        continue; // 那天没有日记
      }
      const section = tools.parser.extractSection(content, tools.title);
      if (!section) continue;
      const todos = tools.parser.parseTodos(section.content);
      const byId = new Map();
      const walk = (items) => (items || []).forEach((todo) => { byId.set(todo.id, todo); walk(todo.children); });
      walk(todos);
      for (const entry of G().openIssueTodos(todos)) {
        entries.push({
          repo: entry.repo,
          number: entry.number,
          url: entry.url,
          filePath: file.fullPath,
          dateKey: keyOfDay(date),
          text: String(byId.get(entry.todoId)?.text || '')
        });
      }
    }
    return entries;
  }

  // GitHub 历史（GitHub 问题 #13）：最近几天日记里带着问题地址的事，勾没勾都要
  // → [{ filePath, dateKey, url, repo, number, text, checked }]（同一个问题在几天里都有：留最近那天的）
  async function diaryIssues(tools, { today, days = PAST_DAYS, includeToday = true, skipPaths = [] } = {}) {
    if (!tools?.api || !tools.parser || !tools.formatter || !tools.title || !G()) return [];
    const skip = new Set(skipPaths.filter(Boolean));
    const seen = new Set();
    const entries = [];
    // 十几篇一起读（GitHub 问题 #45：以前一篇读完再读下一篇，GitHub 清单要等好几秒），读回来还按日子从近到远认
    const daysToRead = [];
    for (let offset = includeToday ? 0 : 1; offset <= days; offset += 1) {
      const date = new Date(today);
      date.setDate(date.getDate() - offset);
      const file = tools.formatter.format(date);
      if (!skip.has(file.fullPath)) daysToRead.push({ date, file });
    }
    const contents = await Promise.all(daysToRead.map(({ file }) => Promise.resolve()
      .then(() => tools.api.getFileContent(file.fullPath))
      .catch(() => null))); // 那天没有日记
    for (const [index, { date, file }] of daysToRead.entries()) {
      const content = contents[index];
      if (typeof content !== 'string') continue;
      const section = tools.parser.extractSection(content, tools.title);
      if (!section) continue;
      const walk = (items) => (items || []).forEach((todo) => {
        const issue = G().findIssueUrls(todo?.text || '')[0];
        if (issue && !seen.has(issue.url)) {
          seen.add(issue.url);
          entries.push({ ...issue, filePath: file.fullPath, dateKey: keyOfDay(date), text: String(todo.text || ''), checked: Boolean(todo.checked) });
        }
        walk(todo?.children);
      });
      walk(tools.parser.parseTodos(section.content));
    }
    return entries;
  }

  // 写回去：updateFileContent 明说没写（返回 false：读出来以后文件又被改过）就当没改成，不算打了勾；
  // 扩展那边冲突时直接抛错，返回值是对象或 undefined，照旧算写了
  async function writeBack(tools, filePath, content, todos) {
    const next = tools.parser.replaceSection(content, tools.title, tools.parser.todosToMarkdown(todos));
    const wrote = await tools.api.updateFileContent(filePath, next, { expectedContent: content });
    return wrote !== false;
  }

  async function setChecked(tools, filePath, url, checked) {
    if (!tools?.api || !tools.parser || !tools.title || !G() || !url) return false;
    const content = await tools.api.getFileContent(filePath);
    const section = tools.parser.extractSection(content, tools.title);
    if (!section) return false;
    const todos = tools.parser.parseTodos(section.content);
    let hit = null;
    // 整个问题地址对上才算：关了 #1 不会勾到带着 #12 的那件
    const walk = (items) => (items || []).some((todo) => {
      if (Boolean(todo?.checked) !== checked && G().hasIssueUrl(todo?.text, url)) {
        hit = todo;
        return true;
      }
      return walk(todo?.children);
    });
    walk(todos);
    if (!hit) return false;
    hit.checked = checked;
    return writeBack(tools, filePath, content, todos);
  }

  // 问题搬走了（GitHub 问题 #15）：那篇日记里带着老地址的事换成新地址（整段写回，和打勾同一种写法）
  async function replaceUrl(tools, filePath, from, to) {
    if (!from || !to || from === to) return false;
    return replaceUrls(tools, filePath, [{ from, to }]);
  }

  // 一篇日记里几个问题一起搬：每件事从原来的地址一次换好（#1→#2、#2→#1 对换不会换乱），整篇只写一次
  // moves：[{ from, to }] 或 Map（老地址 → 新地址）
  async function replaceUrls(tools, filePath, moves) {
    if (!tools?.api || !tools.parser || !tools.title || !G()) return false;
    const content = await tools.api.getFileContent(filePath);
    const section = tools.parser.extractSection(content, tools.title);
    if (!section) return false;
    const todos = tools.parser.parseTodos(section.content);
    let changed = false;
    const walk = (items) => (items || []).forEach((todo) => {
      const next = G().replaceIssueUrls(todo?.text, moves);
      if (todo && next !== String(todo.text || '')) {
        todo.text = next;
        changed = true;
      }
      walk(todo?.children);
    });
    walk(todos);
    if (!changed) return false;
    return writeBack(tools, filePath, content, todos);
  }

  // 那件事给人看的一行：去掉问题地址、附件、Markdown 记号
  function plainText(text) {
    const lines = String(text || '').split('\n');
    const plain = (line) => {
      const converted = globalScope.TodoPlainText?.convertText ? globalScope.TodoPlainText.convertText(line).text : String(line || '');
      // 项目名、附件名都有上限：很长一段没有收尾的字也是一遍扫完，不会越扫越慢
      return converted.replace(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/g, '').replace(/!?\[\[[^\]]{0,500}\]\]/g, '').replace(/\s+/g, ' ').trim();
    };
    return (lines.map(plain).find(Boolean) || '').slice(0, 120);
  }

  // muted：config.github.barkOff（{ 'owner/repo': true } = 这个项目关了不推）
  function barkItem(entry, { muted = {}, tr = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)) } = {}) {
    if (!entry?.url || muted?.[entry.repo] === true) return null;
    return {
      key: `${entry.url}@${entry.closedAt || 'closed'}`,
      title: tr('✓ #{number} 关了，已打勾', { number: entry.number }),
      message: plainText(entry.text) || entry.repo
    };
  }

  const api = { diaryEntries, diaryIssues, setChecked, replaceUrl, replaceUrls, barkItem, plainText, keyOfDay, PAST_DAYS };
  globalScope.GithubAutoTick = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
