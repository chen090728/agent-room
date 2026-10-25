# 服务器文案与演示内容（方案，本步不改服务器）

App 里还有一批中文不是写在页面上的，而是服务器存进消息、卡片或接口错误里，App 原样显示。换语言时只改 App 词条覆盖不到它们。本文件只做清单和方案，不改 `core/`、`server/`、`worker/`。

语言由客户端决定后，用请求头 `Accept-Language: zh` 或 `en`（只传解析后的语言，不传 `system`）告诉服务器。WebSocket 认证从 `{ "type": "auth", "token" }` 扩展为可以多带 `"lang": "zh" | "en"`。旧客户端什么都不带，服务器按 `zh` 处理，行为和现在一样。

## 1. 系统通知：改成 code + params

今天 `Coordinator.addSystemMessage`（`core/src/coordinator.ts`）把一句中文写进 `message.content`，`senderKind` 是 `system`，`senderName` 是 `系统`。App 的 `MessageItem` 直接渲染 `content`。

新消息在保留 `content` 的同时增加可选字段：

```ts
notice?: { code: string; params?: Record<string, string | number> } | null;
```

- 服务器**同时**写 `content` 和 `notice`。`content` 继续是现在这句中文。
- 旧客户端不认识 `notice`，忽略未知 JSON 字段，仍显示 `content`。
- 新客户端：`notice.code` 在词表里就用 `t('notice.' + code, params)`，不在词表里（更新的服务器、更旧的 App）就显示 `content`。
- 已知错误用嵌套 code；上游原文（GitHub 返回的句子、模型抛出的英文）放进 `params.detail`，不翻译。

建议的 code。`content` 一栏是现在的中文，也是旧客户端看到的句子。

| code | params | 现在的 content | 位置 |
| --- | --- | --- | --- |
| `relay.interrupted` | `name` | `{name} 的回复被中断，已跳过。` | `core/src/coordinator.ts`（回复被打断两次） |
| `relay.failed` | `name`, `detail` 或 `reasonCode` | `{name} 回复失败：{原因}` | 同上 |
| `relay.hopLimit` | `maxHops` | `已达到 {maxHops} 轮传递上限，自动停止。` | 同上 |
| `relay.replyLimit` | `maxReplies` | `已达到每条消息最多 {maxReplies} 次回复的上限，自动停止。` | 同上 |
| `relay.timeout` | （无） | `请求超时` | `describeError`，作为 `relay.failed` 的 `reasonCode`，不要再拼进中文句子 |
| `deploy.started` | `title`, `platform` | `已合并「{title}」，正在部署到 {platform}` | 同上，合并后的系统消息 |
| `demo.welcome` | （无） | 见下一节欢迎语 | `core/src/seed.ts` 的 `WELCOME_MESSAGE`，经 `addSystemMessage` 写入 |

`deploy.started` 的 `platform` 目前是集成类型的 `label`（Vercel、Netlify、Cloudflare Pages、Render 已经是英文）。

欢迎语走同一条路：种子数据仍把中文写进 `content`，并带上 `notice: { code: 'demo.welcome' }`。新客户端按自己的语言画这句，不依赖种子是用哪种语言种下的。这样演示群在服务器第一次启动、还没有客户端语言时也可以先种好。

建议的英文：

- `relay.interrupted`: `{name}'s reply was interrupted and skipped.`
- `relay.failed`: `{name} couldn't reply: {detail}`
- `relay.hopLimit`: `Stopped. This message reached the {maxHops}-round relay limit.`
- `relay.replyLimit`: `Stopped. This message reached the limit of {maxReplies} replies.`
- `relay.timeout`: `The request timed out`
- `deploy.started`: `Merged “{title}”. Deploying to {platform}`
- `demo.welcome`: `Welcome to the demo group. These three members are simulated and don't need a key. Try “@小橙 hello”, or @ several of them and watch them hand off.`

## 2. 卡片上的错误，用同一套字段

这些不是系统消息，但 App 会把 `card.error` 画出来（`DeploymentCard`、`PullRequestCard`）。同样保留中文 `error`，另加 `errorNotice: { code, params }`。旧客户端只读 `error`。

| code | 现在的句子 | 位置 |
| --- | --- | --- |
| `deploy.connectionDeleted` | `这个部署平台的连接已经被删除了` | `core/src/coordinator.ts` |
| `deploy.notStarted` | `一直没有等到平台开始部署` | 同上（平台能被触发时） |
| `deploy.notStartedNoTrigger` | `一直没有等到平台开始部署，请确认这个项目在平台上连接了该仓库并开启了自动部署` | 同上（不能触发时，现在用拼接） |
| `deploy.timedOut` | `部署时间太长，已停止跟踪，请到平台查看` | 同上 |
| `deploy.failed` | `部署失败` | 同上，状态没有自带 error 时的兜底 |
| `github.connectionDeleted` | `这个仓库的连接已经被删除了，请在 GitHub 上直接处理这个 PR` | 同上，点卡片时的 `UserError`，走接口 `error` |
| `card.missing` | `找不到这张卡片` | 同上 |

平台适配器写在卡片上的失败原因（也进 `card.error`）：

| 句子 | 位置 |
| --- | --- |
| `部署被取消了` | `core/src/integrations/platforms/cloudflare-pages.ts`、`render.ts`、`vercel.ts` |
| `部署在「{stage}」这一步失败了，请到 Cloudflare 查看日志` | `cloudflare-pages.ts` |
| `部署失败，请到 Render 查看日志` | `render.ts` |
| `部署失败，请到 Vercel 查看日志` | `vercel.ts` |
| `d.error_message ?? '部署失败'` | `netlify.ts` |

建议同样收成 code（`deploy.canceled`、`deploy.stageFailed`、`deploy.platformFailed`），平台名做 param。上游 `error_message` / `errorMessage` 原样放进 `detail`。

## 3. 演示群和模拟回复：两套文案，按客户端语言选

模拟成员的回复是服务器现写的，可以跟当前这条请求的语言走。已经写进历史的消息不改写。

名字不能按语言换。`@` 认的是成员名字，换语言如果把「小橙」改成 Orange，会变成另一个人，旧消息里的 @ 也对不上。建议两套文案都保留名字 **小橙、阿蓝、小绿**，群名也保持 **演示群**。英文欢迎语里直接写 `@小橙`。如果一定要英文名字，只能在第一次种子时选定一种，之后不能再跟着设置里的语言变。本方案不这么做。

### 存在哪

`core/src/seed.ts` 的 `DEMO_MEMBERS` 今天把中文 `role`、`persona`、`replies` 写进成员。`replies` 以 JSON 数组放在 `config.replies`。

兼容旧数据：

- `config.replies` 仍是 JSON 数组：所有语言都用这一份（用户自己写的模拟回复，以及已经种好的旧演示群）。
- `config.replies` 是 `{ "zh": string[], "en": string[] }`：按请求语言取，缺了先退回 `zh`，再退回 `en`。
- 新种子写成对象形式。
- `role` / `persona` 列继续存中文，作为没带语言的旧客户端和现有数据库看到的值。英文放在 config 里，例如 `roleI18n` / `personaI18n`。接口在带了 `Accept-Language` 时把 `role` 和 `persona` 换成对应语言；不带则仍返回中文。多出来的字段旧客户端忽略。
- 已有演示成员（`directory.ts` 里按名字补的角色：小橙 产品经理、阿蓝 安全顾问、小绿 交互设计）不用迁移语句改写。它们没有 `roleI18n` 时继续显示中文。

`core/src/adapters/mock.ts` 在 `reply()` 里按这个语言选池子。问候判断 `/你好|您好|hello|hi|嗨|哈喽/i` 已经认英文 hello / hi，不用改规则。

### 欢迎语

`core/src/seed.ts` 的 `WELCOME_MESSAGE`：

> 欢迎来到演示群！这里的三位都是模拟成员，不需要任何 Key。试试发送「@小橙 你好」，或者同时 @ 好几位，看看成员之间怎么接力。

写入点：`server/src/hub.ts`、`worker/src/directory-do.ts` 调用 `seedIfEmpty`，再 `addSystemMessage`。按第 1 节做成 `demo.welcome`，不要在种子时选死一种语言。

### 种子成员（`core/src/seed.ts`）

| 名字 | 角色 zh / en | 人设 zh | 人设 en |
| --- | --- | --- | --- |
| 小橙 | 产品经理 / Product manager | 热情的产品经理，点子多，喜欢先抛出方案再拉大家讨论。 | An enthusiastic product manager with lots of ideas, who likes to throw out a plan and get everyone talking. |
| 阿蓝 | 安全顾问 / Security advisor | 冷静的工程师，关注安全和可行性，说话简洁。 | A calm engineer focused on safety and whether it can actually be built. Speaks briefly. |
| 小绿 | 交互设计 / Interaction design | 细心的设计师，关注交互体验，喜欢提问。 | A careful designer who cares about how it feels to use, and likes to ask questions. |

小橙的 `replies`：

| zh | en |
| --- | --- |
| 我有个想法：先做一个最简单的版本，让用户今天就能用上。 | Here's an idea: ship the smallest version so people can use it today. |
| `{sender}说得对！我们可以把这个拆成三步，第一步先验证需求。` | `{sender} is right. We can split this into three steps and test the need first.` |
| 要不要加一个新手引导？第一次打开的体验很关键。 | Should we add a first-run guide? The first open matters. |
| 我觉得方向没问题，接下来要定优先级。 | The direction looks fine. Next we should set priorities. |

阿蓝：

| zh | en |
| --- | --- |
| 技术上可行，但要注意接口的频率限制。 | It's doable, but watch the rate limits. |
| 同意。建议先写测试，再动手实现。 | Agreed. Write the tests first, then implement it. |
| 这里有个风险：数据要做好备份。 | One risk: the data needs a backup. |
| `{sender}，我估算一下，两天能出第一版。` | `{sender}, I'd estimate two days for a first version.` |

小绿：

| zh | en |
| --- | --- |
| 用户在这一步会不会迷路？我想画个流程图确认一下。 | Will people get lost at this step? I want to sketch the flow. |
| 按钮可以再大一点，单手操作更方便。 | The button could be larger so it's easy to tap with one hand. |
| `{sender}的方案我喜欢，颜色上可以再柔和一些。` | `I like {sender}'s approach. The colors could be a bit softer.` |
| 我们是不是该先找几位用户聊聊？ | Should we talk to a few users first? |

`{sender}` 仍是运行时替换，和现在一样。

### 通用模拟回复（`core/src/adapters/mock.ts`）

没有 `config.replies` 时用 `GENERIC_REPLIES`：

| zh | en |
| --- | --- |
| `收到，{sender}。我按自己的理解说两句：先把目标说清楚，再定下一步。` | `Got it, {sender}. Here's how I see it: name the goal, then decide the next step.` |
| 这个问题挺有意思，我的看法是先做一个最小版本试试。 | Interesting question. I'd try the smallest version first. |
| `同意{sender}的方向，不过细节上还可以再想想。` | `I agree with {sender}'s direction, though the details could use another pass.` |
| 我补充一点：别忘了考虑用户第一次使用时的感受。 | One more thing: think about how this feels the first time someone uses it. |
| 好的，这部分我来跟进。 | Okay, I'll follow up on this part. |

`GREETINGS`：

| zh | en |
| --- | --- |
| `你好呀！我是{self}，{persona}。` | `Hi, I'm {self}, {persona}.` |
| `你好～我是{self}，{persona}，有什么想聊的？` | `Hi, I'm {self} — {persona}. What should we talk about?` |

人设取第一小句失败时的兜底：`很高兴认识你` / `nice to meet you`（`mock.ts` 里 `split` 之后的默认值）。

`HANDOVERS`：

| zh | en |
| --- | --- |
| `@{name} 你怎么看？` | `@{name} what do you think?` |
| `@{name} 你来补充一下？` | `@{name} can you add to that?` |
| `@{name} 这块你更熟，交给你。` | `@{name} you know this better — over to you.` |
| `@{name} 有不同意见吗？` | `@{name} do you see it differently?` |

收到文件时拼在回复前面（`mock.ts`）：

| | zh | en |
| --- | --- | --- |
| 一个文件 | `收到你发的文件：{names}。` | `Got your file: {names}.` |
| 多个 | `收到你发的{count} 个文件：{names}。` | `Got your {count} files: {names}.` |

名字之间中文用 `、`，英文用 `, `。

适配器展示名（设置里如果服务器把类型标签发下来）：`模拟助手` / `Demo assistant`，说明 `不需要 Key，按人设返回预设或随机回复，并会 @ 其他成员。`。见下一节附录，和别的适配器标签一起处理，不要塞进 `notice`。

## 4. 也是服务器写的、但不是系统通知

下面这些会出现在聊天里，但发送者是成员，不是系统。可以顺手收成 code，本方案不把它们算进系统通知。

| 句子 | 位置 | 说明 |
| --- | --- | --- |
| `我提交了修改，请在下面的卡片里确认。` | `core/src/coordinator.ts` | 回复是空的但有卡片时，填进成员消息的 `content` |
| `PR #{number}：{title}` | 同上 | 一条回复带了多张卡片时，多出来的卡片各成一条成员消息 |

## 5. 附录：接口错误和类型标签（App 直接显示，本方案不改协议）

这些中文经 `error`、`typeLabel`、`fields[].label` 到 App。旧客户端把整句当错误提示。要翻译它们，需要另一套「错误 code」，不能只在 App 词表里找，因为 App 根本没有这些字面量。列出以免下一步漏掉或误当成页面文案。

适配器（`label` / `description` / 字段）：

- `core/src/adapters/mock.ts`：模拟助手
- `core/src/adapters/openai-compatible.ts`：OpenAI 兼容接口；字段 接口地址、API Key、模型名、支持看图
- `core/src/adapters/bridge.ts`：工作助手；字段 工具、允许修改文件；以及 `这个服务器没有启用 bridge`、`还没有和电脑配对：…`、`不支持的工具：…`、`没有返回内容`

工作助手运行时错误（会进 `relay.failed` 的 detail）：

- `core/src/bridge.ts`：`这台电脑上的 bridge 没有连接。请在电脑上运行 agenthub-bridge run`；`等了 {分钟} 分钟还没有结果，已放弃`；`本机工具运行失败`；`bridge 在工作时断开了连接`

校验和接口（`core/src/api.ts`、`core/src/directory.ts`、`core/src/room.ts`）里用户能在 App 上看到的句子，包括但不限于：名字不能为空、名字最多 20 个字、名字不能包含空格或 @、角色标签最多 20 个字、群名不能为空、一条消息最多带 N 个文件、消息不能为空、仓库名要写成 所有者/仓库名、链接已过期、请求内容不对、访问令牌无效、未知的成员类型、请填写{字段}、需要以 http:// 或 https:// 开头、成员不存在、服务器没有开通文件存储、找不到这张图片、头像图片太大，最多 2 MB、群聊不存在、文件太大、文件是空的、暂不支持这种文件、已经有叫「{name}」的成员了、单聊的成员不能修改、这个连接不存在、这个部署平台的连接不存在、只有工作助手需要配对、配对码无效或已过期，请回到 App 重新获取、有文件找不到了、这个文件已经发送过了、服务器没有配置 AGENTHUB_SECRET、无法解密已保存的 Key。

GitHub / 平台连接失败时返回的句子（`core/src/integrations/github.ts`、`platforms/http.ts` 等）：令牌无效或已过期、连不上 GitHub、没有权限或找不到、仓库名不合法、无法合并。这些经常带上游原文，只翻译外壳，把原文留在 `detail`。

发给模型的提示（`core/src/context.ts`、工具 `description`）是模型指令，不是 App 界面。本步不纳入。若以后要让演示成员以外的模型也用用户的语言回答，应另做，不要和界面词条混在一起。
