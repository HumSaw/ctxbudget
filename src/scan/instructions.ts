import { dirname, join } from "node:path";
import { countTokens } from "../tokens.js";
import type { Agent, Item } from "../types.js";
import { displayPath, fileExists, readText, resolveFrom } from "../utils.js";

export interface ScanCtx {
  cwd: string;
  home: string;
  includeUser: boolean;
}

interface InstructionSpec {
  /** Path relative to cwd or absolute (already expanded). */
  file: string;
  agents: Agent[];
  scope: "project" | "user";
  /** Supports Claude-style `@path` imports. */
  imports?: boolean;
}

function specs(ctx: ScanCtx): InstructionSpec[] {
  const p = (f: string) => join(ctx.cwd, f);
  const h = (f: string) => join(ctx.home, f);
  const out: InstructionSpec[] = [
    { file: p("CLAUDE.md"), agents: ["claude"], scope: "project", imports: true },
    { file: p(".claude/CLAUDE.md"), agents: ["claude"], scope: "project", imports: true },
    { file: p("CLAUDE.local.md"), agents: ["claude"], scope: "project", imports: true },
    { file: p("AGENTS.md"), agents: ["codex", "cursor", "copilot", "gemini"], scope: "project" },
    { file: p("AGENTS.override.md"), agents: ["codex"], scope: "project" },
    { file: p("GEMINI.md"), agents: ["gemini"], scope: "project" },
    { file: p(".cursorrules"), agents: ["cursor"], scope: "project" },
    { file: p(".github/copilot-instructions.md"), agents: ["copilot"], scope: "project" },
  ];
  if (ctx.includeUser) {
    out.push(
      { file: h(".claude/CLAUDE.md"), agents: ["claude"], scope: "user", imports: true },
      { file: h(".codex/AGENTS.md"), agents: ["codex"], scope: "user" },
      { file: h(".gemini/GEMINI.md"), agents: ["gemini"], scope: "user" },
    );
  }
  return out;
}

/**
 * Claude Code resolves `@path/to/file` lines (max depth 5). We follow the same
 * rule: a line whose first non-space token starts with `@` and looks like a path.
 */
const IMPORT_RE = /^\s*@((?:~\/|\.{0,2}\/)?[^\s`'"<>]+)\s*$/gm;

export function resolveImports(
  file: string,
  text: string,
  ctx: ScanCtx,
  seen = new Set<string>(),
  depth = 0,
): Item[] {
  if (depth >= 5) return [];
  const children: Item[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const target = resolveFrom(dirname(file), m[1] as string, ctx.home);
    if (seen.has(target)) continue;
    seen.add(target);
    const content = readText(target);
    const base: Item = {
      kind: "instructions",
      path: displayPath(target, ctx.cwd, ctx.home),
      agents: ["claude"],
      loading: "always",
      scope: target.startsWith(ctx.home) && !target.startsWith(ctx.cwd) ? "user" : "project",
      tokens: 0,
      bytes: 0,
      detail: "@import",
    };
    if (content === undefined) {
      children.push({ ...base, error: "import target not found" });
      continue;
    }
    const nested = resolveImports(target, content, ctx, seen, depth + 1);
    children.push({
      ...base,
      tokens: countTokens(content),
      bytes: Buffer.byteLength(content),
      ...(nested.length ? { children: nested } : {}),
    });
  }
  return children;
}

export function scanInstructions(ctx: ScanCtx): Item[] {
  const items: Item[] = [];
  const seenFiles = new Set<string>();
  for (const spec of specs(ctx)) {
    if (seenFiles.has(spec.file) || !fileExists(spec.file)) continue;
    seenFiles.add(spec.file);
    const text = readText(spec.file);
    if (text === undefined) continue;
    const children = spec.imports ? resolveImports(spec.file, text, ctx, new Set([spec.file])) : [];
    const item: Item = {
      kind: "instructions",
      path: displayPath(spec.file, ctx.cwd, ctx.home),
      agents: spec.agents,
      loading: "always",
      scope: spec.scope,
      tokens: countTokens(text),
      bytes: Buffer.byteLength(text),
    };
    if (children.length) {
      item.children = children;
      item.detail = `${children.length} @import${children.length === 1 ? "" : "s"}`;
    }
    if (spec.file.endsWith(".cursorrules")) item.detail = "legacy, prefer .cursor/rules";
    items.push(item);
  }
  return items;
}

/** Total tokens including nested imports (each import counted once). */
export function totalWithChildren(item: Item): number {
  return item.tokens + (item.children ?? []).reduce((a, c) => a + totalWithChildren(c), 0);
}
