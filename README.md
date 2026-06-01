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

## 文件功能说明（逐文件）

- `package.json`
  - 定义 VS Code 扩展元信息（名称、激活时机、命令、配置项）。
  - 定义本地开发命令：`build`、`watch`、`test`。
- `tsconfig.json`
  - TypeScript 编译配置：`src -> out`，严格模式，Node + VS Code 类型。
- `src/extension.ts`
  - 扩展入口：读取 `agentDoing.*` 配置并启动检测与桥接。
  - 注册命令 `agentDoing.simulateStatus`，用于手动发送一条状态做联调。
- `src/statusDetector.ts`
  - 状态检测核心：日志轮询（Plan A）+ 本地代理拦截（Plan B）。
  - 输出统一 `StatusPayload`，状态枚举为 `Idle/Thinking/Generating/Error`。
- `src/bridgeClient.ts`
  - 负责把状态发送到手机端网关：支持 WebSocket 和 HTTP 两种模式。
  - WebSocket 模式含断线重连；HTTP 模式按 JSON POST 上报。

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

## 使用方法

1. 安装依赖并编译：
   ```bash
   npm install
   npm run build
   ```
2. 在 VS Code 中打开本项目，按 `F5` 启动 Extension Development Host。
3. 在扩展设置中配置 `agentDoing.*`：
   - `transportMode` 与 `bridgeEndpoint`（手机端网关地址）至少需要正确设置；
   - 若走日志方案，填写 `monitorLogFiles`（绝对路径）；
   - 若走代理方案，设置 `proxyListenPort`，并按需设置 `proxyForwardBaseUrl`。
4. 在命令面板执行 `Agent Doing: Simulate Status`，验证手机端是否收到状态。
5. 联调通过后，再按目标 AI 插件日志格式或网络协议补充 `statusDetector.ts` 解析规则。

## 本地开发

```bash
npm install
npm run build
npm run watch
npm test
```

> 当前仓库仅提供核心框架与接口预留，具体 AI 插件适配规则需按目标插件日志/网络协议补充。
