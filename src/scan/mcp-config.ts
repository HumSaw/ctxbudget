import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { Agent, Scope } from "../types.js";
import { displayPath, fileExists, readJson, readText } from "../utils.js";
import type { ScanCtx } from "./instructions.js";

export interface McpServerConfig {
  name: string;
  /** Config file the server was declared in (display path). */
  source: string;
  agents: Agent[];
  scope: Scope;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
}

type RawServer = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  serverUrl?: string;
  headers?: Record<string, string>;
  http_headers?: Record<string, string>;
  type?: string;
  transport?: string;
  disabled?: boolean;
  enabled?: boolean;
};

function normalize(
  name: string,
  raw: RawServer,
  source: string,
  agents: Agent[],
  scope: Scope,
): McpServerConfig | undefined {
  const url = raw.url ?? raw.serverUrl;
  const disabled = raw.disabled === true || raw.enabled === false;
  if (raw.command) {
    return {
      name,
      source,
      agents,
      scope,
      transport: "stdio",
      command: raw.command,
      args: raw.args ?? [],
      ...(raw.env ? { env: raw.env } : {}),
      disabled,
    };
  }
  if (url) {
    const headers = raw.headers ?? raw.http_headers;
    return {
      name,
      source,
      agents,
      scope,
      transport: "http",
      url,
      ...(headers ? { headers } : {}),
      disabled,
    };
  }
  return undefined;
}

function fromJsonFile(
  file: string,
  key: string,
  agents: Agent[],
  scope: Scope,
  ctx: ScanCtx,
): McpServerConfig[] {
  if (!fileExists(file)) return [];
  const json = readJson<Record<string, unknown>>(file);
  if (!json) return [];
  const servers = (json[key] ?? {}) as Record<string, RawServer>;
  const source = displayPath(file, ctx.cwd, ctx.home);
  const out: McpServerConfig[] = [];
  for (const [name, raw] of Object.entries(servers)) {
    const cfg = normalize(name, raw, source, agents, scope);
    if (cfg) out.push(cfg);
  }
  return out;
}

function fromCodexToml(file: string, scope: Scope, ctx: ScanCtx): McpServerConfig[] {
  const text = readText(file);
  if (text === undefined) return [];
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(text) as Record<string, unknown>;
  } catch {
    return [];
  }
  const servers = (parsed.mcp_servers ?? {}) as Record<string, RawServer>;
  const source = displayPath(file, ctx.cwd, ctx.home);
  const out: McpServerConfig[] = [];
  for (const [name, raw] of Object.entries(servers)) {
    const cfg = normalize(name, raw, source, ["codex"], scope);
    if (cfg) out.push(cfg);
  }
  return out;
}

/** Claude's `~/.claude.json` keeps per-project servers under `projects[cwd].mcpServers`. */
function fromClaudeUserJson(ctx: ScanCtx): McpServerConfig[] {
  const file = join(ctx.home, ".claude.json");
  if (!fileExists(file)) return [];
  const json = readJson<{
    mcpServers?: Record<string, RawServer>;
    projects?: Record<string, { mcpServers?: Record<string, RawServer> }>;
  }>(file);
  if (!json) return [];
  const source = displayPath(file, ctx.cwd, ctx.home);
  const out: McpServerConfig[] = [];
  for (const [name, raw] of Object.entries(json.mcpServers ?? {})) {
    const cfg = normalize(name, raw, source, ["claude"], "user");
    if (cfg) out.push(cfg);
  }
  const project = json.projects?.[ctx.cwd];
  for (const [name, raw] of Object.entries(project?.mcpServers ?? {})) {
    const cfg = normalize(name, raw, `${source} (projects[cwd])`, ["claude"], "user");
    if (cfg) out.push(cfg);
  }
  return out;
}

export function discoverMcpServers(ctx: ScanCtx): McpServerConfig[] {
  const p = (f: string) => join(ctx.cwd, f);
  const h = (f: string) => join(ctx.home, f);
  const all: McpServerConfig[] = [
    ...fromJsonFile(p(".mcp.json"), "mcpServers", ["claude"], "project", ctx),
    ...fromJsonFile(p(".cursor/mcp.json"), "mcpServers", ["cursor"], "project", ctx),
    ...fromJsonFile(p(".vscode/mcp.json"), "servers", ["copilot"], "project", ctx),
    ...fromJsonFile(p(".gemini/settings.json"), "mcpServers", ["gemini"], "project", ctx),
    ...fromCodexToml(p(".codex/config.toml"), "project", ctx),
  ];
  if (ctx.includeUser) {
    all.push(
      ...fromClaudeUserJson(ctx),
      ...fromJsonFile(h(".cursor/mcp.json"), "mcpServers", ["cursor"], "user", ctx),
      ...fromJsonFile(h(".gemini/settings.json"), "mcpServers", ["gemini"], "user", ctx),
      ...fromCodexToml(h(".codex/config.toml"), "user", ctx),
    );
  }
  return all;
}

/**
 * Two agents often point at the same server (same command+args or same url).
 * Group them so we connect once and attribute the cost to every agent.
 */
export function dedupeServers(servers: McpServerConfig[]): McpServerConfig[] {
  const byKey = new Map<string, McpServerConfig>();
  for (const s of servers) {
    const key =
      s.transport === "stdio" ? `stdio:${s.command} ${(s.args ?? []).join(" ")}` : `http:${s.url}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.agents = [...new Set([...existing.agents, ...s.agents])];
      if (existing.source !== s.source) existing.source = `${existing.source}, ${s.source}`;
    } else byKey.set(key, { ...s, agents: [...s.agents] });
  }
  return [...byKey.values()];
}
