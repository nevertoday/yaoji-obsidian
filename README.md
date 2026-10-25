# 今日待办 · Obsidian 插件

今天的待办，放在今天的日记里。

- **自己建好今天的日记**：Obsidian 开着过了零点，或者第二天打开时，建好今天的日记，放好 `### 事项`。已经有日记（日记插件、模板刚建的）就只补这一节，别的不动。
- **把没做完的带过来**：以前没做完的，20 件以内每天第一次自动带到今天，能撤销；多了只说一句，点一下去那天看。
- **侧边栏里的今天**：点左边的日历勾图标，右侧栏打开今天。顶上一行输入框，回车加到最后；点方框勾掉，右键星标、删除（能撤销）；鼠标移到日期上可以翻前后一天。
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
| 今日待办：在侧边栏打开 | 右侧栏打开「今天」 |

勾掉一行用 Obsidian 自带的「切换复选框状态」。

## 设置

日记放在哪、文件名（moment 格式，和日记插件一样）、待办放在哪个标题下。用了日记插件的模板时，多一行「新日记用的模板」。

## 和浏览器扩展一起用

电脑版 Obsidian 里，插件在本机开一个只给浏览器扩展用的接口（`127.0.0.1:27125`，别的电脑连不上）。扩展设置里点「连接」，再在 Obsidian 里点「允许」就连上，不用装 Local REST API、不用 API Key 和证书。

- 只认配对过的浏览器扩展；网页发来的请求一律拒绝。
- 读写的只有库里的笔记和附件，碰不到 `.obsidian` 里的设置和插件。
- 设置里能看到连着的浏览器，随时断开。

## 会员功能（可选）

设置 › 会员 里点「登录」，会在浏览器里打开小小东会员站登录，确认后跳回 Obsidian（`obsidian://yaoji-auth`）。登录后：

- **发到 GitHub**：侧边栏里右键一件事 › 发到 GitHub，选项目（打字就能找），这件事变成那个项目的一个问题，问题地址接在这件事后面。
- **问题关了自动打勾**：今天和最近 14 天的日记里发过的事，GitHub 上关成「完成」就自动勾上；关成「不打算做」「重复」的不替你打勾。
- 连接 GitHub、会员到期这些都由小小东会员站判断，和浏览器扩展用的是同一个账号、同一份会员。

## 联网和隐私

- 不登录：插件不连外网，只读写你库里的日记文件；给浏览器扩展的本机接口只在你自己的电脑上。
- 登录后：只在用会员功能时连小小东会员站（`vip.xiaoxiaodong.ai`）：发到 GitHub 时把这件事的标题和文字发给会员站转给 GitHub；定时查发过的问题关没关。日记的其他内容不会发出去。
- 需要账号；会员功能需要付费会员。隐私说明：https://vip.xiaoxiaodong.ai/plugins/yaoji/privacy

---

# Today’s To-dos for Obsidian

Keeps today’s to-dos in today’s daily note.

- Creates today’s note (or just adds the `### 事项` heading to the one you already have) when the day changes.
- Carries over what you didn’t finish: up to 20 items automatically once a day, with undo; more than that and it just tells you.
- A “today” panel in the right sidebar: type and press Enter to add, click to check, right-click to star or delete (with undo), hover the date to page through days.
- Adds a to-do from anywhere with the command “Add a to-do”.
- Needs no other plugins. On first run it reuses your daily notes settings if you have them.

The file format is plain Markdown, identical to the “今日待办 / Today’s To-dos” browser extension, so both can work on the same notes.

**Browser extension:** on desktop the plugin opens a local-only endpoint (`127.0.0.1:27125`) for the companion browser extension. Click “Connect” in the extension and “Allow” in Obsidian; no Local REST API, API key or certificate needed. Only paired extensions are accepted, web pages are refused, and `.obsidian` is never readable or writable through it. Paired browsers are listed in settings and can be disconnected.

**Membership (optional):** sign in from Settings › Member (opens the Xiaoxiaodong member site in your browser, then returns to Obsidian via `obsidian://yaoji-auth`). Signed-in members can send a to-do to a GitHub repository from the sidebar's right-click menu, and to-dos whose issue closes as completed get ticked off automatically.

**Network & privacy:** without signing in, the plugin makes no internet requests; it only reads and writes notes in your vault, and the local endpoint is reachable from your own computer only. When signed in, it talks to `vip.xiaoxiaodong.ai` only for member features: the title and text of a to-do you send to GitHub, and periodic checks of issues you sent. Requires an account; member features require a paid membership. Privacy policy: https://vip.xiaoxiaodong.ai/plugins/yaoji/privacy
