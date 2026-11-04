# PROGRESS

## 长期工作方式（一直按这个做）

完成任务后：所有测试通过就**自行把 PR 合并到 `main`（用 merge commit）**；然后检查 GitHub Actions 的**服务器部署**和 **App 发布**是否成功，失败就修复直到变绿；最后告诉用户结果和需要在手机上检查的地方。

**Grok Bot 开的 PR 都由我检查后合并**（同样用 merge commit），合并后确认部署和发布成功。

**用户说"合并 #xx"时：目标是尽早部署，只做快速检查，不再问用户。**
1. 快速检查（几分钟内完成，不做浏览器预览、不逐行细审）：测试和类型检查通过；没有冲突，有冲突就直接解决；扫一眼改动，确认没有会闪退、泄露密钥、删掉别人的功能、引入 Expo Go 不支持的原生库这类严重问题。
2. 立即合并到 `main`（用 merge commit）。
3. 确认 GitHub Actions 的服务器部署和 App 发布成功，失败就修复直到变绿。
4. 完成后用一两句话告诉用户结果，以及需要在手机上检查的地方。

小问题（代码风格、可以更好的写法）不拦着合并，记到下面的"以后再改"里。只有发现严重问题时才停下来告诉用户。

## 最近一次运行总结

> 每次运行结束时更新本节：本次完成了什么、PR 链接、用户醒来要做什么。

- 状态：**PR #12（`fable/app-smoothness`，整体流畅度）已合并到 `main`**。#11 的发送路径（乐观上屏、重试、`clientKey`、触觉、`outgoing.ts`）保留。
- 做了什么：
  1. 进聊天和打开首页都先用本机缓存画出内容。整份 App 只保持一条 `/ws`。断线超过 1 秒才在顶部显示一条小横幅。
  2. 首页和聊天页的「+」都从按钮本身长成圆角卡片，关上时缩回去。
  3. 新建助手的头像：小点轻跳、带粒子，再弹簧放大；换形状或颜色也是弹簧。动画在 UI 线程上。
  4. 页面转场用系统原生 push；转场结束后才拉历史和插件。底部卡片弹簧更软；内容滚到顶后继续下拉会关掉卡片。卡片里的列表没有回弹（这个取舍保留）。
  5. 服务器把聊天事件（新消息、卡片更新、正在输入、接力）复用到同一条 `/ws` 上，信封是 `{ type: 'chat', event }`，`event` 原样转发，未知字段（以后的 `notice`）不会被拆掉。认证帧和之后的 `subscribe` 可以多带字段（以后的 `lang`），这一版不解释它们。旧的 `/ws/groups/:id` 还在。
- 验证：App `tsc`、`npm test`（19）、`check:animations` 通过。core 121、Node 端到端 16、Worker（含 wrangler）19 通过，三边 `tsc` 通过。没有在 Expo Go 里看过。
- 新增依赖：**没有**。新增用户可见文案：**没有**。横幅仍是 `ConnectionBanner.tsx` 里的「连接中…」和「与服务器断开，正在重连…」。
- 你要做什么：按 PR #12 说明里的手机对照清单在 Expo Go 里对一下。决定见下面「App 手感」。
- 更早的任务 1–7 的总结在 git 历史里（PR #1–#7 的说明也有）。

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

- [x] **任务 2：界面改版**（设计稿 https://claude.ai/artifact/1fdJBVcxUNVTKDhcqCZZiu ）
  - 去掉侧边抽屉，打开应用直接进入"助手和群聊"页：
    - 左上角"我"的头像（进入设置：昵称、头像、服务器地址、访问令牌），头像右边三个 Mac 配色圆点 #FF5F57、#FEBC2E、#28C840（带稍深细描边）
    - 右上角加号新对话
    - 列表混合单聊和群聊，按最近消息排序
    - 底部方块加号弹出"新建助手 / 新建群聊"，右边搜索栏
  - 聊天页左上角菜单回到列表页；群名胶囊里也用 Mac 配色三个点
  - 单聊 = 只有我和一个助手的群；新建助手后自动出现在列表
  - 助手行：头像、名字、角色标签、最后一条消息、右侧模型小图标（LobeHub Icons，先核对许可证；认不出用通用图标，模拟助手不显示）
  - 头像改为"形状 + 颜色"：12 种带白色眼睛的纯色团子、11 种颜色，服务器头像字段改为 `{ shape, color }`；新建助手页加"角色标签"

- [x] **任务 3：统一的"连接（integrations）"系统 + 连接 GitHub**
  - 写法和成员适配器一致：类型注册、配置表单描述、敏感字段加密、向助手暴露工具
  - 设置里新增"连接"页；GitHub 用细粒度令牌，只显示打码
  - 群聊和单聊可绑定一个仓库；助手通过工具调用读取文件和目录
  - 助手改代码时在新分支提交并开 PR，群里显示确认卡片（文件、增删行数、"同意合并 / 拒绝"），用户点同意才合并

- [x] **任务 4：上传文件**
  - 聊天里可发图片、PDF、代码文件，存到 Cloudflare R2（Node 版存本地目录）
  - 图片发给支持看图的模型，文本类文件作为内容发送，PDF 先提取文字

- [x] **任务 5：连接托管平台**
  - 支持 Cloudflare Pages、Vercel、Netlify、Render，PR 合并后跟踪部署（平台没自动部署时能触发的会触发）
  - 群里显示部署卡片：状态、预览链接

- [x] **任务 6：bridge 接入工作助手**
  - 写 bridge 程序：运行在用户自己的电脑或服务器上，主动连接 AgentHub，调用本机已登录的 Claude Code（`claude -p`）和 Codex，结果回传群里
  - 项目不接触任何 Claude.ai 账号凭证；README 说明使用条款需用户自行确认
  - 新建助手页的"工作助手"选项启用，用配对码绑定 bridge

- [x] **任务 7：公开前打磨**
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

### 任务 2 的决定

- **右上角加号"新对话" = 新建群聊。** 设计稿里这个按钮只有"新对话"的名字，没说明去哪。单聊在助手创建时已经自动出现，所以"新对话"只剩新建群聊有意义。底部左下角的菜单仍然提供"新建助手 / 新建群聊"。
- **单聊是 `kind: 'direct'` 的群。** 这样单聊复用群的全部机制（消息、接力、WebSocket）。单聊里没有 @ 也会回复给唯一的助手；单聊的成员不能改；删除助手会连它的单聊一起删（消息数据留在 Durable Object / 本地库里不清理）。
- **数据库迁移是真写了的。** 你可能先部署任务 1 再合并任务 2，所以旧库（成员只有 color、群没有 kind）会在启动时自动升级，并给已有助手补单聊（`core/test/coordinator.test.ts` 里有迁移测试）。旧颜色保留为新调色板里的同名颜色，`graphite` 变成 `gray`，并按旧颜色分配一个形状。
- **我的昵称和头像只存在手机本地**，没有传给服务器。模型看到的"用户名"还是服务器的 `USER_DISPLAY_NAME`。如果你想让模型看到自己设的昵称，需要加一个 `PUT /api/profile`（放到后面）。
- **打开应用不再自动进入上次的群聊**，按你的要求直接进列表。
- **单聊的输入栏暂时没有"+"按钮**（设计稿里有"添加附件或点名"）。单聊没人可 @，附件上传是任务 4，到时再放回来；群聊里的"+"仍然是 @ 选择器。
- **"工作助手"选项仍然灰显**，任务 6 才启用。
- **模型小图标**：用 `@lobehub/icons-static-svg`（MIT）里的 17 个品牌图标，把 SVG 路径内嵌进 `app/src/modelIcons.ts`；按模型名（如 `claude-…`、`gpt-…`）再按接口地址判断提供方，认不出用通用图标，模拟助手不显示。许可证全文和商标说明在 `THIRD_PARTY_NOTICES.md`。
- **头像的歪眼睛旋转直接算进路径里**，没有用 react-native-svg 的 `rotation`/`origin` 属性（网页预览里这两个属性会报 DOM 警告）。
- **没能在真机上验证的**：所有界面只在浏览器（react-native-web）里渲染核对过，没在 Expo Go 真机上看。键盘弹起时底部搜索栏和输入栏的位置、手势返回、`boxShadow` 在 Android 上的效果需要你在手机上看一眼。
- **设置页的默认头像**：没选过头像时显示灰色人形；一旦在选择器里点了形状或颜色就变成团子，点"使用默认头像"可以还原。选择器在"未选择"状态下仍会高亮默认的云朵和青色，这是个小瑕疵，没处理。

### 任务 3 的决定

- **只用假 GitHub 验证过，没连过真实 GitHub。** 这个环境连不上 github.com 的 REST API，所以用 `core/test/fake-github.ts`（内存里模拟 `/user`、`/user/repos`、contents、Git Data、pulls、merge 等接口）做端到端测试。风险点是真实 GitHub 的细节可能和我模拟的不同：例如细粒度令牌对 `/user` 的访问权限（代码里 `/user` 返回 403/404 时会退回用 `/user/repos` 验证）、`/git/trees` 的 `base_tree` 用提交的树 SHA、`/pulls/:n/files` 的字段。第一次用真令牌失败时，先看错误提示，里面带有 GitHub 返回的信息。
- **App 里"创建细粒度令牌"的步骤说明**是按我印象里的 GitHub 网页写的（Settings → Developer settings → Personal access tokens → Fine-grained tokens；权限 Contents 和 Pull requests 读写），没法在这里核对，GitHub 改版后可能对不上。
- **一个对话绑定一个仓库**，绑定保存在群的 `binding` 字段里（单聊和群聊一样）。群里所有"OpenAI 兼容"助手都能用这些工具；模拟助手没有工具。
- **助手只有三个工具：读目录、读文件、开 PR。没有合并工具**，合并只能由用户点卡片按钮触发（接口 `POST /api/groups/:id/messages/:mid/card`，助手无法调用）。App 里点"同意合并"前还会再弹一次确认。
- **助手不能改 `.github/workflows/`**：CI 工作流带着仓库密钥运行，让模型改它风险太大，工具里直接拒绝并报错。
- **合并方式是 squash，合并或拒绝后会删除临时分支**（尽力而为，删不掉不影响结果）。分支名形如 `agenthub/<标题的英文缩写>-<6位随机>`。
- **模型不支持函数调用时自动降级**：第一次请求带 `tools` 被服务返回 400/422 时，去掉 `tools` 重试，当普通回复处理。工具调用最多 6 轮，最后一轮强制用文字回答。
- **Cloudflare 免费档每次调用最多 50 个外部请求（subrequest）**，我没有做硬性限制：一次开 PR 大约 8 个 GitHub 请求，加上读文件和模型请求，正常用不会碰到，连续读很多文件可能超。碰到时助手会在群里报错，不会崩。
- **卡片状态只在你点按钮时和 GitHub 同步**：如果你直接在 GitHub 上合并或关闭了 PR，卡片要等你点一下按钮才会更新（点的时候会先查 GitHub 的真实状态再决定）。
- **查到并修了一个只在 Cloudflare 上出现的问题**：把 `fetch` 存成对象属性再用 `this.fetchImpl(...)` 调用，Workers 会报 "Illegal invocation"（Node 不会），Worker 版端到端测试发现了它，已改成不带 `this` 调用。
- **"群成员"页改成了"对话设置"页**（路由 `/chat/[id]/settings`）：同时放群成员（仅群聊）和仓库绑定。单聊点顶部胶囊现在也能进（以前不能）。
- **跨平台的确认 / 提示小工具 `app/src/dialogs.ts`**：原生用 `Alert`，网页用 `confirm/alert`。原因是 react-native-web 里 `Alert.alert` 是空实现，网页预览没法测确认流程。
- **接口地址字段（可选）**：GitHub 连接多一个可选的"接口地址"，默认 `https://api.github.com`，可以填 GitHub Enterprise 的地址；测试里也靠它指向假服务器。

### 任务 4 的决定

- **R2 做成可选，部署流程自动探测。** 理由：R2 在 Cloudflare 上要单独开通，我印象里开通时可能要求绑定付款方式；如果把它写死进 `wrangler.jsonc`，没开通 R2 的用户第一次部署就会失败。做法是 `worker/scripts/make-config.mjs` 生成带 R2 绑定的临时配置，部署流程先 `wrangler r2 bucket create agenthub-files`，成功（或已存在）才用它部署。**这些我没法在真实账号上验证**：`wrangler r2 bucket create` 的失败提示、"Edit Cloudflare Workers"令牌模板是否自带 R2 权限（我假设没有，所以指南要求加一条 R2 编辑权限）、开通 R2 是否要付款方式，都需要你实测。
- **文件通过"原始请求体"上传**（头里放类型和 URL 编码的文件名），没用 multipart，省掉解析；App 端用 `fetch(uri).blob()` 再 POST，不依赖 `expo-file-system`。
- **PDF 提取在 Durable Object 里做，不在前端 Worker 里**：免费档前端 Worker 每次请求只有约 10ms CPU，解析 PDF 会超；文件字节由前端直接写进 R2，再通知 GroupDO 去读取并提取。`unpdf` 打进 Worker 后压缩约 0.5 MB，远低于免费档 3 MB 上限。
- **图片缩略图用签名链接显示，不用请求头认证**：react-native-web 的 `<img>` 带不了请求头，原生 `Image` 虽然支持 `headers`，但行为不一致；签名链接 10 分钟有效，各平台一致。
- **不接受 SVG**（可以带脚本），文件类型和 `Content-Type` 由服务器决定并带 `nosniff` 和严格的 CSP；文件名会清理路径和控制字符。
- **上限**：单文件 10 MB，每条消息 6 个；发给模型的最多最近 4 张图片（每张 ≤ 5 MB），文本文件单个 3 万字符、合计 10 万字符。App 选图时用 `quality: 0.7` 压缩。这些数字是我定的，没有依据某个模型的具体限制。
- **"支持看图"开关默认开，模型拒绝图片（400/422）时自动去掉图片重试一次**，所以对不支持看图的模型也不会直接报错。
- **没有清理孤儿文件**：上传了但没发送的文件（比如发送前移除、或上传后关了 App）会留在存储里。第一阶段用量很小，没做清理任务，后面可以按"超过 N 天没被消息引用"清理。
- **文件按群聊分开存放**（键是 `群id/文件id`），文件 id 是随机 UUID；删除助手时不删除它单聊里的文件。
- **只在浏览器里验证了选文件**：用 Playwright 在 react-native-web 上真的选了图片、Markdown 和 PDF。手机上的相册选择器（`expo-image-picker`）和文件选择器（`expo-document-picker`）没在 Expo Go 真机上试过。另外，这个沙箱里的 Chromium 选中文文件名的文件时只选中了一部分（换成英文文件名就正常），我判断是沙箱问题；中文文件名在服务器的端到端测试里是覆盖了的。

### 任务 5 的决定

- **"自动部署"= 跟踪平台自己的自动部署，必要时触发。** 项目在平台上连着 GitHub 仓库，合并到默认分支后平台本来就会自动部署，所以 AgentHub 不重复触发，只按提交号找到那次部署并跟踪。理由：重复触发会产生两次部署。Netlify、Render、Cloudflare Pages 在约 90 秒（9 次查询）还没出现对应部署时，会主动触发一次；Vercel 没有这样的简单接口，所以只能依赖它自己的自动部署，约 5 分钟找不到就在卡片上提示"请确认项目连接了仓库并开启自动部署"。
- **只跟踪通过 AgentHub 卡片合并的 PR。** 在 GitHub 网页上直接合并不会有部署卡片。理由：不想为此去订阅 GitHub webhook（那需要你在 GitHub 里配置，而且手机上很麻烦）。
- **用轮询，不用 webhook。** 每个平台都能按提交号查到部署；轮询在 Node 版（定时器）和 Cloudflare 版（Durable Object alarm）都能工作、不需要你配置任何东西。默认 10 秒一次，最长跟踪约 20 分钟（120 次），连续 5 次请求出错就停止并写明原因。进度存在数据库里，服务器重启后会接着查。
- **部署项目绑定在对话上**（和代码仓库并列），一个对话一个仓库 + 一个部署项目。设置页的"部署平台"只在已绑定仓库后出现。
- **绑定接口改成"部分更新"**：`repo`、`deploy` 两个键都可省略（保持不变），`null` 清除。旧的只传 `repo` 的 App 仍然能用。删除某个连接会清掉用到它的仓库或部署绑定，另一个保留。
- **每个平台多一个可选的"接口地址"字段**（同 GitHub），测试里靠它指向假服务器，一般不用填。
- **没有用真实平台验证。** 四个平台的接口路径和字段是我按它们的公开文档和记忆写的，测试用的是我自己写的假服务器（`core/test/fake-platforms.ts`）：如果真实返回的字段名和我假设的不一样（比如 Vercel 的 `meta.githubCommitSha`、Render 的 `commit.id`、Cloudflare 的 `deployment_trigger.metadata.commit_hash`、Netlify 的 `commit_ref`），部署卡片会一直找不到部署，最后显示"没有等到平台开始部署"。第一次真实使用时如果出现这种情况，把平台返回的部署 JSON 发给我就能对上。Render 完成后的预览链接取的是服务地址，Netlify 取的是该次部署的专属地址。
- **同一次合并只发一张卡片；卡片状态随平台更新原地变化**（消息里的 `card` 被更新并推送 `message_updated`），群列表的最后一条消息预览也同步变化。

### 任务 6 的决定

- **bridge 是 `bridge/` 里的独立 Node 程序（npm workspace），打成单个 `dist/agenthub-bridge.cjs`。** 理由：用户要把它跑在自己的电脑上，单文件最容易复制；用 CommonJS 是因为把 `ws` 打进 ESM 包会报 `Dynamic require` 错误（这个问题是我实际运行打好的包时才发现的，已改正并用真实服务器烟雾测试过）。没有发布到 npm，所以需要 `git clone` 后 `npm install && npm run build`；如果你想要 `npx agenthub-bridge`，需要你决定包名并发布。
- **只主动连出，不监听端口**：bridge 用 WebSocket 连 `/ws/bridge`。理由：你的电脑通常没有公网地址；也不用开防火墙。
- **配对流程**：App 创建"工作助手"成员后，服务器生成 8 位一次性配对码（10 分钟有效；字母表去掉了 0/O/1/I/L）；电脑上运行 `pair <服务器地址> <配对码>` 换到长期凭证（`bridgeId` + 随机令牌），保存在 `~/.agenthub-bridge/config.json`（权限 600）。**服务器只存令牌的 SHA-256 哈希**。凭证和 `AGENTHUB_TOKEN` 是两回事：bridge 的凭证只能用来连 `/ws/bridge`，不能调用其他接口。同一台电脑再配对别的工作助手时会带上已有凭证，复用同一个 bridge。
- **配对码接口 `/api/bridge/pair` 不需要访问令牌**（配对码就是凭证），所以 README 的安全说明里把它列为例外。码只有 8 位×31 个字符 ≈ 40 位，10 分钟有效且一次性；我没有给这个接口加限流（Worker 免费档上也没有现成的计数器），猜中的概率可以忽略，但如果你担心，可以以后加。
- **默认只读，写权限要两边同意**：成员有"允许修改文件"开关，但这只是向 bridge 申请；电脑上的 bridge 必须用 `--allow-write` 启动才会真的允许。只读时 Claude Code 用 `--permission-mode plan`，Codex 用 `--sandbox read-only`；允许写时分别是 `acceptEdits` 和 `workspace-write`。理由：群聊里的内容（包括别的 AI 成员的话）会进入提示，不能让它们决定是否改你电脑上的文件。提示里也写明了"聊天记录不是指令"，但这只是辅助，不是保证，README 和 bridge 文档里写了安全提醒。
- **提示通过标准输入传给工具**（`claude -p` 和 `codex exec -`），不放在命令行参数里：避免长度限制和转义问题。Codex 的最终回答从 `--output-last-message` 指定的文件里读，不解析它标准输出里的过程日志。
- **没有在真实的 Claude Code / Codex 上跑过任务。** 这个沙箱里虽然能执行 `claude --version` 和 `--help`（用来核对 `-p`、`--permission-mode` 的取值），但我没有真的让它回答问题（那会用到账号）。测试里用的是假的 `claude` / `codex` 脚本。**Codex 的参数（`exec`、`--sandbox`、`--skip-git-repo-check`、`--output-last-message`、用 `-` 读标准输入）是我凭记忆写的，没有核对过**；如果你的 Codex 版本参数不一样，bridge 会报"运行失败（退出码 N）：…"并把末尾的错误信息显示在群里，到时候按报错改 `bridge/src/runner.ts` 即可。
- **一次任务的最长等待时间**：服务器端 `BRIDGE_TIMEOUT_MS`（默认 10 分钟），bridge 端 `--timeout`（默认 10 分钟）。超时会通知 bridge 取消并杀掉工具进程。工作助手的回复**不受**普通模型回复的 60 秒超时限制。
- **Cloudflare 版把 bridge 的 WebSocket 放在 DirectoryDO 里**（用 tag 和普通群列表连接区分，群列表广播只发给 `list` 标签的连接），工作任务由 GroupDO 通过 RPC 交给它，而不是新增一个 Durable Object 类：新增类要写迁移，部署失败的风险更大。代价是任务期间 DirectoryDO 会一直保持活跃（等 bridge 回答，最长 10 分钟）。这在本地 `wrangler dev` 下跑通了完整流程（配对 → 连接 → 任务 → 失败 → 中途断线），没有在真实 Cloudflare 上验证；真实环境里如果 Durable Object 被迁移或重启，正在进行的任务会失败并显示"断开"。
- **只支持文字**：图片、PDF 等附件在工作助手的提示里只会以文字说明出现（文本和 PDF 提取的文字会带上，图片只写文件名）。
- **没有"解除配对 / 吊销 bridge"的界面**：要停用一台电脑，可以删除这个工作助手（它的配对码和成员记录会一起删掉，但 bridge 记录仍留在数据库里，凭证只能连接、不能做别的）。如果需要，以后加"吊销 bridge"。
- **App 的配对页只显示命令，不能一键复制**（可以长按选中）。网页预览截图核对过页面，手机上的体验没验证。
- **App 网页预览的小改动**：`expo-secure-store` 没有网页实现，所以 `storage.ts` 在网页上改用 `localStorage` 存令牌（手机上仍然是系统钥匙串）。这只影响开发时的网页预览，用来截图核对界面。

### 任务 7 的决定

- **"Deploy to Cloudflare"按钮指向仓库根目录，而不是 `worker/`。** 我查了 Cloudflare 文档：按钮带子目录时，应用必须在这个子目录里完全独立（包括依赖），否则构建失败；我们的 Worker 依赖仓库里的 `core/`，所以不能指向 `worker/`。做法：在根目录加了一份 `wrangler.jsonc`（和 `worker/wrangler.jsonc` 内容一致，只有入口路径不同，有测试保证两份同步）、`.dev.vars.example`（让按钮提示填 `AGENTHUB_TOKEN`、`AGENTHUB_SECRET`），以及根 `package.json` 里的 `deploy` 脚本和 `cloudflare.bindings` 说明。根目录 `wrangler deploy --dry-run` 打包成功。**但按钮本身没法在这里点，所以真实效果没验证**，README 里标成"实验"并写明限制：没有 R2、不发布 App、更新靠 Cloudflare 自己的 Git 构建。推荐的方式仍是 GitHub Actions。
- **截图是用假数据生成的**（模拟的 GitHub / Vercel、脚本化的"模型"、模拟成员），在浏览器里用 react-native-web 渲染，不是手机真机截图；README 里注明了。截图里部署卡片的提交号显示成 `commit-`，是因为假 GitHub 的提交号形如 `commit-3`，真实的 40 位提交号会显示前 7 位。
- **路线图只写了"想做"，没有时间承诺**。"流式回复"和"语音输入"是你在第一阶段明确去掉的，放在了路线图里。
- **加了 `SECURITY.md`**（私下报告漏洞的方式），没有加 CONTRIBUTING、issue 模板或徽章：许可证是 Elastic License 2.0，不是 OSI 意义上的开源，我不想在你没决定前写太多"欢迎贡献"的话。
- **仓库扫描**：查了常见密钥格式（`sk-`、`ghp_`、`github_pat_`、AWS Key），没有命中；`.env`、数据库文件没有被 git 跟踪。

## 界面改版（底部卡片、聊天页顶部、插件入口）

- **底部卡片不是路由，是根部的一个"卡片层"**（`app/src/sheets.tsx`）。理由：要让卡片后面的整个 App 缩小变暗，卡片本身就必须在被缩放的内容之外；用 expo-router 的 modal 路由做不到。卡片层用 reanimated + gesture-handler：弹簧滑入、拖住顶部下拉、超过 110px 或速度够快就关，不够就带回弹地弹回去；下拉时背景的缩放和变暗跟着连续变化。
- **首页是 Grok Bot 的，我没有改**。首页仍然 `router.push('/settings')`、`'/group/new'`，所以这几个路由保留成"隐形路由"：打开即返回并弹出对应的卡片（`sheetRoute.ts`）。首次连接服务器（还没有地址）时 `/settings` 仍是全屏页面。
- **气泡菜单已统一成一个**：保留 Grok Bot 的 `components/BubbleMenu.tsx`（从加号位置缩放弹出），我自己做的那个删了；加了共用的 `useBubbleAnchor` 量出加号位置，首页和聊天页都用它；点菜单项时菜单会自动关闭。
- **头像预览的"变形"是淡入淡出 + 弹出，不是真正的路径变形。** 12 种形状的 SVG 结构各不相同，真正逐点变形要重画每个形状；现在是：第一次出现时从小点弹簧放大，切换形状或颜色时旧的淡出、新的从 0.72 倍弹出叠上去。
- **我的头像**：拍照或相册 → 系统自带的方形裁剪 → 居中裁成正方形并缩到 256 像素 JPEG → 以 data URI 存在本机 AsyncStorage（不上传服务器）。显示时是圆形。原来给"我"选形状颜色的界面去掉了（旧的设置仍然会显示）。
- **助手头像上传图片**：创建助手后，把图片传到这个助手自己的单聊（走现有上传接口），再用新接口 `PUT /api/members/:id/avatar-image` 让头像指向它。因为上传文件的下载链接 10 分钟过期，App 端按图片缓存链接、过期前重新取（`avatarImages.ts`）。健康检查返回 `files`，没有文件存储（没开通 R2）时 App 隐藏"上传图片"。
- **"设置里看不到部署平台"的原因**：我在代码里没有找到把它们隐藏的地方，能解释的有三点：① 部署平台原来在 设置 → 连接 → 添加连接 里，而设置页那一行的说明只写了"GitHub"；② 对话设置里的"部署平台"一栏要先绑定了 GitHub 仓库才出现；③ **可用的连接类型是服务器告诉 App 的**——如果你手机连的 Cloudflare 服务器还是任务 5 合并之前的版本，它根本不会列出这四个平台。我没法从这里看你的服务器是哪个版本。现在入口改到了输入框的"插件"：五个插件永远都列出来，如果服务器不支持某个，会明确写"这个服务器还不支持它，请先更新服务器"。如果你看到这句话，重新部署一次服务器就行。
- **插件的流程**：未连接 → 填令牌（带获取令牌的说明，沿用原来的文字）→ 验证成功后直接进入选仓库 / 选项目；已连接 → 直接选；同一类型有多个连接时顶部有切换。部署平台要先绑定 GitHub 仓库（因为部署是在合并 PR 后才跟踪的），没绑定时显示原因并禁用。每个连接页底部有"断开连接"。
- **卡片只能拖顶部（把手和标题栏）关闭**，不能在滚动内容上直接下拉关闭：内容里的滚动和下拉手势在 Expo Go 里很容易互相抢，我选了更稳的做法。
- **没有在真机上验证。** 我在浏览器里（react-native-web）跑了交互测试：打开 / 拖动关闭 / 回弹 / ×、气泡菜单、插件列表和连接 / 绑定 / 详情、设置（选照片）、消息进入。动画的手感（弹簧、跟手、键盘弹起时卡片内的输入框）、拍照、相册裁剪这些只有真机能看。`expo export` 能打出 iOS 和 Android 包。
- **新增依赖**：`expo-image-manipulator`（裁剪缩小头像）。`app.json` 加了 `expo-image-picker` 插件及相册 / 相机权限说明文字（独立构建时才需要，Expo Go 不受影响）。

## 修复：键盘挡住输入框、发送消息闪退、错误记录

- **闪退的原因**：PR #9 里消息进入动画用了 Reanimated 的 `Keyframe`，它的 `easing` 写成了普通 JS 函数。Keyframe 的缓动在 UI 线程上执行，必须是 Reanimated 自带的 `Easing.*`（worklet）；开发模式下 Reanimated 会报错提醒，但手机上跑的是发布版（EAS Update），没有这个检查，一发消息动画启动就崩溃。浏览器预览里 worklet 跑在普通 JS 线程上，所以我之前没测出来。新建助手的头像切换动画有同样的问题，一起修了。
- **修法**：消息进入动画改成"挂载时启动的动画样式"（不用 layout 动画，也就不在倒序 FlatList 里跑原生 layout 动画）；所有缓动都用 `Easing.*`。新增 `app/scripts/check-animations.mjs`，检查所有 `easing:` 都是 `Easing.*`，EAS Update 发布前会先跑它（我用旧代码验证过它能抓到这次的问题）。
- **键盘**：原来的 KeyboardAvoidingView 按"相对父视图"的位置计算要让出多少空间，放进会缩放的 App 外框和底部卡片之后就算错了。改成 `components/KeyboardAvoider.tsx`：用 Reanimated 的 `useAnimatedKeyboard` 直接拿键盘高度，把底部垫高，跟着键盘一帧一帧移动。聊天页、首页搜索栏、所有底部卡片（新建助手、新建群聊、设置、插件连接）都换成了它。`useAnimatedKeyboard` 在 Reanimated 4 里标了"建议改用 react-native-keyboard-controller"，但我不能确定 Expo Go 里有没有带那个库（没带的话 App 一打开就崩），所以先用 Reanimated 自带的这个，它肯定能在 Expo Go 里用。
- **错误记录**：出现 JS 错误时（未捕获的错误，或界面渲染出错）把错误信息同步写进本机的安全存储（同步写是为了在 App 被关掉前写完），设置页会显示"上次错误"（时间、类型、信息、前几行调用栈），可以截图，也可以清除。另外加了全局错误边界：界面出错时显示"出错了"页面（带错误信息、"重新加载"和"再试一次"），而不是直接闪退。**限制**：原生层的崩溃（不经过 JavaScript 的）记不下来；这次的崩溃发生在 UI 线程上，属于这一类，所以就算当时有这个功能，也可能记不到。
- **没有真机验证**：键盘的位置和跟随、发送消息不再闪退，都需要你在 iPhone 上确认。浏览器里验证了：发 "hi" 和第二条消息、收到小绿的回复、设置页显示和清除"上次错误"。

## App 手感（fable/app-smoothness）

- **整份 App 只留一条 WebSocket（`/ws`）。** 聊天事件现在也走这条连接：服务器在原来发给 `/ws/groups/:id` 的同一个对象外套一层 `{ type: "chat", event }`，再发给所有 `/ws`。不重新拼字段，所以以后消息上的 `notice` 会原样到 App。认证可以写成 `{ type: "auth", token, lang }`，hello 之后也可以发 `{ type: "subscribe", ... }`；多出来的键先存着，这一版不按语言分支。旧 App 不认识 `chat`，会忽略；`/ws/groups/:id` 仍推裸事件，旧客户端不用改。Node 和 Cloudflare 都做了。已经打开过的聊天，转场结束后仍会用 HTTP 补一次历史；HTTP 合并会更新已经在屏幕上的旧卡片，并保住 `clientKey`。从没打开过的聊天不会在启动时预拉全文。
- **缓存按服务器地址分开**，键是 `agenthub.room.v1.${地址}`，每个群最多留最近 80 条。还在发送中或发送失败的消息（带 `delivery`）不写入磁盘。每条都留着 `clientKey`（没有就用消息 id），方便和 PR #11 的列表 key 接上。和设置一起读进来，避免设置那次更新把缓存清掉。断开连接只清内存，不删磁盘缓存。
- **「连接中」横幅**：离开在线满 1 秒才出现，在「连接中」和「已断开」之间切换不会重新计时。文案只有两句，都在 `ConnectionBanner.tsx`：「连接中…」（原来在首页顶栏）、「与服务器断开，正在重连…」（原来在聊天页）。首页的「离线」和聊天页的「正在连接服务器…」去掉了。历史还没从缓存或网络回来时，列表中间不再写「加载中…」（空白），避免整页被占住；群本身还不在列表里、而且列表也还没加载完时，整页「加载中…」还在。
- **「+」菜单**用现有主题色（`colors.surface`、`colors.hairline`、`shadows.popover`），没有改 `theme.ts` 的结构。菜单弹簧期间真正的加号按钮先藏起来，避免缩回去时和按钮叠成两个。
- **底部卡片内容区关掉了回弹**（`bounces={false}`）。不关的话，iOS 的回弹会把「滚到顶再往下拉」吃掉，卡片关不掉。代价是卡片里的列表不再有橡皮筋。第一次设置页不在卡片里，那里仍是普通滚动。内容区下拉关闭是手势和原生滚动叠在一起，**没有在真机上试过**；拖标题栏关闭仍走原来的弹簧。
- **转场后再干活**：听导航的 `transitionEnd`，480 毫秒兜底（网页或 replace 可能不发这个事件）。原生栈的转场经常不算 InteractionManager 的交互，所以没有只用它。
- **没有新增依赖。** 测试脚本改成跑 `src/*.test.ts`，这样和 #11 只指向 `outgoing.test.ts` 的脚本合并后两边都会跑。`tsconfig` 排除测试文件，和 #11 的写法一致。
- **和 PR #11 的合并**：发送、重试、触觉、`clientKey` 用 #11 的实现。`mergeServerMessages` 现在会改已经在列表里的消息（旧卡片的 HTTP 更新），不变的行仍是原来的对象。聊天页只加了横幅、空列表不再写「加载中…」、加号菜单从按钮长出、转场后再拉插件。
- **没有在 Expo Go 里看过。** 类型检查、11 个单元测试、动画缓动检查通过。手机上要看的：进已打开过的聊天是否立刻有内容、断线 1 秒内不出现横幅、加号菜单从按钮长出再缩回、新建助手头像的小点和换形状、页面是系统侧滑、卡片滚到顶再下拉能关掉。

## 以后再改（合并时发现的小问题，不拦合并）

- PR #12 把"最近一次运行总结"整段换掉了，任务 1–7 的总结只剩在 git 历史和各 PR 说明里；以后可以把它们压成几行放回来。

## 深色模式（dark/theme-foundation）

- 把 `dark/theme-foundation` 合并了最新 `main`（含 #11、#12）。合并没有冲突。页面颜色改走 `useTheme()`，根布局挂了 `ThemeProvider`，`app.json` 的 `userInterfaceStyle` 改为 `automatic`，状态栏样式跟着当前主题。
- 设置里单独加了「外观」：跟随系统 / 浅色 / 深色。没有改已有界面文字，也没有动语言区块的位置（语言区块还不在这支上）。
- 没加需要原生构建的依赖。动画仍在 UI 线程，`check:animations` 通过。
- 验证：根目录 `npm test`（core 121、server 16、worker 19、bridge 14）通过；App `npm test` 30 通过；`tsc --noEmit` 通过；`check:animations` 61 个文件通过。没有在 Expo Go 里看过。手机对照清单在 PR #14：https://github.com/chen090728/agent-room/pull/14

## 中英双语（i18n/foundation）

- 把 App 里用户看得到的中文换成 `t(key)`。启动时在 `app/src/app/_layout.tsx` 先 `await initI18n()`。等语言就绪的空白页放在 `ThemeProvider` 里面，背景用当前主题的 `colors.bg`。
- 系统通知仍写中文 `content`，并带 `notice: { code, params }`。HTTP 看 `Accept-Language`（没有、或 Node 默认的 `*`，仍是中文）；WebSocket 的 `auth` / `subscribe` 可以带 `lang`。演示群欢迎语、模拟回复、种子成员的角色和人设有中英两套，名字和「演示群」不变。旧的数组格式 `config.replies` 继续可用。App 按 code 显示当前语言，不认识的 code 用 `content`。
- 英文较长的地方只加了换行和收缩（`numberOfLines`、`flexShrink`），没有改颜色。颜色和样式用 #14 的 `useTheme()` / `useThemedStyles()`。
- 合并了已进入 main 的 #14。冲突里留住深色模式的配色和主题逻辑，界面文字改走翻译。设置页顺序是「我」→「外观」→「语言」→「服务器」。外观标题和跟随系统 / 浅色 / 深色用已有的 `settings.appearance.*`；`THEME_PREFERENCE_LABELS` 仍留在 `app/src/theme/preference.ts`，设置页不再读它。语言仍是紧挨在外观后面的单独一块。
- `app/package.json` 的测试脚本同时包含 `src/i18n/*.test.ts` 和 `src/theme/*.test.ts`。
- 合并 #14 之后的测试：根目录 `npm test`（core 126、server 18、worker 21、bridge 14）通过；`cd app && npm test` 46 通过；`cd app && npx tsc --noEmit` 通过；`app/scripts/check-animations.mjs` 72 个文件通过。没有在 Expo Go 里看过。

## 深色配色改成中性深灰（dark/neutral-palette）

- 从最新 `main`（已含 #14、#15）开了新分支，只改深色色板。浅色色值和浅色阴影没动，界面文字和翻译没动。
- 深色页面改成接近黑色的中性灰（`#0E0E0F`），卡片 / 底部卡片 / 菜单高一档（`#1C1C1E`），输入框和助手气泡再高一档（`#2A2A2D`）。主要文字 `#F5F5F5`，次要文字和占位符 `#A1A1A6`。深色去掉投影；底部卡片和分段选中块没有自己的描边，所以用 1px 细线代替，浅色阴影还在。
- 首页搜索栏在深色下用卡片那一档（浅色里卡片和输入框都是白的，看起来不变）。
- 测试锁住了这些色值，并检查主要 / 次要文字在每一层背景上的对比度至少 4.5:1。根目录 `npm test`（core 126、server 18、worker 21、bridge 14）、App 46、`tsc --noEmit`、`check:animations`（72）通过。没有在 Expo Go 里看过。对照清单在 PR #16：https://github.com/chen090728/agent-room/pull/16

## 深色配色改成 Claude App 的感觉

- 按用户从 Claude App 深色截图取的颜色：页面 `#111111`；卡片、底部卡片 `#1E1E1D`，气泡菜单、搜索栏、输入框 `#262625`；选中 / 按下 `#404040`；主要文字 `#F9F9F7`，次要文字 `#C3C2B8`，更弱的文字（占位符、把手、未选圆圈）`#8A8984`；分隔线和描边 `#2A2A28`；我的气泡 `#2A2A28` 底 `#F9F9F7` 字；主要按钮反色 `#F2F2F2` 底 `#1F1F1E` 字。深色不用阴影，只有底部卡片和分段选中块用 1px `#2A2A28` 细线。
- 新增颜色角色 `accent` / `accentIcon`，用于首页和聊天页右上角的加号圆按钮（深色是白底深色图标）。浅色里它们等于原来的 `surface` / `icon`，浅色外观不变。发送按钮、主按钮用原有的 `button` / `buttonText`，深色改成同样的反色。
- 危险红从 `#FF7A72` 稍微调亮到 `#FF8C84`，让它在 `#404040` 的选中块上也有 4.5:1 对比度。占位符 `#8A8984` 按"更弱的文字"处理，测试只要求 ≥ 3:1。
- Mac 圆点、助手头像颜色、浅色配色、布局、文字都没动。没有在真机上看过。

## 输入栏旁的连接入口（fable/composer-connect-chips）

- 未绑定的对话在输入栏上方一直有两枚小标签：仓库和部署。已绑定的仍是「名称 · 详情」，点开还是插件详情。没绑定的是「连接 GitHub」和「连接部署」。
- 点「连接 GitHub」打开原来的插件卡片，并直接进入这一步：还没有令牌就填令牌，已经有 GitHub 连接就去选仓库。从这里返回是完整插件列表。点「连接部署」打开同一张卡片，列表只留 Cloudflare Pages、Vercel、Netlify、Render，返回仍是这份列表。输入栏「+」里的「插件」不带过滤，还是完整列表。
- 部署仍然要先绑定仓库。没绑仓库时点「连接部署」，卡片里沿用原来的说明，不会绕过这条规则。
- 英文芯片用短句 Connect deploy，避免两枚芯片在窄屏上挤出屏幕；卡片标题是 Connect a deploy platform。读屏听到的也是这句完整的。没有新依赖，没有改发送、重试、`clientKey`。
- 芯片行左边距从 18 改成 14，和输入栏外框（`Composer` 的 `paddingHorizontal: 14`）对齐，第一枚贴在加号那一侧，不再往中间偏。
- 芯片不盖在列表上，列表仍是 `flex: 1`。倒序列表里最新一条下面的空隙是 `paddingTop`，现在是 48。芯片高 40、字号 15、图标 16，左右边距仍是 14。
- 验证：根目录 `npm test`（core 126、server 18、worker 21、bridge 14）通过；App `npm test` 50 通过；`tsc --noEmit` 通过；`check:animations` 73 个文件通过。没有在 Expo Go 里看过。

## 首次打开按设备选语言，以及公开仓库说明

- 从最新 `main` 开了新分支。没有改输入框里的 GitHub / 部署芯片，也没有加需要原生编译的库。
- 还没有保存过语言时（AsyncStorage 里没有 `agenthub.language`），界面语言按设备决定，并继续当作「跟随系统」。启动不会写入这个键：
  1. `expo-localization` 的语言是 `zh` → 中文，是 `en` → 英文。语言已经是这两种之一就停，不再看地区和时区，所以英文手机在中国仍是英文。
  2. 否则看国家：先用设备地区 `regionCode`，再看语言自带的地区。中国大陆、台湾、香港、澳门 → 中文，其他地区 → 英文。
  3. 语言和地区都看不出来时，才用 IANA 时区：`Asia/Shanghai`、`Asia/Urumqi`、`Asia/Taipei`、`Asia/Hong_Kong`、`Asia/Macau`，以及一些手机仍会报的旧名 → 中文。`Asia/Singapore` 和 `GMT+8` 这种偏移不算。
- 已经保存的 `system` / `zh` / `en` 不会被改写。设置里仍是「跟随系统 / 中文 / English」。选了中文或 English 之后，换地区或时区也不会改回去；选了跟随系统，则回到上面的规则。
- 扫过仓库：测试里的 `sk-`、`github_pat_` 都是假数据，`server/.env.example` 和 `.dev.vars.example` 是空占位。没有维护者的私人 Key、令牌、部署账号或个人助手配置。README「安全说明」加了一段中英说明：使用者自己带 API Key、自己部署后端，公开仓库不能放维护者的私钥或个人助手配置。演示成员小橙、阿蓝、小绿保持不动。
- 没有新增依赖，没有新的界面文案。合并了已进入 main 的 #18（输入栏连接芯片）和 #19（英文 README）。芯片文件保持 main 上的版本。验证：根目录 `npm test`（core 126、server 18、worker 21、bridge 14）和 `npm run typecheck` 通过；`cd app && npm test` 53 通过，`npx tsc --noEmit` 通过。没有在 Expo Go 里看过。
