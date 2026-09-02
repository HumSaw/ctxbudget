import { formatTokens, percent } from "./tokens.js";
import type { AgentSummary, Item, Suggestion } from "./types.js";

const INSTRUCTION_FILE_WARN = 3_000;
const RULE_ALWAYS_WARN = 1_500;
const MCP_SERVER_WARN = 5_000;
const MCP_TOOL_WARN = 800;
const MCP_TOTAL_WARN_PCT = 0.15;
const SKILL_DESC_LONG = 600;
const ALWAYS_TOTAL_WARN_PCT = 0.1;

/**
 * Deterministic, opinionated advice. Every rule cites a threshold so users can
 * disagree with the number instead of guessing what we consider "too much".
 */
export function suggest(
  items: Item[],
  summaries: AgentSummary[],
  contextWindow: number,
): Suggestion[] {
  const out: Suggestion[] = [];

  for (const item of items) {
    if (item.error && item.kind !== "skill") {
      out.push({
        level: "warn",
        agents: item.agents,
        path: item.path,
        message: `${item.kind === "mcp-server" ? `MCP server "${item.path}"` : item.path} could not be measured: ${item.error}`,
      });
      continue;
    }

    switch (item.kind) {
      case "instructions": {
        const total = item.tokens + (item.children ?? []).reduce((a, c) => a + c.tokens, 0);
        if (total > INSTRUCTION_FILE_WARN) {
          out.push({
            level: "warn",
            agents: item.agents,
            path: item.path,
            message: `${item.path} is ${formatTokens(total)} tokens and loads every turn. Keep instruction files under ~${formatTokens(INSTRUCTION_FILE_WARN)}: move reference material into skills or path-scoped rules so it loads only when relevant.`,
          });
        }
        for (const c of item.children ?? []) {
          if (c.error) {
            out.push({
              level: "warn",
              agents: item.agents,
              path: c.path,
              message: `@import ${c.path} in ${item.path} points to a missing file.`,
            });
          }
        }
        break;
      }
      case "rules": {
        if (item.loading === "always" && item.tokens > RULE_ALWAYS_WARN) {
          out.push({
            level: "warn",
            agents: item.agents,
            path: item.path,
            message: `${item.path} (${formatTokens(item.tokens)} tokens) applies to every request. Scope it with a path glob (\`paths:\` / \`globs:\` / \`applyTo:\`) or split it up.`,
          });
        }
        break;
      }
      case "skill": {
        if (item.error) {
          out.push({
            level: "warn",
            agents: item.agents,
            path: item.path,
            message: `${item.path}: ${item.error}.`,
          });
        } else if (item.detail && Number.parseInt(item.detail, 10) > SKILL_DESC_LONG) {
          out.push({
            level: "info",
            agents: item.agents,
            path: item.path,
            message: `${item.path} has a ${Number.parseInt(item.detail, 10)}-character description. Only the description is loaded every turn – keep it to one or two sentences and put the detail in the body.`,
          });
        }
        break;
      }
      case "mcp-server": {
        if (item.tokens > MCP_SERVER_WARN) {
          const n = item.children?.length ?? 0;
          const top = item.children?.[0];
          out.push({
            level: "warn",
            agents: item.agents,
            path: item.path,
            message: `MCP server "${item.path}" adds ${formatTokens(item.tokens)} tokens (${n} tools) to every turn${top ? `; the largest tool is "${top.path}" at ${formatTokens(top.tokens)}` : ""}. Disable it when not needed, or use an agent that supports tool search / deferred tool loading.`,
          });
        }
        for (const t of item.children ?? []) {
          if (t.tokens > MCP_TOOL_WARN) {
            out.push({
              level: "info",
              agents: item.agents,
              path: `${item.path}/${t.path}`,
              message: `Tool "${t.path}" on "${item.path}" is ${formatTokens(t.tokens)} tokens – large input schema or description. Worth reporting upstream.`,
            });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  for (const s of summaries) {
    const mcp = s.byKind["mcp-server"] ?? 0;
    if (mcp > contextWindow * MCP_TOTAL_WARN_PCT) {
      out.push({
        level: "warn",
        agents: [s.agent],
        message: `MCP tool schemas use ${percent(mcp, contextWindow)} of the ${formatTokens(contextWindow)} window for ${s.agent} before you type anything.`,
      });
    }
    if (s.always > contextWindow * ALWAYS_TOTAL_WARN_PCT) {
      out.push({
        level: "warn",
        agents: [s.agent],
        message: `${s.agent} starts every turn with ${formatTokens(s.always)} tokens (${percent(s.always, contextWindow)}) of fixed overhead. Under ${percent(contextWindow * ALWAYS_TOTAL_WARN_PCT, contextWindow)} leaves room for code and conversation.`,
      });
    }
  }

  // Cross-agent duplicates: same content in CLAUDE.md and AGENTS.md.
  const claude = items.find((i) => i.kind === "instructions" && i.path === "CLAUDE.md");
  const agentsMd = items.find((i) => i.kind === "instructions" && i.path === "AGENTS.md");
  if (claude && agentsMd && Math.abs(claude.tokens - agentsMd.tokens) > 200) {
    out.push({
      level: "info",
      agents: ["claude", "codex", "cursor", "copilot"],
      message: `CLAUDE.md (${formatTokens(claude.tokens)}) and AGENTS.md (${formatTokens(agentsMd.tokens)}) differ. If they should match, make CLAUDE.md a one-liner: \`@AGENTS.md\`.`,
    });
  }

  const order = { warn: 0, info: 1 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
