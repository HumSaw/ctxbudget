import { homedir } from "node:os";
import { resolve } from "node:path";
import { suggest } from "../suggest.js";
import { TOKENIZER_NAME } from "../tokens.js";
import {
  AGENTS,
  type Agent,
  type AgentSummary,
  type Item,
  type Report,
  type ScanOptions,
} from "../types.js";
import { scanCommands, scanRules, scanSkills, scanSubagents } from "./extensions.js";
import { type ScanCtx, scanInstructions, totalWithChildren } from "./instructions.js";
import { measureServers } from "./mcp.js";
import { dedupeServers, discoverMcpServers } from "./mcp-config.js";

export const VERSION = "0.1.0";
export const DEFAULT_CONTEXT_WINDOW = 200_000;

/** Tokens the agent pays for an item when it is loaded (instructions include imports). */
export function loadedTokens(item: Item): number {
  return item.kind === "instructions" ? totalWithChildren(item) : item.tokens;
}

export function summarize(agent: Agent, items: Item[]): AgentSummary {
  const mine = items.filter((i) => i.agents.includes(agent));
  const s: AgentSummary = {
    agent,
    always: 0,
    conditional: 0,
    onDemand: 0,
    byKind: {},
    items: mine,
  };
  for (const item of mine) {
    if (item.error && item.tokens === 0) continue;
    const t = loadedTokens(item);
    if (item.loading === "always") {
      s.always += t;
      s.byKind[item.kind] = (s.byKind[item.kind] ?? 0) + t;
    } else if (item.loading === "conditional") s.conditional += t;
    else s.onDemand += t;
  }
  return s;
}

export async function scan(opts: ScanOptions): Promise<Report> {
  const cwd = resolve(opts.cwd);
  const home = opts.homeDir ?? homedir();
  const ctx: ScanCtx = { cwd, home, includeUser: opts.includeUser ?? true };
  const agents = opts.agents?.length ? opts.agents : [...AGENTS];

  opts.onProgress?.("scanning instruction files…");
  let items: Item[] = [
    ...scanInstructions(ctx),
    ...scanRules(ctx),
    ...scanSkills(ctx),
    ...scanSubagents(ctx),
    ...scanCommands(ctx),
  ];

  const mcp = { measured: false, servers: 0, failed: 0 };
  const servers = dedupeServers(discoverMcpServers(ctx)).filter((s) =>
    s.agents.some((a) => agents.includes(a)),
  );
  mcp.servers = servers.length;
  if (servers.length && opts.mcp !== false) {
    mcp.measured = true;
    const measured = await measureServers(
      servers,
      cwd,
      opts.mcpTimeoutMs ?? 20_000,
      opts.onProgress,
    );
    mcp.failed = measured.filter((m) => !m.ok).length;
    items.push(...measured.map((m) => m.item));
  } else if (servers.length) {
    items.push(
      ...servers.map<Item>((s) => ({
        kind: "mcp-server",
        path: s.name,
        agents: s.agents,
        loading: "always",
        scope: s.scope,
        tokens: 0,
        bytes: 0,
        detail: `${s.source} · not measured (--no-mcp)`,
      })),
    );
  }

  // Restrict to requested agents.
  items = items
    .map((i) => ({ ...i, agents: i.agents.filter((a) => agents.includes(a)) }))
    .filter((i) => i.agents.length > 0);

  const summaries = agents.map((a) => summarize(a, items));
  const contextWindow = opts.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  return {
    version: VERSION,
    cwd,
    contextWindow,
    tokenizer: TOKENIZER_NAME,
    generatedAt: new Date().toISOString(),
    agents: summaries,
    items,
    suggestions: suggest(items, summaries, contextWindow),
    mcp,
  };
}
