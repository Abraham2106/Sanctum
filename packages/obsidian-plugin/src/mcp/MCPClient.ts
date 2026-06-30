interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export class MCPClient {
  private process: any = null;
  private reqId = 0;
  private pending = new Map<number, PendingRequest>();
  private buffer = '';
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  async connect(command: string, token: string): Promise<void> {
    if (this._connected) return;

    let spawn: (cmd: string, args: readonly string[], opts: any) => any;
    try {
      spawn = (await import('child_process')).spawn;
    } catch {
      throw new Error('child_process not available in this environment');
    }

    const parts = splitCommand(command);
    const env: Record<string, string | undefined> = { ...process.env, GITHUB_TOKEN: token };

    return new Promise((resolve, reject) => {
      const proc = spawn(parts.cmd, parts.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      });
      this.process = proc;

      const timeout = setTimeout(() => {
        this.process?.kill();
        this.process = null;
        reject(new Error('MCP connection timeout'));
      }, 15000);

      const cleanup = () => {
        clearTimeout(timeout);
        this.process = null;
        this._connected = false;
        for (const [, p] of this.pending) p.reject(new Error('MCP process exited'));
        this.pending.clear();
      };

      proc.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        console.error(`[MCP] ${data.toString().trim()}`);
      });

      proc.on('error', (err: Error) => {
        clearTimeout(timeout);
        cleanup();
        reject(err);
      });

      proc.on('exit', () => {
        clearTimeout(timeout);
        cleanup();
      });

      this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'sanctum-agents', version: '0.1.0' },
      }).then(() => {
        this.sendNotification('notifications/initialized', {});
        this._connected = true;
        clearTimeout(timeout);
        resolve();
      }).catch(reject);
    });
  }

  async listTools(): Promise<MCPToolInfo[]> {
    const result = await this.request('tools/list', {});
    return (result as { tools: MCPToolInfo[] }).tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  async disconnect(): Promise<void> {
    if (!this.process || !this._connected) return;
    try { await this.request('shutdown', {}); } catch { /* ignore */ }
    this.process?.kill();
    this.process = null;
    this._connected = false;
    for (const [, p] of this.pending) p.reject(new Error('MCP disconnected'));
    this.pending.clear();
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.reqId;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('MCP not connected'));
        return;
      }
      this.pending.set(id, { resolve, reject });
      this.process.stdin?.write(msg);
    });
  }

  private sendNotification(method: string, params: unknown): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.process?.stdin?.write(msg);
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message));
            else p.resolve(msg.result);
          }
        }
      } catch { /* malformed JSON */ }
    }
  }
}

function splitCommand(cmd: string): { cmd: string; args: string[] } {
  const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [cmd];
  const parsed = parts.map(p => p.replace(/^"|"$/g, ''));
  return { cmd: parsed[0], args: parsed.slice(1) };
}
