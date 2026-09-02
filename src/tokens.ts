import { countTokens as countO200k } from "gpt-tokenizer/encoding/o200k_base";

/**
 * Token counting.
 *
 * We use the `o200k_base` BPE (GPT-4o / GPT-4.1 / o-series). Anthropic and Google do
 * not publish their tokenizers; on English prose + Markdown + JSON the numbers land
 * within roughly ±10% of Claude's, which is more than enough for budgeting decisions.
 * `ctxbudget` reports the tokenizer name so nobody mistakes an estimate for a bill.
 */
export const TOKENIZER_NAME = "o200k_base";

export function countTokens(text: string): number {
  if (text.length === 0) return 0;
  return countO200k(text);
}

/**
 * Estimate the tokens a tool definition costs once serialized into the model's
 * tool block. Different hosts serialize differently (JSON, XML-ish, TypeScript
 * signatures), so we measure the compact JSON of `{name, description, inputSchema}`
 * which is close to what most hosts send.
 */
export function countToolTokens(tool: {
  name: string;
  description?: string | undefined;
  inputSchema?: unknown;
}): number {
  const payload = JSON.stringify({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: tool.inputSchema ?? {},
  });
  return countTokens(payload);
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

export function percent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const p = (part / whole) * 100;
  if (p < 0.1 && part > 0) return "<0.1%";
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}
