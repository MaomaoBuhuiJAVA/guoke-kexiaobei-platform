# Production Deployment

- The active production application source is `robot-console/` in this repository.
- The deployment target is Alibaba Cloud ECS running Ubuntu, Node.js 22, Nginx, and the `guoke-web` systemd service.
- The application listens on `127.0.0.1:3000`; PostgreSQL runs on ECS and media is stored in Alibaba Cloud OSS.
- Verify production state using the current ECS deployment records and checks against SSH, systemd, Nginx, and the public HTTP endpoints.
- Treat other workspace copies, temporary directories, and archived snapshots as historical material, not as production source or deployment status.

## 轻量部署与验收（必须执行）

- 所有生产包必须由 GitHub Actions 的 Ubuntu/Node.js 22 环境构建；ECS 禁止执行依赖安装或生产构建。
- ECS 服务入口固定为 `.next/standalone/server.js`；必须同时打包 `.next/standalone/.next/static` 与 `.next/standalone/public`，仅放在 release 根目录无效。
- 打包后执行 `node scripts/verify-standalone-package.mjs <release目录>`；缺少或不匹配的资源必须阻止发布。
- 上线验收不仅检查 HTML 200，还必须检查页面引用的 CSS、JS、图片响应、浏览器实际样式和至少一项交互。失败立即回滚。
- 发布记录、构建提交和校验结果推送 GitHub；生产运行密钥、用户数据和私人日志不得提交。
