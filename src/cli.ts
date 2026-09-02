#!/usr/bin/env node
import { parseArgs } from "node:util";
import pc from "picocolors";
import { renderCheck, renderReport } from "./report.js";
import { DEFAULT_CONTEXT_WINDOW, scan, VERSION } from "./scan/index.js";
import { formatTokens } from "./tokens.js";
import { AGENTS, type Agent } from "./types.js";

const HELP = `
${pc.bold("ctxbudget")} – how many tokens does your agent config cost on every turn?

${pc.bold("Usage")}
  ctxbudget [dir]                 Scan instruction files, rules, skills and MCP config
  ctxbudget check [dir] --max N   Exit 1 if any agent's per-turn overhead exceeds N tokens
  ctxbudget json [dir]            Machine-readable report on stdout

${pc.bold("Options")}
  --agent <name>       Only report for one agent: ${AGENTS.join(", ")}
  --max <tokens>       Budget for \`check\` (default 20000)
  --window <tokens>    Context window used for percentages (default ${DEFAULT_CONTEXT_WINDOW})
  --mcp                Start configured MCP servers and measure tool schemas
  --no-user            Ignore ~/.claude, ~/.codex, ~/.cursor, … (project files only)
  --timeout <ms>       Per-server MCP timeout (default 20000)
  --verbose, -v        Expand every MCP tool and @import
  --no-color           Plain output
  --version, -V
  --help, -h

${pc.bold("Examples")}
  npx ctxbudget
  npx ctxbudget --mcp
  npx ctxbudget --agent claude -v
  npx ctxbudget check --max 15000        # in CI
  npx ctxbudget json | jq '.agents[] | {agent, always}'
`;

function fail(msg: string): never {
  process.stderr.write(`${pc.red("error:")} ${msg}\n`);
  process.exit(2);
}

async function main(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      agent: { type: "string" },
      max: { type: "string" },
      window: { type: "string" },
      mcp: { type: "boolean", default: false },
      user: { type: "boolean", default: true },
      timeout: { type: "string" },
      verbose: { type: "boolean", short: "v", default: false },
      color: { type: "boolean", default: true },
      version: { type: "boolean", short: "V", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  type Command = "report" | "check" | "json";
  const rest = [...positionals];
  const first = rest[0];
  let command: Command = "report";
  if (first === "check" || first === "json" || first === "report") {
    command = first;
    rest.shift();
  }
  const cwd = rest[0] ?? process.cwd();

  let agents: Agent[] | undefined;
  if (values.agent) {
    if (!AGENTS.includes(values.agent as Agent))
      fail(`unknown agent "${values.agent}". Use one of: ${AGENTS.join(", ")}`);
    agents = [values.agent as Agent];
  }
  const num = (v: string | undefined, name: string, def: number) => {
    if (v === undefined) return def;
    const n = Number(v.replace(/[_,]/g, ""));
    if (!Number.isFinite(n) || n <= 0) fail(`--${name} must be a positive number`);
    return n;
  };
  const contextWindow = num(values.window, "window", DEFAULT_CONTEXT_WINDOW);
  const timeout = num(values.timeout, "timeout", 20_000);
  const budget = num(values.max, "max", 20_000);

  const quiet = command === "json";
  const spinner = !quiet && process.stderr.isTTY;
  let lastLen = 0;
  const onProgress = (msg: string) => {
    if (!spinner) return;
    const line = pc.dim(`… ${msg}`);
    process.stderr.write(`\r${" ".repeat(lastLen)}\r${line}`);
    lastLen = msg.length + 2;
  };

  const report = await scan({
    cwd,
    ...(agents ? { agents } : {}),
    includeUser: values.user,
    mcp: values.mcp,
    mcpTimeoutMs: timeout,
    contextWindow,
    onProgress,
  });
  if (spinner && lastLen) process.stderr.write(`\r${" ".repeat(lastLen)}\r`);

  if (command === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (command === "check") {
    const failed = report.agents
      .filter((a) => a.items.length && a.always > budget)
      .map((a) => a.agent);
    process.stdout.write(`${renderCheck(report, budget, failed)}\n`);
    if (failed.length) {
      process.stdout.write(
        `\n${pc.red(`${failed.length} agent(s) over the ${formatTokens(budget)} token budget.`)} Run \`ctxbudget\` for details.\n`,
      );
      process.exit(1);
    }
    return;
  }

  process.stdout.write(
    `${renderReport(report, { verbose: values.verbose, ...(agents ? { agent: agents[0] as Agent } : {}) })}\n`,
  );
}

main(process.argv.slice(2)).catch((e: unknown) => {
  fail(e instanceof Error ? e.message : String(e));
});
