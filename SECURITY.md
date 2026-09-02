# Security

## What ctxbudget does on your machine

`ctxbudget` is read-only by default. It scans agent instruction files, rules, skills, commands and MCP configuration without starting commands from the repository.

MCP tool-schema measurement is opt-in:

```bash
ctxbudget --mcp
```

With `--mcp`, ctxbudget starts configured stdio MCP servers or connects to configured HTTP/SSE servers, calls `tools/list`, records schema sizes, then disconnects. Treat this the same way you would treat opening an unfamiliar repository in an agent that enables its MCP configuration: a repository-controlled stdio command can execute code on your machine.

For repositories you do not trust, run the default command and leave `--mcp` off. Use `--no-user` if you also want to ignore user-level agent configuration.

Environment variables referenced by MCP config are expanded only when `--mcp` is used. Their values are never included in the report. ctxbudget has no telemetry and does not upload scanned files.

## Reporting a vulnerability

Please report security issues privately through [GitHub Security Advisories](https://github.com/HumSaw/ctxbudget/security/advisories/new), especially anything that causes command execution without `--mcp` or exposes environment values in output.
