import pc from "picocolors";
import { loadedTokens } from "./scan/index.js";
import { formatTokens, percent } from "./tokens.js";
import { AGENT_LABELS, type Agent, type Item, type ItemKind, type Report } from "./types.js";

export interface RenderOptions {
  /** Expand MCP tools and @imports. */
  verbose?: boolean;
  /** Show only this agent in the detail section (summary shows all). */
  agent?: Agent;
  color?: boolean;
}

const KIND_LABEL: Record<ItemKind, string> = {
  instructions: "Instructions",
  rules: "Rules",
  skill: "Skills",
  subagent: "Subagents",
  command: "Commands",
  "mcp-server": "MCP servers",
  "mcp-tool": "MCP tools",
};

const KIND_ORDER: ItemKind[] = [
  "instructions",
  "rules",
  "mcp-server",
  "skill",
  "subagent",
  "command",
];

function bar(part: number, whole: number, width = 24): string {
  const filled = Math.min(width, Math.round((part / whole) * width));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function rpad(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function loadTag(item: Item): string {
  if (item.error && item.tokens === 0) return pc.red("error");
  if (item.loading === "always") return pc.yellow("every turn");
  if (item.loading === "conditional") return pc.cyan("when matched");
  return pc.dim("on demand");
}

function tokenCell(item: Item): string {
  const t = loadedTokens(item);
  if (item.error && item.tokens === 0) return pc.red(rpad("—", 7));
  const s = rpad(formatTokens(t), 7);
  if (item.loading !== "always") return pc.dim(s);
  if (t > 5000) return pc.red(pc.bold(s));
  if (t > 1500) return pc.yellow(s);
  return s;
}

export function renderReport(report: Report, opts: RenderOptions = {}): string {
  const lines: string[] = [];
  const cw = report.contextWindow;
  const p = (s = "") => lines.push(s);

  p();
  p(`${pc.bold("ctxbudget")} ${pc.dim(`v${report.version}`)}  ${pc.dim(report.cwd)}`);
  p(
    pc.dim(`tokenizer ${report.tokenizer} · context window ${formatTokens(cw)} · ~ means estimate`),
  );
  p();

  // ---- Summary per agent
  const active = report.agents.filter((a) => a.items.length > 0);
  if (active.length === 0) {
    p(
      pc.dim(
        "No agent configuration found (CLAUDE.md, AGENTS.md, .cursor/, .github/, .mcp.json, …).",
      ),
    );
    p();
    return lines.join("\n");
  }
  p(pc.bold("Fixed cost per turn"));
  const labelW = Math.max(...active.map((a) => AGENT_LABELS[a.agent].length)) + 2;
  for (const a of active) {
    const pctStr = rpad(percent(a.always, cw), 5);
    const tone = a.always > cw * 0.15 ? pc.red : a.always > cw * 0.08 ? pc.yellow : pc.green;
    const extras: string[] = [];
    if (a.conditional) extras.push(`+${formatTokens(a.conditional)} when matched`);
    if (a.onDemand) extras.push(`${formatTokens(a.onDemand)} on demand`);
    p(
      `  ${pad(AGENT_LABELS[a.agent], labelW)} ${tone(bar(a.always, cw * 0.25))} ${tone(rpad(`~${formatTokens(a.always)}`, 7))} ${pc.dim(pctStr)}${extras.length ? pc.dim(`  ${extras.join(" · ")}`) : ""}`,
    );
  }
  p(
    pc.dim(
      `  ${" ".repeat(labelW)} bar = share of a 25% budget (${formatTokens(cw * 0.25)} tokens)`,
    ),
  );
  p();

  // ---- Detail
  const detailAgents = opts.agent ? active.filter((a) => a.agent === opts.agent) : active;
  const shown = new Set<Item>();
  const detailItems = report.items.filter((i) =>
    detailAgents.some((a) => i.agents.includes(a.agent)),
  );

  for (const kind of KIND_ORDER) {
    const group = detailItems
      .filter((i) => i.kind === kind)
      .sort((a, b) => loadedTokens(b) - loadedTokens(a));
    if (!group.length) continue;
    const always = group
      .filter((i) => i.loading === "always")
      .reduce((s, i) => s + loadedTokens(i), 0);
    const suffix =
      kind === "skill" || kind === "subagent" ? pc.dim(" (name + description only)") : "";
    p(`${pc.bold(KIND_LABEL[kind])}${suffix}  ${pc.dim(`~${formatTokens(always)} every turn`)}`);
    for (const item of group) {
      if (shown.has(item)) continue;
      shown.add(item);
      const agents = item.agents.map((a) => AGENT_LABELS[a]).join(", ");
      const detail = [
        item.detail,
        item.fullTokens ? `${formatTokens(item.fullTokens)} when invoked` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      p(
        `  ${tokenCell(item)}  ${pad(loadTag(item), 12)}  ${item.path}  ${pc.dim(agents)}${detail ? pc.dim(`  ${detail}`) : ""}`,
      );
      if (item.error && item.tokens === 0) p(`           ${pc.red(`↳ ${item.error}`)}`);
      if (item.children?.length) {
        const kids = opts.verbose
          ? item.children
          : item.children.slice(0, kind === "mcp-server" ? 3 : 10);
        for (const c of kids) {
          const err = c.error ? pc.red(` (${c.error})`) : "";
          p(
            `           ${pc.dim(rpad(formatTokens(c.tokens), 7))}  ${pc.dim("↳")} ${pc.dim(c.path)}${err}`,
          );
        }
        const rest = item.children.length - kids.length;
        if (rest > 0) p(`           ${pc.dim(`… ${rest} more (run with --verbose)`)}`);
      }
    }
    p();
  }

  // ---- Suggestions
  if (report.suggestions.length) {
    p(pc.bold("Suggestions"));
    for (const s of report.suggestions) {
      const icon = s.level === "warn" ? pc.yellow("▲") : pc.blue("●");
      p(`  ${icon} ${s.message}`);
    }
    p();
  }

  if (report.mcp.servers && !report.mcp.measured) {
    p(
      pc.dim(
        `${report.mcp.servers} MCP server(s) found but not measured. Drop --no-mcp to connect and count tool schemas.`,
      ),
    );
    p();
  }
  return lines.join("\n");
}

/** Compact one-line-per-agent output for `ctxbudget check`. */
export function renderCheck(report: Report, budget: number, failed: Agent[]): string {
  const lines: string[] = [];
  for (const a of report.agents.filter((x) => x.items.length)) {
    const bad = failed.includes(a.agent);
    const mark = bad ? pc.red("✖") : pc.green("✔");
    lines.push(
      `${mark} ${pad(AGENT_LABELS[a.agent], 16)} ~${formatTokens(a.always)} tokens every turn ${pc.dim(`(budget ${formatTokens(budget)})`)}`,
    );
  }
  return lines.join("\n");
}
