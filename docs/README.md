# 国科二幼项目完整文档索引

**更新日期**: 2026-10-28  
**整理人**: Claude Opus 5.5

---

## 📚 文档导航

### 🎯 核心文档（必读）
1. **[Claude接手交接文档](./Claude接手交接文档.md)** ⭐
   - 项目交接说明
   - 当前工作区状态
   - 接手前必读内容

2. **[项目当前状态整理](./项目当前状态整理-2026-10-28.md)** ⭐⭐⭐
   - 项目全面概况
   - 功能模块状态
   - 待办事项与优先级
   - 环境配置清单

3. **[线上环境实际状态](./线上环境实际状态-2026-10-28.md)** ⭐⭐⭐
   - ECS 服务器实际运行状态
   - 线上与本地代码差异
   - 发布版本历史
   - 关键发现与建议

### 📖 项目说明文档
- [../README.md](../README.md) - 项目总览
- [../AGENTS.md](../AGENTS.md) - 生产架构与工作区规则
- [../robot-console/README.md](../robot-console/README.md) - 应用说明
- [../robot-console/PROJECT_REPORT.md](../robot-console/PROJECT_REPORT.md) - 项目报告

### 🚀 部署与运维
- [../robot-console/docs/上线发布与ECS维护.md](../robot-console/docs/上线发布与ECS维护.md) - **发布流程** ⭐
- [../robot-console/docs/releases/](../robot-console/docs/releases/) - 发布记录目录
  - [2026-10-27-微信语音兼容.md](../robot-console/docs/releases/2026-10-27-微信语音兼容.md) - 最新
  - [2026-10-25-磁力游戏与对话优化.md](../robot-console/docs/releases/2026-10-25-磁力游戏与对话优化.md)

### 🤖 AI 功能文档
- [../robot-console/docs/native-teaching-workflow.md](../robot-console/docs/native-teaching-workflow.md) - 教学智能体实现
- [../robot-console/docs/native-teaching-documents.md](../robot-console/docs/native-teaching-documents.md) - 文档生成说明
- [../robot-console/docs/qwen-tts.md](../robot-console/docs/qwen-tts.md) - 语音合成说明
- [../robot-console/docs/AI平台与开发过程说明.md](../robot-console/docs/AI平台与开发过程说明.md)

### 🎮 科学游戏文档
- [../robot-console/docs/science-games/README.md](../robot-console/docs/science-games/README.md) - 游戏总览 ⭐
- [../robot-console/docs/science-games/ROLLOUT.md](../robot-console/docs/science-games/ROLLOUT.md) - 上线计划
- [../robot-console/docs/science-games/QA.md](../robot-console/docs/science-games/QA.md) - 验收记录
- [../robot-console/docs/science-games/OPEN_SOURCE.md](../robot-console/docs/science-games/OPEN_SOURCE.md) - 开源说明

### 👤 账号系统文档
- [../robot-console/docs/sms-accounts.md](../robot-console/docs/sms-accounts.md) - 短信账号系统
- [../robot-console/docs/account-menu.md](../robot-console/docs/account-menu.md) - 账号菜单

### 📦 其他技术文档
- [../robot-console/docs/oss-media-migration.md](../robot-console/docs/oss-media-migration.md) - 媒体迁移
- [../robot-console/docs/功能性修改说明.md](../robot-console/docs/功能性修改说明.md)
- [../robot-console/docs/实验室视频与图片更新说明.md](../robot-console/docs/实验室视频与图片更新说明.md)
- [../robot-console/docs/接龙反馈整改说明.md](../robot-console/docs/接龙反馈整改说明.md)

### 📚 历史文档（参考）
- [./功能完成情况说明.md](./功能完成情况说明.md) - 2026-08 旧版功能状态
- [./2026-08-20-网站全面验收计划书.md](./2026-08-20-网站全面验收计划书.md)
- [./2026-08-20-网站全面验收记录.md](./2026-08-20-网站全面验收记录.md)
- [../robot-console/dify/](../robot-console/dify/) - Dify 历史设计文档

---

## 🎯 当前状态快览

### ✅ 线上运行状态
- **域名**: https://guokeey.cn
- **状态**: 正常运行 ✅
- **版本**: 20261027-wechat-voice-r1
- **发布时间**: 2026-10-27 20:04
- **运行时长**: 12+ 小时
- **服务**: guoke-web.service (systemd)
- **内存**: 434M / 1.1G (39%)
- **磁盘**: 14G / 40G (36%)

### 📝 本地工作区状态
- **分支**: main
- **HEAD**: 4778eef (与 origin/main 同步)
- **未提交修改**: 6 个文件
- **未跟踪文件**: 4 个文件
- **主要改动**: 注册流程优化（快速注册功能）

### ⚠️ 关键差异
- ❌ 线上**没有**快速注册功能 (`/api/auth/register/quick/`)
- ❌ 线上**没有**提取的注册逻辑模块 (`auth-registration.ts`)
- ⏳ 本地改动**尚未部署**到生产环境

---

## 📋 待办事项优先级

### 🔴 高优先级
1. **决定本地注册改动去向**
   - [ ] 继续完善功能
   - [ ] 运行完整测试
   - [ ] 提交并准备发布
   - [ ] 或暂时搁置

2. **调查 sms-registration-r1 被替换原因**
   - [ ] 该版本是否有问题？
   - [ ] 功能是否已合并到其他版本？

3. **科学游戏数据库迁移**
   - [ ] 执行 `prisma/patches/science-games.sql`
   - [ ] 验收真实账号流程

### 🟡 中优先级
4. **真机验收**
   - [ ] iOS Safari 语音输入
   - [ ] Android 微信浏览器
   - [ ] 游戏触控体验

5. **ESLint 历史错误修复**
   - [ ] `src/components/SiteFooter.tsx`
   - [ ] `src/components/StudentWorks.tsx`

### 🟢 低优先级
6. **文档补充**
   - [x] 项目状态整理文档
   - [x] 线上环境状态文档
   - [ ] 快速注册功能说明

---

## 🔧 快速命令参考

### 本地开发
```bash
cd robot-console
npm ci
npm run dev  # http://localhost:3000
```

### 测试
```bash
npm test -- --run          # 全量测试
npm run test:science       # 科学模块测试
npx tsc --noEmit           # 类型检查
npm run lint               # ESLint
npm run build              # 生产构建
```

### Git
```bash
git status --short --branch
git log --graph --oneline --all -12
git diff -- <file>
```

### 查看线上状态（需 SSH）
```bash
# 通过阿里云 Workbench 连接后执行
systemctl status guoke-web
readlink -f /opt/guoke/current
ls -lht /opt/guoke/releases/ | head -5
df -h /opt/guoke
```

---

## 📞 支持信息

### 服务器信息
- **公网 IP**: 47.98.87.93
- **内网 IP**: 172.27.237.78
- **SSH**: root@47.98.87.93 (需通过阿里云 Workbench)
- **区域**: 阿里云杭州 (华东1)

### 关键路径
- **应用目录**: `/opt/guoke/current`
- **发布目录**: `/opt/guoke/releases/`
- **配置目录**: `/etc/guoke/`
- **服务文件**: `/etc/systemd/system/guoke-web.service`

---

## 📅 更新日志

### 2026-10-28
- ✅ 创建项目状态整理文档
- ✅ 创建线上环境实际状态文档
- ✅ 创建文档索引（本文档）
- ✅ 完成线上环境调查
- ✅ 对比本地与线上代码差异

---

**文档维护者**: Claude Opus 5.5  
**最后更新**: 2026-10-28
