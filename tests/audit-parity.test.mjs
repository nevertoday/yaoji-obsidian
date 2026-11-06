import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import MarkdownParser from '../src/vendor/markdown-parser.js';
import G from '../src/vendor/github-issues.js';

// 扩展问题清单（2026-11-06）里插件也有的几条：星标 L5/L6、⌘ 点链接 L13、「两个都要」G5、发两次 G15
const view = readFileSync(new URL('../src/view.js', import.meta.url), 'utf8');
const github = readFileSync(new URL('../src/github.js', import.meta.url), 'utf8');
const parser = new MarkdownParser();

test('L5 / L6: stars survive on tasks with == and on multi-line tasks', () => {
  for (const text of ['1+1==2', '结尾是=', '第一行\n第二行']) {
    const note = parser.todosToMarkdown([{ checked: false, text, highlighted: true, indent: 0, children: [] }]);
    const back = parser.parseTodos(note)[0];
    assert.equal(back.highlighted, true, `${JSON.stringify(text)} → ${JSON.stringify(note)}`);
    assert.equal(back.text, text);
  }
});

test('L13: ⌘ / Shift on a link opens the link instead of picking the row', () => {
  assert.match(view, /if \(event\.target\.closest\('\.yaoji-edit, \.yaoji-grip, a'\)\) return;/);
});

test('G5: every issue on a task gets its own badge and menu row; tick only when all are closed', () => {
  assert.match(view, /for \(const item of issues\) \{\n\s+if \(seenIssues\.has\(item\.url\)\) continue;/);
  assert.match(view, /for \(const issue of live\) \{/);
  assert.match(view, /if \(!live\.length && github\?\.ready\(\) && file\) \{/);
  assert.match(github, /for \(const act of entry\.acts \|\| \[entry\]\) \{/);
  const url1 = 'https://github.com/me/a/issues/1';
  const url2 = 'https://github.com/me/b/issues/2';
  const entries = [{ todoId: 't', filePath: 'd.md', url: url1, repo: 'me/a', number: 1 }, { todoId: 't', filePath: 'd.md', url: url2, repo: 'me/b', number: 2 }];
  const closed = (repo, number) => ({ repo, number, state: 'closed', stateReason: 'completed', closedAt: '2026-11-06T01:00:00Z' });
  assert.equal(G.todosToTick(entries, [closed('me/a', 1), { repo: 'me/b', number: 2, state: 'open' }], {}).length, 0);
  const both = G.todosToTick(entries, [closed('me/a', 1), closed('me/b', 2)], {});
  assert.equal(both.length, 1);
  assert.deepEqual(both[0].acts.map((act) => act.url).sort(), [url1, url2]);
});

test('G15: a send that got no reply reuses its dedupe key, so trying again makes only one issue', () => {
  assert.match(github, /dedupeKey: manual\.key/);
  assert.match(github, /if \(!waited\) this\.manualKeys\.delete\(manual\.slot\);/);
  assert.match(github, /run: \(\) => this\.send\(\{ file, todo, path, repo \}\)/);
});
