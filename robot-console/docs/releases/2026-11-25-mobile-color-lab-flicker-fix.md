# 修复移动端混色实验闪屏

- 移动端中画布尺寸、屏幕方向或页面可见状态变化时，避免七杯混色实验出现空白闪屏。
- 仅在画布实际尺寸或像素密度变化时重设画布，并立即重绘。
- 增加相同尺寸通知、实际尺寸变化和高像素密度变化的回归测试；不涉及数据库变更。

## 发布验证

- 日期：2026 年 11 月 25 日。
- 修复提交：`38ef06243e3e1f10a6846d784e56f1769a32742d`；GitHub Actions Linux/Node.js 22 构建运行 `45575297281` 成功。
- Vitest：1,039 项通过、19 项跳过；TypeScript 和目标文件 ESLint 检查通过。
- 部署包 SHA-256：`f1c52acb9910c30c86d245bb096844f762ba1d6f0b9c360afd773e2700b896c7`。
- 服务器包内 `.next/static` 和 `public` 的 544 个文件校验通过，正式切换前候选服务及其 18 个 HTML 引用资源响应均为 200。
- 正式版本：`/opt/guoke/releases/20261125-color-lab-flicker-38ef062`；保留回滚版本：`/opt/guoke/releases/20261125-color-lab-9a31fe4`。服务配置未变更。
- 生产站 iPhone 和桌面 Chromium 验收通过：画布尺寸变化后无空白帧，CSS/JS 资源响应为 200；选色、自由移动水杯、倒水中的液位变化、红黄缓慢混色及橙色结果提示均正常。浏览器无页面脚本错误或失败请求。
- 发布后 `guoke-web`、Nginx、PostgreSQL 均为 active，Nginx 配置检查通过。

## 回滚

- 将 `/opt/guoke/current` 原子切回 `/opt/guoke/releases/20261125-color-lab-9a31fe4`，重启 `guoke-web`，并重新检查游戏页面与服务状态。
