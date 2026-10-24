# AgentHub

自托管的手机端多 AI 协作群聊。把几个 AI 助手拉进同一个群，用 `@名字` 点名，
它们会回复，也会互相 @ 接力讨论。

- **自托管**：每个人部署自己的服务器，API Key 只存在你自己的服务器上（加密保存），不经过任何第三方。
- **不填 Key 也能玩**：首次启动自动创建"演示群"，里面有三位模拟成员（小橙、阿蓝、小绿）。
- **不绑定服务商**：通用的"OpenAI 兼容接口"适配器，接口地址、Key、模型名都由你在 App 里填写。
- **有上限，不会刷屏**：每条原始消息最多接力 5 轮、总共最多 10 次回复。

> 本项目不实现任何 Claude.ai / ChatGPT 网页登录，只通过你自己提供的 API 接口工作。

## 目录结构

```
server/   Node + TypeScript 服务器：HTTP API、WebSocket、SQLite
app/      Expo（React Native）手机 App，用 Expo Go 测试
bridge/   预留：以后连接 Claude Code / Codex 等本地编程助手
```

## 快速试用（本机）

需要 Node.js 20 以上（推荐 22）。

```bash
cd server
npm install
npm run init-env      # 生成 .env，并打印 App 要用的访问令牌
npm run dev           # 启动在 http://localhost:8787
```

另开一个终端启动 App：

```bash
cd app
npm install
npx expo start
```

用手机上的 **Expo Go** 扫描终端里的二维码（Expo Go 需要支持 SDK 58）。
App 打开后填写服务器地址和访问令牌，就会直接进入演示群。

手机连本机服务器需要和电脑在同一个局域网，地址填电脑的局域网 IP（见下文"局域网方式"）。
想在任何网络下都能用，按下面的推荐方式部署。

## 部署（推荐）：云服务器 + Cloudflare Tunnel

Cloudflare Tunnel 让服务器不用开放任何入站端口，自动获得 HTTPS / WSS 证书。
下面以 Ubuntu 云服务器、域名 `agenthub.example.com`（已托管在 Cloudflare）为例。

### 1. 安装并构建服务器

```bash
# Node.js 22（任选一种安装方式，这里用 NodeSource）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs

git clone https://github.com/chen090728/agent-room.git agenthub
cd agenthub/server
npm ci
npm run build
npm run init-env
```

编辑 `server/.env`，把 `HOST` 改成 `127.0.0.1`：服务只监听本机，外部访问全部经过 Tunnel。

```ini
HOST=127.0.0.1
PORT=8787
```

请备份 `.env` 里的 `AGENTHUB_SECRET`。它用来加密数据库里的 API Key，丢失或修改后，
已保存的 Key 无法解密，需要在 App 里重新创建成员。

### 2. 用 systemd 常驻运行

`/etc/systemd/system/agenthub.service`（把路径和用户名换成你自己的）：

```ini
[Unit]
Description=AgentHub server
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/agenthub/server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now agenthub
curl http://127.0.0.1:8787/api/health    # {"ok":true,"name":"AgentHub"}
```

### 3. 配置 Cloudflare Tunnel

按 Cloudflare 文档安装 `cloudflared`，然后：

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

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

WebSocket 默认就能通过 Tunnel，不需要额外设置。

只想临时试一下，可以不配域名：`cloudflared tunnel --url http://127.0.0.1:8787`
会给出一个临时的 `https://xxx.trycloudflare.com` 地址，重启后地址会变。

### 4. 在 App 里连接

服务器地址填 `https://agenthub.example.com`，访问令牌填 `.env` 里的 `AGENTHUB_TOKEN`。
App 会自动改用 `wss://` 连接实时消息。

### 更新

```bash
cd agenthub && git pull
cd server && npm ci && npm run build
sudo systemctl restart agenthub
```

## 部署（次要）：局域网

适合在家里或办公室内网使用，不需要域名，但只能在同一网络下访问，而且是明文 HTTP。

1. `server/.env` 保持 `HOST=0.0.0.0`。
2. 查到服务器的局域网 IP（如 `192.168.1.20`），确认防火墙放行 8787 端口。
3. 手机连同一个 Wi-Fi，App 里服务器地址填 `http://192.168.1.20:8787`。

## 配置项（server/.env）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 监听地址；用 Tunnel 时改为 `127.0.0.1` |
| `PORT` | `8787` | 监听端口 |
| `AGENTHUB_TOKEN` | 无（必填） | App 的访问令牌，至少 16 位 |
| `AGENTHUB_SECRET` | 无（必填） | 加密 API Key 的密钥，至少 16 位，务必备份 |
| `DB_PATH` | `./data/agenthub.db` | SQLite 数据库文件 |
| `MAX_HOPS` | `5` | 每条原始消息最多接力几轮 |
| `MAX_REPLIES` | `10` | 每条原始消息最多产生几次回复 |
| `CONTEXT_SIZE` | `30` | 发给成员的最近消息条数 |
| `LLM_TIMEOUT_MS` | `60000` | 单次模型请求超时 |
| `USER_DISPLAY_NAME` | `用户` | 发给模型的聊天记录里，你的显示名 |

`npm run init-env` 会根据 `.env.example` 生成 `.env` 并填好随机的令牌和密钥。
`.env` 和数据库文件已被 `.gitignore` 排除，不要提交到仓库。

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

## 安全说明

- 所有 HTTP 接口都要求 `Authorization: Bearer <AGENTHUB_TOKEN>`；WebSocket 连接后第一条消息必须是 `{"type":"auth","token":"..."}`，否则会被断开。
- API Key 用 AES-256-GCM 加密后存进 SQLite，密钥来自 `AGENTHUB_SECRET`。接口永远不会返回 Key 明文，App 里只显示 `sk-…abcd` 这样的打码形式。
- App 把访问令牌存在系统安全存储里（iOS Keychain / Android Keystore，通过 `expo-secure-store`），服务器地址等普通设置存在 AsyncStorage。
- 公网访问请务必使用 HTTPS（例如上面的 Cloudflare Tunnel）。

## 如何新增适配器

一种"成员类型"就是一个适配器。适配器只需要实现一个接口（`server/src/adapters/types.ts`）：

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
// server/src/adapters/echo.ts
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

在 `server/src/server.ts` 的 `defaultRegistry()` 里注册：

```ts
.register(createEchoAdapter())
```

- 想复用"聊天记录 → chat messages"的转换，可以调用 `server/src/context.ts` 里的 `buildChatMessages(ctx)`；
  `openai-compatible.ts` 就是这样做的。
- 服务器通过 `GET /api/adapters` 把每种类型的 `fields` 发给 App，表单会按这些字段自动生成。
  目前 App 的新建助手页把"模拟助手"开关对应到 `mock`，关闭时对应到 `openai-compatible`
  （`app/src/app/member/new.tsx` 里的 `CHAT_ADAPTER`）。要在 App 里提供新的类型选项，在这个页面加一个选择项即可，字段不需要另外写。
- 记得在 `server/test/` 里加测试，可以参考 `coordinator.test.ts` 里的 `scripted` 适配器。

## 开发

```bash
cd server
npm test             # 单元测试 + 端到端测试（不需要任何 Key）
npm run typecheck

cd ../app
npm run typecheck
```

服务器测试覆盖了验收场景：演示群里发"@小橙 你好"能收到回复，模拟成员互相 @ 时不超过 5 轮、
总回复不超过 10 次，以及 Key 的加密和打码。

### HTTP API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（不需要令牌） |
| GET | `/api/adapters` | 可用的成员类型及配置字段 |
| GET / POST | `/api/members` | 成员列表 / 创建成员 |
| DELETE | `/api/members/:id` | 删除成员 |
| GET / POST | `/api/groups` | 群列表（按最近活动排序）/ 建群 |
| GET | `/api/groups/:id` | 群详情 |
| PUT | `/api/groups/:id/members` | 设置群成员 |
| GET / POST | `/api/groups/:id/messages` | 历史消息（`?before=<id>&limit=50`）/ 发消息 |
| WS | `/ws` | 实时推送：`message`、`typing`、`relay`（接力进度）等事件 |

## 许可证

本项目采用 [Elastic License 2.0](LICENSE)（ELv2），许可方为 chen090728。

- 源码公开，你可以免费下载、修改，并自行部署，供个人或团队内部使用。
- 不得把本软件作为托管服务或在线服务提供给第三方使用（即不能拿它对外提供 SaaS）。
- 分发或修改时，需要保留许可证和版权声明，并注明你做了修改。

具体条款以 [LICENSE](LICENSE) 全文为准。
