import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { countToolTokens } from "../tokens.js";
import type { Item } from "../types.js";
import { expandEnv } from "../utils.js";
import type { McpServerConfig } from "./mcp-config.js";

export interface MeasuredServer {
  item: Item;
  ok: boolean;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function expandRecord(r: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r ?? {})) out[k] = expandEnv(v);
  return out;
}

function makeTransports(cfg: McpServerConfig, cwd: string): Array<() => Transport> {
  if (cfg.transport === "stdio") {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    Object.assign(env, expandRecord(cfg.env));
    return [
      () =>
        new StdioClientTransport({
          command: expandEnv(cfg.command as string),
          args: (cfg.args ?? []).map((a) => expandEnv(a)),
          env,
          cwd,
          stderr: "ignore",
        }),
    ];
  }
  const url = new URL(expandEnv(cfg.url as string));
  const headers = expandRecord(cfg.headers);
  const init = Object.keys(headers).length ? { requestInit: { headers } } : {};
  // Try Streamable HTTP first, fall back to legacy SSE.
  // The SDK's own classes don't satisfy `Transport` under exactOptionalPropertyTypes; cast is safe.
  return [
    () => new StreamableHTTPClientTransport(url, init) as unknown as Transport,
    () => new SSEClientTransport(url, init) as unknown as Transport,
  ];
}

export async function measureServer(
  cfg: McpServerConfig,
  cwd: string,
  timeoutMs: number,
): Promise<MeasuredServer> {
  const base: Item = {
    kind: "mcp-server",
    path: cfg.name,
    agents: cfg.agents,
    loading: "always",
    scope: cfg.scope,
    tokens: 0,
    bytes: 0,
    detail: cfg.source,
  };
  if (cfg.disabled) {
    return {
      ok: true,
      item: { ...base, loading: "on-demand", detail: `disabled in ${cfg.source}` },
    };
  }

  let lastError: unknown;
  for (const make of makeTransports(cfg, cwd)) {
    const client = new Client({ name: "ctxbudget", version: "0.1.0" });
    try {
      const transport = make();
      await withTimeout(client.connect(transport), timeoutMs, "connect");
      const tools: Item[] = [];
      let cursor: string | undefined;
      do {
        const res = await withTimeout(
          client.listTools(cursor ? { cursor } : undefined),
          timeoutMs,
          "tools/list",
        );
        for (const t of res.tools) {
          const tokens = countToolTokens(t);
          tools.push({
            kind: "mcp-tool",
            path: t.name,
            agents: cfg.agents,
            loading: "always",
            scope: cfg.scope,
            tokens,
            bytes: JSON.stringify(t).length,
            ...(t.description ? { detail: `${t.description.length} char description` } : {}),
          });
        }
        cursor = res.nextCursor;
      } while (cursor);
      tools.sort((a, b) => b.tokens - a.tokens);
      const total = tools.reduce((a, t) => a + t.tokens, 0);
      await client.close().catch(() => {});
      return {
        ok: true,
        item: {
          ...base,
          tokens: total,
          bytes: tools.reduce((a, t) => a + t.bytes, 0),
          detail: `${tools.length} tool${tools.length === 1 ? "" : "s"} · ${cfg.source}`,
          children: tools,
        },
      };
    } catch (e) {
      lastError = e;
      await client.close().catch(() => {});
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  return { ok: false, item: { ...base, error: msg.split("\n")[0] ?? msg } };
}

export async function measureServers(
  servers: McpServerConfig[],
  cwd: string,
  timeoutMs: number,
  onProgress?: (msg: string) => void,
  concurrency = 4,
): Promise<MeasuredServer[]> {
  const results: MeasuredServer[] = new Array(servers.length);
  let next = 0;
  const worker = async () => {
    while (next < servers.length) {
      const i = next++;
      const cfg = servers[i] as McpServerConfig;
      onProgress?.(`connecting to MCP server "${cfg.name}"…`);
      results[i] = await measureServer(cfg, cwd, timeoutMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, servers.length) }, worker));
  return results;
}
