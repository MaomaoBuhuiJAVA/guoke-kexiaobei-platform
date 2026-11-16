# 科小贝实时视频通话实施计划

**目标：** 在科小贝对话中接入持续视觉输入、实时语音、字幕和打断。

**架构：** 浏览器使用 WebRTC 音视频轨道与 Qwen-Omni-Realtime 通话；Next.js 代理 SDP 交换，长期密钥只在后端使用。园本检索通过固定名称的只读工具接入。

**技术：** TypeScript、React 19、Next.js 16、原生 WebRTC、Vitest。

**设计依据：** `E:\国科二幼\output\kexiaobei-video-call-20261116\视频通话方案草案.md`，用户已选择实时音视频路线。

## 约束

- 使用独立工作区，保留原工作区进行中的语音优化。
- 普通千问接口的密钥不自动发送到新域名；实时服务需显式配置百炼密钥、业务空间与地域。
- 不持久化原始音视频；会话结束、后台切换、权限迟到、网络失败都必须停止采集。
- ECS 不安装依赖或构建；生产包由 GitHub Actions Ubuntu/Node.js 22 构建并校验。

## 任务 1：实时会话后端

文件：`robot-console/src/lib/realtime-video-config.ts`、`robot-console/app/api/video-call/session/route.ts` 及对应测试。

- [ ] 先测试未配置时不可用、业务空间与地域校验、密钥不进入响应。
- [ ] 测试 SDP 内容类型与大小、来源校验、上游失败、取消请求。
- [ ] 实现 GET 可用性检查与 POST SDP 代理，沿用来源检查和限流。
- [ ] 配置原生双工、输入转写、幼儿科学提示词和固定园本检索工具。

接口：GET 返回 `{available:boolean}`；POST 接收 `application/sdp`，返回 `{sdp:string,session:object}`。错误响应只包含面向用户的提示。

## 任务 2：通话控制器

文件：`robot-console/src/lib/realtime-video-call.ts` 及测试。

- [ ] 先测试晚到的权限结果释放、连接失败清理、字幕与打断、关闭摄像头及重新采集、切换镜头、旧事件隔离。
- [ ] 实现单会话控制器，暴露 start、stop、toggleMicrophone、toggleCamera、switchCamera、toggleSpeaker、interrupt。
- [ ] 同时接收本地 DataChannel 与服务端 txt 通道，避免重复事件和重复会话配置。
- [ ] 回填只读园本工具结果，取消或打断后丢弃旧工具结果。

接口：通过 onState、onPreview、onTurn、onResources 回调交付状态、预览、完成字幕及资源链接。所有媒体生命周期集中在控制器中。

## 任务 3：实际对话界面

文件：`robot-console/src/components/VideoCallPanel.tsx`、配套 CSS Module、`SciencePet.tsx`。

- [ ] 独立通话面板显示预览、字幕、状态和控制按钮；连接由用户点击启动。
- [ ] 对话标题栏增加视频入口，与现有语音互斥；关闭聊天、后台切换、卸载会清理。
- [ ] 已完成的字幕写入既有聊天记录，资源使用现有 `/lab?item=` 地址。
- [ ] 确保窄屏布局和键盘焦点可用。

## 任务 4：验证与交付

- [ ] 执行新增测试、现有语音回归、TypeScript、修改文件 ESLint。
- [ ] 运行全量测试；真实浏览器验证入口、配置缺失提示、权限与通话界面。
- [ ] 配置具备后验证真实服务；如缺少开通信息，明确标记该项未验收。
- [ ] 写入配置说明与验收记录，提交独立分支。只提交本次文件。

测试命令：`npm test -- --run`、`npx tsc --noEmit`、`npx eslint src/lib/realtime-video-*.ts src/components/VideoCallPanel.tsx app/api/video-call/*/route.ts`。
