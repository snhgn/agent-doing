import * as vscode from 'vscode';
import { BridgeClient } from './bridgeClient';
import { StatusDetector, StatusPayload } from './statusDetector';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('agentDoing');

  const bridgeClient = new BridgeClient({
    enabled: config.get<boolean>('enabled', true),
    mode: config.get<'websocket' | 'http'>('transportMode', 'websocket'),
    endpoint: config.get<string>('bridgeEndpoint', 'ws://127.0.0.1:9876/status'),
    authToken: config.get<string>('authToken', ''),
    reconnectIntervalMs: 3000
  });

  const detector = new StatusDetector({
    monitorLogFiles: config.get<string[]>('monitorLogFiles', []),
    proxyListenPort: config.get<number>('proxyListenPort', 18888),
    proxyForwardBaseUrl: config.get<string>('proxyForwardBaseUrl', '')
  });

  await bridgeClient.start();

  await detector.start(async (payload: StatusPayload) => {
    await bridgeClient.sendStatus(payload);
  });

  const simulateCommand = vscode.commands.registerCommand('agentDoing.simulateStatus', async () => {
    // 手动触发一条状态，便于联调手机端 Live Activities / 灵动岛。
    const sample: StatusPayload = {
      status: 'Thinking',
      progress: 20,
      message: '手动模拟状态推送',
      source: 'manual',
      timestamp: new Date().toISOString()
    };

    await bridgeClient.sendStatus(sample);
    vscode.window.showInformationMessage('Agent Doing: 已发送模拟状态');
  });

  context.subscriptions.push(simulateCommand);
  context.subscriptions.push({
    dispose: () => {
      void detector.stop();
      void bridgeClient.stop();
    }
  });
}

export function deactivate(): void {
  // 资源在 subscription dispose 中统一释放。
}
