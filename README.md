# AgentHub

自托管的手机端多 AI 协作群聊。把几个 AI 助手拉进同一个群，用 `@名字` 点名，
它们会回复，也会互相 @ 接力讨论。

- **自托管**：每个人部署自己的服务器，API Key 只存在你自己的服务器上（加密保存），不经过任何第三方。
- **没有电脑也能部署**：推到 GitHub，自动部署到 Cloudflare 免费档，App 用 Expo Go 打开。见《[手机部署指南](docs/手机部署指南.md)》。
- **不填 Key 也能玩**：首次启动自动创建"演示群"，里面有三位模拟成员（小橙、阿蓝、小绿）。
- **不绑定服务商**：通用的"OpenAI 兼容接口"适配器，接口地址、Key、模型名都由你在 App 里填写。
- **有上限，不会刷屏**：每条原始消息最多接力 5 轮、总共最多 10 次回复。

> 本项目不实现任何 Claude.ai / ChatGPT 网页登录，只通过你自己提供的 API 接口工作。

## 目录结构

```
core/     共用核心（纯 TypeScript）：协调者、适配器、上下文组装、加密、存储和 HTTP API
server/   Node 版服务器：node:http + ws + SQLite（better-sqlite3）
worker/   Cloudflare 版服务器：Workers + Durable Objects（SQLite 存储）
app/      Expo（React Native）手机 App，用 Expo Go 打开
bridge/   预留：以后连接 Claude Code / Codex 等本地编程助手
docs/     手机部署指南
```

Node 版和 Cloudflare 版共用 `core/` 里的全部业务逻辑，对 App 暴露完全相同的接口，所以 App 不用区分。

## 部署方式

### 推荐：Cloudflare（免费档，只用手机）

用 Workers + Durable Objects：每个群一个 Durable Object，WebSocket 使用 Hibernation API，
空闲时不占资源。推送到 `main` 分支时，GitHub Actions 自动测试、部署，并发布 App（EAS Update）。

**完整步骤见《[手机部署指南](docs/手机部署指南.md)》**，从生成令牌开始，不需要电脑。概括起来：

1. 生成 Cloudflare API 令牌、Expo 访问令牌，再自己生成 `AGENTHUB_TOKEN` 和 `AGENTHUB_SECRET`。
2. 把 5 个值填进 GitHub Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`EXPO_TOKEN`、`AGENTHUB_TOKEN`、`AGENTHUB_SECRET`。
3. 合并到 `main`，等 Actions 变绿，在运行摘要里找到服务器地址和打开 App 的链接。

> **务必备份 `AGENTHUB_SECRET`。** 它加密你保存的 API Key，以后修改会导致已保存的 Key 无法解密。

### 备选：自己的服务器（Node 版）

需要 Node.js 20 以上（推荐 22）。

```bash
npm install                 # 在仓库根目录，安装所有工作区
cd server
npm run init-env            # 生成 .env，并打印 App 要用的访问令牌
npm run dev                 # 开发模式，监听 http://localhost:8787
```

生产环境：

```bash
cd server
npm run build               # 打包成 dist/index.js
npm start
```

另开一个终端启动 App（Expo Go 需要支持 SDK 58）：

```bash
cd app
npm install
npx expo start
```

手机连本机服务器需要在同一个局域网，App 里服务器地址填电脑的局域网 IP，如 `http://192.168.1.20:8787`
（局域网内是明文 HTTP；`server/.env` 里保持 `HOST=0.0.0.0`，并放行 8787 端口）。

想让 Node 版在公网用 HTTPS，可以配合 Cloudflare Tunnel（不用开放入站端口）：

```bash
cloudflared tunnel login
cloudflared tunnel create agenthub
cloudflared tunnel route dns agenthub agenthub.example.com
```

`~/.cloudflared/config.yml`：

```yaml
tunnel: agenthub
credentials-file: /home/ubuntu/.cloudflared/<隧道ID>.json
ingress:
  - hostname: agenthub.example.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

这时把 `server/.env` 的 `HOST` 改成 `127.0.0.1`，用 systemd 让 `node dist/index.js` 常驻运行，
App 里的服务器地址填 `https://agenthub.example.com`（App 会自动改用 `wss://`）。

## 配置项

两个版本共用的限制项：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MAX_HOPS` | `5` | 每条原始消息最多接力几轮 |
| `MAX_REPLIES` | `10` | 每条原始消息最多产生几次回复 |
| `CONTEXT_SIZE` | `30` | 发给成员的最近消息条数 |
| `LLM_TIMEOUT_MS` | `60000` | 单次模型请求超时 |
| `USER_DISPLAY_NAME` | `用户` | 发给模型的聊天记录里，你的显示名 |
| `MOCK_DELAY_MS` | `400-1400` | 模拟成员回复前的随机等待（毫秒，范围） |

Cloudflare 版：上面这些写在 `worker/wrangler.jsonc` 的 `vars` 里；`AGENTHUB_TOKEN` 和 `AGENTHUB_SECRET`
是 Wrangler secrets，由部署流程从 GitHub Secrets 写入，**不要写进仓库**。

Node 版：写在 `server/.env`（参考 `server/.env.example`），另外还有：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8787` | 监听端口 |
| `AGENTHUB_TOKEN` | 无（必填） | App 的访问令牌，至少 16 位 |
| `AGENTHUB_SECRET` | 无（必填） | 加密 API Key 的密钥，至少 16 位，务必备份 |
| `DB_PATH` | `./data/agenthub.db` | SQLite 数据库文件 |

`.env` 和数据库文件已被 `.gitignore` 排除，不要提交。

## 群聊规则

- **只有被 @ 的成员回复**。一条消息 @ 了多位成员，按顺序依次回复。
- **自动转发**：成员回复里 @ 了别的成员，被 @ 的成员会接着回复。@ 自己会被忽略。
- **两道上限**（每条你发出的原始消息单独计算）：
  - 深度：最多接力 5 轮，第 5 轮回复里的 @ 不再转发；
  - 总量：最多 10 次回复，比如同时 @ 了三位、每位又 @ 两位时，到 10 次就停。
  - 触发上限时，群里会出现一条系统提示。
- **上下文**：发给成员的是最近 30 条消息（系统提示除外），每条都标明发言人，并告诉它群里有哪些成员可以 @。
  对 OpenAI 兼容接口，成员自己说过的话作为 `assistant`，其他人的话作为 `user` 并加上"名字: "前缀，相邻的 `user` 消息会合并成一条。
- **清理前缀**：保存成员回复前，会去掉开头多余的"自己名字:"或"【自己名字】"。
- **逐步执行，不丢任务**：接力任务保存在存储里，每次只处理一条回复。服务重启或 Durable Object 被回收后会接着做；
  正在生成的那条回复如果被打断，会重试一次，再失败就跳过并在群里提示。

## 安全说明

- 所有 HTTP 接口都要求 `Authorization: Bearer <AGENTHUB_TOKEN>`；WebSocket 连接后第一条消息必须是 `{"type":"auth","token":"..."}`，否则会被断开。令牌比较用常数时间算法。
- API Key 用 Web Crypto 的 AES-256-GCM 加密后存进 SQLite，密钥由 `AGENTHUB_SECRET` 经 HKDF-SHA256 派生。接口永远不会返回 Key 明文，App 里只显示 `sk-…abcd` 这样的打码形式。
- App 把访问令牌存在系统安全存储里（iOS Keychain / Android Keystore，通过 `expo-secure-store`），服务器地址等普通设置存在 AsyncStorage。
- 公网访问请务必使用 HTTPS（Cloudflare 版自带）。

### 从旧版本升级

加密格式在 Cloudflare 版开发时改成了 `v2`（HKDF + AES-GCM），数据库表结构也有调整。
项目还没有正式发布过，所以**不提供迁移**：如果你之前跑过旧版 Node 服务器，请删除 `server/data/` 后重新启动，并在 App 里重新填 Key。

## 如何新增适配器

一种"成员类型"就是一个适配器。适配器只需要实现一个接口（`core/src/adapters/types.ts`）：

```ts
interface MemberAdapter {
  type: string;          // 唯一标识，存进数据库，例如 'my-service'
  label: string;         // App 里显示的名字
  description: string;
  fields: FieldSpec[];   // 创建成员时要填的配置项；secret: true 的字段会加密保存
  reply(ctx: ReplyContext, config: Record<string, string>): Promise<string>;
}
```

`ReplyContext` 里有：群名、成员自己的名字和人设（`self`）、群里其他可以 @ 的成员（`others`）、
最近的聊天记录（`history`，已标明发言人）、点名它的那条消息（`trigger`），以及超时用的 `signal`。
返回值就是回复的文字；回复里写 `@名字` 就会转发给对应成员；抛出异常时，群里会显示"xx 回复失败：原因"。

示例：一个原样复述的适配器。

```ts
// core/src/adapters/echo.ts
import type { MemberAdapter } from './types.js';

export function createEchoAdapter(): MemberAdapter {
  return {
    type: 'echo',
    label: '复读机',
    description: '把点名它的消息原样说一遍',
    fields: [{ key: 'prefix', label: '前缀', kind: 'text', required: false, placeholder: '例如：我听到了' }],
    async reply(ctx, config) {
      return `${config.prefix ?? ''}${ctx.trigger.content}`;
    },
  };
}
```

在 `core/src/index.ts` 的 `defaultRegistry()` 里注册：

```ts
.register(createEchoAdapter())
```

因为 Node 版和 Cloudflare 版都使用 `defaultRegistry()`，注册一次两边同时生效。

- 适配器要能在 Cloudflare Workers 里运行：只用标准的 Web API（`fetch`、`crypto` 等），不要用 Node 专有模块。
- 想复用"聊天记录 → chat messages"的转换，可以调用 `core/src/context.ts` 里的 `buildChatMessages(ctx)`；`openai-compatible.ts` 就是这样做的。
- 服务器通过 `GET /api/adapters` 把每种类型的 `fields` 发给 App。目前 App 的新建助手页把"模拟助手"开关对应到 `mock`，
  关闭时对应到 `openai-compatible`（`app/src/app/member/new.tsx` 里的 `CHAT_ADAPTER`），表单字段由服务器描述生成。
- 记得加测试，可以参考 `core/test/coordinator.test.ts` 里的 `scripted` 适配器。

## 开发

```bash
npm install            # 仓库根目录
npm test               # core 单元测试 + Node 版端到端 + Cloudflare 版端到端
npm run typecheck

cd app && npm install && npm run typecheck
```

`core/test/e2e-suite.ts` 是一套只用 HTTP 和 WebSocket 的端到端测试，同时跑在 Node 版和 Cloudflare 版上
（后者在本地用 `wrangler dev` 启动真正的 workerd 和 Durable Objects，不需要 Cloudflare 账号）。
覆盖了验收场景：演示群里发"@小橙 你好"能收到回复，模拟成员互相 @ 时不超过 5 轮、总回复不超过 10 次，
以及 Key 的加密和打码、WebSocket 认证。

本地跑 Cloudflare 版：

```bash
cd worker
npx wrangler dev --var AGENTHUB_TOKEN:<至少16位> --var AGENTHUB_SECRET:<至少16位>
```

### HTTP API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（不需要令牌），`configured` 表示令牌和密钥是否已配置 |
| GET | `/api/adapters` | 可用的成员类型及配置字段 |
| GET / POST | `/api/members` | 成员列表 / 创建成员 |
| DELETE | `/api/members/:id` | 删除成员 |
| GET / POST | `/api/groups` | 群列表（按最近活动排序）/ 建群 |
| GET | `/api/groups/:id` | 群详情 |
| PUT | `/api/groups/:id/members` | 设置群成员 |
| GET / POST | `/api/groups/:id/messages` | 历史消息（`?before=<id>&limit=50`）/ 发消息 |
| WS | `/ws` | 群列表事件：`group_updated`、`groups_changed`、`members_changed` |
| WS | `/ws/groups/:id` | 单个群的聊天事件：`message`、`typing`、`relay`（接力进度） |

两个 WebSocket 连上后都要先发 `{"type":"auth","token":"..."}`，收到 `{"type":"hello"}` 后才开始推送。

## 许可证

本项目采用 [Elastic License 2.0](LICENSE)（ELv2），许可方为 chen090728。

- 源码公开，你可以免费下载、修改，并自行部署，供个人或团队内部使用。
- 不得把本软件作为托管服务或在线服务提供给第三方使用（即不能拿它对外提供 SaaS）。
- 分发或修改时，需要保留许可证和版权声明，并注明你做了修改。

具体条款以 [LICENSE](LICENSE) 全文为准。
