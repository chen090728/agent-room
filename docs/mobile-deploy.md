**中文：** [手机部署指南](手机部署指南.md)（同一套步骤）

# Deploy from a phone (Cloudflare free plan)

No computer and no server of your own to administer. A phone browser is enough. Plan on 20–30 minutes.

You need three accounts before you start: **Cloudflare**, **Expo**, and **GitHub**. This page starts at “create tokens.”

> ## Back up `AGENTHUB_SECRET` first
>
> `AGENTHUB_SECRET` encrypts the API keys you save. **Put it in a password manager as soon as you generate it.**
>
> **If you later change or lose it, keys already stored cannot be decrypted.** You would type each assistant key again in the app.
>
> It is not the same value as `AGENTHUB_TOKEN` (the token the app uses to log in). You can rotate the token. Do not rotate the secret once keys are saved.

Every value below is something **you** create. This guide never includes a real token. Examples are empty or obviously fake (`0123456789abcdef0123456789abcdef` is only a shape for an account ID).

## The five values

They all go into GitHub Actions secrets, on **your** fork. The names must match exactly:

| Secret name | What it is | Where it comes from |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Lets GitHub deploy into your Cloudflare account | Step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Step 1 |
| `EXPO_TOKEN` | Lets GitHub publish the app to your Expo account | Step 2 |
| `AGENTHUB_TOKEN` | Access token the app sends to your server | Step 3 (you generate it) |
| `AGENTHUB_SECRET` | Key that encrypts API keys at rest | Step 3 (you generate it, **back it up**) |

Keep a note or password-manager entry for each one as you go.

> Button labels below match the sites at the time this guide was written. If a site has moved a control, follow the same meaning.

---

## Step 1: Cloudflare — API token and account ID

### 1.1 Create an API token

1. Open <https://dash.cloudflare.com> and sign in.
2. Avatar (or the menu) → **My Profile** → **API Tokens**.
3. **Create Token**.
4. Find the **Edit Cloudflare Workers** template and choose **Use template**.
5. The template's permissions are enough. Leave the other options as they are. Under account resources pick your account. Under zone resources, all zones is fine.
6. **Continue to summary** → **Create Token**.
7. The page shows the token once. Copy it immediately and label it `CLOUDFLARE_API_TOKEN`.

> If a later deploy says `Authentication error` or mentions permissions, edit the token and confirm it includes Account → Workers Scripts → Edit.

### 1.2 Copy the account ID

Preferred: after you sign in, the address bar looks like `https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/...`. That **32-character** hex string is the account ID. The string in this sentence is a placeholder, not a real account.

Or: **Workers & Pages** → **Overview**. The **Account ID** is on the page (scroll on a phone). Copy it.

Label it `CLOUDFLARE_ACCOUNT_ID`.

### 1.3 Confirm a workers.dev subdomain

The server URL will look like `https://agenthub.<your-subdomain>.workers.dev`. If this account has never used Workers, the subdomain may not exist yet, and **deploy will fail until it does**.

1. Open **Workers & Pages**.
2. If the page asks you to set a subdomain, pick one (letters, digits, hyphens) and confirm.
3. If you already see something ending in `.workers.dev`, you are done.

---

## Step 2: Expo — access token

1. Open <https://expo.dev> and sign in.
2. **Account settings** → **Access tokens** (the avatar or menu opens account settings).
3. **Create token**. Any name is fine, for example `github-agenthub`.
4. Copy the token once and label it `EXPO_TOKEN`.

---

## Step 3: Generate `AGENTHUB_TOKEN` and `AGENTHUB_SECRET`

Generate **two different** long random strings yourself. Each one at least 16 characters; 32 or more is better. Do not reuse a token from this page, from a screenshot, or from anyone else's deploy.

Use the password generator on the phone:

- **iPhone:** Passwords app → **+** → in the password field choose the suggested strong password, then copy.
- **Android:** Google Password Manager, or another manager you already use (1Password, Bitwarden, …) → generate, length 32 or more, copy.

Then:

1. First string → `AGENTHUB_TOKEN`.
2. Second string → `AGENTHUB_SECRET`.
3. Save both in a password manager now. `AGENTHUB_SECRET` is the one you must not lose. See the warning at the top.

If the generator lets you choose a character set, letters and digits are easier to paste into the app. Symbols work too.

---

## Step 4: Add the five GitHub Actions secrets

1. Fork this repository into your own GitHub account if you have not already.
2. Open **that** repository: `https://github.com/<your-username>/<your-repo>`. Do not add secrets to a repository you do not own.
3. **Settings**. On a phone the tab may be under **…**, or switch the browser to the desktop site.
4. In the left menu (you may need **☰** first): **Secrets and variables** → **Actions**.
5. **New repository secret**.
6. **Name** is the secret name. **Secret** is the value. **Add secret**.
7. Repeat until all five exist: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `EXPO_TOKEN`, `AGENTHUB_TOKEN`, `AGENTHUB_SECRET`.

Names must match exactly, with no extra spaces. Do not include spaces or a newline around the value. GitHub will not show the value again; that is expected. Adding the same name again replaces the old value.

---

## Step 5: Run the deploy workflows

The workflows are already on `main`. You do not merge a separate “deploy” pull request. Forking also does not start Actions. The first time, start them by hand, or push a commit to `main` that touches the paths each workflow watches.

The two workflows:

- **Deploy server to Cloudflare** — test, deploy the Worker, write the token and secret into Cloudflare. It also runs on a push to `main` that changes `core/`, `worker/`, the root `package.json` or `package-lock.json`, or this workflow file.
- **Publish App with EAS Update** — typecheck, link the Expo project, publish the app. It also runs on a push to `main` that changes `app/` or this workflow file.

First deploy (also the right button after you change a secret, or when a commit only touched docs):

1. Open **Actions** on your fork. Enable Actions if GitHub asks.
2. **Deploy server to Cloudflare** → **Run workflow** → branch `main` → **Run workflow**.
3. Do the same for **Publish App with EAS Update**.

Open each run from the Actions list. Both should turn green in about 3–8 minutes. Later pushes to `main` that touch the paths above run them again. To repeat on purpose, use **Run workflow** the same way.

---

## Step 6: Find the server URL

The run summary is written in Chinese. You can still read the values without translating the page.

Easiest: Actions → the latest successful **Deploy server to Cloudflare** run → **Summary** at the bottom. Under the heading `部署完成` there is a URL like:

```
https://agenthub.<your-subdomain>.workers.dev
```

The line next to it is the app's **Server address**. `文件上传：已开启` means file upload is on; `未开启` means it is off (see the optional R2 section).

Or open the **deploy** job → **Deploy Worker** log and copy the same `*.workers.dev` URL.

Or, in the Cloudflare dashboard: **Workers & Pages** → **agenthub** → the visit URL on that page.

### Is the server actually up?

In the phone browser open:

```
https://agenthub.<your-subdomain>.workers.dev/api/health
```

- `{"ok":true,"name":"AgentHub","configured":true}` — ready.
- `"configured":false` — the token or secret did not land. Recheck `AGENTHUB_TOKEN` and `AGENTHUB_SECRET` in Step 4, then **Run workflow** on **Deploy server to Cloudflare** again.
- The page does not load — see Troubleshooting.

---

## Step 7: Open the app

The app opens in **Expo Go**. Install Expo Go from the store and sign in with the **same Expo account** that owns `EXPO_TOKEN`.

The app follows the phone language for Chinese and English. If the labels are not the ones below, Settings → **Language** → **English**.

### From the Expo Go project list (preferred)

After you sign in, the project list should include **agenthub**. Open it and pick the latest update. If it is missing, pull to refresh, and confirm this is the account that created `EXPO_TOKEN`.

### From the Actions summary

1. Actions → the latest successful **Publish App with EAS Update** run.
2. The summary heading is `App 已发布`. Copy the line that starts with `exp://u.expo.dev/`.
3. Paste it into the phone browser. It should hand off to Expo Go.

That hand-off was not verified on a device. If nothing opens, use the project list.

### QR code (needs a second screen)

The summary also links an updates page, `https://expo.dev/accounts/<your-account>/projects/agenthub/updates/...`, which shows a QR code. A phone cannot scan its own screen. Show that page on another screen, then scan with the phone that has Expo Go. Otherwise use the project list.

### First launch

1. You should see **Welcome to AgentHub** / **Connect to a server**:
   - **Server address:** the URL from Step 6, with `https://` and no trailing slash. Do not add `/api`.
   - **Access token:** the `AGENTHUB_TOKEN` from Step 3.
2. Tap **Connect and save**. You land in the demo group.
3. Send `@小橙 hello` (or `@小橙 你好`). The simulated members reply and may `@` each other for a few turns, then stop (at most 5 hops). 小橙, 阿蓝, and 小绿 are built-in demo members. They do not use a model key.

After that, changes under `app/` that land on `main` publish a new update. Reopen the app to get it.

---

## Afterward

- **Your own model:** New assistant, turn off the demo/mock assistant, and fill in the base URL, API key, and model name. The key is encrypted on your Cloudflare account. AgentHub does not have a copy.
- **Rotate the access token:** update the `AGENTHUB_TOKEN` secret, **Run workflow** on **Deploy server to Cloudflare**, then paste the new token in the app settings.
- **Do not change `AGENTHUB_SECRET`** once keys are saved (see the top of this page).

## Optional: file uploads (images, PDFs, code)

Images, PDFs, and code files are stored in Cloudflare **R2**. Skip this and everything else still works. The app will say the server has no file storage when you try to send a file.

> Turning R2 on can ask for a payment method. There is a free allowance; whether personal use stays inside it is up to the Cloudflare page you see that day. The control labels below may not match a redesigned dashboard.

1. Open <https://dash.cloudflare.com> → **R2 Object Storage**, and enable R2 if the page asks.
2. **My Profile → API Tokens**. Edit the token from Step 1 and add **Account → Workers R2 Storage → Edit**. Save. The token string does not change, so the GitHub secret stays as it is.
3. **Run workflow** again on **Deploy server to Cloudflare**. It creates a bucket named `agenthub-files` and binds it when it can.
4. In the summary, `文件上传：已开启` means upload is on. `未开启` means it is not. Open the **Prepare file storage (R2)** log for the reason (usually R2 is not enabled, or the token cannot edit R2).

Limits: 10 MB per file. Images (PNG, JPEG, GIF, WebP), PDF, and common text and code files. Images go to models that accept them. Text and code are sent as text. PDFs are text-extracted first (a scan with no text layer yields nothing).

## Will the free plan be enough?

For one person's chats, the Workers free plan is usually enough. Each group is a Durable Object. Messages and model replies spend a small amount of requests and storage. Daily request and storage caps change; use Cloudflare's current docs rather than a number copied here. If the cap is hit, the service pauses until the next day.

---

## Troubleshooting

**A run is red.** Actions → the failed run → the failed job → the step with the red mark. Read the last `error` lines.

**`GitHub Secrets 缺少` (missing secrets).** A name from Step 4 is absent or misspelled. Add the name the log prints, then **Run workflow** again.

**`至少需要 16 个字符` (`AGENTHUB_TOKEN` or `AGENTHUB_SECRET` is shorter than 16 characters).** Generate a longer value. If `AGENTHUB_SECRET` already protects saved keys, do not replace it; lengthen only a secret that has never been used to encrypt keys.

**`Authentication error` / `You do not have permission`.** The Cloudflare API token is wrong or too narrow. Repeat 1.1 and update `CLOUDFLARE_API_TOKEN`.

**workers.dev subdomain error.** Finish 1.3, then run the deploy workflow again.

**EAS says you are not logged in, or the token is invalid.** `EXPO_TOKEN` is wrong. Repeat Step 2 and update the secret.

**EAS complains about the project.** The first successful run creates a project named `agenthub` under your Expo account. If that slug is already taken by another project in the account, rename or remove the other one on expo.dev, then run the workflow again.

**The app says the server has no file storage.** R2 is off. See the optional section above.

**The app cannot reach the server.**

- Open `…/api/health` in the phone browser first.
- The address starts with `https://`, has no trailing slash, and does not end in `/api`.
- The access token matches `AGENTHUB_TOKEN` in GitHub exactly.

**The app says the access token is invalid.** It was copied with a space, or it is a different string than the secret.

**An assistant replies with a 401 (or similar) from the model API.** That is your model endpoint rejecting the request: base URL, API key, or model name. Create the assistant again with the correct values. Those credentials never belong in git.

**`AGENTHUB_SECRET` was lost or changed.** Saved keys are gone. Set a new secret, redeploy, and create each keyed assistant again. Names must be unique. The demo members are unaffected.
