import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

export function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function dirExists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function readText(p: string): string | undefined {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return undefined;
  }
}

export function readJson<T = unknown>(p: string): T | undefined {
  const raw = readText(p);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(stripJsonComments(raw)) as T;
  } catch {
    return undefined;
  }
}

/** Removes `//` and `/* *\/` comments and trailing commas (VS Code / Cursor JSONC). */
export function stripJsonComments(s: string): string {
  let out = "";
  let inStr = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i] as string;
    const n = s[i + 1];
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Recursively list files under `dir` matching the predicate (skips node_modules/.git). */
export function walk(dir: string, predicate: (file: string) => boolean, maxDepth = 6): string[] {
  const out: string[] = [];
  const visit = (d: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === ".git") continue;
      const full = join(d, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) visit(full, depth + 1);
      else if (st.isFile() && predicate(full)) out.push(full);
    }
  };
  visit(dir, 0);
  return out.sort();
}

export function listDir(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

export interface Frontmatter {
  data: Record<string, unknown>;
  /** Raw frontmatter text including the `---` fences. */
  raw: string;
  body: string;
}

/**
 * Minimal YAML frontmatter parser: handles `key: value`, quoted strings,
 * `[a, b]` inline lists and `- item` block lists. Enough for agent metadata
 * files without pulling in a YAML dependency.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, raw: "", body: text };
  const yaml = m[1] ?? "";
  const data: Record<string, unknown> = {};
  let currentKey: string | undefined;
  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const listItem = /^\s+-\s*(.+)$/.exec(line);
    if (listItem && currentKey) {
      const arr = Array.isArray(data[currentKey]) ? (data[currentKey] as unknown[]) : [];
      arr.push(unquote(listItem[1] ?? ""));
      data[currentKey] = arr;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    currentKey = kv[1];
    const value = (kv[2] ?? "").trim();
    if (value === "") data[currentKey as string] = [];
    else if (value.startsWith("[") && value.endsWith("]")) {
      data[currentKey as string] = value
        .slice(1, -1)
        .split(",")
        .map((v) => unquote(v.trim()))
        .filter(Boolean);
    } else if (value === "true" || value === "false") data[currentKey as string] = value === "true";
    else data[currentKey as string] = unquote(value);
  }
  return { data, raw: m[0], body: text.slice(m[0].length) };
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export function displayPath(abs: string, cwd: string, home: string): string {
  const rel = relative(cwd, abs);
  if (rel && !rel.startsWith("..") && !rel.startsWith(sep)) return rel.split(sep).join("/");
  if (abs.startsWith(home)) return `~${abs.slice(home.length).split(sep).join("/")}`;
  return abs;
}

export function expandHome(p: string, home = homedir()): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}

/** Substitute `${VAR}` / `$VAR` / `${env:VAR}` from the environment. */
export function expandEnv(s: string, env: NodeJS.ProcessEnv = process.env): string {
  return s
    .replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => env[k] ?? "")
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, k) => env[k] ?? "")
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => env[k] ?? "");
}

export function resolveFrom(base: string, p: string, home = homedir()): string {
  return resolve(base, expandHome(p, home));
}

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
