import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';

export type AIStatus = 'Idle' | 'Thinking' | 'Generating' | 'Error';

export interface StatusPayload {
  status: AIStatus;
  progress?: number;
  message?: string;
  source: 'log' | 'proxy' | 'manual';
  timestamp: string;
}

export interface StatusDetectorOptions {
  monitorLogFiles: string[];
  proxyListenPort: number;
  proxyForwardBaseUrl?: string;
}

export type StatusListener = (payload: StatusPayload) => void;

interface DetectionStrategy {
  start(listener: StatusListener): Promise<void>;
  stop(): Promise<void>;
}

export class StatusDetector {
  private readonly strategies: DetectionStrategy[];

  constructor(options: StatusDetectorOptions) {
    this.strategies = [
      new LogOutputStrategy(options.monitorLogFiles),
      new ProxyInterceptionStrategy(options.proxyListenPort, options.proxyForwardBaseUrl)
    ];
  }

  async start(listener: StatusListener): Promise<void> {
    for (const strategy of this.strategies) {
      await strategy.start(listener);
    }
  }

  async stop(): Promise<void> {
    for (const strategy of this.strategies) {
      await strategy.stop();
    }
  }
}

class LogOutputStrategy implements DetectionStrategy {
  private readonly positions = new Map<string, number>();
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly monitoredFiles: string[]) {}

  async start(listener: StatusListener): Promise<void> {
    if (this.monitoredFiles.length === 0) {
      return;
    }

    for (const file of this.monitoredFiles) {
      this.positions.set(file, 0);
    }

    // 方案 A：通过轮询日志文件增量内容，匹配状态关键词。
    // 在这里可按 Copilot/Cursor/Codeium 各自日志格式补充 parser 规则。
    this.timer = setInterval(() => {
      for (const file of this.monitoredFiles) {
        try {
          this.readIncremental(file, listener);
        } catch {
          // 忽略单个日志读取异常，避免中断其他文件状态检测。
        }
      }
    }, 1200);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.positions.clear();
  }

  private readIncremental(filePath: string, listener: StatusListener): void {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const prevPos = this.positions.get(filePath) ?? 0;
    const stat = fs.statSync(filePath);
    const currentSize = stat.size;

    if (currentSize < prevPos) {
      this.positions.set(filePath, 0);
      return;
    }

    if (currentSize === prevPos) {
      return;
    }

    const fd = fs.openSync(filePath, 'r');
    try {
      const chunkLength = currentSize - prevPos;
      const buffer = Buffer.alloc(chunkLength);
      fs.readSync(fd, buffer, 0, chunkLength, prevPos);
      this.positions.set(filePath, currentSize);

      const text = buffer.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        const payload = parseStatusLine(line);
        if (payload) {
          listener({ ...payload, source: 'log', timestamp: new Date().toISOString() });
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  }
}

class ProxyInterceptionStrategy implements DetectionStrategy {
  private server: http.Server | undefined;

  constructor(
    private readonly port: number,
    private readonly forwardBaseUrl?: string
  ) {}

  async start(listener: StatusListener): Promise<void> {
    // 方案 B：本地代理拦截。将 AI 插件 API Base URL 指向 localhost:port。
    // 在 onRequest 中可为不同插件协议做更细粒度适配。
    this.server = http.createServer((req, res) => {
      listener({
        status: 'Thinking',
        message: `代理收到请求: ${req.method ?? 'GET'} ${req.url ?? '/'}`,
        source: 'proxy',
        timestamp: new Date().toISOString()
      });

      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        this.forwardRequest(req, body, listener)
          .then(({ statusCode, payload, headers }) => {
            res.writeHead(statusCode, headers);
            res.end(payload);
            listener({
              status: 'Idle',
              progress: 100,
              message: '代理转发完成',
              source: 'proxy',
              timestamp: new Date().toISOString()
            });
          })
          .catch((error) => {
            res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: String(error) }));
            listener({
              status: 'Error',
              message: `代理异常: ${String(error)}`,
              source: 'proxy',
              timestamp: new Date().toISOString()
            });
          });
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.port, '127.0.0.1', () => {
        this.server?.off('error', reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    const current = this.server;
    this.server = undefined;
    await new Promise<void>((resolve, reject) => {
      current.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private async forwardRequest(
    req: http.IncomingMessage,
    body: Buffer,
    listener: StatusListener
  ): Promise<{ statusCode: number; payload: Buffer; headers: http.OutgoingHttpHeaders }> {
    if (!this.forwardBaseUrl) {
      // 未配置上游时，返回模拟响应，便于先联调手机端显示。
      listener({
        status: 'Generating',
        progress: 60,
        message: '未配置上游，返回本地模拟结果',
        source: 'proxy',
        timestamp: new Date().toISOString()
      });
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        payload: Buffer.from(JSON.stringify({ ok: true, mode: 'mock-proxy' }))
      };
    }

    const target = new URL(req.url ?? '/', this.forwardBaseUrl);
    const transport = target.protocol === 'https:' ? https : http;

    const response = await new Promise<{ statusCode: number; payload: Buffer; headers: http.OutgoingHttpHeaders }>((resolve, reject) => {
      const proxyReq = transport.request(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port,
          method: req.method,
          path: `${target.pathname}${target.search}`,
          headers: req.headers
        },
        (proxyRes) => {
          listener({
            status: 'Generating',
            progress: 75,
            message: `上游响应: ${proxyRes.statusCode ?? 200}`,
            source: 'proxy',
            timestamp: new Date().toISOString()
          });

          const chunks: Buffer[] = [];
          proxyRes.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          proxyRes.on('end', () => {
            resolve({
              statusCode: proxyRes.statusCode ?? 200,
              payload: Buffer.concat(chunks),
              headers: proxyRes.headers
            });
          });
        }
      );

      proxyReq.on('error', reject);
      if (body.length > 0) {
        proxyReq.write(body);
      }
      proxyReq.end();
    });

    return response;
  }
}

function parseStatusLine(line: string): Omit<StatusPayload, 'source' | 'timestamp'> | undefined {
  const normalized = line.toLowerCase();

  if (!normalized.trim()) {
    return undefined;
  }

  if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('异常') || normalized.includes('失败')) {
    return { status: 'Error', message: line };
  }
  if (
    normalized.includes('generating') ||
    normalized.includes('stream') ||
    normalized.includes('输出中') ||
    normalized.includes('生成中')
  ) {
    return { status: 'Generating', message: line, progress: 70 };
  }
  if (
    normalized.includes('thinking') ||
    normalized.includes('request started') ||
    normalized.includes('思考中') ||
    normalized.includes('请求开始')
  ) {
    return { status: 'Thinking', message: line, progress: 30 };
  }
  if (
    normalized.includes('idle') ||
    normalized.includes('completed') ||
    normalized.includes('done') ||
    normalized.includes('空闲') ||
    normalized.includes('完成')
  ) {
    return { status: 'Idle', message: line, progress: 100 };
  }

  return undefined;
}
