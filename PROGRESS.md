# PROGRESS

## 最近一次运行总结

> 每次运行结束时更新本节：本次完成了什么、PR 链接、用户醒来要做什么。

- 状态：**任务 1 代码和文档已完成，PR 开启中**（见下方 PR 链接）。任务 2 起尚未开始。
- 本次完成（任务 1）：
  - `docs/手机部署指南.md`：从生成令牌开始，含 `AGENTHUB_SECRET` 备份警告、5 个 Secrets、服务器地址在哪找、App 怎么打开、常见问题。
  - README 重写：workspaces 结构、Cloudflare 主推、Node 版保留、两条 WebSocket、新增适配器位置、v2 加密说明。
  - 测试：core 24 + Node 版 7 + Worker 版 7 全部通过；各包 typecheck 和 App `tsc` 通过；`wrangler deploy --dry-run` 打包成功；用 kill 掉 wrangler 再重启的方式验证了接力任务能续跑。
- PR 链接：（开启后填写）
- 你醒来要做什么：
  1. 按《手机部署指南》生成令牌并填 5 个 GitHub Secrets（这一步只能你自己做）。
  2. 合并任务 1 的 PR 到 `main`，到 Actions 页面看部署结果。
  3. 看下面"待我确认"里的决定。

## 工作规则（来自用户）

- 仓库：chen090728/agent-room。先读本文件，从第一项未完成的任务接着做。
- 用户无法回答问题，连续工作；需要决定时选最合理的方案，把决定和理由记进下面的"待我确认"。
- 每项任务在上一项的基础上新建分支，完成后开 PR 到 `main`。
- 每完成一小步就提交、推送并更新本文件；额度用完前确保进度已保存。
- 所有测试必须通过；做不到的写清原因。
- 每次运行结束时更新上面的"最近一次运行总结"。

## 任务清单

- [x] **任务 1：完成 Cloudflare 部署**（计划已确认），附《手机部署指南》
  - [x] 共用核心 `core/`，Node 版去掉 Fastify，npm workspaces
  - [x] `worker/`：Workers + Durable Objects（SQLite，每群一个 DO），WebSocket 用 Hibernation API
  - [x] Web Crypto AES-GCM 加密，令牌和密钥用 Wrangler secrets
  - [x] GitHub Actions：推送 `main` 自动部署 Worker、自动 `eas update`
  - [x] App：列表连接 `/ws` + 聊天连接 `/ws/groups/:id`；`expo-updates` + `runtimeVersion`
  - [x] `docs/手机部署指南.md`（从生成令牌开始，不写注册；醒目提醒 AGENTHUB_SECRET 要备份）
  - [x] 更新 README（workspaces 结构、Cloudflare 主推、两条 WebSocket、新增适配器位置、加密格式 v2）
  - [x] 跑测试、提交推送、开 PR 到 `main`

- [ ] **任务 2：界面改版**（设计稿 https://claude.ai/artifact/1fdJBVcxUNVTKDhcqCZZiu ）
  - 去掉侧边抽屉，打开应用直接进入"助手和群聊"页：
    - 左上角"我"的头像（进入设置：昵称、头像、服务器地址、访问令牌），头像右边三个 Mac 配色圆点 #FF5F57、#FEBC2E、#28C840（带稍深细描边）
    - 右上角加号新对话
    - 列表混合单聊和群聊，按最近消息排序
    - 底部方块加号弹出"新建助手 / 新建群聊"，右边搜索栏
  - 聊天页左上角菜单回到列表页；群名胶囊里也用 Mac 配色三个点
  - 单聊 = 只有我和一个助手的群；新建助手后自动出现在列表
  - 助手行：头像、名字、角色标签、最后一条消息、右侧模型小图标（LobeHub Icons，先核对许可证；认不出用通用图标，模拟助手不显示）
  - 头像改为"形状 + 颜色"：12 种带白色眼睛的纯色团子、11 种颜色，服务器头像字段改为 `{ shape, color }`；新建助手页加"角色标签"

- [ ] **任务 3：统一的"连接（integrations）"系统 + 连接 GitHub**
  - 写法和成员适配器一致：类型注册、配置表单描述、敏感字段加密、向助手暴露工具
  - 设置里新增"连接"页；GitHub 用细粒度令牌，只显示打码
  - 群聊和单聊可绑定一个仓库；助手通过工具调用读取文件和目录
  - 助手改代码时在新分支提交并开 PR，群里显示确认卡片（文件、增删行数、"同意合并 / 拒绝"），用户点同意才合并

- [ ] **任务 4：上传文件**
  - 聊天里可发图片、PDF、代码文件，存到 Cloudflare R2（Node 版存本地目录）
  - 图片发给支持看图的模型，文本类文件作为内容发送，PDF 先提取文字

- [ ] **任务 5：连接托管平台**
  - 支持 Cloudflare、Vercel、Netlify、Render，PR 合并后自动部署
  - 群里显示部署卡片：状态、预览链接

- [ ] **任务 6：bridge 接入工作助手**
  - 写 bridge 程序：运行在用户自己的电脑或服务器上，主动连接 AgentHub，调用本机已登录的 Claude Code（`claude -p`）和 Codex，结果回传群里
  - 项目不接触任何 Claude.ai 账号凭证；README 说明使用条款需用户自行确认
  - 新建助手页的"工作助手"选项启用，用配对码绑定 bridge

- [ ] **任务 7：公开前打磨**
  - README 加"一键部署到 Cloudflare"按钮、截图、路线图更新

## 待我确认

> 运行中做出的决定和理由记在这里，用户醒来后统一确认。

- **未能用真实账号验证的部分（任务 1）**：这个环境连不上 Cloudflare、Expo、GitHub Actions 的真实服务，也打不开 Expo 文档网站。已验证的是：本地 `wrangler dev`（真实 workerd + Durable Objects）跑通全部端到端测试、`wrangler deploy --dry-run` 打包成功、两个 workflow 里的 shell 步骤用假数据演练过。没验证的是：真实的 `wrangler deploy` / `wrangler secret bulk`、`eas init --non-interactive --force` 与 `eas update --auto --branch main` 在 CI 里的表现、`exp://u.expo.dev/<项目ID>/group/<更新组ID>` 链接能否在手机上直接跳转 Expo Go（eas-cli 源码里只能确认更新页面网址格式）。指南里已对跳转链接标注"未在真机验证"。第一次真实部署失败时，先看 Actions 日志。
- **GitHub Secrets 是 5 个**：除了你说的两个令牌，还需要 `CLOUDFLARE_ACCOUNT_ID`、`AGENTHUB_TOKEN`、`AGENTHUB_SECRET`。理由：部署需要账户 ID；你没有电脑，没法运行 `wrangler secret put`，所以由 Actions 每次部署时把后两个写进 Wrangler secrets。
- **不提供旧数据迁移**：加密格式换成 `v2`（HKDF + AES-GCM），数据库表结构也变了。项目还没真正部署过，所以没写迁移代码，README 里写了"删 data/ 重来"。
- **App 里还没有"删除助手"**：服务器有 `DELETE /api/members/:id`，但 App 没入口。指南里让用户换名字重新创建。任务 2 改版时顺手补一个入口。
- **自动部署只在 `main` 上运行**：`workflow_dispatch` 的"Run workflow"按钮也要等 workflow 文件合并到默认分支才出现，所以必须先合并任务 1 的 PR。
- **工作流用的 Node 22、`eas-version: latest`、`expo-github-action@v8`**：没法在这里确认这些版本号的最新情况，如果 Actions 报版本不存在，改成当时可用的版本。
- **任务分支做法**：任务 1 在 `claude/agenthub-phase1` 上；任务 2 起每项从上一项的分支切新分支（`claude/task-2-...` 等），PR 的 base 先指向 `main`（用户要求）。因此后面的 PR 会包含前面任务的提交，直到前面的 PR 合并。
