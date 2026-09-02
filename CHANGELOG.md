# Changelog

## 0.1.0 — 2026-09-02

First release.

### Features

- Per-agent fixed-cost report for **Claude Code, Codex CLI, Cursor, GitHub Copilot and Gemini CLI**, split into *every turn*, *when matched* and *on demand*.
- Instruction files: `CLAUDE.md` (+ `.claude/CLAUDE.md`, `CLAUDE.local.md`, user-level), `AGENTS.md` / `AGENTS.override.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursorrules`; Claude `@import` resolution to depth 5.
- Rules: `.claude/rules` (`paths:`), `.cursor/rules/*.mdc` (`alwaysApply` / `globs`), `.github/instructions/*.instructions.md` (`applyTo`).
- Skills, subagents and slash commands for every agent, with the per-turn listing cost separated from the "when invoked" body size.
- **MCP measurement**: discovers servers in `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.vscode/mcp.json`, `.gemini/settings.json` and user-level configs; connects over stdio / Streamable HTTP / SSE, paginates `tools/list`, tokenizes each tool schema. Servers shared between agents are connected once.
- Suggestions engine (oversized MCP servers, large instruction files, always-on rules that should be scoped, duplicated content).
- `check --max N` for CI gating, `json` for machine-readable output, `--agent`, `--no-mcp`, `--no-user`, `-v`.
- Programmatic API: `import { scan } from "ctxbudget"`.

### Known limitations

- Token counts use `o200k_base`; Anthropic/Google tokenizers differ by roughly ±10%, and each agent wraps tools in its own template. Relative sizes are exact, absolute numbers are estimates.
- MCP servers requiring OAuth are reported as *unreachable* rather than measured.
- Agents not yet covered: Windsurf, Cline, Amp, Zed, JetBrains Junie. See the roadmap in the README — PRs welcome.
- Hooks, output styles and status-line configs are not counted (they do not enter the prompt).
