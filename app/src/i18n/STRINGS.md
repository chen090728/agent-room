# App strings

Step 2 replaces the Chinese literals in the source files below with `t('key')` from `app/src/i18n`. Do not change copy while doing that. This file is the mechanical map.

Call `initI18n()` once at startup before any screen reads `useLanguage()` / `useAppTranslation()`. Nothing in this step is wired into a screen.

## How to call a key

- Interpolation: `t('home.deleteTitle', { name })` with `{{name}}` in the string.
- Plurals: keys ending in `_one` / `_other` are one i18next plural. Call the base key with `count`, for example `t('pr.moreFiles', { count })`. Do not call `pr.moreFiles_one` yourself. Chinese has no plural category, so i18next selects `_other` for every count; the `_one` Chinese string is the same text, kept so a wrong suffix still reads correctly.
- Dates (`time.*`): `format.ts` composes these. Chinese clock is `{{period}} {{hour}}:{{minute}}` (12-hour, 凌晨/上午/中午/下午/晚上). English clock is `{{hour}}:{{minute}} {{period}}` with period `AM` or `PM`. `time.date` is `{{month}}{{day}}日` in Chinese (`month` is `1月` …) and `{{month}} {{day}}` in English (`month` is `Jan` …). `time.full` is the screenshot timestamp and should keep a 24-hour clock.
- `home.from` is the list prefix `名字：正文`. The inner preview (files changed, photo, file) is a separate key, then wrapped with `home.from` for groups.

## Not in this map

- Field labels and placeholders that the server sends (接口地址, API Key, 模型名, 支持看图, 细粒度访问令牌, and the other integration fields). The app prints `f.label` / `f.placeholder` as returned. See `SERVER_COPY.md`. The vision switch’s subtitle is `member.visionHint`; its title is the server label.
- System notices, the demo welcome, and mock replies. Those are server text. See `SERVER_COPY.md`.
- The command placeholder `…` in `BridgePairing.tsx` before a pairing code exists. It is the same glyph in both languages.

## Appearance and language rows

`settings.appearance.*` matches `THEME_PREFERENCE_LABELS` on branch `dark/theme-foundation` (`app/src/theme/preference.ts`: 跟随系统 / 浅色 / 深色). That branch is not on main. Do not edit it or its files. When the settings screen gains an appearance control, use these keys instead of those hardcoded labels. `settings.appearance.title` (外观 / Appearance) is the section title; the branch itself only has the three choice labels.

`settings.language.*` is the new language row for this feature (语言 / Language, 跟随系统 / System, 中文, English). No screen shows it yet. The choice labels 中文 and English stay in their own language in both catalogs. Wire it with `useLanguage()`: `preference` is `system` | `zh` | `en`, `setPreference` persists it, `language` is the resolved `zh` | `en`.

## Translation notes

A few English lines are judgment calls. They are repeated under the key when it matters.

- 模拟 → Demo (not Mock).
- 接力 → Relay.
- 人设 → Persona.
- 青色 → Teal. 杏色 → Apricot. 四叶花 → Flower. 豆子 → Bean.
- 凌晨 through 晚上 collapse to AM/PM. See `time.period.*`.
- 已拒绝 → Declined (GitHub would say Closed).
- 同意合并 → Merge.
- Default nickname 我 → Me.
- Example name 小青 → Quinn.
- Plugin help keeps the third-party product’s own English menu labels.

322 keys in 21 groups: common, home, chat, composer, attachments, avatar, sheets, bridge, deployment, pr, error, time, photo, permissions, api, plugins, pluginDetail, settings, member, group, chatSettings.


### common.cancel

- zh: 取消
- en: Cancel
- sources:
  - app/src/dialogs.ts

### common.close

- zh: 关闭
- en: Close
- sources:
  - app/src/sheets.tsx

### common.back

- zh: 返回
- en: Back
- sources:
  - app/src/sheets.tsx
  - app/src/app/member/pair.tsx

### common.loading

- zh: 加载中…
- en: Loading...
- sources:
  - app/src/app/chat/[id]/index.tsx

### common.save

- zh: 保存
- en: Save
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### common.clear

- zh: 清除
- en: Clear
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### common.change

- zh: 更换
- en: Change
- sources:
  - app/src/sheet-content/PluginsSheet.tsx
  - app/src/sheet-content/PluginDetailSheet.tsx

### common.disconnect

- zh: 断开
- en: Disconnect
- sources:
  - app/src/sheet-content/PluginsSheet.tsx
  - app/src/sheet-content/SettingsSheet.tsx

### common.file

- zh: 文件
- en: File
- sources:
  - app/src/components/Attachments.tsx

### common.pdf

- zh: PDF
- en: PDF
- sources:
  - app/src/components/Attachments.tsx

### common.newAssistant

- zh: 新建助手
- en: New assistant
- sources:
  - app/src/app/index.tsx
  - app/src/app/chat/[id]/index.tsx
  - app/src/sheet-content/ChatSettingsSheet.tsx
  - app/src/sheet-content/NewGroupSheet.tsx
  - app/src/sheet-content/NewMemberSheet.tsx

### common.newGroup

- zh: 新建群聊
- en: New group
- sources:
  - app/src/app/index.tsx
  - app/src/app/chat/[id]/index.tsx
  - app/src/sheet-content/NewGroupSheet.tsx

### common.connecting

- zh: 连接中…
- en: Connecting...
- sources:
  - app/src/app/index.tsx
  - app/src/sheet-content/SettingsSheet.tsx

### common.actionFailed

- zh: 操作失败
- en: Something went wrong
- sources:
  - app/src/components/PullRequestCard.tsx
  - app/src/sheet-content/PluginDetailSheet.tsx

### home.settingsA11y

- zh: 我的设置
- en: Settings
- sources:
  - app/src/app/index.tsx

### home.newA11y

- zh: 新建
- en: New
- sources:
  - app/src/app/index.tsx

### home.searchPlaceholder

- zh: 搜索助手和群聊
- en: Search
- sources:
  - app/src/app/index.tsx

### home.searchA11y

- zh: 搜索助手和群聊
- en: Search assistants and chats
- sources:
  - app/src/app/index.tsx

### home.emptySearch

- zh: 没有匹配的助手或群聊
- en: No matches
- sources:
  - app/src/app/index.tsx

### home.empty

- zh: 还没有助手，点右上角的加号新建一个
- en: No assistants yet. Tap + to create one.
- sources:
  - app/src/app/index.tsx

### home.offline

- zh: 离线
- en: Offline
- sources:
  - app/src/app/index.tsx

### home.pendingA11y

- zh: 待处理
- en: Needs review
- sources:
  - app/src/app/index.tsx

### home.deleteTitle

- zh: 删除「{{name}}」？
- en: Delete “{{name}}”?
- sources:
  - app/src/app/index.tsx

### home.deleteMessage

- zh: 会同时删除和它的单聊入口；它在群聊里发过的消息会保留。
- en: This also removes their direct chat. Messages they sent in groups stay.
- sources:
  - app/src/app/index.tsx

### home.deleteConfirm

- zh: 删除
- en: Delete
- sources:
  - app/src/app/index.tsx

### home.deleteFailed

- zh: 删除失败
- en: Couldn't delete
- sources:
  - app/src/app/index.tsx

### home.mockTag

- zh: 模拟
- en: Demo
- note: Short role suffix. “Demo” reads as product copy; “Mock” would sound like a developer term.
- sources:
  - app/src/app/index.tsx

### home.someone

- zh: 成员
- en: Someone
- sources:
  - app/src/app/index.tsx

### home.thinking

- zh: {{name}} 正在思考…
- en: {{name}} is thinking...
- sources:
  - app/src/app/index.tsx

### home.photo

- zh: [图片]
- en: [Photo]
- sources:
  - app/src/app/index.tsx

### home.file

- zh: [文件]
- en: [File]
- sources:
  - app/src/app/index.tsx

### home.from

- zh: {{name}}：{{text}}
- en: {{name}}: {{text}}
- sources:
  - app/src/app/index.tsx

### home.openDirect

- zh: 点开开始聊天
- en: Tap to chat
- sources:
  - app/src/app/index.tsx

### home.noMessages

- zh: 还没有消息
- en: No messages yet
- sources:
  - app/src/app/index.tsx

### home.filesChanged_one

- zh: 改了 {{count}} 个文件，等你确认
- en: Changed {{count}} file, waiting for you
- plural: `t('home.filesChanged', { count })`
- sources:
  - app/src/app/index.tsx

### home.filesChanged_other

- zh: 改了 {{count}} 个文件，等你确认
- en: Changed {{count}} files, waiting for you
- plural: `t('home.filesChanged', { count })`
- sources:
  - app/src/app/index.tsx

### home.deployReady

- zh: {{platform}} 部署完成
- en: {{platform}} deployed
- sources:
  - app/src/app/index.tsx

### home.deployFailed

- zh: {{platform}} 部署失败
- en: {{platform}} deploy failed
- sources:
  - app/src/app/index.tsx

### home.deploying

- zh: 正在部署到 {{platform}}
- en: Deploying to {{platform}}
- sources:
  - app/src/app/index.tsx

### chat.notFound

- zh: 群聊不存在
- en: Chat not found
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.backToList

- zh: 回到列表
- en: Back to list
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.backHomeA11y

- zh: 回到助手和群聊
- en: Back to chats
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.settingsA11y

- zh: {{name}}，对话设置
- en: {{name}}, chat settings
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.moreA11y

- zh: 更多
- en: More
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.connecting

- zh: 正在连接服务器…
- en: Connecting...
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.reconnecting

- zh: 与服务器断开，正在重连…
- en: Disconnected. Reconnecting...
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.emptyDirect

- zh: 发一句话，开始聊天吧
- en: Say something to start
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.emptyGroup

- zh: 还没有消息，@ 一位成员开始聊天吧
- en: No messages yet. @ someone to start.
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.notConnected

- zh: 还没有连接服务器
- en: Not connected to a server
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.placeholderDirect

- zh: 给{{name}}发消息
- en: Message {{name}}
- sources:
  - app/src/app/chat/[id]/index.tsx

### chat.placeholderGroup

- zh: 给群里发消息，@ 点名
- en: Message the group, @ to mention
- sources:
  - app/src/app/chat/[id]/index.tsx
  - app/src/components/Composer.tsx

### chat.relay

- zh: 接力 {{hop}} / {{max}}
- en: Relay {{hop}} / {{max}}
- note: Product term 接力. “Relay” matches the code; “Round” would also be plausible.
- sources:
  - app/src/app/chat/[id]/index.tsx
  - app/src/components/RelayDots.tsx

### chat.typing

- zh: {{name}} 正在思考
- en: {{name}} is thinking
- sources:
  - app/src/components/MessageItem.tsx

### chat.sending

- zh: 发送中
- en: Sending
- sources:
  - app/src/components/MessageItem.tsx

### chat.sendFailedRetry

- zh: 发送失败，点击重试
- en: Couldn't send. Tap to retry
- sources:
  - app/src/components/MessageItem.tsx

### composer.photo

- zh: 图片
- en: Photo
- sources:
  - app/src/components/Composer.tsx

### composer.file

- zh: 文件
- en: File
- sources:
  - app/src/components/Composer.tsx

### composer.plugins

- zh: 插件
- en: Plugins
- sources:
  - app/src/components/Composer.tsx

### composer.mention

- zh: @ 成员
- en: @ Mention
- sources:
  - app/src/components/Composer.tsx

### composer.uploadFailed

- zh: 「{{name}}」没能上传
- en: Couldn't upload “{{name}}”
- sources:
  - app/src/components/Composer.tsx

### composer.maxFiles_one

- zh: 一条消息最多带 {{count}} 个文件
- en: Up to {{count}} file per message
- plural: `t('composer.maxFiles', { count })`
- sources:
  - app/src/components/Composer.tsx

### composer.maxFiles_other

- zh: 一条消息最多带 {{count}} 个文件
- en: Up to {{count}} files per message
- plural: `t('composer.maxFiles', { count })`
- sources:
  - app/src/components/Composer.tsx

### composer.chipUploadingA11y

- zh: {{name}}，上传中
- en: {{name}}, uploading
- sources:
  - app/src/components/Composer.tsx

### composer.removeA11y

- zh: 移除 {{name}}
- en: Remove {{name}}
- sources:
  - app/src/components/Composer.tsx

### composer.addA11y

- zh: 添加附件或点名
- en: Add attachment or mention
- sources:
  - app/src/components/Composer.tsx

### composer.messageA11y

- zh: 消息
- en: Message
- sources:
  - app/src/components/Composer.tsx

### composer.sendA11y

- zh: 发送
- en: Send
- sources:
  - app/src/components/Composer.tsx

### composer.defaultImageName

- zh: 图片.{{ext}}
- en: image.{{ext}}
- sources:
  - app/src/components/Composer.tsx

### attachments.openFailed

- zh: 打不开这个文件
- en: Couldn't open this file
- sources:
  - app/src/components/Attachments.tsx

### attachments.fileA11y

- zh: {{name}}，{{size}}
- en: {{name}}, {{size}}
- sources:
  - app/src/components/Attachments.tsx

### avatar.previewA11y

- zh: 头像预览
- en: Avatar preview
- sources:
  - app/src/components/AvatarPicker.tsx
  - app/src/components/AnimatedBlob.tsx

### avatar.mineA11y

- zh: 我的头像
- en: My avatar
- sources:
  - app/src/components/Avatar.tsx

### avatar.shape

- zh: 形状
- en: Shape
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.color

- zh: 颜色
- en: Color
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.modelA11y

- zh: 所用模型
- en: Model
- sources:
  - app/src/components/ModelIcon.tsx

### avatar.shapeName.circle

- zh: 圆形
- en: Circle
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.cloud

- zh: 云朵
- en: Cloud
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.square

- zh: 方块
- en: Square
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.flower

- zh: 四叶花
- en: Flower
- note: 四叶花, kept short for VoiceOver. A longer gloss would be “four-petal flower”.
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.egg

- zh: 蛋形
- en: Egg
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.hexagon

- zh: 六边形
- en: Hexagon
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.triangle

- zh: 三角
- en: Triangle
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.capsule

- zh: 胶囊
- en: Capsule
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.star

- zh: 星星
- en: Star
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.diamond

- zh: 菱形
- en: Diamond
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.drop

- zh: 水滴
- en: Drop
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.shapeName.bean

- zh: 豆子
- en: Bean
- note: Shape name, kept as “Bean”.
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.black

- zh: 黑色
- en: Black
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.brown

- zh: 棕色
- en: Brown
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.red

- zh: 红色
- en: Red
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.orange

- zh: 橙色
- en: Orange
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.apricot

- zh: 杏色
- en: Apricot
- note: Hex is #F2A33A. “Apricot” rather than “peach”.
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.green

- zh: 绿色
- en: Green
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.teal

- zh: 青色
- en: Teal
- note: Palette id is teal. 青 can also mean cyan.
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.blue

- zh: 蓝色
- en: Blue
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.purple

- zh: 紫色
- en: Purple
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.pink

- zh: 粉色
- en: Pink
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### avatar.colorName.gray

- zh: 灰色
- en: Gray
- sources:
  - app/src/theme.ts
  - app/src/components/AvatarPicker.tsx

### sheets.dismissA11y

- zh: 点空白处关闭
- en: Tap outside to close
- sources:
  - app/src/sheets.tsx

### sheets.closeMenuA11y

- zh: 关闭菜单
- en: Close menu
- sources:
  - app/src/components/BubbleMenu.tsx

### bridge.title

- zh: 连接电脑
- en: Connect a computer
- sources:
  - app/src/app/member/pair.tsx

### bridge.workAssistant

- zh: 工作助手
- en: Work assistant
- sources:
  - app/src/components/BridgeMembers.tsx
  - app/src/sheet-content/NewMemberSheet.tsx

### bridge.connectA11y

- zh: {{name}}，连接电脑
- en: {{name}}, connect computer
- sources:
  - app/src/components/BridgeMembers.tsx

### bridge.online

- zh: 电脑已连接
- en: Computer connected
- sources:
  - app/src/components/BridgeMembers.tsx
  - app/src/components/BridgePairing.tsx

### bridge.pairedOffline

- zh: 已配对，电脑没有在线
- en: Paired, computer offline
- sources:
  - app/src/components/BridgeMembers.tsx
  - app/src/components/BridgePairing.tsx

### bridge.notPairedShort

- zh: 还没有配对电脑
- en: Not paired yet
- sources:
  - app/src/components/BridgeMembers.tsx

### bridge.status

- zh: 状态
- en: Status
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.notPaired

- zh: 还没有配对
- en: Not paired
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.computer

- zh: 电脑
- en: Computer
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.toolsLine

- zh: {{name}} · {{tools}}
- en: {{name}} · {{tools}}
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.toolJoiner

- zh: 、
- en: , 
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.followSteps

- zh: 在电脑上按下面的步骤操作
- en: Follow the steps on your computer
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.repair

- zh: 重新配对 / 换一台电脑
- en: Pair again / switch computer
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.code

- zh: 配对码
- en: Pairing code
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.codeA11y

- zh: 配对码 {{code}}
- en: Pairing code {{code}}
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.expired

- zh: 已过期
- en: Expired
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.codeHint

- zh: 10 分钟内有效，只能用一次
- en: Valid for 10 minutes, one time only
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.refreshExpired

- zh: 重新获取配对码
- en: Get a new code
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.refresh

- zh: 换一个配对码
- en: New code
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.onComputer

- zh: 在你的电脑上
- en: On your computer
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.step1

- zh: 1. 电脑上要先装好并登录 Claude Code 或 Codex（这是你自己的账号，AgentHub 看不到登录信息）。
- en: 1. Install and sign in to Claude Code or Codex on your computer. Those are your accounts — AgentHub never sees the login.
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.step2

- zh: 2. 在项目的 bridge 目录里运行 npm install 和 npm run build，得到 dist/agenthub-bridge.cjs。
- en: 2. In the project’s bridge folder, run npm install and npm run build. That produces dist/agenthub-bridge.cjs.
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.step3

- zh: 3. 配对（把下面这行粘贴到终端）：
- en: 3. Pair (paste this line into a terminal):
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.step4

- zh: 4. 开始接任务（在你想让它工作的目录里运行；默认只读，要让它改文件再加 --allow-write）：
- en: 4. Start taking tasks (run this in the folder it should work in). It is read-only unless you also pass --allow-write:
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.step5

- zh: 5. 上面的"状态"变成"电脑已连接"后，就可以在聊天里和这个助手说话了。使用 Claude Code、Codex 要遵守它们各自的使用条款，请自行确认。
- en: 5. When Status above says “Computer connected”, you can chat with this assistant. Check the terms of Claude Code and Codex yourself before using them.
- sources:
  - app/src/components/BridgePairing.tsx

### bridge.serverPlaceholder

- zh: 你的服务器地址
- en: your server address
- sources:
  - app/src/components/BridgePairing.tsx

### deployment.queued

- zh: 排队中
- en: Queued
- sources:
  - app/src/components/DeploymentCard.tsx

### deployment.building

- zh: 部署中
- en: Deploying
- sources:
  - app/src/components/DeploymentCard.tsx

### deployment.ready

- zh: 已上线
- en: Live
- sources:
  - app/src/components/DeploymentCard.tsx

### deployment.failed

- zh: 部署失败
- en: Failed
- sources:
  - app/src/components/DeploymentCard.tsx

### deployment.a11y

- zh: {{platform}} 部署 {{project}}：{{state}}
- en: {{platform}} deploy of {{project}}: {{state}}
- sources:
  - app/src/components/DeploymentCard.tsx

### deployment.openPreview

- zh: 打开预览
- en: Open preview
- sources:
  - app/src/components/DeploymentCard.tsx

### pr.open

- zh: 等你确认
- en: Needs review
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.merged

- zh: 已合并
- en: Merged
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.closed

- zh: 已拒绝
- en: Declined
- note: The card state is closed after 拒绝. Copy says “Declined”; GitHub’s own UI says “Closed”.
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.failed

- zh: 合并失败
- en: Merge failed
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.confirmTitle

- zh: 合并 #{{number}}？
- en: Merge #{{number}}?
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.confirmMessage

- zh: 「{{title}}」会合并进 {{repo}} 的 {{base}} 分支。
- en: “{{title}}” will be merged into {{base}} on {{repo}}.
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.confirm

- zh: 同意合并
- en: Merge
- note: Button, dialog confirm, and accessibility label. Short “Merge”, not “Agree to merge”.
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.a11y

- zh: 修改建议 #{{number}}：{{title}}，{{state}}
- en: Change #{{number}}: {{title}}, {{state}}
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.moreFiles_one

- zh: 另外 {{count}} 个文件
- en: {{count}} more file
- plural: `t('pr.moreFiles', { count })`
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.moreFiles_other

- zh: 另外 {{count}} 个文件
- en: {{count}} more files
- plural: `t('pr.moreFiles', { count })`
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.summary_one

- zh: 共 {{count}} 个文件 · 
- en: {{count}} file · 
- plural: `t('pr.summary', { count })`
- note: The +additions −deletions counts stay outside this string, in their own colored text nodes. Keep the trailing “ · ”.
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.summary_other

- zh: 共 {{count}} 个文件 · 
- en: {{count}} files · 
- plural: `t('pr.summary', { count })`
- note: Same as pr.summary_one.
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.reject

- zh: 拒绝
- en: Decline
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.retry

- zh: 重试合并
- en: Retry merge
- sources:
  - app/src/components/PullRequestCard.tsx

### pr.viewOnGitHub

- zh: 在 GitHub 查看
- en: View on GitHub
- sources:
  - app/src/components/PullRequestCard.tsx

### error.title

- zh: 出错了
- en: Something went wrong
- sources:
  - app/src/components/ErrorBoundary.tsx

### error.body

- zh: App 遇到了一个问题。可以截图这一页发给开发者，然后点"重新加载"。
- en: The app hit a problem. Screenshot this page for the developer, then tap Reload.
- sources:
  - app/src/components/ErrorBoundary.tsx

### error.reload

- zh: 重新加载
- en: Reload
- sources:
  - app/src/components/ErrorBoundary.tsx

### error.retry

- zh: 再试一次
- en: Try again
- sources:
  - app/src/components/ErrorBoundary.tsx

### time.today

- zh: 今天
- en: Today
- sources:
  - app/src/format.ts

### time.yesterday

- zh: 昨天
- en: Yesterday
- sources:
  - app/src/format.ts

### time.weekday.sun

- zh: 周日
- en: Sun
- sources:
  - app/src/format.ts

### time.weekday.mon

- zh: 周一
- en: Mon
- sources:
  - app/src/format.ts

### time.weekday.tue

- zh: 周二
- en: Tue
- sources:
  - app/src/format.ts

### time.weekday.wed

- zh: 周三
- en: Wed
- sources:
  - app/src/format.ts

### time.weekday.thu

- zh: 周四
- en: Thu
- sources:
  - app/src/format.ts

### time.weekday.fri

- zh: 周五
- en: Fri
- sources:
  - app/src/format.ts

### time.weekday.sat

- zh: 周六
- en: Sat
- sources:
  - app/src/format.ts

### time.period.lateNight

- zh: 凌晨
- en: AM
- note: English collapses 凌晨/上午 to AM and 中午/下午/晚上 to PM. Step 2 should pass a 12-hour clock into time.clock.
- sources:
  - app/src/format.ts

### time.period.morning

- zh: 上午
- en: AM
- note: Same AM/PM collapse as time.period.lateNight.
- sources:
  - app/src/format.ts

### time.period.noon

- zh: 中午
- en: PM
- note: Same AM/PM collapse as time.period.lateNight. Noon is not a separate English word here.
- sources:
  - app/src/format.ts

### time.period.afternoon

- zh: 下午
- en: PM
- note: Same AM/PM collapse as time.period.lateNight.
- sources:
  - app/src/format.ts

### time.period.evening

- zh: 晚上
- en: PM
- note: Same AM/PM collapse as time.period.lateNight.
- sources:
  - app/src/format.ts

### time.month.jan

- zh: 1月
- en: Jan
- sources:
  - app/src/format.ts

### time.month.feb

- zh: 2月
- en: Feb
- sources:
  - app/src/format.ts

### time.month.mar

- zh: 3月
- en: Mar
- sources:
  - app/src/format.ts

### time.month.apr

- zh: 4月
- en: Apr
- sources:
  - app/src/format.ts

### time.month.may

- zh: 5月
- en: May
- sources:
  - app/src/format.ts

### time.month.jun

- zh: 6月
- en: Jun
- sources:
  - app/src/format.ts

### time.month.jul

- zh: 7月
- en: Jul
- sources:
  - app/src/format.ts

### time.month.aug

- zh: 8月
- en: Aug
- sources:
  - app/src/format.ts

### time.month.sep

- zh: 9月
- en: Sep
- sources:
  - app/src/format.ts

### time.month.oct

- zh: 10月
- en: Oct
- sources:
  - app/src/format.ts

### time.month.nov

- zh: 11月
- en: Nov
- sources:
  - app/src/format.ts

### time.month.dec

- zh: 12月
- en: Dec
- sources:
  - app/src/format.ts

### time.clock

- zh: {{period}} {{hour}}:{{minute}}
- en: {{hour}}:{{minute}} {{period}}
- sources:
  - app/src/format.ts

### time.separatorToday

- zh: 今天 {{clock}}
- en: Today, {{clock}}
- sources:
  - app/src/format.ts

### time.separatorYesterday

- zh: 昨天 {{clock}}
- en: Yesterday, {{clock}}
- sources:
  - app/src/format.ts

### time.separatorWeekday

- zh: {{weekday}} {{clock}}
- en: {{weekday}}, {{clock}}
- sources:
  - app/src/format.ts

### time.separatorDate

- zh: {{date}} {{clock}}
- en: {{date}}, {{clock}}
- sources:
  - app/src/format.ts

### time.date

- zh: {{month}}{{day}}日
- en: {{month}} {{day}}
- sources:
  - app/src/format.ts

### time.shortDate

- zh: {{month}}/{{day}}
- en: {{month}}/{{day}}
- sources:
  - app/src/format.ts

### time.full

- zh: {{date}} {{hour}}:{{minute}}
- en: {{date}}, {{hour}}:{{minute}}
- note: Screenshot log. Pass a 24-hour hour so English stays “Oct 25, 14:03”.
- sources:
  - app/src/format.ts

### photo.cameraDenied

- zh: 没有相机权限。请在系统设置里允许 AgentHub 使用相机
- en: Camera access is off. Allow AgentHub in Settings.
- sources:
  - app/src/photo.ts

### photo.processFailed

- zh: 处理图片失败
- en: Couldn't process the photo
- sources:
  - app/src/photo.ts

### permissions.photos

- zh: AgentHub 需要访问相册，用来选择头像和要发送的图片。
- en: AgentHub needs photo library access to choose an avatar and pictures to send.
- note: Baked into app.json for a standalone build. Expo Go does not show it, and a language switch cannot change it without a new native build.
- sources:
  - app/app.json

### permissions.camera

- zh: AgentHub 需要使用相机，用来拍摄头像。
- en: AgentHub needs the camera to take an avatar photo.
- note: Same constraint as permissions.photos.
- sources:
  - app/app.json

### api.unreachable

- zh: 连不上服务器，请检查地址和网络
- en: Can't reach the server. Check the address and your network.
- sources:
  - app/src/api.ts

### api.httpStatus

- zh: 服务器返回 {{status}}
- en: Server returned {{status}}
- sources:
  - app/src/api.ts

### api.readFailed

- zh: 读取这个文件失败
- en: Couldn't read this file
- sources:
  - app/src/api.ts

### api.tooBig

- zh: 文件太大，最多 {{size}}
- en: File is too large. {{size}} max.
- note: Pass size as “10 MB”. The screen currently hardcodes that limit.
- sources:
  - app/src/api.ts

### plugins.title

- zh: 插件
- en: Plugins
- sources:
  - app/src/components/Composer.tsx
  - app/src/sheet-content/PluginsSheet.tsx
  - app/src/sheet-content/PluginDetailSheet.tsx

### plugins.githubDescription

- zh: 读取代码、通过 PR 提交修改（合并前要你确认）
- en: Read code and open pull requests (you confirm before anything merges)
- sources:
  - app/src/plugins.ts

### plugins.deployDescription

- zh: 合并后在群里显示部署进度和预览链接
- en: After a merge, show deploy progress and a preview link in the chat
- sources:
  - app/src/plugins.ts

### plugins.fallbackPlatform

- zh: 部署平台
- en: Deploy platform
- sources:
  - app/src/plugins.ts

### plugins.intro

- zh: 给「{{name}}」添加插件。令牌加密保存在你的服务器上。
- en: Add plugins to “{{name}}”. Tokens are encrypted on your server.
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.connect

- zh: 连接
- en: Connect
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.unsupported

- zh: 这个服务器还不支持它，请先更新服务器
- en: This server doesn't support it yet. Update the server.
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.bound

- zh: 已绑定：{{target}}
- en: Bound: {{target}}
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.connected

- zh: 已连接 · {{name}}
- en: Connected · {{name}}
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.bind

- zh: 绑定
- en: Bind
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.needsRepo

- zh: 已连接 · 先绑定 GitHub 仓库，才能跟踪部署
- en: Connected · Bind a GitHub repo before tracking deploys
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.maskedNote

- zh: 令牌只保存在你的服务器上，这里只显示打码后的样子
- en: Tokens stay on your server. Only a masked preview is shown here.
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.connectTitle

- zh: 连接 {{name}}
- en: Connect {{name}}
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.info

- zh: 连接信息
- en: Connection
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.unsupportedNamed

- zh: 这个服务器还不支持 {{name}}。请先更新服务器（重新部署最新版本）。
- en: This server doesn't support {{name}} yet. Update the server (redeploy the latest version).
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.encryptedNote

- zh: 令牌加密保存在你的服务器上
- en: The token is encrypted on your server
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.verify

- zh: 验证并保存
- en: Verify and save
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.saveFailed

- zh: 保存失败
- en: Couldn't save
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.disconnectTitle

- zh: 断开「{{name}}」？
- en: Disconnect “{{name}}”?
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.disconnectMessage

- zh: 会同时解除所有用到它的对话的绑定，服务器上保存的令牌也会被删掉。
- en: This unbinds every chat using it and deletes the saved token.
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.disconnectFailed

- zh: 断开失败
- en: Couldn't disconnect
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.pickRepo

- zh: 选择仓库
- en: Choose a repository
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.pickProject

- zh: 选择部署项目
- en: Choose a project
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.repoHint

- zh: 绑定后，这个对话里的助手可以读取这个仓库，并通过 PR 提交修改。
- en: Once bound, assistants in this chat can read the repo and open pull requests.
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.deployHint

- zh: 绑定后，你在聊天里点"同意合并"，群里会显示这个项目的部署进度和预览链接。
- en: After you tap Merge in the chat, the group shows this project’s deploy progress and a preview link.
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.searchPlaceholder

- zh: 搜索仓库，或直接输入 所有者/仓库名
- en: Search repos, or type owner/repo
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.searchA11y

- zh: 搜索仓库
- en: Search repositories
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.useTyped

- zh: 使用 {{name}}
- en: Use {{name}}
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.current

- zh: 当前
- en: Current
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.emptyRepos

- zh: 没有找到仓库。细粒度令牌只能看到你授权过的仓库。
- en: No repositories. A fine-grained token only sees repos you authorized.
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.emptyProjects

- zh: 这个账号下还没有项目。
- en: No projects on this account yet.
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.disconnectNamed

- zh: 断开「{{name}}」
- en: Disconnect “{{name}}”
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.rowA11y

- zh: {{name}}，{{action}}
- en: {{name}}, {{action}}
- sources:
  - app/src/sheet-content/PluginsSheet.tsx

### plugins.help.github.step1

- zh: 1. 在 GitHub 网页打开 Settings → Developer settings → Personal access tokens → Fine-grained tokens，点 Generate new token。
- en: 1. On GitHub, open Settings → Developer settings → Personal access tokens → Fine-grained tokens, then Generate new token.
- note: GitHub / Vercel / Netlify / Render / Cloudflare menu labels are left in those products’ own English. The steps were not rechecked against the live sites.
- sources:
  - app/src/plugins.ts

### plugins.help.github.step2

- zh: 2. Repository access 选"Only select repositories"，勾选要给助手用的仓库。
- en: 2. Under Repository access, choose “Only select repositories” and select the repos this assistant should use.
- sources:
  - app/src/plugins.ts

### plugins.help.github.step3

- zh: 3. Permissions → Repository permissions 里，把 Contents 和 Pull requests 设为 Read and write。
- en: 3. Under Permissions → Repository permissions, set Contents and Pull requests to Read and write.
- sources:
  - app/src/plugins.ts

### plugins.help.github.step4

- zh: 4. 生成后复制令牌（以 github_pat_ 开头），粘贴到下面。
- en: 4. Copy the token (it starts with github_pat_) and paste it below.
- sources:
  - app/src/plugins.ts

### plugins.help.vercel.step1

- zh: 1. 在 Vercel 网页打开 Account Settings → Tokens，创建一个令牌（范围选你的账号或团队）。
- en: 1. On Vercel, open Account Settings → Tokens and create a token for your account or team.
- sources:
  - app/src/plugins.ts

### plugins.help.vercel.step2

- zh: 2. 项目要已经在 Vercel 里连接了对应的 GitHub 仓库；合并后 Vercel 会自动部署，AgentHub 只负责跟踪进度。
- en: 2. The project must already be connected to the matching GitHub repo on Vercel. After a merge, Vercel deploys on its own; AgentHub only tracks progress.
- sources:
  - app/src/plugins.ts

### plugins.help.vercel.step3

- zh: 3. 项目属于团队时，把团队 ID（team_ 开头）填到下面。
- en: 3. If the project belongs to a team, paste the team ID (it starts with team_) below.
- sources:
  - app/src/plugins.ts

### plugins.help.vercel.step4

- zh: 4. Vercel 不能从这里触发部署，所以必须开着自动部署。
- en: 4. Vercel can't be triggered from here, so automatic deploys must be on.
- sources:
  - app/src/plugins.ts

### plugins.help.netlify.step1

- zh: 1. 在 Netlify 网页打开 User settings → Applications → Personal access tokens，新建一个令牌。
- en: 1. On Netlify, open User settings → Applications → Personal access tokens and create a token.
- sources:
  - app/src/plugins.ts

### plugins.help.netlify.step2

- zh: 2. 站点要已经连接了对应的 GitHub 仓库。合并后如果 Netlify 没有自动开始部署，AgentHub 会替你触发一次。
- en: 2. The site must already be connected to the matching GitHub repo. If Netlify doesn't start a deploy after a merge, AgentHub will trigger one.
- sources:
  - app/src/plugins.ts

### plugins.help.render.step1

- zh: 1. 在 Render 网页打开 Account Settings → API Keys，创建一个 API Key。
- en: 1. On Render, open Account Settings → API Keys and create an API key.
- sources:
  - app/src/plugins.ts

### plugins.help.render.step2

- zh: 2. 服务要已经连接了对应的 GitHub 仓库。合并后如果 Render 没有自动开始部署，AgentHub 会替你触发一次。
- en: 2. The service must already be connected to the matching GitHub repo. If Render doesn't start a deploy after a merge, AgentHub will trigger one.
- sources:
  - app/src/plugins.ts

### plugins.help.cloudflare.step1

- zh: 1. 在 Cloudflare 网页打开 My Profile → API Tokens，创建令牌，权限选 Account → Cloudflare Pages → Edit。
- en: 1. On Cloudflare, open My Profile → API Tokens and create a token with Account → Cloudflare Pages → Edit.
- sources:
  - app/src/plugins.ts

### plugins.help.cloudflare.step2

- zh: 2. 账户 ID 在 Cloudflare 后台首页地址栏里（dash.cloudflare.com/ 后面那串 32 位字符）。
- en: 2. The account ID is the 32-character string after dash.cloudflare.com/ in the dashboard URL.
- sources:
  - app/src/plugins.ts

### plugins.help.cloudflare.step3

- zh: 3. 项目要已经连接了对应的 GitHub 仓库。合并后如果 Pages 没有自动开始部署，AgentHub 会替你触发一次。
- en: 3. The project must already be connected to the matching GitHub repo. If Pages doesn't start a deploy after a merge, AgentHub will trigger one.
- sources:
  - app/src/plugins.ts

### pluginDetail.unbindRepoTitle

- zh: 解除仓库绑定？
- en: Unbind this repository?
- sources:
  - app/src/sheet-content/PluginDetailSheet.tsx

### pluginDetail.unbindDeployTitle

- zh: 不再跟踪部署？
- en: Stop tracking deploys?
- sources:
  - app/src/sheet-content/PluginDetailSheet.tsx

### pluginDetail.unbindRepoMessage

- zh: 助手之后就不能再读取这个仓库了。
- en: Assistants will no longer be able to read this repository.
- sources:
  - app/src/sheet-content/PluginDetailSheet.tsx

### pluginDetail.unbindDeployMessage

- zh: 合并之后群里不会再显示部署进度。
- en: The chat will no longer show deploy progress after a merge.
- sources:
  - app/src/sheet-content/PluginDetailSheet.tsx

### pluginDetail.unbind

- zh: 解除绑定
- en: Unbind
- sources:
  - app/src/sheet-content/PluginDetailSheet.tsx

### pluginDetail.repo

- zh: 代码仓库
- en: Repository
- sources:
  - app/src/sheet-content/PluginDetailSheet.tsx

### pluginDetail.project

- zh: 部署项目
- en: Project
- sources:
  - app/src/sheet-content/PluginDetailSheet.tsx

### pluginDetail.repoBody

- zh: 这个对话里的助手可以读取这个仓库，并通过 PR 提交修改；PR 要你点"同意合并"才会合并。
- en: Assistants in this chat can read this repository and open pull requests. A pull request merges only after you tap Merge.
- sources:
  - app/src/sheet-content/PluginDetailSheet.tsx

### pluginDetail.deployBody

- zh: 你在聊天里合并修改后，群里会显示这个项目的部署进度和预览链接。
- en: After you merge a change in the chat, the group shows this project’s deploy progress and a preview link.
- sources:
  - app/src/sheet-content/PluginDetailSheet.tsx

### settings.avatarFailed

- zh: 没能设置头像
- en: Couldn't set the avatar
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.disconnectTitle

- zh: 断开服务器
- en: Disconnect server
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.disconnectMessage

- zh: 会清除本机保存的地址和访问令牌。服务器上的数据不受影响。
- en: This clears the address and access token on this phone. Data on the server stays.
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.connectTitle

- zh: 连接服务器
- en: Connect to a server
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.title

- zh: 设置
- en: Settings
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.welcomeTitle

- zh: 欢迎使用 AgentHub
- en: Welcome to AgentHub
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.welcomeBody

- zh: 填写你自己部署的服务器地址和访问令牌（服务器的 AGENTHUB_TOKEN）。
- en: Enter the address and access token of the server you deployed (AGENTHUB_TOKEN).
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.me

- zh: 我
- en: Me
- note: Default nickname stored on the phone (storage.ts DEFAULT_PROFILE and the settings placeholder). New installs only; do not rewrite a name the user already saved.
- sources:
  - app/src/sheet-content/SettingsSheet.tsx
  - app/src/storage.ts
  - app/src/store.tsx

### settings.camera

- zh: 拍照
- en: Camera
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.library

- zh: 从相册选择
- en: Choose from library
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.useDefault

- zh: 使用默认头像
- en: Use default avatar
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.nickname

- zh: 昵称
- en: Name
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.profileNote

- zh: 昵称和头像只保存在这台手机上。
- en: Your name and photo stay on this phone.
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.online

- zh: 已连接
- en: Connected
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.offline

- zh: 未连接
- en: Not connected
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.server

- zh: 服务器
- en: Server
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.serverUrl

- zh: 服务器地址
- en: Server address
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.token

- zh: 访问令牌
- en: Access token
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.tokenSavedPlaceholder

- zh: 已保存，留空则不修改
- en: Saved. Leave blank to keep it.
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.tokenPlaceholder

- zh: 粘贴 AGENTHUB_TOKEN
- en: Paste AGENTHUB_TOKEN
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.tokenNote

- zh: 令牌保存在本机的系统安全存储中
- en: The token is stored in this phone's secure storage
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.clearErrorA11y

- zh: 清除上次错误
- en: Clear last error
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.lastError

- zh: 上次错误
- en: Last error
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.errorRender

- zh: 界面出错
- en: Screen error
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.errorFatal

- zh: 导致退出
- en: App quit
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.errorUnhandled

- zh: 未处理的错误
- en: Unhandled error
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.errorNote

- zh: 出问题时截图这里发给开发者。只保存在这台手机上。
- en: If something breaks, screenshot this and send it to the developer. It stays on this phone.
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.connectSave

- zh: 连接并保存
- en: Connect and save
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.appearance.title

- zh: 外观
- en: Appearance
- note: From branch `dark/theme-foundation` (`THEME_PREFERENCE_LABELS` in `app/src/theme/preference.ts`). Not on main. Do not edit that branch.
- sources:
  - dark/theme-foundation:app/src/theme/preference.ts

### settings.appearance.system

- zh: 跟随系统
- en: System
- note: From branch `dark/theme-foundation` (`THEME_PREFERENCE_LABELS` in `app/src/theme/preference.ts`). Not on main. Do not edit that branch.
- sources:
  - dark/theme-foundation:app/src/theme/preference.ts

### settings.appearance.light

- zh: 浅色
- en: Light
- note: From branch `dark/theme-foundation` (`THEME_PREFERENCE_LABELS` in `app/src/theme/preference.ts`). Not on main. Do not edit that branch.
- sources:
  - dark/theme-foundation:app/src/theme/preference.ts

### settings.appearance.dark

- zh: 深色
- en: Dark
- note: From branch `dark/theme-foundation` (`THEME_PREFERENCE_LABELS` in `app/src/theme/preference.ts`). Not on main. Do not edit that branch.
- sources:
  - dark/theme-foundation:app/src/theme/preference.ts

### settings.language.title

- zh: 语言
- en: Language
- note: New language row. Not shown by any screen yet.
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.language.system

- zh: 跟随系统
- en: System
- note: New language row. Not shown by any screen yet.
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.language.zh

- zh: 中文
- en: 中文
- note: New language row. Not shown by any screen yet.
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### settings.language.en

- zh: English
- en: English
- note: New language row. Not shown by any screen yet.
- sources:
  - app/src/sheet-content/SettingsSheet.tsx

### member.pickFailed

- zh: 没能选择图片
- en: Couldn't choose a photo
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.directMissing

- zh: 找不到这个助手的单聊
- en: Couldn't find this assistant's chat
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.avatarUploadFailed

- zh: 助手已创建，但头像图片没传上去
- en: Assistant created, but the photo didn't upload
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.uploadA11y

- zh: 上传图片
- en: Upload photo
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.upload

- zh: 上传图片作为头像
- en: Use a photo
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.removePicture

- zh: 不用图片
- en: Don't use a photo
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.name

- zh: 名字
- en: Name
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.namePlaceholder

- zh: 例如：小青
- en: e.g. Quinn
- note: 小青 is an example name, not a product string. English example is Quinn.
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.role

- zh: 角色标签
- en: Role
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.rolePlaceholder

- zh: 例如：产品经理
- en: e.g. Product manager
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.persona

- zh: 人设
- en: Persona
- note: “Persona” is the usual label in assistant apps.
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.personaPlaceholder

- zh: 它是谁、怎么说话、擅长什么。比如：挑剔的审查员，发现问题就 @ 负责的人。
- en: Who they are, how they talk, what they’re good at. For example: a picky reviewer who @s the right person when they find a problem.
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.type

- zh: 类型
- en: Type
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.chat

- zh: 聊天助手
- en: Chat assistant
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.tools

- zh: 电脑上的工具
- en: Tools on your computer
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.allowWrite

- zh: 允许修改文件
- en: Allow file changes
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.allowWriteHint

- zh: 默认只读，只看代码和回答问题；电脑上的 bridge 也要同意才行
- en: Read-only by default: look at code and answer questions. The bridge on your computer must allow writes too.
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.workNote

- zh: 创建后会给你一个配对码，在你的电脑上运行 bridge 并配对。它调用的是电脑里已经登录的 {{tool}}，AgentHub 不会接触你的登录信息；使用它们要遵守各自的使用条款，请自行确认。
- en: After you create it, you’ll get a pairing code. Run the bridge on your computer and pair. It uses the {{tool}} already signed in there. AgentHub never sees that login. Check each product’s terms yourself.
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.keyNote

- zh: Key 只存在你的服务器
- en: The key stays on your server
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.modelSection

- zh: 模型连接
- en: Model connection
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.mock

- zh: 模拟助手
- en: Demo assistant
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.mockHint

- zh: 不需要 Key，先体验效果
- en: No key needed. Try it out first.
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.visionHint

- zh: 关闭后不会把图片发给这个模型
- en: When off, pictures are not sent to this model
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.join

- zh: 加入当前群聊
- en: Add to this group
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.createAndPair

- zh: 创建并去配对
- en: Create and pair
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### member.create

- zh: 创建助手
- en: Create assistant
- sources:
  - app/src/sheet-content/NewMemberSheet.tsx

### group.name

- zh: 群名
- en: Group name
- sources:
  - app/src/sheet-content/NewGroupSheet.tsx

### group.namePlaceholder

- zh: 例如：产品讨论组
- en: e.g. Product discussion
- sources:
  - app/src/sheet-content/NewGroupSheet.tsx

### group.members

- zh: 选择成员
- en: Members
- sources:
  - app/src/sheet-content/NewGroupSheet.tsx

### group.create

- zh: 创建群聊
- en: Create group
- sources:
  - app/src/sheet-content/NewGroupSheet.tsx

### chatSettings.title

- zh: 对话设置
- en: Chat settings
- sources:
  - app/src/sheet-content/ChatSettingsSheet.tsx

### chatSettings.members

- zh: 群成员 · 已选 {{count}} 位
- en: Members · {{count}} selected
- sources:
  - app/src/sheet-content/ChatSettingsSheet.tsx

### chatSettings.noAssistants

- zh: 还没有助手
- en: No assistants yet
- sources:
  - app/src/sheet-content/ChatSettingsSheet.tsx

### chatSettings.saveMembers

- zh: 保存成员
- en: Save members
- sources:
  - app/src/sheet-content/ChatSettingsSheet.tsx

### chatSettings.directHint

- zh: 这是和 {{name}} 的单聊。点输入框左边的加号，可以给这个对话添加插件（GitHub、部署平台）。
- en: This is your chat with {{name}}. Tap + by the message box to add plugins (GitHub, deploy platforms).
- sources:
  - app/src/sheet-content/ChatSettingsSheet.tsx

### chatSettings.missing

- zh: 找不到这个对话
- en: Chat not found
- sources:
  - app/src/sheet-content/ChatSettingsSheet.tsx
