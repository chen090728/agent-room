# 安全策略

如果你发现了安全问题（比如能绕过访问令牌、读到别人保存的 Key、或让 bridge 在未同意的情况下改文件），
请**不要**直接公开提 issue。请到仓库的 **Security → Report a vulnerability** 私下报告，
或通过 GitHub 个人主页上的联系方式联系维护者。

写清楚：影响范围、复现步骤、你测试用的版本。我们会尽快确认和修复。

使用提醒（详见 README 的"安全说明"）：

- 公网部署务必使用 HTTPS；
- 备份并保管好 `AGENTHUB_SECRET` 和 `AGENTHUB_TOKEN`，不要提交到仓库；
- GitHub 令牌用"细粒度令牌"，只授权需要的仓库；
- bridge 只配对给你自己的服务器，并用 `--workdir` 限制工作目录，谨慎使用 `--allow-write`。
