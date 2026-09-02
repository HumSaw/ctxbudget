# Launch kit

Ready-to-post texts for the v0.1.0 launch. Everything below is factual;
replace the bracketed numbers with your own `ctxbudget` output before posting.

Order that tends to work for dev tools: Show HN (Tue–Thu, 13:00–15:00 UTC) →
same-day X post → r/ClaudeAI + r/cursor the next day → Dev.to article a week
later once you have a couple of real user numbers to quote.

---

## Hacker News

**Title**

`Show HN: ctxbudget – how many tokens does your agent config cost on every turn?`

**Text**

I run Claude Code, Codex and Cursor across a handful of projects and kept
noticing that "the model got dumber" moments lined up with me adding another
MCP server or another paragraph to CLAUDE.md. There was no easy way to see the
actual number, so I wrote one.

`npx ctxbudget` in a repo prints, per agent, how many tokens go into the
context before you type anything: instruction files (following `@imports`),
always-on rules, the skill/subagent listings, and – the part that surprised me
– MCP tool schemas. It actually connects to each configured server, pulls
`tools/list`, and tokenizes the schemas. In my main project [N] servers were
[X]k tokens; one of them was [Y]k for tools I use maybe once a week.

It also splits things into "every turn / when matched / on demand", so you can
see what's cheap to keep. There's a `check --max` mode for CI and JSON output.

Counts use `o200k_base`, so they're ±10% for Claude/Gemini; the relative sizes
are what matter. Zero telemetry, single dependency for MCP.

Would love to hear which agents/paths I'm missing – it currently reads Claude
Code, Codex CLI, Cursor, Copilot and Gemini CLI.

https://github.com/HumSaw/ctxbudget

---

## Reddit

### r/ClaudeAI

**Title:** I measured how many tokens my CLAUDE.md + MCP servers eat before every message. Made a CLI for it.

I'd been blaming the model for forgetting things mid-session. Turned out my
"fixed" context – CLAUDE.md with its @imports, the rules, and the MCP tool
schemas – was [X]k tokens before I typed a word.

The tool is `npx ctxbudget`. It reads `.claude/`, follows `@imports`, connects
to each MCP server in `.mcp.json` / `~/.claude.json`, and tokenizes every tool
schema. Then it groups everything by *when it's loaded* (every turn vs. only
when a rule's glob matches vs. on demand) and flags the obvious wins.

Biggest surprise for me: [server name] was [Y]k tokens for [N] tools. I moved
it to a project-level config for the one repo that needs it and got [Z]k back.

Repo: https://github.com/HumSaw/ctxbudget – curious what numbers other people
see.

### r/cursor

**Title:** Which of your .cursor/rules actually load on every request? A CLI that shows the token cost.

Cursor rules have three modes (always / auto-attached by glob / agent
requested) and it's easy to lose track of which ones are which, especially with
legacy `.cursorrules` still around. `npx ctxbudget` walks `.cursor/rules/`,
reads the frontmatter, and prints the token cost split into "every turn",
"when matched", and "on demand". It does the same for MCP servers in
`.cursor/mcp.json` by connecting and pulling the tool list.

https://github.com/HumSaw/ctxbudget

### r/LocalLLaMA (only if there's a hook about small context windows)

**Title:** For anyone running coding agents against small-context local models: a tool that shows how much of the window your config already burns

Local models with 32k–128k windows make fixed context cost painfully visible.
`ctxbudget` measures the agent-config overhead (instruction files, rules, MCP
tool schemas) for Claude Code / Codex / Cursor / Copilot / Gemini CLI. Tokenizer
is `o200k_base`, so treat it as an estimate for other model families.

https://github.com/HumSaw/ctxbudget

---

## X / Twitter

Your coding agent reads your CLAUDE.md, rules and every MCP tool schema before
you type a word.

Mine was [X]k tokens. One MCP server alone was [Y]k.

`npx ctxbudget` shows the number, per agent, split by "every turn / when
matched / on demand".

Claude Code, Codex, Cursor, Copilot, Gemini CLI.

github.com/HumSaw/ctxbudget

*(attach docs/demo.png)*

---

## LinkedIn

Small open-source release: **ctxbudget**.

Every AI coding agent – Claude Code, Codex, Cursor, Copilot, Gemini CLI – reads
a stack of config before your first message: instruction files, rules, and the
JSON schema of every tool exposed by every MCP server you've connected. That
stack is a fixed cost on every turn, and nothing shows you the number.

`npx ctxbudget` does. It connects to your MCP servers, pulls the tool lists,
tokenizes them together with your instruction files and rules, and groups the
result by when it's actually loaded. In my own setup the fixed cost was [X]k
tokens; one server I rarely used was [Y]k of that.

Technical notes for anyone curious:
- TypeScript, Node 20+, one runtime dependency (the MCP SDK) plus a tokenizer
- stdio, Streamable HTTP and SSE transports; paginated `tools/list`
- `check --max N` for CI; JSON output; programmatic `scan()` API
- Counts use `o200k_base`, so ±10% for non-OpenAI tokenizers

Feedback on missing agents or config locations very welcome:
https://github.com/HumSaw/ctxbudget

---

## Dev.to / blog post outline

**Working title:** *Your agent's context window is already 15% full before you say hello*

1. **The symptom** – model "forgets" more as the day goes on; adding an MCP
   server makes it worse; nobody can say by how much.
2. **What's actually in the window before turn 1** – system prompt (opaque),
   instruction files + `@imports`, always-on rules, skill/subagent listings,
   MCP `tools/list` results. Which of these you control.
3. **Why MCP schemas are the sleeper cost** – a JSON Schema per tool, 40–60
   tools per server, all sent on every turn. Real numbers from [3–4 popular
   servers] measured with the tool.
4. **Building ctxbudget** – reading five agents' config conventions (and where
   they disagree), following Claude's `@imports`, Cursor's three rule modes,
   connecting to servers over three transports, why `o200k_base` and what the
   error bars look like.
5. **What I changed in my own setup** – before/after table from `ctxbudget
   json`, which servers moved to project scope, what got path-scoped.
6. **Running it in CI** – `ctxbudget check --max 12000` and why a budget beats
   a guideline.
7. **What's next** – Windsurf/Cline/Amp, per-tool breakdown, agent-specific
   tokenizers; link to the roadmap and issue templates.

---

## Awesome lists – assessment

| List | Fit | Notes |
| --- | --- | --- |
| `hesreallyhim/awesome-claude-code` | Strong | Has a "CLI tools / utilities" section; contributions via PR or their `/project:add-new-resource` command. Submit after the first week, once there are a few external stars. |
| `punkpeye/awesome-mcp-servers` | Weak | Lists servers, not client-side tooling. Skip. |
| `punkpeye/awesome-mcp-devtools` (and similar "MCP devtools" lists) | Good | Lists inspectors and CLIs; ctxbudget fits under testing/inspection utilities. |
| `PatrickJS/awesome-cursorrules` | Medium | Primarily rule collections; a "tools" section exists in some forks. Submit only where a tooling section already exists. |
| `awesome-copilot` / Gemini CLI lists | Low for now | Coverage there is thin in v0.1; revisit after Copilot/Gemini support has had real-world testing. |

Rule for all of them: one PR per list, follow their template exactly, never
open a PR to a list where the project doesn't clearly belong.

---

## Metrics to watch (GitHub Insights → Traffic)

- Unique visitors and referrers per day for the first 14 days
- Stars per 100 unique visitors (conversion); >3% is healthy for a CLI
- Clones vs. `npm` downloads (npmjs.com/package/ctxbudget once published)
- Issues opened using the "new agent or location" template – that's the
  roadmap signal
- First external PR
