# 对抗测试 · 2026-10-25

对象：本机接口（`src/bridge.js`，127.0.0.1:27125）、会员登录（`src/member.js` + 会员站 `/api/yaoji` 的 Obsidian 客户端）。
本机接口在临时测试库里真的打（`scratchpad/sec/attack.cjs` 的做法：Node `http` 直接发请求，Host / Origin 都能随便写）；会员站在本地 Worker 测试里打，线上只发了少量不带登录的探测。

## 打穿了、已修

| # | 严重 | 问题 | 修法 |
|---|---|---|---|
| 1 | 高 | 磁盘不分大小写（macOS 默认）时 `PUT /vault/.OBSIDIAN/plugins/evil/main.js` 写进了真正的 `.obsidian/plugins/`；再写 `community-plugins.json` 就能让 Obsidian 下次启动时跑任意代码 | 任何一段以点开头的路径都拒绝，设置文件夹名不分大小写比较 |
| 2 | 高 | `PUT /vault/.git/hooks/post-commit` 能写 git 钩子（装了 Git 插件的库会执行） | 同上 |
| 3 | 中 | 能写 `.js`、`.html` 等任意类型 | 只能写笔记和附件（md、txt、图片、PDF、音视频） |
| 4 | 中 | 一个扩展的密钥换个扩展来源也能用 | 密钥绑定配对时的扩展来源 |
| 5 | 中 | 任何扩展都能请求配对，弹窗看不出是谁；默认焦点在「允许」 | 不是商店里的今日待办就写出扩展 ID 提醒；默认焦点在「不允许」；拒绝后 30 秒内不再弹 |
| 6 | 低 | `/vault/C:/x.md` 让接口报 500 | 冒号、控制字符、Windows 短文件名（`OBSIDI~1`）一律拒绝 |
| 7 | 低 | 文字文件最大 50 MB | 文字最多 10 MB（附件仍 50 MB） |
| 8 | 中 | 会员站：已登录时 `auto=1` 直接发码。别的应用能认领 `obsidian://`，自带 PKCE 发起授权就能拿到会话 | Obsidian 每次都要在页面上点「确认授权」，页面写明是 Obsidian 插件（会员站 12e2f8873） |
| 9 | 低 | 会员站：Obsidian 客户端也能走邮箱密码登录、注册 | 拒绝，只走授权页 |
| 10 | 低 | 会员站：验证串猜错不作废授权码；开关只认 `off` | 猜错就作废（只对 Obsidian 的码）；`false/0/no/disabled` 也算关 |

## 挡住了的

- 网页：带 `Origin: https://…`、`Origin: null`、跨站预检 → 403；DNS 重绑定（Host 不是 127.0.0.1/localhost:27125）→ 403。
- 没密钥、错密钥 → 401；密钥比较不提早返回。
- 路径穿越：`..`、`%2e%2e`、`..%2f`、`..%5c`、`Daily/../..`、`//.obsidian` → 拒绝或 404。
- 60 MB 请求体中途断开；DELETE 等方法 404。
- 会员站：Obsidian 令牌只能用在 `/api/yaoji`，别的插件接口 403；浏览器扩展来源拿 Obsidian 令牌 401；两种客户端的码不能互换；回调地址的各种变体（结尾 `/`、`?x`、大写、少 `//`、编码）都 400；`plain`、缺 challenge、重放、过期都 400。
- 插件登录回跳：state 对不上或超过 10 分钟不认，别人塞进来的码换不了会话。

## 回归测试

`tests/bridge.test.mjs`（路径、能写的类型、密钥比较），会员站 `test/yaoji-obsidian-client.test.mjs`（不自动授权、不收密码、猜错作废、开关）。
