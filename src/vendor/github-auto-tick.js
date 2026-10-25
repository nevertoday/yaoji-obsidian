// GitHub 上问题关了 → 日记里打勾（新标签页、侧边栏、后台共用；GitHub 问题 #8 方案 A）
//
// - diaryEntries：今天和最近 14 天的日记里，没打勾、带着问题地址的事 [{ filePath, dateKey, url, repo, number, text }]
// - setChecked：在那篇日记里把带着这个地址的那件事勾上 / 改回未完成（读出来、改一个勾、整段写回，和「带到今天」同一种写法）
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

  async function setChecked(tools, filePath, url, checked) {
    if (!tools?.api || !tools.parser || !tools.title) return false;
    const content = await tools.api.getFileContent(filePath);
    const section = tools.parser.extractSection(content, tools.title);
    if (!section) return false;
    const todos = tools.parser.parseTodos(section.content);
    let hit = null;
    const walk = (items) => (items || []).some((todo) => {
      if (Boolean(todo?.checked) !== checked && String(todo?.text || '').includes(url)) {
        hit = todo;
        return true;
      }
      return walk(todo?.children);
    });
    walk(todos);
    if (!hit) return false;
    hit.checked = checked;
    const next = tools.parser.replaceSection(content, tools.title, tools.parser.todosToMarkdown(todos));
    await tools.api.updateFileContent(filePath, next, { expectedContent: content });
    return true;
  }

  // 问题搬走了（GitHub 问题 #15）：那篇日记里带着老地址的事换成新地址（整段写回，和打勾同一种写法）
  async function replaceUrl(tools, filePath, from, to) {
    if (!tools?.api || !tools.parser || !tools.title || !G()) return false;
    const content = await tools.api.getFileContent(filePath);
    const section = tools.parser.extractSection(content, tools.title);
    if (!section) return false;
    const todos = tools.parser.parseTodos(section.content);
    let changed = false;
    const walk = (items) => (items || []).forEach((todo) => {
      const next = G().replaceIssueUrl(todo?.text, from, to);
      if (todo && next !== todo.text) {
        todo.text = next;
        changed = true;
      }
      walk(todo?.children);
    });
    walk(todos);
    if (!changed) return false;
    const next = tools.parser.replaceSection(content, tools.title, tools.parser.todosToMarkdown(todos));
    await tools.api.updateFileContent(filePath, next, { expectedContent: content });
    return true;
  }

  // 那件事给人看的一行：去掉问题地址、附件、Markdown 记号
  function plainText(text) {
    const lines = String(text || '').split('\n');
    const plain = (line) => {
      const converted = globalScope.TodoPlainText?.convertText ? globalScope.TodoPlainText.convertText(line).text : String(line || '');
      return converted.replace(/https:\/\/github\.com\/[^\s]+\/issues\/\d+/g, '').replace(/!?\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim();
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

  const api = { diaryEntries, diaryIssues, setChecked, replaceUrl, barkItem, plainText, keyOfDay, PAST_DAYS };
  globalScope.GithubAutoTick = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
