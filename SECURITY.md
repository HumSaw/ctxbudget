# Security

## What ctxbudget does on your machine

Worth knowing before you run it on an unfamiliar repo:

- **It starts your MCP servers.** By default `ctxbudget` spawns every stdio MCP server declared in the repo's agent configs (`.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.vscode/mcp.json`, `.gemini/settings.json`) and in your user-level configs, exactly as the agent would, then calls `tools/list` and disconnects. A malicious repo can therefore run arbitrary commands through its MCP config — the same risk you take by opening that repo in Claude Code or Cursor. Use `--no-mcp` on repos you don't trust, or `--no-user` to skip your own servers.
- **It reads config, not source.** Only instruction files, rules, skills, commands and MCP configs are read. Nothing is sent anywhere; there is no telemetry.
- **Env expansion.** `${VAR}` in MCP configs is expanded from your environment so servers can start, but values are never printed or written to the report.

## Reporting a vulnerability

If you find a way for `ctxbudget` to do something beyond the above — e.g. execute code from a repo with `--no-mcp` set, or leak environment values into output — please report it privately via [GitHub Security Advisories](https://github.com/HumSaw/ctxbudget/security/advisories/new) rather than a public issue. You should get a response within a few days.
