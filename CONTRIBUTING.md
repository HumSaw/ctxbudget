# Contributing to ctxbudget

Thanks for helping. The codebase is small on purpose (~1.5k lines), so most contributions are an afternoon's work.

## Setup

```bash
git clone https://github.com/HumSaw/ctxbudget
cd ctxbudget
pnpm i
pnpm test                                  # vitest
pnpm dev tests/fixtures/basic --no-user    # run the CLI from source against the fixture
pnpm lint && pnpm typecheck                # biome + tsc, same as CI
```

Node 20+ and pnpm 9+ (enabled via corepack: `corepack enable`).

## Layout

```
src/
  cli.ts              argument parsing, commands (report / check / json)
  scan/
    index.ts          orchestrator: runs scanners, builds per-agent summaries
    instructions.ts   CLAUDE.md / AGENTS.md / GEMINI.md / copilot-instructions + @imports
    extensions.ts     rules, skills, subagents, commands for every agent
    mcp-config.ts     discovers MCP servers in each agent's config file
    mcp.ts            connects to servers, paginates tools/list, tokenizes schemas
  suggest.ts          heuristics that turn the scan into actionable suggestions
  report.ts           terminal renderer
  tokens.ts           o200k_base counting
tests/
  scan.test.ts        unit tests against tests/fixtures/basic
```

## The most useful contributions

**Adding a config location.** Agents move their files around between releases. If `ctxbudget` misses a file your agent actually loads, add the path in `src/scan/instructions.ts` or `src/scan/extensions.ts`, add the file to `tests/fixtures/basic`, and extend the matching test. Please link the agent's docs in the PR so the behaviour is verifiable.

**Adding an agent.** Each agent is a scanner entry (~30 lines) plus a row in the README table. Start from the Gemini CLI entry — it is the simplest.

**Improving suggestions.** `src/suggest.ts` is plain heuristics over the scan result. If you have a rule that would have saved you tokens, add it with a test.

**Reporting wrong numbers.** If the count differs noticeably from what your agent reports (e.g. `/context` in Claude Code), open an issue with both numbers and the `ctxbudget json` output. Tokenizer differences of ±10% are expected; larger gaps usually mean a missed or double-counted file.

## Pull requests

- One change per PR; keep it small.
- `pnpm lint && pnpm typecheck && pnpm test` must pass — CI runs exactly these.
- Commit messages: `feat:`, `fix:`, `docs:`, `ci:`, `test:` prefixes (conventional commits, no scopes required).
- No new runtime dependencies without discussion in an issue first. The CLI ships as a single bundle and startup time matters.

## Reporting a security issue

See [SECURITY.md](SECURITY.md).
