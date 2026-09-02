import { basename, join } from "node:path";
import { countTokens } from "../tokens.js";
import type { Agent, Item, Loading, Scope } from "../types.js";
import {
  dirExists,
  displayPath,
  fileExists,
  listDir,
  parseFrontmatter,
  readText,
  walk,
} from "../utils.js";
import type { ScanCtx } from "./instructions.js";

const isMd = (f: string) => f.endsWith(".md") || f.endsWith(".mdc");

function roots(ctx: ScanCtx, rel: string): Array<{ dir: string; scope: Scope }> {
  const out: Array<{ dir: string; scope: Scope }> = [{ dir: join(ctx.cwd, rel), scope: "project" }];
  if (ctx.includeUser) out.push({ dir: join(ctx.home, rel), scope: "user" });
  return out.filter((r) => dirExists(r.dir));
}

/* ------------------------------------------------------------------ rules */

interface RuleMeta {
  loading: Loading;
  detail?: string;
}

/** Cursor `.mdc`: alwaysApply / globs / description decide how a rule loads. */
function cursorRuleMeta(data: Record<string, unknown>): RuleMeta {
  if (data.alwaysApply === true) return { loading: "always", detail: "alwaysApply: true" };
  const globs = data.globs;
  if (typeof globs === "string" && globs.trim())
    return { loading: "conditional", detail: `globs: ${globs}` };
  if (Array.isArray(globs) && globs.length)
    return { loading: "conditional", detail: `globs: ${globs.join(", ")}` };
  if (typeof data.description === "string" && data.description.trim()) {
    return { loading: "on-demand", detail: "agent-requested (description)" };
  }
  return { loading: "on-demand", detail: "manual (@rule)" };
}

/** Claude `.claude/rules/*.md`: always unless `paths:` frontmatter narrows it. */
function claudeRuleMeta(data: Record<string, unknown>): RuleMeta {
  const paths = data.paths;
  if (Array.isArray(paths) && paths.length)
    return { loading: "conditional", detail: `paths: ${paths.join(", ")}` };
  if (typeof paths === "string" && paths.trim())
    return { loading: "conditional", detail: `paths: ${paths}` };
  return { loading: "always" };
}

/** Copilot `.github/instructions/*.instructions.md`: `applyTo` glob. */
function copilotRuleMeta(data: Record<string, unknown>): RuleMeta {
  const applyTo = data.applyTo;
  if (typeof applyTo === "string" && applyTo.trim()) {
    return applyTo.trim() === "**"
      ? { loading: "always", detail: "applyTo: **" }
      : { loading: "conditional", detail: `applyTo: ${applyTo}` };
  }
  return { loading: "on-demand", detail: "no applyTo (manual)" };
}

export function scanRules(ctx: ScanCtx): Item[] {
  const items: Item[] = [];
  const push = (
    file: string,
    agents: Agent[],
    scope: Scope,
    meta: (d: Record<string, unknown>) => RuleMeta,
  ) => {
    const text = readText(file);
    if (text === undefined) return;
    const fm = parseFrontmatter(text);
    const m = meta(fm.data);
    items.push({
      kind: "rules",
      path: displayPath(file, ctx.cwd, ctx.home),
      agents,
      loading: m.loading,
      scope,
      tokens: countTokens(text),
      bytes: Buffer.byteLength(text),
      ...(m.detail ? { detail: m.detail } : {}),
    });
  };

  for (const r of roots(ctx, ".claude/rules")) {
    for (const f of walk(r.dir, isMd)) push(f, ["claude"], r.scope, claudeRuleMeta);
  }
  const cursorRules = join(ctx.cwd, ".cursor/rules");
  if (dirExists(cursorRules)) {
    for (const f of walk(cursorRules, isMd)) push(f, ["cursor"], "project", cursorRuleMeta);
  }
  const copilotRules = join(ctx.cwd, ".github/instructions");
  if (dirExists(copilotRules)) {
    for (const f of walk(copilotRules, (p) => p.endsWith(".instructions.md"))) {
      push(f, ["copilot"], "project", copilotRuleMeta);
    }
  }
  return items;
}

/* ----------------------------------------------------------------- skills */

/**
 * Agent Skills (Claude Code, Codex, Copilot, Cursor, Gemini all use SKILL.md).
 * Only `name` + `description` are injected every turn; the body loads on demand.
 */
export function scanSkills(ctx: ScanCtx): Item[] {
  const items: Item[] = [];
  const sources: Array<{ rel: string; agents: Agent[] }> = [
    { rel: ".claude/skills", agents: ["claude"] },
    { rel: ".codex/skills", agents: ["codex"] },
    { rel: ".agents/skills", agents: ["codex", "cursor", "copilot"] },
    { rel: ".github/skills", agents: ["copilot"] },
    { rel: ".cursor/skills", agents: ["cursor"] },
    { rel: ".gemini/skills", agents: ["gemini"] },
  ];
  for (const src of sources) {
    for (const r of roots(ctx, src.rel)) {
      for (const name of listDir(r.dir)) {
        const skillFile = join(r.dir, name, "SKILL.md");
        if (!fileExists(skillFile)) continue;
        const text = readText(skillFile);
        if (text === undefined) continue;
        const fm = parseFrontmatter(text);
        const desc = typeof fm.data.description === "string" ? fm.data.description : "";
        const skillName = typeof fm.data.name === "string" ? fm.data.name : name;
        // What the agent pays per turn is roughly the name+description listing.
        const listing = `${skillName}: ${desc}`;
        const extras = walk(join(r.dir, name), () => true).length - 1;
        items.push({
          kind: "skill",
          path: displayPath(skillFile, ctx.cwd, ctx.home),
          agents: src.agents,
          loading: "always",
          scope: r.scope,
          tokens: countTokens(listing),
          fullTokens: countTokens(text),
          bytes: Buffer.byteLength(text),
          detail: `${desc.length} char description${extras > 0 ? `, ${extras} extra file${extras === 1 ? "" : "s"}` : ""}`,
          ...(desc.trim()
            ? {}
            : { error: "missing description – agent cannot decide when to use it" }),
        });
      }
    }
  }
  return items;
}

/* -------------------------------------------------------------- subagents */

export function scanSubagents(ctx: ScanCtx): Item[] {
  const items: Item[] = [];
  const sources: Array<{ rel: string; agents: Agent[]; kind: "subagent" }> = [
    { rel: ".claude/agents", agents: ["claude"], kind: "subagent" },
    { rel: ".github/agents", agents: ["copilot"], kind: "subagent" },
    { rel: ".codex/agents", agents: ["codex"], kind: "subagent" },
  ];
  for (const src of sources) {
    for (const r of roots(ctx, src.rel)) {
      for (const f of walk(
        r.dir,
        (p) => p.endsWith(".md") || p.endsWith(".agent.md") || p.endsWith(".toml"),
      )) {
        const text = readText(f);
        if (text === undefined) continue;
        const fm = parseFrontmatter(text);
        const desc = typeof fm.data.description === "string" ? fm.data.description : "";
        const name =
          typeof fm.data.name === "string"
            ? fm.data.name
            : basename(f).replace(/\.(agent\.)?md$|\.toml$/, "");
        items.push({
          kind: src.kind,
          path: displayPath(f, ctx.cwd, ctx.home),
          agents: src.agents,
          loading: "always",
          scope: r.scope,
          tokens: countTokens(`${name}: ${desc}`),
          fullTokens: countTokens(text),
          bytes: Buffer.byteLength(text),
          detail: `${desc.length} char description`,
        });
      }
    }
  }
  return items;
}

/* --------------------------------------------------------------- commands */

/** Slash commands / prompts: purely on demand, but easy to let rot. */
export function scanCommands(ctx: ScanCtx): Item[] {
  const items: Item[] = [];
  const sources: Array<{ rel: string; agents: Agent[]; ext: (p: string) => boolean }> = [
    { rel: ".claude/commands", agents: ["claude"], ext: (p) => p.endsWith(".md") },
    { rel: ".codex/prompts", agents: ["codex"], ext: (p) => p.endsWith(".md") },
    { rel: ".github/prompts", agents: ["copilot"], ext: (p) => p.endsWith(".prompt.md") },
    { rel: ".cursor/commands", agents: ["cursor"], ext: (p) => p.endsWith(".md") },
    { rel: ".gemini/commands", agents: ["gemini"], ext: (p) => p.endsWith(".toml") },
  ];
  for (const src of sources) {
    for (const r of roots(ctx, src.rel)) {
      for (const f of walk(r.dir, src.ext)) {
        const text = readText(f);
        if (text === undefined) continue;
        items.push({
          kind: "command",
          path: displayPath(f, ctx.cwd, ctx.home),
          agents: src.agents,
          loading: "on-demand",
          scope: r.scope,
          tokens: countTokens(text),
          bytes: Buffer.byteLength(text),
        });
      }
    }
  }
  return items;
}
