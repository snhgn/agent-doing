import WebSocket from 'ws';
import { StatusPayload } from './statusDetector';

export interface BridgeConfig {
  enabled: boolean;
  mode: 'websocket' | 'http';
  endpoint: string;
  authToken?: string;
  reconnectIntervalMs?: number;
}

export class BridgeClient {
  private socket: WebSocket | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(private readonly config: BridgeConfig) {}

  async start(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (this.config.mode === 'websocket') {
      await this.connectWebSocket();
    }
  }

  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.socket) {
      await new Promise<void>((resolve) => {
        this.socket?.once('close', () => resolve());
        this.socket?.close();
      });
      this.socket = undefined;
    }
  }

  async sendStatus(payload: StatusPayload): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const body = JSON.stringify(payload);

    if (this.config.mode === 'websocket') {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.socket.send(body);
      return;
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };

    if (this.config.authToken) {
      headers.authorization = 'Bearer ' + this.config.authToken;
    }

    await fetch(this.config.endpoint, {
      method: 'POST',
      headers,
      body
    });
  }

  private async connectWebSocket(): Promise<void> {
    await new Promise<void>((resolve) => {
      const headers: Record<string, string> = {};
      if (this.config.authToken) {
        headers.authorization = 'Bearer ' + this.config.authToken;
      }

      const socket = new WebSocket(this.config.endpoint, { headers });
      this.socket = socket;

      socket.on('open', () => resolve());
      socket.on('error', () => resolve());
      socket.on('close', () => this.scheduleReconnect());
    });
  }

  private scheduleReconnect(): void {
    if (this.config.mode !== 'websocket') {
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    const interval = this.config.reconnectIntervalMs ?? 3000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectWebSocket();
    }, interval);
  }
}
