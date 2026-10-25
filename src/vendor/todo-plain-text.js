// 「复制文字」：把一条任务（连子任务）变成可以直接贴给别人、贴给 AI 的纯文本。
// 存的原文里有 Markdown（![[图片]]、[标题](网址)、**粗体**、[[笔记]]），复制出去不带这些记号：
// 图片 / 文件附件单独占一行，写成电脑上的完整路径（resolvePath 由调用方给：库里的原文件，或存在「下载/今日待办」的那份）；网页图片写网址；
// 链接写网址（自己起了标题的写「标题 网址」）；粗体、高亮、删除线、行内代码只留字；换行照原样。
(function (root) {
  'use strict';

  const ATTACHMENT_RE = /!\[\[([^\]]+?)\]\]|!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g;
  const MD_LINK_RE = /\[([^\]\n]+)\]\(\s*<?([^\s)>]+)>?\s*\)/g;
  const WIKI_LINK_RE = /\[\[([^\]\n]+?)\]\]/g;

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return ''; }
  }

  // 以前自动生成的 [域名](网址) 和 [网址](网址) 只留网址
  function linkText(label, url) {
    const text = String(label || '').trim();
    const bare = text.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
    if (!text || text === url || bare === url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase() || bare === hostOf(url)) return url;
    return `${text} ${url}`;
  }

  function stripInline(text) {
    return String(text || '')
      .replace(MD_LINK_RE, (_m, label, url) => linkText(label, url))
      .replace(/<(https?:\/\/[^\s>]+)>/gi, '$1')
      .replace(WIKI_LINK_RE, (_m, inner) => {
        const [target, alias] = inner.split('|');
        return (alias || target.split('#')[0] || target).trim();
      })
      .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1')
      .replace(/==(?=\S)([^\n]*?\S)==/g, '$1')
      .replace(/~~(?=\S)([^\n]*?\S)~~/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1');
  }

  // 库里的位置 → 电脑上的完整路径；root 是 Windows 写法（C:\…）时路径也用反斜杠
  function joinDiskPath(rootPath, vaultPath) {
    const rel = String(vaultPath || '').replace(/^\/+/, '');
    const base = String(rootPath || '').trim().replace(/^["']|["']$/g, '');
    if (!base) return rel;
    const windows = /^[a-z]:[\\/]/i.test(base) || (base.includes('\\') && !base.includes('/'));
    const sep = windows ? '\\' : '/';
    const trimmed = base.replace(/[\\/]+$/, '');
    return `${trimmed}${sep}${windows ? rel.replace(/\//g, '\\') : rel}`;
  }

  /**
   * 一段任务文字 → 纯文本。
   * resolvePath(ref)：把附件引用（库里的位置或短名）换成要写出去的路径；不给就原样写。
   * 返回 { text, attachments }：attachments 是写出去的附件引用（不含网页图片），给调用方判断要不要提示填库的位置。
   */
  function convertText(raw, { resolvePath } = {}) {
    const source = String(raw || '');
    const attachments = [];
    let out = '';
    let cursor = 0;
    for (const match of source.matchAll(ATTACHMENT_RE)) {
      const [whole, wiki, bracket, plain] = match;
      let line;
      if (wiki !== undefined) {
        const ref = wiki.split('|')[0].split('#')[0].trim();
        attachments.push(ref);
        line = resolvePath ? resolvePath(ref) : ref;
      } else {
        let ref = String(bracket || plain || '').trim();
        if (/^https?:\/\//i.test(ref)) line = ref;
        else {
          try { ref = decodeURIComponent(ref); } catch { /* 文件名里本来就有 % 的照写 */ }
          attachments.push(ref);
          line = resolvePath ? resolvePath(ref) : ref;
        }
      }
      // 附件单独一行：前后不是行首 / 行尾时补换行，夹着的空格去掉
      const before = stripInline(source.slice(cursor, match.index)).replace(/[ \t]+$/, '');
      out += before;
      if (out && !out.endsWith('\n')) out += '\n';
      out += line;
      cursor = match.index + whole.length;
      const rest = source.slice(cursor);
      const lead = /^[ \t]*/.exec(rest)[0];
      cursor += lead.length;
      if (cursor < source.length && source[cursor] !== '\n') out += '\n';
    }
    out += stripInline(source.slice(cursor));
    const text = out.split('\n').map((line) => line.replace(/[ \t]+$/, '')).join('\n').replace(/^\n+|\n+$/g, '');
    return { text, attachments };
  }

  /**
   * 一条任务连子任务 → 纯文本。子任务一行一条，前面「- 」，每深一层多缩进两个空格；做完的写「✓ 」。
   */
  function todoToPlainText(todo, options = {}) {
    const attachments = [];
    const lines = [];
    const visit = (item, depth) => {
      const converted = convertText(item?.text, options);
      attachments.push(...converted.attachments);
      if (depth === 0) {
        lines.push(converted.text);
      } else {
        const indent = '  '.repeat(depth - 1);
        const mark = item?.checked ? '✓ ' : '- ';
        const [first, ...more] = converted.text.split('\n');
        lines.push(`${indent}${mark}${first}`);
        for (const line of more) lines.push(`${indent}  ${line}`);
      }
      for (const child of item?.children || []) visit(child, depth + 1);
    };
    visit(todo, 0);
    return { text: lines.join('\n'), attachments };
  }

  // 只要一行给人看（标签页标题、「带到今天」的影子）：第一行；附件写文件名，链接写标题（没有就写域名），
  // 强调记号去掉
  function oneLine(text) {
    const first = String(text || '').split('\n').find((line) => line.trim()) || '';
    return first
      .replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, file) => file.split('/').pop())
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/!?\[([^\]]*)\]\(([^)]+)\)/g, (_, label, url) => label || String(url).split('/').pop())
      // 发到 GitHub 的问题地址写成 #42（和列表里一样），别的网址只留域名
      .replace(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/(\d+)(?![\w/])/g, '#$1')
      .replace(/https?:\/\/([^/\s]+)\S*/g, '$1')
      .replace(/(\*\*|__|==|~~|`)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const api = { todoToPlainText, convertText, joinDiskPath, oneLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TodoPlainText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
