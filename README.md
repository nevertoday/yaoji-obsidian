# 今日待办 · Obsidian 插件

今天的待办，放在今天的日记里。

- **自己建好今天的日记**：Obsidian 开着过了零点，或者第二天打开时，建好今天的日记，放好 `### 事项`。已经有日记（日记插件、模板刚建的）就只补这一节，别的不动。
- **把没做完的带过来**：以前没做完的，20 件以内每天第一次自动带到今天，能撤销；多了只说一句，点一下去那天看。
- **随时加一件事**：命令面板里「今日待办：添加待办」，可以绑快捷键。
- **不依赖别的插件**：不用 Local REST API、不用 Periodic Notes、不用 Templater。第一次打开时如果你已经有日记设置，就直接沿用。

文件里就是普通的 Markdown，和浏览器扩展「今日待办」写的一模一样，两边可以一起用：

```markdown
### 事项
- [ ] 买菜
- [x] ==回邮件==
```

## 命令

| 命令 | 做什么 |
|---|---|
| 今日待办：添加待办 | 一行输入，回车加到今天 |
| 今日待办：打开今天 | 打开今天的日记，光标停在事项最后 |
| 今日待办：把没做完的带到今天 | 以前没做完的全部带过来，能撤销 |

勾掉一行用 Obsidian 自带的「切换复选框状态」。

## 设置

日记放在哪、文件名（moment 格式，和日记插件一样）、待办放在哪个标题下。用了日记插件的模板时，多一行「新日记用的模板」。

## 联网和隐私

这个版本不联网，只读写你库里的日记文件。

---

# Today’s To-dos for Obsidian

Keeps today’s to-dos in today’s daily note.

- Creates today’s note (or just adds the `### 事项` heading to the one you already have) when the day changes.
- Carries over what you didn’t finish: up to 20 items automatically once a day, with undo; more than that and it just tells you.
- Adds a to-do from anywhere with the command “Add a to-do”.
- Needs no other plugins. On first run it reuses your daily notes settings if you have them.

The file format is plain Markdown, identical to the “今日待办 / Today’s To-dos” browser extension, so both can work on the same notes.

**Network & privacy:** this version makes no network requests; it only reads and writes daily notes in your vault.
