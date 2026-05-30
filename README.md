# agent-doing

一个 VS Code 插件脚手架：采集 AI 插件状态，并桥接到手机端（用于 Live Activities / 灵动岛展示）。

## 技术可行性（简要）

- **可行**：虽然 VS Code 扩展沙盒隔离导致无法直接读其他插件内部变量，但可以通过“外部可观测信号”推断状态。  
- **方案 A（日志/输出监听）**：解析 AI 插件产生日志中的关键词（Idle / Thinking / Generating / Error）。  
- **方案 B（网络/代理拦截）**：让 AI 插件请求经本地轻量代理转发，通过请求生命周期推断状态。  
- **跨设备通信**：扩展端将统一状态 JSON（`status`, `progress`, `message`）通过 WebSocket 或 HTTP 推送到手机端网关。  

## 项目目录结构

```text
agent-doing/
├─ package.json
├─ tsconfig.json
├─ README.md
└─ src/
   ├─ extension.ts        # VS Code 扩展入口
   ├─ statusDetector.ts   # 状态检测核心（日志监听 + 代理拦截）
   └─ bridgeClient.ts     # VS Code -> 手机端桥接通信
```

## 核心 Scaffold 说明

### 1) `src/extension.ts`
- 读取 `agentDoing.*` 配置。
- 初始化 `StatusDetector` 与 `BridgeClient`。
- 将检测到的状态实时发送到手机端网关。
- 提供 `agentDoing.simulateStatus` 命令便于联调。

### 2) `src/statusDetector.ts`
- `StatusPayload`：统一状态数据结构。
- `LogOutputStrategy`：轮询日志文件增量内容（方案 A）。
- `ProxyInterceptionStrategy`：本地 HTTP 代理监听与转发（方案 B）。
- 已在代码中用中文注释标明：应在何处补充 Copilot/Cursor/Codeium 适配规则。

### 3) `src/bridgeClient.ts`
- 支持 WebSocket 持久连接（含重连）。
- 支持 HTTP POST 推送。
- 统一发送 JSON 状态消息。

## 配置项

- `agentDoing.enabled`
- `agentDoing.transportMode` (`websocket` / `http`)
- `agentDoing.bridgeEndpoint`
- `agentDoing.authToken`
- `agentDoing.monitorLogFiles`
- `agentDoing.proxyListenPort`
- `agentDoing.proxyForwardBaseUrl`

## 手机端（iOS / Android）对接逻辑（下一步）

1. **在手机端运行局域网网关服务**（或同网段中转服务）：接收 VS Code 推送状态。  
2. **iOS**：
   - App 侧接收状态后更新 ActivityKit 的 `Activity.update(...)`；
   - 锁屏与灵动岛根据 `status/progress/message` 渲染 UI。  
3. **Android**：
   - 前台服务或通知组件接收状态；
   - 用持续通知（或厂商等效能力）展示实时状态。  
4. **状态映射建议**：
   - `Thinking` → “思考中”动画
   - `Generating` → 流式进度条
   - `Idle` → 完成态（可自动收起）
   - `Error` → 错误提示 + 重试入口

## 本地开发

```bash
npm install
npm run build
npm test
```

> 当前仓库仅提供核心框架与接口预留，具体 AI 插件适配规则需按目标插件日志/网络协议补充。
