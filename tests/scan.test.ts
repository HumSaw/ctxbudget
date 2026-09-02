import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scan } from "../src/scan/index.js";
import { dedupeServers, discoverMcpServers } from "../src/scan/mcp-config.js";
import { countTokens, formatTokens } from "../src/tokens.js";
import { parseFrontmatter, stripJsonComments } from "../src/utils.js";

const fixture = resolve(__dirname, "fixtures/basic");
const emptyHome = mkdtempSync(join(tmpdir(), "ctxbudget-home-"));
const ctx = { cwd: fixture, home: emptyHome, includeUser: false };

describe("utils", () => {
  it("parses frontmatter with scalars, inline lists and block lists", () => {
    const fm = parseFrontmatter(
      `---\nname: x\nglobs: ["a/**", 'b/**']\npaths:\n  - src/**\n  - lib/**\nalwaysApply: true\n---\nbody`,
    );
    expect(fm.data).toEqual({
      name: "x",
      globs: ["a/**", "b/**"],
      paths: ["src/**", "lib/**"],
      alwaysApply: true,
    });
    expect(fm.body).toBe("body");
  });

  it("returns empty data when there is no frontmatter", () => {
    expect(parseFrontmatter("# hi").data).toEqual({});
  });

  it("strips JSONC comments and trailing commas", () => {
    const s = `{\n // c\n "a": "http://x", /* b */ "b": [1,],\n}`;
    expect(JSON.parse(stripJsonComments(s))).toEqual({ a: "http://x", b: [1] });
  });
});

describe("tokens", () => {
  it("counts and formats", () => {
    expect(countTokens("")).toBe(0);
    expect(countTokens("hello world")).toBeGreaterThan(0);
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(20_000)).toBe("20k");
  });
});

describe("mcp config", () => {
  it("discovers servers from .mcp.json and codex toml and dedupes them", () => {
    const servers = discoverMcpServers(ctx);
    expect(servers.map((s) => `${s.name}:${s.agents.join("+")}`).sort()).toEqual([
      "broken:claude",
      "everything:claude",
      "everything:codex",
    ]);
    const deduped = dedupeServers(servers);
    const everything = deduped.find((s) => s.name === "everything");
    expect(everything?.agents.sort()).toEqual(["claude", "codex"]);
    expect(deduped).toHaveLength(2);
  });
});

describe("scan (no MCP)", () => {
  it("attributes files to the right agents and loading modes", async () => {
    const report = await scan({ cwd: fixture, homeDir: emptyHome, includeUser: false, mcp: false });
    const byPath = new Map(report.items.map((i) => [i.path, i]));

    const claudeMd = byPath.get("CLAUDE.md");
    expect(claudeMd?.children?.map((c) => c.path)).toEqual([
      "docs/architecture.md",
      "docs/missing.md",
    ]);
    expect(claudeMd?.children?.[1]?.error).toBeDefined();

    expect(byPath.get(".cursor/rules/style.mdc")?.loading).toBe("always");
    expect(byPath.get(".cursor/rules/react.mdc")?.loading).toBe("conditional");
    expect(byPath.get(".claude/rules/api.md")?.loading).toBe("conditional");
    expect(byPath.get(".github/instructions/ts.instructions.md")?.loading).toBe("conditional");
    expect(byPath.get(".claude/commands/fix-tests.md")?.loading).toBe("on-demand");

    const skill = byPath.get(".claude/skills/deploy/SKILL.md");
    expect(skill?.tokens).toBeLessThan(skill?.fullTokens ?? 0);

    const claude = report.agents.find((a) => a.agent === "claude");
    const cursor = report.agents.find((a) => a.agent === "cursor");
    // CLAUDE.md + import + skill/subagent listings, but not the conditional rule.
    expect(claude?.always).toBeGreaterThan(1000);
    expect(claude?.conditional).toBe(byPath.get(".claude/rules/api.md")?.tokens);
    expect(cursor?.always).toBeGreaterThan(1000);

    expect(report.suggestions.some((s) => s.message.includes("docs/missing.md"))).toBe(true);
    expect(report.mcp).toEqual({ measured: false, servers: 2, failed: 0 });
  });

  it("restricts to a single agent", async () => {
    const report = await scan({
      cwd: fixture,
      homeDir: emptyHome,
      includeUser: false,
      mcp: false,
      agents: ["copilot"],
    });
    expect(report.agents).toHaveLength(1);
    expect(report.items.every((i) => i.agents.every((a) => a === "copilot"))).toBe(true);
  });

  it("reports nothing for an empty directory", async () => {
    const empty = mkdtempSync(join(tmpdir(), "ctxbudget-empty-"));
    const report = await scan({ cwd: empty, homeDir: emptyHome, includeUser: false, mcp: false });
    expect(report.items).toHaveLength(0);
    expect(report.agents.every((a) => a.always === 0)).toBe(true);
  });
});
