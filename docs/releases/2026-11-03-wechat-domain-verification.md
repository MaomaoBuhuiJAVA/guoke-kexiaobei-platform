# 2026-11-03 微信小程序域名校验文件

## 变更

- 将微信提供的 `0G290B7c8s.txt` 放入 `robot-console/public/`，由 Next.js 静态文件服务从网站根路径提供。
- 文件内容：`a4a7ca0eca3960c129840d53164cdceb`。
- SHA-256：`c51bb4a2969a074d531aad27afffcea3fb69103def689f6d9431549bcedb410c`。
- 当前 ECS release 的 `public/` 与 `.next/standalone/public/` 均已安装同一文件，权限为 `guoke:guoke`、0644。
- 本次未变更数据库、Nginx 或应用代码版本；`guoke-web`、Nginx 和 PostgreSQL 验收时均为 active。

## 构建与验证

- Git 提交：`b5a33e3c91611aa892b4b316deb749ca98d4c332`。
- [GitHub Actions Linux production build](https://github.com/MaomaoBuhuiJAVA/guoke-kexiaobei-platform/actions/runs/41626642020)：测试、TypeScript 检查、Node.js 22 Linux 生产构建和 standalone 资源校验均通过。
- `https://guokeey.cn/0G290B7c8s.txt` 与 `https://www.guokeey.cn/0G290B7c8s.txt` 均返回 HTTP 200、`text/plain`，正文与微信校验串一致。
- 首页及抽查的 4 项 CSS/JS 资源均返回 HTTP 200。
- 桌面原文件、仓库文件和 ECS 文件 SHA-256 一致。
