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
  private static readonly HTTP_TIMEOUT_MS = 5000;
  private static readonly MAX_PENDING_STATUS = 50;

  private socket: WebSocket | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private readonly pendingStatuses: string[] = [];
  private isStopping = false;

  constructor(private readonly config: BridgeConfig) {}

  async start(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    this.isStopping = false;

    if (this.config.mode === 'websocket') {
      await this.connectWebSocket();
    }
  }

  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.isStopping = true;

    if (this.socket) {
      await new Promise<void>((resolve) => {
        this.socket?.once('close', () => resolve());
        this.socket?.once('error', (error) => {
          console.warn('Agent Doing: WebSocket close error', error);
          resolve();
        });
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
        this.enqueuePendingStatus(body);
        if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
          this.scheduleReconnect();
        }
        return;
      }
      await this.sendWebSocketMessage(body);
      return;
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };

    if (this.config.authToken) {
      headers.authorization = 'Bearer ' + this.config.authToken;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BridgeClient.HTTP_TIMEOUT_MS);

    try {
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async connectWebSocket(): Promise<void> {
    await new Promise<void>((resolve) => {
      const headers: Record<string, string> = {};
      if (this.config.authToken) {
        headers.authorization = 'Bearer ' + this.config.authToken;
      }

      const socket = new WebSocket(this.config.endpoint, { headers });
      this.socket = socket;

      socket.on('open', () => {
        void this.flushPendingStatuses().finally(() => resolve());
      });
      socket.on('error', (error) => {
        console.warn('Agent Doing: WebSocket connect error', error);
        resolve();
      });
      socket.on('close', () => {
        if (this.socket === socket) {
          this.socket = undefined;
        }
        if (!this.isStopping) {
          this.scheduleReconnect();
        }
      });
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

  private async sendWebSocketMessage(body: string): Promise<boolean> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this.enqueuePendingStatus(body);
      return false;
    }

    return await new Promise<boolean>((resolve) => {
      socket.send(body, (error) => {
        if (error) {
          console.warn('Agent Doing: WebSocket send error, queued for retry', error);
          this.enqueuePendingStatus(body);
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  }

  private async flushPendingStatuses(): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const pending = [...this.pendingStatuses];
    this.pendingStatuses.length = 0;
    for (let i = 0; i < pending.length; i += 1) {
      const payload = pending[i];
      const sent = await this.sendWebSocketMessage(payload);
      if (!sent) {
        for (let j = i + 1; j < pending.length; j += 1) {
          this.enqueuePendingStatus(pending[j]);
        }
        console.warn('Agent Doing: Pending status flush interrupted');
        break;
      }
    }
  }

  private enqueuePendingStatus(body: string): void {
    if (this.pendingStatuses.length >= BridgeClient.MAX_PENDING_STATUS) {
      console.warn('Agent Doing: Pending status queue overflow, dropping oldest message');
      this.pendingStatuses.shift();
    }
    this.pendingStatuses.push(body);
  }
}
