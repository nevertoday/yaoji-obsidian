/**
 * Markdown Todo 解析器
 * 负责解析和重构 Markdown 格式的 Todo 列表
 */
class MarkdownParser {
  /**
   * 插件内部元数据标记：用于在 Todo 文本中持久化“已发送到灵感”等状态
   * 采用 Obsidian 的 %%...%% 注释格式（预览模式下不显示）
   */
  static META = {
    INSPIRATION_SENT: '%%yaoji:inspiration%%',
    MEMORY_SENT: '%%yaoji:memory%%',
    TODO_ID_KEY: 'todoid',
    TODO_ID_PREFIX: '%%yaoji:todoid:'
  };

  // 今天已经自动「带过来」了：写在今天日记事项标题下面的一行注释（阅读时看不见）。
  // 浏览器扩展和 Obsidian 里的今日待办插件都开着、或者两台电脑都开着时，谁先写下它谁带，另一边看到就不再带（GitHub 问题 #19）
  static BROUGHT_MARK = '%%yaoji:brought%%';

  // 任务行：- [ ] / * [ ] / + [ ]，允许空格或 Tab 缩进；行尾的 \r（Windows 换行）不算字
  static TODO_LINE = /^([ \t]*)([-*+]) \[([ xX])\]\s*(.*?)\r?$/;

  /**
   * 哪些行在代码块（``` 或 ~~~ 围起来）里：代码块里的「# 注释」不是标题、「- [ ] 示例」不是任务。
   * 缩进写在任务下面的代码块，遇到缩进更浅的行就算结束（这件事结束了）；一直没合上的不算代码块，照旧读。
   */
  static fencedLines(lines) {
    const inside = new Array(lines.length).fill(false);
    let open = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = /^([ \t]*)(`{3,}|~{3,})([^\n]*)$/.exec(line);
      if (open && line.trim() && MarkdownParser.indentWidth(line.match(/^[ \t]*/)[0]) < open.width) open = null;
      if (open) {
        inside[i] = true;
        if (match && match[2][0] === open.fence[0] && match[2].length >= open.fence.length && !match[3].trim()) open = null;
        continue;
      }
      if (!match || (match[2][0] === '`' && match[3].includes('`'))) continue;
      open = { fence: match[2], width: MarkdownParser.indentWidth(match[1]), start: i };
      inside[i] = true;
    }
    if (open) for (let i = open.start; i < lines.length; i++) inside[i] = false;
    return inside;
  }

  /** 缩进宽度，Tab 按 4 个空格计 */
  static indentWidth(whitespace) {
    return String(whitespace || '').replace(/\t/g, '    ').length;
  }

  /** 原文件使用的缩进单位：有 Tab 用 Tab，否则取任务行最小的缩进空格数 */
  static detectIndentUnit(lines) {
    let minSpaces = 0;
    for (const line of lines) {
      const match = line.match(MarkdownParser.TODO_LINE);
      if (!match || !match[1]) continue;
      if (match[1].includes('\t')) return '\t';
      if (!minSpaces || match[1].length < minSpaces) minSpaces = match[1].length;
    }
    return minSpaces === 2 ? '  ' : '    ';
  }

  /**
   * todosToMarkdown 统一按 4 空格一级输出，这里换成原文件的缩进单位。
   * upTo：续行只换任务本身那几级，再往里的缩进（嵌套列表、代码）原样留着（Tab 文件照旧整段换）
   */
  static reindentLine(line, unit, upTo = Infinity) {
    if (unit === '    ') return line;
    const leading = Math.min(line.match(/^ */)[0].length, unit === '\t' ? Infinity : upTo);
    const levels = Math.floor(leading / 4);
    return unit.repeat(levels) + ' '.repeat(leading % 4) + line.slice(leading);
  }

  /**
   * 从完整 Markdown 中提取指定板块
   * @param {string} markdown - 完整的 Markdown 内容
   * @param {string} sectionTitle - 板块标题(如 "### 事项")
   * @returns {Object|null} { content: string, startLine: number, endLine: number }
   */
  extractSection(markdown, sectionTitle) {
    const lines = markdown.split('\n');
    let startLine = -1;
    let endLine = lines.length;
    let sectionLevel = 0;
    const targetTitle = this.normalizeTitle(sectionTitle);
    const targetLevel = this.getHeaderLevel(String(sectionTitle || '').trim());
    // 代码块里的 # 不是标题；文件开头的 BOM 不算字
    const fenced = MarkdownParser.fencedLines(lines);
    const lineAt = (i) => (i === 0 ? lines[0].replace(/^\uFEFF/, '') : lines[i]);

    // 查找板块开始位置：同级的标题优先（「# 事项」这种大标题会吞掉整篇）；没有同级的才认别的级别（以前就这样认）
    let fallback = -1;
    for (let i = 0; i < lines.length; i++) {
      if (fenced[i]) continue;
      const headerLevel = this.getHeaderLevel(lineAt(i));
      if (headerLevel === 0 || this.normalizeTitle(lineAt(i)) !== targetTitle) continue;
      if (!targetLevel || headerLevel === targetLevel) {
        startLine = i;
        break;
      }
      if (fallback === -1) fallback = i;
    }
    if (startLine === -1) startLine = fallback;

    if (startLine === -1) {
      return null; // 未找到指定板块
    }
    sectionLevel = this.getHeaderLevel(lineAt(startLine));

    // 查找板块结束位置(下一个同级或更高级标题)
    for (let i = startLine + 1; i < lines.length; i++) {
      if (fenced[i]) continue;
      const currentLevel = this.getHeaderLevel(lines[i]);
      if (currentLevel > 0 && currentLevel <= sectionLevel) {
        endLine = i;
        break;
      }
    }

    // 提取板块内容(不包括标题行)
    const content = lines.slice(startLine + 1, endLine).join('\n');

    return {
      content,
      startLine,
      endLine
    };
  }

  /**
   * 写入前自检：把替换后的整份文件里这一节再读一遍，任务行一条都不能少。
   * 少了（这一节被提前截断、或者替换错位）就返回 false，调用方不写入。
   */
  sectionRoundTrips(newContent, sectionTitle, newSectionContent) {
    const countTasks = (text) => (String(text || '').match(/^[ \t]*[-*+] \[[ xX]\]/gm) || []).length;
    const expected = countTasks(newSectionContent);
    if (expected === 0) return true;
    const section = this.extractSection(String(newContent || ''), sectionTitle);
    return !!section && countTasks(section.content) >= expected;
  }

  /**
   * 获取标题级别：只认顶格的标题。缩进的「### …」是上一条任务的续行（任务里 Shift+Enter 写的、
   * 右键加进来的网页段落），不是新的一节——当成新的一节会让它下面的任务全部「消失」（docs/adversarial-test-2026-10-08.md P0-1）
   * @param {string} line - 行内容
   * @returns {number} 标题级别(1-6),非标题返回 0
   */
  getHeaderLevel(line) {
    const match = String(line || '').match(/^(#{1,6})\s/);
    return match ? match[1].length : 0;
  }

  /**
   * 用户自己打的「%%yaoji:…%%」不能被当成今日待办的内部标记（会悄悄标成「已存进记忆」、字也没了）：
   * 写入时在 yaoji 和冒号之间夹一个零宽空格，读出时去掉，用户看到的字一模一样（docs/adversarial-test-2026-10-08.md P3-10）
   */
  static escapeUserMarkers(text) {
    return String(text ?? '')
      // 空字符、强制改写文字方向的控制符（可以让一段字倒着显示、伪装成别的内容）不写进文件
      .split(String.fromCharCode(0)).join('')
      .replace(/[\u202D\u202E]/g, '')
      .replace(/%%yaoji:/gi, (m) => `${m.slice(0, -1)}\u200B:`);
  }

  static unescapeUserMarkers(text) {
    return String(text ?? '').replace(/(%%yaoji)\u200B:/gi, '$1:');
  }

  /**
   * 从任务末尾剥离插件元数据标记
   * 支持多标记串联（例如：%%yaoji:inspiration%% %%yaoji:memory%% %%yaoji:todoid:xxx%%）
   * @param {string} rawText
   * @returns {{ text: string, meta: { inspirationSent: boolean, memorySent: boolean, todoMetaId: string|null } }}
   */
  stripMetaMarkers(rawText) {
    let text = String(rawText || '').trim();
    const meta = {
      inspirationSent: false,
      memorySent: false,
      todoMetaId: null
    };

    const markerTailRegex = /\s*%%yaoji:([a-z0-9-]+)(?::([^%]*))?%%\s*$/i;

    // 不是 %% 结尾就不用找（很长一串空格时正则会很慢）
    while (text.endsWith('%%')) {
      const match = markerTailRegex.exec(text);
      if (!match) break;

      const key = String(match[1] || '').toLowerCase();
      const value = String(match[2] || '').trim();
      if (key === 'inspiration') {
        meta.inspirationSent = true;
      } else if (key === 'memory') {
        meta.memorySent = true;
      } else if (key === MarkdownParser.META.TODO_ID_KEY && value) {
        meta.todoMetaId = value;
      } else {
        break;
      }

      text = text.slice(0, match.index).trimEnd();
    }

    return { text, meta };
  }

  /**
   * 构造任务末尾元数据标记文本
   * @param {Object} todo
   * @returns {string}
   */
  buildMetaMarkers(todo) {
    const markers = [];
    if (todo?.inspirationSent) {
      markers.push(MarkdownParser.META.INSPIRATION_SENT);
    }
    if (todo?.memorySent) {
      markers.push(MarkdownParser.META.MEMORY_SENT);
    }
    if (todo?.metaId) {
      markers.push(`${MarkdownParser.META.TODO_ID_PREFIX}${todo.metaId}%%`);
    }
    return markers.join(' ');
  }

  /**
   * 解析 Todo 列表
   * 缩进按“相对上级”判断：2 空格、4 空格、Tab 缩进的子任务都能正确挂到父任务下。
   * @param {string} sectionContent - 板块内容(不包括标题)
   * @returns {Array<Object>} Todo 对象数组（树形）
   */
  /**
   * 修复旧版本写坏的文件：以前缩进的「### …」会被当成新的一节，连续保存时这一段被一遍遍重复写进去。
   * 只收起「紧挨着、一模一样、至少两行、并且里面有缩进标题行」的重复段——这是那个 bug 独有的样子，
   * 用户自己连着加的两条同样的任务不会被动到。
   */
  static collapseRepeatedBlocks(lines) {
    // 旧 bug 是在缩进的标题处把这一节截断，被重复写进去的那一段总是从这一行开始：
    // 只看从缩进标题开始的段，用户自己连着写的两条一样的多行任务（任务行开头）不会被收掉
    const indentedHeading = /^[ \t]+#{1,6}\s/;
    if (!lines.some((line) => indentedHeading.test(line))) return lines;
    const out = lines.slice();
    const same = (a, b, k) => { for (let j = 0; j < k; j++) if (out[a + j] !== out[b + j]) return false; return true; };
    for (let i = 0; i < out.length; i++) {
      if (!indentedHeading.test(out[i])) continue;
      for (let k = 2; k <= Math.min(400, Math.floor((out.length - i) / 2)); k++) {
        if (!same(i, i + k, k)) continue;
        while (i + 2 * k <= out.length && same(i, i + k, k)) out.splice(i + k, k);
        break;
      }
    }
    return out;
  }

  parseTodos(sectionContent) {
    // Windows 换行：\r 不算字（写回时 replaceSection 会换回 \r\n）
    const lines = MarkdownParser.collapseRepeatedBlocks(String(sectionContent ?? '').replace(/\r\n/g, '\n').split('\n'));
    return this.parseLines(lines);
  }

  // parseTodos 的本体：不再收重复段，line 就是 lines 里的行号
  parseLines(lines) {
    const todos = [];
    const stack = []; // [{ todo, width }]，width 是该任务行的缩进宽度
    const fenced = MarkdownParser.fencedLines(lines);

    for (let i = 0; i < lines.length; i++) {
      if (fenced[i]) continue;
      const todoMatch = lines[i].match(MarkdownParser.TODO_LINE);
      if (!todoMatch) continue;

      const [, indentStr, bullet, checkMark, text] = todoMatch;
      const width = MarkdownParser.indentWidth(indentStr);
      while (stack.length > 0 && stack[stack.length - 1].width >= width) stack.pop();
      const indent = stack.length;

      // 解析持久化标记（从显示文本中剥离，但保留状态）
      const { text: trimmedText, meta } = this.stripMetaMarkers(text);
      // 整条是一段高亮才算星标；「==a== 和 ==b==」是两段，不算（不然取消星标会吃掉中间的 ==）。
      // 给这种字加星标写成「====a== 和 ==b====」，读回来还是星标，取消后原样
      const highlightMatch = trimmedText.match(/^==(==.*==|(?:(?!==).)+)==$/);
      let normalizedText = highlightMatch ? highlightMatch[1].trim() : trimmedText;
      let highlighted = !!highlightMatch;

      // 多行任务：紧跟其后、缩进比任务行更深的非任务行是任务正文的续行（代码块里像任务的行也是续行）
      const continuationLines = [];
      const continuationWidths = [];
      let endLineIndex = i;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        if (!fenced[j] && MarkdownParser.TODO_LINE.test(next)) break;
        // 行尾的 \r 不算字：Windows 换行的日记里这一节最后一行（后面紧跟下一个标题）还带着它，不去掉就认不出是续行，改一下别的任务这一行就没了
        const contMatch = next.match(/^([ \t]+)(.*?)\r?$/);
        if (!contMatch || MarkdownParser.indentWidth(contMatch[1]) <= width) break;
        continuationLines.push(contMatch[2]);
        continuationWidths.push(contMatch[2].trim() ? MarkdownParser.indentWidth(contMatch[1]) : -1);
        endLineIndex = j;
      }
      // 续行末尾只有空格的行不算这件事的字（留在原处）：不然这件事写回时挪浅一级，下面那行空格就成了它的第二行，星标、次数都认不出来
      while (continuationLines.length > 0 && !continuationLines[continuationLines.length - 1].trim()) {
        continuationLines.pop();
        continuationWidths.pop();
        endLineIndex -= 1;
      }
      // 续行里更深的缩进（嵌套列表、代码）：显示时不带，写回时按原来的层次补上
      let contIndent = null;
      if (continuationLines.length > 0) {
        normalizedText = [normalizedText, ...continuationLines].join('\n');
        // Obsidian 中跨行的 == == 高亮表现不稳定，这里仅对单行任务启用
        highlighted = false;
        const base = Math.min(...continuationWidths.filter((w) => w >= 0));
        const extra = continuationWidths.map((w) => (w >= 0 ? w - base : 0));
        if (extra.some((n) => n > 0)) contIndent = extra;
      }

      const todo = {
        id: this.generateId(),
        checked: checkMark.toLowerCase() === 'x',
        text: MarkdownParser.unescapeUserMarkers(normalizedText),
        highlighted,
        inspirationSent: meta.inspirationSent,
        memorySent: meta.memorySent,
        metaId: meta.todoMetaId,
        indent,
        children: [],
        line: i,
        raw: lines.slice(i, endLineIndex + 1).join('\n')
      };
      if (bullet !== '-') todo.bullet = bullet;
      if (contIndent) todo.contIndent = contIndent;

      if (indent === 0) todos.push(todo);
      else stack[stack.length - 1].todo.children.push(todo);
      stack.push({ todo, width });
      i = endLineIndex;
    }

    return todos;
  }

  /**
   * 将 Todo 对象数组转回 Markdown
   * @param {Array<Object>} todos - Todo 对象数组
   * @returns {string} Markdown 格式的 Todo 列表
   */
  todosToMarkdown(todos) {
    const lines = [];

    const convertTodo = (todo) => {
      // 刚点了「添加子任务」、还在输入框里没确认的那一条（_isNew）不写进文件：
      // 确认时才算新加一条、才占免费版额度；按 Esc 放弃就当没有过
      if (todo?._isNew) return;
      // 使用 4 个空格表示一个缩进层级，贴合 Obsidian 默认缩进宽度
      const indent = ' '.repeat((todo.indent || 0) * 4);
      const checkMark = todo.checked ? 'x' : ' ';
      const textLines = MarkdownParser.escapeUserMarkers(todo.text || '').split('\n');
      const firstLine = textLines[0] || '';
      let firstContent = todo.highlighted && textLines.length === 1 ? `==${firstLine}==` : firstLine;
      const metaMarkers = this.buildMetaMarkers(todo);
      if (metaMarkers) {
        firstContent = `${firstContent} ${metaMarkers}`.trimEnd();
      }
      lines.push(`${indent}${todo.bullet || '-'} [${checkMark}] ${firstContent}`);
      // 续行原来更深的缩进（行数对得上才用）
      const extra = Array.isArray(todo.contIndent) && todo.contIndent.length === textLines.length - 1 ? todo.contIndent : null;
      for (let i = 1; i < textLines.length; i++) {
        lines.push(`${indent}    ${' '.repeat(extra?.[i - 1] || 0)}${textLines[i] || ''}`);
      }

      // 递归处理子任务
      if (todo.children && todo.children.length > 0) {
        todo.children.forEach(child => convertTodo(child));
      }
    };

    todos.forEach(todo => convertTodo(todo));

    return lines.join('\n');
  }

  /**
   * 替换板块里的任务并保持文件其他部分不变
   * @param {string} originalMarkdown - 原始完整 Markdown
   * @param {string} sectionTitle - 板块标题
   * @param {string} newSectionContent - todosToMarkdown 生成的任务列表
   * @returns {string} 更新后的完整 Markdown
   */
  replaceSection(originalMarkdown, sectionTitle, newSectionContent) {
    // 整篇都是 Windows 换行（\r\n）：按 \n 改，写回时换回 \r\n，不混着写
    const raw = String(originalMarkdown ?? '');
    if (raw.includes('\r\n') && !/(^|[^\r])\n/.test(raw)) {
      return this.replaceSection(raw.replace(/\r\n/g, '\n'), sectionTitle, newSectionContent).replace(/\n/g, '\r\n');
    }
    const section = this.extractSection(originalMarkdown, sectionTitle);

    if (!section) {
      // 如果板块不存在,添加到文件末尾
      return originalMarkdown.trim() + '\n\n' + sectionTitle + '\n' + newSectionContent;
    }

    const lines = originalMarkdown.split('\n');
    return [
      ...lines.slice(0, section.startLine + 1),
      this.mergeSectionContent(section.content, newSectionContent),
      ...lines.slice(section.endLine)
    ].join('\n');
  }

  /**
   * 把新的任务列表写回板块，同时保留板块里不是任务的内容
   * （小标题、备注、图片、空行、其他格式的列表等），这些内容插件界面不展示，但绝不能在保存时丢掉。
   *
   * 每段非任务内容跟随它上方的任务：任务被拖动时一起移动；任务被删除或改写时，
   * 挂到更前面仍然存在的任务下方。板块开头和结尾的内容始终留在原位。
   * 写回时沿用原文件的缩进单位（Tab / 2 空格 / 4 空格）。
   */
  mergeSectionContent(baseContent, generatedContent) {
    const base = String(baseContent ?? '');
    const generated = String(generatedContent ?? '');
    if (!base) return generated;

    // 和 parseTodos 读到的一样先收起旧 bug 的重复段，行号才对得上（不然会多写、少写几行）
    const baseLines = MarkdownParser.collapseRepeatedBlocks(base.split('\n'));
    const baseBlocks = this.collectTodoBlocks(baseLines);
    const covered = new Set();
    baseBlocks.forEach((block) => {
      for (let i = block.start; i <= block.end; i++) covered.add(i);
    });

    // 非任务行按“上方最近的任务”分组；-1 表示在第一个任务之前
    const preamble = [];
    const attached = baseBlocks.map(() => []);
    let owner = -1;
    let blockCursor = 0;
    baseLines.forEach((line, index) => {
      while (blockCursor < baseBlocks.length && baseBlocks[blockCursor].start <= index) {
        owner = blockCursor;
        blockCursor += 1;
      }
      if (covered.has(index)) return;
      (owner === -1 ? preamble : attached[owner]).push(line);
    });

    // 板块末尾的空行固定留在最后，避免任务调整顺序后空行跑到列表中间
    const epilogue = [];
    const lastGroup = baseBlocks.length > 0 ? attached[baseBlocks.length - 1] : preamble;
    while (lastGroup.length > 0 && !lastGroup[lastGroup.length - 1].trim()) epilogue.unshift(lastGroup.pop());
    // 板块原来只有空行（新日记模板）：标题和第一条任务之间保留一个空行
    if (baseBlocks.length === 0 && preamble.length === 0 && epilogue.length > 1) preamble.push(epilogue.shift());

    const generatedLines = generated ? generated.split('\n') : [];
    const generatedBlocks = this.collectTodoBlocks(generatedLines);

    // 配对新旧任务（勾选、高亮不改正文）。先按顺序对齐（最长公共子序列，只比正文）：
    // 好几条同名的、其中一条改了字，别的也不会错位配到隔壁那条上
    const matchedBase = new Map();
    const n = baseBlocks.length;
    const m = generatedBlocks.length;
    const same = (i, j) => baseBlocks[i].text === generatedBlocks[j].text;
    // 前后没变的那几段直接配上，只对中间改过的那一段算（一次只改一两条，几千条的清单也很快）
    let lo = 0;
    while (lo < n && lo < m && same(lo, lo)) {
      matchedBase.set(lo, lo);
      lo += 1;
    }
    let hiBase = n;
    let hiGenerated = m;
    while (hiBase > lo && hiGenerated > lo && same(hiBase - 1, hiGenerated - 1)) {
      hiBase -= 1;
      hiGenerated -= 1;
      matchedBase.set(hiBase, hiGenerated);
    }
    const rows = hiBase - lo;
    const width = hiGenerated - lo + 1;
    if (rows && width > 1 && rows * width <= 4000000) {
      const table = new Uint16Array((rows + 1) * width);
      for (let i = rows - 1; i >= 0; i--) {
        for (let j = width - 2; j >= 0; j--) {
          table[i * width + j] = same(lo + i, lo + j)
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        }
      }
      for (let i = 0, j = 0; i < rows && j < width - 1;) {
        if (same(lo + i, lo + j)) {
          matchedBase.set(lo + i, lo + j);
          i += 1;
          j += 1;
        } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i += 1;
        else j += 1;
      }
    }
    // 拖动换了位置的：剩下的按正文（第几次出现）配，下面的内容跟着它走
    const claimed = new Set(matchedBase.values());
    const freeByText = new Map();
    generatedBlocks.forEach((block, index) => {
      if (claimed.has(index)) return;
      if (!freeByText.has(block.text)) freeByText.set(block.text, []);
      freeByText.get(block.text).push(index);
    });
    baseBlocks.forEach((block, index) => {
      if (matchedBase.has(index)) return;
      const index2 = freeByText.get(block.text)?.shift();
      if (index2 === undefined) return;
      matchedBase.set(index, index2);
      claimed.add(index2);
    });
    // 改了字的那一条（计次 +1、接上 GitHub 问题地址、改写）：正文配不上。两条配上的任务之间，
    // 新旧两边空出的条数一样，就按顺序一一当成同一条——它下面的备注、图片跟着它，不跑到上一条下面
    const anchors = [...matchedBase.entries()].sort((a, b) => a[0] - b[0]);
    let prevBase = -1;
    let prevGenerated = -1;
    for (const [baseIndex, generatedIndex] of [...anchors, [n, m]]) {
      const gap = baseIndex - prevBase - 1;
      if (gap > 0 && generatedIndex - prevGenerated - 1 === gap) {
        for (let k = 1; k <= gap; k++) {
          if (claimed.has(prevGenerated + k)) continue;
          matchedBase.set(prevBase + k, prevGenerated + k);
          claimed.add(prevGenerated + k);
        }
      }
      prevBase = baseIndex;
      prevGenerated = generatedIndex;
    }

    // 旧任务已删除或改写：它下方的内容交给更前面仍然存在的任务，没有就放回开头
    const extraAfterGenerated = generatedBlocks.map(() => []);
    let lastMatched = -1;
    baseBlocks.forEach((_block, baseIndex) => {
      if (matchedBase.has(baseIndex)) {
        lastMatched = matchedBase.get(baseIndex);
        extraAfterGenerated[lastMatched].push(...attached[baseIndex]);
      } else if (lastMatched === -1) {
        preamble.push(...attached[baseIndex]);
      } else {
        extraAfterGenerated[lastMatched].push(...attached[baseIndex]);
      }
    });

    const unit = MarkdownParser.detectIndentUnit(baseLines);
    const baseOf = new Map([...matchedBase].map(([baseIndex, generatedIndex]) => [generatedIndex, baseIndex]));
    // keep：照原来的缩进写——层级没变的任务用它原来的缩进（一级任务写成 8 个空格、第二行用 Tab 的，都原样留着），
    // 新加的、换了层级的用旁边同一层那件的缩进，没有就是上一级的缩进再多一级。不然任务挪浅了，
    // 它下面一行没缩进够的说明会变成它的第二行
    const leadOf = new Array(m).fill(null);
    const blockAt = new Map(generatedBlocks.map((block, index) => [block.start, index]));
    const step = unit === '\t' ? '\t' : unit;
    const assign = (list, parentLead) => {
      const indexes = list.map((todo) => blockAt.get(todo.line));
      indexes.forEach((index) => {
        const old = baseOf.has(index) ? baseBlocks[baseOf.get(index)] : null;
        if (old && old.indent === generatedBlocks[index].indent) leadOf[index] = baseLines[old.start].match(/^[ \t]*/)[0];
      });
      indexes.forEach((index, k) => {
        if (leadOf[index] === null) {
          const before = indexes.slice(0, k).reverse().find((i) => leadOf[i] !== null);
          const after = indexes.slice(k + 1).find((i) => leadOf[i] !== null);
          const near = before ?? after;
          leadOf[index] = near !== undefined ? leadOf[near] : (parentLead === null ? '' : parentLead + step);
        }
        assign(list[k].children, leadOf[index]);
      });
    };
    assign(this.parseLines(generatedLines), null);
    const build = (keep) => {
      const output = [...preamble];
      generatedBlocks.forEach((block, index) => {
        const taskLeading = generatedLines[block.start].match(/^ */)[0].length;
        if (keep) {
          const old = baseOf.has(index) ? baseBlocks[baseOf.get(index)] : null;
          const lead = leadOf[index];
          output.push(lead + generatedLines[block.start].slice(taskLeading));
          // 第二行起：没改的那几行整行照抄（只改了第一行的次数、问题地址时，下面一行都不动）
          const before = old ? String(old.text).split('\n') : [];
          const now = String(block.text).split('\n');
          const sameCount = old && old.indent === block.indent && old.end - old.start === block.end - block.start;
          for (let i = 1; i <= block.end - block.start; i++) {
            output.push(sameCount && before[i] === now[i]
              ? baseLines[old.start + i]
              : lead + MarkdownParser.reindentLine(generatedLines[block.start + i].slice(taskLeading), unit, 4));
          }
        } else {
          for (let i = block.start; i <= block.end; i++) {
            output.push(MarkdownParser.reindentLine(generatedLines[i], unit, i === block.start ? Infinity : taskLeading + 4));
          }
        }
        output.push(...extraAfterGenerated[index]);
      });
      // 生成内容里没有任务时（例如全部删除）也保留空行结构，但不叠加多余空行
      const tail = [...epilogue];
      if (generatedBlocks.length === 0 && output.length > 0 && tail.length > 0 && !output[output.length - 1].trim()) {
        tail.shift();
      }
      return [...output, ...tail];
    };
    // 照原来缩进写出来的，读回去要和要写的任务一模一样（层级、勾、星标、字）；对不上（比如新加的子任务
    // 挂在缩进很怪的任务下面）就整节按统一的缩进写
    const shape = (lines) => {
      const out = [];
      const visit = (todo) => {
        out.push([todo.indent, todo.checked, todo.highlighted, todo.text].join('\u0001'));
        todo.children.forEach(visit);
      };
      this.parseLines(lines).forEach(visit);
      return out.join('\u0000');
    };
    const kept = build(true);
    if (shape(kept) === shape(generatedLines)) return kept.join('\n');
    return build(false).join('\n');
  }

  /**
   * 按文档顺序列出任务块（任务行 + 续行）的行号范围和正文（mergeSectionContent 拿正文配对新旧任务）
   */
  collectTodoBlocks(lines) {
    const blocks = [];
    const visit = (todo) => {
      const lineCount = String(todo.raw || '').split('\n').length;
      blocks.push({ start: todo.line, end: todo.line + lineCount - 1, text: todo.text, indent: todo.indent });
      (todo.children || []).forEach(visit);
    };
    this.parseLines(lines).forEach(visit);
    return blocks.sort((a, b) => a.start - b.start);
  }

  /**
   * 生成唯一 ID
   * @returns {string} UUID v4
   */
  generateId() {
    return crypto.randomUUID();
  }

  hasBroughtMark(markdown) {
    return String(markdown || '').includes(MarkdownParser.BROUGHT_MARK);
  }

  // 在事项标题下面写上「今天带过了」；没有这一节就先加上这一节
  markBrought(markdown, sectionTitle) {
    const text = String(markdown || '');
    if (this.hasBroughtMark(text)) return text;
    const section = this.extractSection(text, sectionTitle);
    if (!section) return `${text.replace(/\s+$/, '')}${text.trim() ? '\n\n' : ''}${sectionTitle}\n${MarkdownParser.BROUGHT_MARK}\n`;
    const lines = text.split('\n');
    // Windows 换行的文件里这一行也带 \r
    lines.splice(section.startLine + 1, 0, MarkdownParser.BROUGHT_MARK + (lines[section.startLine].endsWith('\r') ? '\r' : ''));
    return lines.join('\n');
  }

  /**
   * 归一化标题文本，忽略 # 数量和前后空白
   * @param {string} title
   * @returns {string}
   */
  normalizeTitle(title) {
    return String(title || '')
      .trim()
      .replace(/^#+/, '')
      // 「### 事项 ###」后面收尾的 # 不算标题的字
      .replace(/\s+#+$/, '')
      .trim();
  }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarkdownParser;
}
