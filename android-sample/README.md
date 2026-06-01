Android Sample for Agent Doing

说明
- 这是一个最小的 Android 客户端示例，使用 OkHttp WebSocket 连接到中继服务并在前台服务中运行，带有基础图形界面用于连接和查看状态。

关键点
- 依赖: OkHttp
- 最低 SDK: 26
- 功能: 前台 Service + Notification、WebSocket 自动重连、主界面显示接收到的状态 JSON

在本机构建与安装
1. 使用 Android Studio 打开 `android-sample` 项目，Gradle 会自动同步并下载依赖。
2. 如果你的机器已经安装了 Gradle，可以直接在 `android-sample` 目录下构建；仓库里不再保留不完整的 `gradlew` 包装脚本。

```bash
# 在项目根目录（含 settings.gradle.kts 的位置）执行（需要安装 Android SDK / Gradle）
gradle assembleDebug
# 生成的 APK 在 app/build/outputs/apk/debug/app-debug.apk
# 安装到手机（需要 adb 可用）
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

若你希望我为你在 CI 中自动构建并发布 APK（例如 GitHub Actions），我可以生成相应的 workflow 配置。

运行时说明
- 启动应用后点击 `Start Service` 以启动前台服务并自动连接到 `ws://<bridge-host-ip>:9876/status`。
- 默认 Bridge 地址可在代码中修改（`WSClient.COMPANION_URL`），或在 UI 中扩展为可配置。

限制
- 我当前环境无法远程构建 APK（缺少 Android SDK/NDK），但 GitHub Actions 工作流会在运行时下载 Gradle 并构建 APK。