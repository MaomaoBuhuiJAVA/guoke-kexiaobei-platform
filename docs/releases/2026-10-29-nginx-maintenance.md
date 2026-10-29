# 2026-10-29 网站维护保底页发布

## 变更

增加 Nginx 独立静态维护页。网页请求在应用停机、连接失败或返回 500/502/503/504 时显示维护说明，统一返回 HTTP 503，带禁止缓存、禁止索引及 `Retry-After: 60`。按钮重新加载原网址，保留路径和参数。`/api/` 的业务错误状态和 JSON 保留，既有登录/注册精确路由和限流配置不变。

维护页使用内嵌 CSS、SVG 和一个本地刷新按钮，不依赖 Next.js、数据库或外部资源。整台 ECS、Nginx 或网络失效不在本次覆盖范围，已加载页面内的局部接口失败仍使用原有应用提示。

## 构建与产物

- 功能提交：`ea2e6425591de0e59759e6a53572914efb37dfd9`。
- 最终打包提交：`e060fd08f8ed99b45075586a56636f5a1876183d`，排除 Python 测试缓存。
- [GitHub Actions 验证与打包](https://github.com/MaomaoBuhuiJAVA/guoke-kexiaobei-platform/actions/runs/40793824387) 通过。
- artifact：`nginx-maintenance-e060fd08f8ed99b45075586a56636f5a1876183d`。
- 压缩包 SHA-256：`ca98d33b059becb65d8ff65525146c3b1347d313bd1edd250e3b23b80a30efbe`。
- 静态页面 SHA-256：`14e2993728af139f2e8135b7341d01d101512130576f8ce4b9066eee2f565673`。

生产 ECS 仅解压并验证 GitHub 生成的产物，没有安装依赖或执行应用构建。

## 验证证据

- 真实 Nginx 的 6 组隔离集成测试全部通过：正常网页、4 类网页服务错误、4 类 API 错误保留、后端停机与恢复、已有登录精确路由保留、内部错误页禁止直接访问。正式 `guoke-web` 未被停止。
- Chrome/Playwright 检查 1440×900 和 390×844：布局无横向溢出、无 JavaScript 运行错误、无外部资源依赖；模拟恢复后按钮导航状态从 503 变为 200，原路径和参数保持。
- 上线执行 `nginx -t` 和 `systemctl reload nginx`，二者通过；应用进程 PID 保持 5831，线上 release 仍为 `/opt/guoke/releases/20261028-linux-a1a579c`。
- 正式首页、`/lab`、`/games` 均为 HTTP 200；未登录的 `/api/admin/users` 仍返回 JSON 和 401。
- 正式浏览器验证首页至资源库导航，抽查 10 个页面引用的 CSS/JS 均为 HTTP 200，未捕获 JavaScript 运行错误。
- 内部地址 `/_guoke_maintenance.html` 直接请求为 404；维护页不是一个可直接访问的正常业务页面。

## 服务器文件和回滚

- 页面：`/var/www/guoke-maintenance/index.html`，`root:root`、0644。
- Nginx 片段：`/etc/nginx/snippets/guoke-maintenance.conf`。
- 站点：`/etc/nginx/sites-available/guoke`。
- 原配置备份与部署记录：`/var/backups/guoke/nginx-maintenance/20261029T002530Z-e060fd08/`。
- 上线后站点 SHA-256：`1c315066b12b74fe93b509aac4ee8342c2776b2c494f439ae2b878a59d86c45a`。

若需回滚，先比较当前站点哈希与上线记录；发生独立变更时不能直接覆盖。确认未漂移后恢复备份中的 `2-guoke.before` 至站点文件，执行 `nginx -t`，再 reload Nginx。数据库和应用 release 均无需回滚。临时测试端口在验收后已关闭，服务器暂存文件会清理；GitHub artifact 和配置备份保留。
