# ctxbudget

**How many tokens does your agent config cost on every turn?**

`ctxbudget` estimates the fixed context cost of a coding-agent setup before the first prompt: instruction files, imports, always-on rules, skill and subagent listings, and MCP tool schemas.

It understands Claude Code, Codex CLI, Cursor, GitHub Copilot and Gemini CLI.

![ctxbudget report](docs/demo.png)

<details>
<summary>Example report</summary>

```text
$ npx ctxbudget --mcp

Fixed cost per turn
  Claude Code      ████████████░░░░░░░░░░░░  ~24.1k 12.1%  +1.6k when matched · 3.2k on demand
  Codex CLI        ██████████░░░░░░░░░░░░░░  ~21.4k 10.7%
  Cursor           ██░░░░░░░░░░░░░░░░░░░░░░   ~4.0k  2.0%  +2.3k when matched

MCP servers  ~20.3k every turn
    12.8k  every turn  github       Claude Code, Codex CLI  51 tools · .mcp.json, .codex/config.toml
             1.1k  ↳ create_pull_request_review
             ...
     7.5k  every turn  playwright   Claude Code             24 tools · .mcp.json

Suggestions
  ▲ MCP server "github" adds 12.8k tokens (51 tools) to every turn; the largest tool is
    "create_pull_request_review" at 1.1k. Disable it when not needed, or use an agent
    that supports deferred tool loading.
  ▲ CLAUDE.md is 3.4k tokens and loads every turn. Consider moving path-specific rules
    out of the global instruction file.
```

</details>

## Why

Agent configuration grows quietly. A few instruction files, global rules and MCP servers can consume a meaningful part of the context window before the model sees the task or your code.

`ctxbudget` makes that overhead visible. File-based configuration is scanned without executing repository commands. MCP measurement is optional because accurate tool-schema sizing requires connecting to the configured servers.

## Install

```bash
npx ctxbudget
```

Or install it globally:

```bash
pnpm add -g ctxbudget
```

Requires Node 20+.

## Usage

```bash
ctxbudget [dir]                  # scan files and MCP config; does not start MCP servers
ctxbudget --mcp                  # also start MCP servers and measure tools/list schemas
ctxbudget --agent claude -v      # one agent, expanded details
ctxbudget --no-user              # ignore user-level agent config
ctxbudget check --max 15000      # exit 1 when an agent exceeds the budget
ctxbudget json | jq .            # machine-readable report
```

### CI gate

```yaml
- run: npx ctxbudget check --max 20000
```

The default scan is safe for CI: it does not execute commands declared by repository MCP configuration.

## What it measures

| Agent | Instructions | Rules | Skills / subagents | Commands | MCP config |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `~/.claude/CLAUDE.md`, `@imports` | `.claude/rules/*.md` | `.claude/skills/*/SKILL.md`, `.claude/agents/*.md` | `.claude/commands` | `.mcp.json`, `~/.claude.json` |
| Codex CLI | `AGENTS.md`, `AGENTS.override.md`, `~/.codex/AGENTS.md` | – | `.codex/skills`, `.agents/skills` | `.codex/prompts` | `.codex/config.toml` |
| Cursor | `AGENTS.md`, `.cursorrules` | `.cursor/rules/*.mdc` | `.cursor/skills`, `.agents/skills` | `.cursor/commands` | `.cursor/mcp.json` |
| GitHub Copilot | `.github/copilot-instructions.md`, `AGENTS.md` | `.github/instructions/*.instructions.md` | `.github/skills`, `.github/agents` | `.github/prompts` | `.vscode/mcp.json` |
| Gemini CLI | `GEMINI.md`, `~/.gemini/GEMINI.md` | – | `.gemini/skills` | `.gemini/commands` | `.gemini/settings.json` |

Loading modes:

- **every turn** — fixed context such as global instructions, always-on rules and skill/subagent listings
- **when matched** — path-scoped rules such as `paths:`, `globs:` and `applyTo:`
- **on demand** — slash commands and skill bodies that are loaded only when used

When `--mcp` is enabled, ctxbudget starts configured stdio servers or connects to Streamable HTTP/SSE servers, paginates `tools/list`, and tokenizes each tool's name, description and input schema. Shared servers are connected once and attributed to every agent that uses them.

## Accuracy

Token counts use `o200k_base` via [`gpt-tokenizer`](https://github.com/niieani/gpt-tokenizer). Anthropic and Google models tokenize differently, and agents wrap tools in different prompt templates, so absolute totals are estimates. Treat them as roughly ±10%; relative sizes are the useful part of the report.

## Programmatic use

```ts
import { scan } from "ctxbudget";

const report = await scan({ cwd: process.cwd(), mcp: false });
for (const agent of report.agents) {
  console.log(agent.agent, agent.always);
}
```

## Related tools

Agent configuration has three separate failure modes:

- **ctxbudget** measures how much configuration and MCP schema enters context.
- **[RuleTrace](https://github.com/HumSaw/ruletrace)** maps which instruction files apply and flags conflicting policies.
- **[dev-checkup](https://github.com/HumSaw/dev-checkup)** runs broader deterministic repository checks before CI.

Each tool works independently and keeps its default scan local.

## Roadmap

- [ ] `ctxbudget diff` — compare a branch or commit and show what increased fixed context
- [ ] GitHub Action with a PR comment for context-budget changes
- [ ] More agents: Windsurf, Cline, Amp, Zed and Junie
- [ ] Per-model tokenizers where public implementations are available
- [ ] MCP `resources/list` and `prompts/list`
- [ ] Watch mode for editing instruction files and rules

## Contributing

```bash
pnpm i
pnpm test
pnpm dev tests/fixtures/basic --no-user
```

PRs that add agent config locations or improve measurement are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Security details, especially around `--mcp`, are in [SECURITY.md](SECURITY.md).

## License

MIT
