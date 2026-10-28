# 国科二幼智慧成长平台交接文档

更新日期：2026-10-27

接手对象：`MaomaoBuhuiJAVA/EndReport` 仓库中的 `robot-console` 应用

文档用途：供 Claude 或其他工程师开始维护前快速了解项目、保留当前工作并安全验证改动。

## 1. 交接摘要

这是国科二幼智慧成长平台，包含园所官网、科小贝教学智能体、科学资源库、账号系统、投稿/作品流程和幼儿科学游戏。当前应用源码位于仓库 `robot-console/`，使用 Next.js App Router、React、TypeScript、Prisma 和 PostgreSQL；生产架构记录为阿里云 ECS、Nginx、systemd、Node.js 与私有 OSS。

本次交接时，`main` 工作区有未提交修改和未跟踪文件，且本地分支领先 `origin/main` 两个提交。请先审阅第 5 节列出的本地状态，再决定下一步；不要重置、清理、覆盖或批量暂存这些文件。最新已记录的成功生产发布是 2026-10-25 的 `20261025-magnet-dialogue-r1`。本次没有重新连接生产服务器，因此域名、当前运行版本和服务连通性均应在任何发布前复核。

## 2. 接手前先读

按以下顺序阅读，可先建立仓库规则，再进入正在维护的功能：

1. 仓库根目录的 `AGENTS.md`：生产架构和工作区真实性规则。
2. `README.md` 与 `robot-console/README.md`：产品范围、本地启动、基本检查和数据库安全要求。
3. `robot-console/docs/上线发布与ECS维护.md`：生产发布、回滚、日志和磁盘清理流程。
4. `robot-console/docs/releases/2026-10-25-磁力游戏与对话优化.md`：最近一次有完整生产记录的发布及验收范围。
5. `robot-console/docs/native-teaching-workflow.md` 与 `robot-console/docs/native-teaching-documents.md`：当前本地教学智能体、模型调用和文档生成实现。
6. `robot-console/docs/science-games/README.md`、`ROLLOUT.md` 和 `QA.md`：游戏数据、积分、移动端验收及生产状态记录。
7. `robot-console/prisma/schema.prisma` 和 `robot-console/prisma/patches/`：数据模型及生产增量 SQL。

`docs/功能完成情况说明.md` 是 2026 年 8 月的旧版状态说明，含有 Vercel 和旧域名信息，不代表当前部署方式或生产状态。早期设计计划、功能记录和父目录中的 Word 交接材料也可能落后于当前代码；涉及运行状态时优先核对根 `AGENTS.md`、最近发布记录、Git 当前分支和现场生产检查。

## 3. 仓库和应用结构

```text
EndReport/
  AGENTS.md                 当前生产与工作区规则
  README.md                 项目总览
  docs/                     项目级计划、验收及本交接文档
  robot-console/            Next.js 应用根目录
    app/                    页面与 App Router API
    src/components/         页面组件与交互
    src/lib/                认证、AI、媒体、检索和业务逻辑
    src/data/                静态目录及媒体清单
    prisma/                 Prisma schema、seed、生产增量补丁
    public/                 公开图片、字体及小游戏资源
    scripts/                资源导入、媒体处理、构建前置脚本
    docs/                   应用、运维、发布和专项验收说明
```

主要页面：

| 页面 | 用途 |
| --- | --- |
| `/` | 园所首页、科小贝入口 |
| `/lab` | 科学诗、科学故事、科学实验和详情 |
| `/games`、`/games/play/[gameId]` | 科学游戏与游戏详情 |
| `/games/growth`、`/games/leaderboard` | 成长记录与分龄周榜 |
| `/auth` | 登录和注册 |
| `/works` | 幼儿作品与互动 |
| `/admin/reviews`、`/admin/users` | 投稿审核和账号管理 |

主要服务端入口：`/api/ai-chat`、`/api/voice/tts`、`/api/science-resources`、`/api/media/[...key]`、`/api/auth/*`、`/api/student-works/*`、`/api/games/*`、`/api/admin/*`。以 `robot-console/app/api/` 下的当前路由文件为准。

## 4. 主要功能和数据流

### 教学智能体

`app/api/ai-chat/route.ts` 将请求交给 `src/lib/native-workflow/response.ts` 与 `run.ts`。当前仓库代码采用仓库内置的教学工作流：识别任务类型，按需检索真实园本资料或站点资料，再通过服务端模型配置生成或整理回答，并以流式事件返回状态、文本、来源和文件。工作流模块还负责附件提取、教案、图片、演示文稿及文档交付。不要只依据旧计划中出现的 Dify 描述来判断当前生产链路；检查 `src/lib/native-workflow/model.ts`、`qwen-config-core.mjs` 和服务器运行配置。

安全边界是回答的一部分：检索来源必须来自真实数据；不得把原创内容伪装为园本资料；涉及明火、燃烧和高温的幼儿活动必须走安全替代说明。修改检索、路由或提示词后，优先运行 `native-workflow` 对应测试，并回归文字与电话模式。

### 科学资源和媒体

资源页面由 `src/components/ScienceLab.tsx`、`src/lib/science-navigation.ts`、`src/lib/science-data.ts` 和 `src/data/science-knowledge.json` 等共同实现。生产数据也使用 Prisma 的 `ScienceKnowledgeItem` / `ScienceKnowledgeResource` 模型。媒体访问通过服务端媒体接口和 `src/data/oss-media-manifest.json` 控制；OSS Bucket 应保持私有，不要绕过清单将签名 URL 暴露给浏览器。

批量导入和封面/视频脚本可能写数据库或 OSS。运行任何 `import:*`、`seed:*`、`upload:*` 或 `attach:*` 命令前，先读对应脚本、确认输入目录和目标环境，并使用 `--plan`（若脚本支持）检查范围。

### 账号、作品和科学游戏

账号会话和管理员验证逻辑集中在 `src/lib/auth*.ts`、`src/lib/sms/` 及对应 API 路由。密码以哈希保存；管理员用户页受管理员角色和短信验证码门禁控制。不要在客户端引入短信、模型、数据库或 OSS 密钥，也不要扩大接口返回的个人资料字段。

科学游戏位于 `src/components/science-games/` 和 `src/lib/science-games/`。游客记录留在当前设备；登录账号数据按账号/孩子档案隔离，游戏完成事件有去重及离线待同步处理。服务端数据库访问由 `server-db.ts`、`server-repository.ts` 和相应 API 路由实现。游戏表的 SQL 在 `prisma/patches/science-games.sql`。

## 5. 本次接手时的 Git 状态

以下状态于 2026-10-27 在本机检查。分支为 `main`，HEAD 为 `29189eac64b92440960eb7408e97c967241d3099`，Git 报告 `main...origin/main [ahead 2]`。本地历史包含 `7ae0d35` 的发布记录更新和 `29189ea` 合并提交；`origin/main` 当前指向 `869c3dc`。推送前应重新查看图谱和远端状态。

已修改文件：

- `robot-console/app/globals.css`
- `robot-console/src/components/ScienceLab.tsx`
- `robot-console/src/components/mobile-navigation.contract.test.mjs`

未跟踪文件：

- `robot-console/app/api/voice/transcribe/route.ts` 及其测试
- `robot-console/src/lib/qwen-asr.ts`、`qwen-asr.test.ts`
- `robot-console/src/lib/recorded-speech.ts`、`recorded-speech.test.ts`

已修改的科学馆导航增加了移动端“科学乐园”入口和 4 列底栏样式。未跟踪的语音草稿实现 WAV 录音兼容层、Qwen ASR 服务端转写路由和对应测试；但当前 `SciencePet.tsx` 仍直接使用浏览器 SpeechRecognition，尚未引用 `recorded-speech.ts`。因此这套 ASR 草稿目前不是完整的用户可用功能，也未纳入 Git 提交。接手时请先判断这些本地工作是否属于当前目标，之后再补 UI 集成、边界处理和验证。

本次交接文档是本轮新建文件。不要使用 `git reset --hard`、`git clean`、`git checkout --` 或 `git add -A`；逐个审阅目标文件并只暂存明确属于当前工作的路径。不要覆盖或打印 `.env*` 文件内容。

检查状态的命令：

```powershell
git status --short --branch
git log --graph --decorate --oneline --all -12
git diff -- robot-console/app/globals.css robot-console/src/components/ScienceLab.tsx robot-console/src/components/mobile-navigation.contract.test.mjs
```

## 6. 本地开发与验证

在仓库根目录执行：

```powershell
Set-Location .\robot-console
npm ci
npm run dev
```

默认开发地址为 `http://localhost:3000`。配置本地环境时，以 `.env.example` 为变量清单；复制为 `.env.local` 后只填入本地专用值。仓库当前同时存在 `package-lock.json` 和 `pnpm-lock.yaml`，项目 README 的常用流程为 npm；不要在没有确认依赖策略前更新或删除锁文件。

常用验证命令：

```powershell
npm test -- --run
npm run test:science
npx tsc --noEmit
npm run lint
npm run build -- --webpack
```

`npm run build` 会先执行 `prebuild`。科学目录和资格报告导入分别由 `SEED_SCIENCE_ON_BUILD=1` 和 `SEED_QUALIFICATION_REPORT_ON_BUILD=1` 显式开启；一般验证应保持两个开关未设置。不要在生产环境运行全量 seed 或未经评审的 `prisma db push`。生产 schema 变更要先备份 PostgreSQL，再按已审查的 `prisma/patches/` 增量 SQL 执行。

最近一次发布记录（2026-10-25）报告：Vitest 92 个文件、847 项通过；TypeScript 检查和 Webpack 生产构建通过；相关文件 ESLint 通过。该记录还报告全仓 ESLint 有两个既有规则错误，涉及 `src/components/SiteFooter.tsx` 与 `src/components/StudentWorks.tsx`。这些是历史基线，不等于本次未提交工作已通过检查。提交前需在当前工作区重新跑相关测试、全量测试、类型检查和本次文件 lint，并记录实际结果。

同一历史构建记录指出本机 `DATABASE_URL` 格式无效，构建期间部分数据库取数走了回退路径，且当次关闭了导入开关。需要数据库的测试应使用隔离 PostgreSQL 或明确配置的测试库；静态页面或构建通过不能证明本机数据库链路可用。不要通过读取或粘贴环境文件来诊断，检查时只报告变量是否存在和 URL scheme 等非敏感信息。

## 7. 环境、数据库和生产边界

### 环境变量

使用 `.env.example` 查看当前模板。主要变量组包括：

- PostgreSQL：`DATABASE_URL`、`DATABASE_URL_UNPOOLED`
- 会话与设备：`AUTH_SECRET`、`DEVICE_HEARTBEAT_SECRET`
- 短信：`SMS_ENABLED`、阿里云短信凭据、模板 ID、`SMS_VERIFICATION_SECRET`
- Qwen：`QWEN_TTS_API_KEY`（当前配置兼容从 `DASHSCOPE_API_KEY` 或 `QWEN_API_KEY` 读取）、API 基址和模型名
- 私有文件：`AI_ARTIFACT_DIR`、`AI_ARTIFACT_SECRET`
- OSS：`OSS_BUCKET`、`OSS_REGION`、`ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- 导入门禁：`SEED_SCIENCE_ON_BUILD`、`SEED_QUALIFICATION_REPORT_ON_BUILD`

变量名要以代码和 `.env.example` 的现状交叉核对；生产值只从服务器受限配置读取。绝不能把密钥放到 `NEXT_PUBLIC_*`、源码、测试输出或 Git 提交中。提交问题报告前要清除数据库 URL、手机号、对话正文和访问日志中的个人信息。

### 数据与持久文件

Prisma schema 是应用数据模型入口。增量 SQL 在 `robot-console/prisma/patches/`，历史补丁包含账号资料、用户名、短信账号和游戏数据。写入前确认 SQL 可重复性、备份位置、事务和回滚边界。生产数据与测试账号必须隔离；不要将账号记录、生产 dump 或原始用户日志复制进仓库。

生产运行环境：Ubuntu ECS；Nginx 反向代理到 `127.0.0.1:3000`；systemd 服务名 `guoke-web`；PostgreSQL 在 ECS；媒体使用杭州私有 OSS。应用持久生成文档所在目录 `AI_ARTIFACT_DIR` 需跨版本保留，签名密钥 `AI_ARTIFACT_SECRET` 也要稳定。不要清除当前版本 `.next/cache` 或删除仍被服务引用的 release/备份目录。

### 发布和生产域名

发布必须按 `robot-console/docs/上线发布与ECS维护.md` 执行：核对当前服务和 release、只制作本次文件的 SHA-256 清单、数据库备份、候选版本暂存与独立端口验收、原子切换、正式 HTTP/服务验收，并在失败时按脚本回滚。禁止直接覆盖运行目录；不得用整个工作区代替受控发布包。

最后一份完整成功记录称 2026-10-25 的 `20261025-magnet-dialogue-r1` 已上线，生产 release 路径为 `/opt/guoke/releases/20261025-magnet-dialogue-r1`，上线前版本为 `20261024-mobile-lab-games-r16`，当次没有数据库写入。记录中的公网游戏入口仍是旧域名 `qyfck.icu/games`。另一方面，`.env.example` 的 `SITE_URL` 指向 `https://guokeey.cn`；2026-10-23 的 `science-games/QA.md` 记录 `guokeey.cn` 的 ECS 22/443 TCP 可连，但 SSH banner 与 HTTPS 请求超时，并指出 `www.qyfck.icu` 已指向域名过期服务。此次交接没有做在线查询，因此请不要把任一文档地址当作已确认的当前正式入口。

需要发布时，先现场确认域名 DNS/TLS、SSH、`/opt/guoke/current`、`guoke-web`、Nginx、PostgreSQL 和关键接口。不要依据本地 build 成功或旧发布记录推断线上工作正常。当前生产凭据和数据库 URL 未在此文档中记录。

## 8. 建议的接手顺序

1. 在当前仓库读取本文件和 `AGENTS.md`，保存 `git status --short --branch`、`git log --graph`，审阅第 5 节的每个 diff 和新文件。
2. 向项目负责人确认优先任务。若继续语音输入，先确定现有浏览器原生识别的兼容性问题，再评估本地 Qwen ASR 草稿如何接入 `SciencePet.tsx`；检查用户授权、取消/超时、录音时长、文件格式校验、频率限制和服务端费用边界。
3. 对确定的改动先加或更新有意义的测试，再运行相关 Vitest、全量 Vitest、`npx tsc --noEmit` 和目标文件 lint。不要把 10 月 25 日的历史测试结果写成本轮验证结果。
4. 若涉及科学内容或资源，检查返回来源确实对应本轮检索；若涉及账号、作品、游戏或媒体，检查跨账号隔离、公开字段最小化和私有对象访问控制。
5. 用户明确要求发布后，再按 ECS 手册制作受控包并进行生产前检查。部署和数据库写入属于独立操作，不能仅凭这份交接文档推断已获授权。

这份文档记录的是 2026-10-27 可见的仓库状态。生产状态、域名和本地未提交文件会随时间变化；开始后续工作时应先重新检查现场。
