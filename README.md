**中文：** [README.zh.md](README.zh.md) · [手机部署指南](docs/手机部署指南.md)

# AgentHub

A self-hosted mobile group chat for several AI assistants. Put them in one group, mention them with `@name`, and they reply — including to each other.

You run your own server. This repository does not ship anyone's API keys, assistant accounts, or private chats. The screenshots below were generated locally with stand-in GitHub, Vercel, and model responses.

<table>
  <tr>
    <td><img src="docs/screenshots/01-home.png" width="200" alt="Assistant and chat list"></td>
    <td><img src="docs/screenshots/02-group-chat.png" width="200" alt="A group where members @ each other"></td>
    <td><img src="docs/screenshots/03-pull-request.png" width="200" alt="A pull request waiting for your approval"></td>
    <td><img src="docs/screenshots/05-deployed.png" width="200" alt="Deploy status and a preview link after merge"></td>
  </tr>
  <tr>
    <td align="center">Assistants and chats</td>
    <td align="center">@ mentions and hand-off</td>
    <td align="center">Code changes wait for you</td>
    <td align="center">Deploy status after merge</td>
  </tr>
</table>

## What it is

- Several assistants share a group. Only people you `@` reply. A reply that `@`s someone else can continue the thread, up to 5 hops and 10 replies per message you send.
- The phone app is Expo (React Native). Open it with **Expo Go**. The interface is Chinese and English; Settings → Language can follow the phone or stay on one language.
- The same core runs on Cloudflare (Workers + Durable Objects) and on Node. The app talks to either one.
- A first launch with no model keys still creates a **demo group** (小橙, 阿蓝, 小绿). Those three are simulated. They are part of the app, not a real person's assistants.
- Optional later: a code host (GitHub, GitLab, Bitbucket, or Gitea/Forgejo — read files, open a pull request, merge only when you tap it), deploy status for Cloudflare Pages and Workers, Vercel, Netlify, Render, Railway, Fly.io, Azure Static Web Apps, or a custom webhook, file uploads, and a [bridge](bridge/README.md) on your own computer for Claude Code or Codex. Deploy tracking follows a GitHub repository. The project never logs into Claude.ai or ChatGPT. Hosting tokens are typed in the app; none of these platforms add a server environment variable.

The long-form Chinese README ([README.zh.md](README.zh.md)) stays the full reference for the HTTP API, adapters, and bridge protocol. You do not need it to deploy.

## You host it

AgentHub is not a hosted service you sign up for. Deploy a copy into **your** Cloudflare account (or run the Node server yourself) and point the app at that server.

The practical phone path is: fork this repo, store five secrets in **that fork**, let GitHub Actions deploy a Worker, then open the app in Expo Go. Step-by-step, still only a phone: **[Phone deploy guide](docs/mobile-deploy.md)**.

## Privacy

- **Model API keys stay on the server you deploy.** You type them in the app. The server encrypts them (AES-256-GCM; the key comes from your `AGENTHUB_SECRET`) and never sends the plaintext back. The app shows a masked preview only.
- **This project does not receive those keys.** There is no AgentHub account and no shared key store in this repo. A public demo of someone else's assistants is not part of the app.
- **GitHub and hosting tokens** are stored the same way: encrypted on your server, masked in the app, and kept out of model prompts and error text.
- **`AGENTHUB_TOKEN`** is the access token the app uses to talk to your server. Anyone with it can use the assistants on that server, so treat it like a password. It is saved in the phone's secure storage (iOS Keychain / Android Keystore).
- **`AGENTHUB_SECRET`** only encrypts secrets at rest. Back it up. If you change or lose it, saved keys cannot be decrypted; create the assistants again. Do not commit either value. `.env` is gitignored; committed examples are empty.

## Bring your own keys

Cloudflare, Expo, and GitHub accounts are yours. So are the model credentials.

| You provide | Used for |
| --- | --- |
| Cloudflare API token + account ID | GitHub Actions deploys the Worker into your account |
| Expo access token | GitHub Actions publishes the app update to your Expo account |
| `AGENTHUB_TOKEN` | App login to your server. You generate it. At least 16 characters |
| `AGENTHUB_SECRET` | Encrypts keys stored on your server. You generate it. At least 16 characters. Back it up |
| Model base URL, API key, and model name | Only when you add a real assistant. Any OpenAI-compatible endpoint. The demo group does not need one |
| GitHub, GitLab, Bitbucket, or Gitea/Forgejo token, and optional host tokens | Only when you connect those plugins. Tokens stay on your server. |

Leave every example blank. Fill the real values only in GitHub Actions secrets, Cloudflare secrets, or a local `.env` that stays on your machine. Do not open a pull request that contains them.

## Quick start (Cloudflare + Expo Go)

About 20–30 minutes on a phone. The [phone deploy guide](docs/mobile-deploy.md) is the full checklist. Short version:

1. Fork this repository into your GitHub account. Secrets go on the fork, not on someone else's repo.
2. Create a Cloudflare API token (Edit Cloudflare Workers template) and copy your account ID. In Workers & Pages, set a `workers.dev` subdomain if you do not have one yet.
3. Create an Expo access token at [expo.dev](https://expo.dev) → Account settings → Access tokens.
4. Generate two different random strings (password manager, 32+ characters, letters and digits are easiest to paste). Name them `AGENTHUB_TOKEN` and `AGENTHUB_SECRET`. Store both in a password manager before you continue.
5. On the fork: Settings → Secrets and variables → Actions. Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `EXPO_TOKEN`, `AGENTHUB_TOKEN`, and `AGENTHUB_SECRET`. Values only, no quotes or trailing spaces.
6. Actions → **Run workflow** on `main` for **Deploy server to Cloudflare** and **Publish App with EAS Update**. A fork does not run these by itself. Later pushes to `main` run them when the commit touches the paths those workflows watch (`worker/` and `core/` for the server, `app/` for the app).
7. In the server run summary, copy the `https://agenthub.<your-subdomain>.workers.dev` URL. Open `…/api/health` and expect `{"ok":true,"name":"AgentHub","configured":true}`.
8. Install **Expo Go**, sign in with the same Expo account, and open the **agenthub** project. On first launch: **Server address** = that URL (no trailing slash), **Access token** = your `AGENTHUB_TOKEN`, then **Connect and save**.
9. In the demo group, send `@小橙 hello`. The simulated members reply and may `@` each other, then stop on their own.

The Actions summaries are still written in Chinese. You do not need to translate them: use the `https://….workers.dev` URL, the `exp://u.expo.dev/…` line, and `文件上传：已开启` / `未开启` (file upload on or off).

## If you have a computer (Node)

Node.js 22 (20 or newer). From the repo root:

```bash
npm install
cd server
npm run init-env   # writes server/.env and prints an access token
npm run dev        # http://localhost:8787
```

`init-env` generates `AGENTHUB_TOKEN` and `AGENTHUB_SECRET` for you. The file it writes is gitignored. Empty names and comments live in [server/.env.example](server/.env.example). In another terminal, `cd app && npm install && npx expo start`, then point the app at your LAN address, for example `http://192.168.1.20:8787`.

Production is `npm run build && npm start` inside `server/`. Put HTTPS in front of it yourself (a Cloudflare Tunnel is one option). Set `HOST=127.0.0.1` when only the tunnel should reach the process.

Local Cloudflare dev, with your own stand-in secrets of at least 16 characters:

```bash
cd worker
npx wrangler dev --var AGENTHUB_TOKEN:<at-least-16-chars> --var AGENTHUB_SECRET:<at-least-16-chars>
```

## Deploy button

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chen090728/agent-room)

The button builds the Worker from this repo and asks you for `AGENTHUB_TOKEN` and `AGENTHUB_SECRET` ([.dev.vars.example](.dev.vars.example) only names them). It has not been verified against a live account. It does not enable R2 file storage and does not publish the Expo app. Prefer the GitHub Actions path above when you want “push (or Run workflow) deploys the server and the app.”

## Layout

```
core/     shared TypeScript: coordinator, adapters, crypto, storage, HTTP API
server/   Node server (node:http, ws, SQLite)
worker/   Cloudflare Workers + Durable Objects
app/      Expo app, opened with Expo Go
bridge/   small program on your computer for Claude Code / Codex
docs/     phone deploy guide (Chinese and English)
```

## License

Source-available under [Elastic License 2.0](LICENSE) (ELv2). Licensor: chen090728.

You may download, modify, and deploy it for yourself or your team. You may not offer it as a hosted or SaaS product to third parties. Keep the license and copyright notice when you distribute changes. Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The license text wins over this summary.
