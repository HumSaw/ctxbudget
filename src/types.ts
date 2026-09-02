export type Agent = "claude" | "codex" | "cursor" | "copilot" | "gemini";

export const AGENTS: readonly Agent[] = ["claude", "codex", "cursor", "copilot", "gemini"];

export const AGENT_LABELS: Record<Agent, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
  gemini: "Gemini CLI",
};

/**
 * How an item enters the agent's context.
 * - always:      loaded into every session / every turn
 * - conditional: loaded when a path glob or description matches (rules with `paths:`, Cursor globs)
 * - on-demand:   only loaded when invoked (full skill bodies, slash commands, prompts)
 */
export type Loading = "always" | "conditional" | "on-demand";

export type ItemKind =
  | "instructions"
  | "rules"
  | "skill"
  | "subagent"
  | "command"
  | "mcp-server"
  | "mcp-tool";

export type Scope = "project" | "user";

export interface Item {
  kind: ItemKind;
  /** Display path (relative to cwd, or `~/...` for user scope). */
  path: string;
  agents: Agent[];
  loading: Loading;
  scope: Scope;
  /** Tokens the agent actually pays for this item when it is loaded. */
  tokens: number;
  /** For skills/subagents: tokens of the full file (only frontmatter is `tokens`). */
  fullTokens?: number;
  bytes: number;
  /** Short human hint: `alwaysApply: false`, `paths: src/**`, `12 tools`, ... */
  detail?: string;
  /** MCP tools under a server, or `@imports` resolved from an instruction file. */
  children?: Item[];
  /** Non-fatal problem while measuring (server failed to start, unreadable file...). */
  error?: string;
}

export interface Suggestion {
  level: "info" | "warn";
  agents: Agent[];
  message: string;
  path?: string;
}

export interface AgentSummary {
  agent: Agent;
  /** Tokens paid on every turn. */
  always: number;
  /** Tokens paid only when a glob/description matches. */
  conditional: number;
  /** Tokens loaded only on invocation (not part of the per-turn cost). */
  onDemand: number;
  byKind: Partial<Record<ItemKind, number>>;
  items: Item[];
}

export interface Report {
  version: string;
  cwd: string;
  contextWindow: number;
  tokenizer: string;
  generatedAt: string;
  agents: AgentSummary[];
  items: Item[];
  suggestions: Suggestion[];
  mcp: { measured: boolean; servers: number; failed: number };
}

export interface ScanOptions {
  cwd: string;
  /** Include `~/.claude`, `~/.codex`, ... (default true). */
  includeUser?: boolean;
  /** Connect to configured MCP servers and measure their tool schemas (default true). */
  mcp?: boolean;
  /** Per-server MCP timeout in ms (default 20000). */
  mcpTimeoutMs?: number;
  /** Restrict to these agents. */
  agents?: Agent[];
  /** Context window size used for percentages (default 200000). */
  contextWindow?: number;
  /** Progress callback for long operations (MCP connects). */
  onProgress?: (message: string) => void;
  /** Override home directory (tests). */
  homeDir?: string;
}
