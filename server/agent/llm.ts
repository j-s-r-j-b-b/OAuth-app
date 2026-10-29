/**
 * One OpenAI-compatible client for any provider (Gemini by default). Adds a
 * client-side RPM throttle and retries so free-tier limits degrade gracefully.
 */
import OpenAI from 'openai';
import { env } from '../env.ts';

export const llm = new OpenAI({ apiKey: env.llm.apiKey || 'missing', baseURL: env.llm.baseURL, maxRetries: 0, timeout: 120_000 });

const recent: number[] = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    while (recent.length && now - recent[0] > 60_000) recent.shift();
    if (recent.length < env.llm.rpm) {
      recent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000 - (now - recent[0]) + 250));
  }
}

export type Usage = { calls: number; inputTokens: number; outputTokens: number };

export async function chat(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  usage: Usage,
  onWait?: (msg: string) => void,
): Promise<OpenAI.Chat.ChatCompletion> {
  let attempt = 0;
  for (;;) {
    await throttle();
    try {
      const res = await llm.chat.completions.create(params);
      usage.calls++;
      usage.inputTokens += res.usage?.prompt_tokens ?? 0;
      usage.outputTokens += res.usage?.completion_tokens ?? 0;
      return res;
    } catch (e) {
      const err = e as { status?: number; message?: string; headers?: Record<string, string> };
      const retryable = err.status === 429 || (err.status !== undefined && err.status >= 500) || err.status === undefined;
      if (!retryable || attempt >= 4) throw e;
      const retryAfter = Number(err.headers?.['retry-after']);
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(60_000, 4000 * 2 ** attempt);
      onWait?.(
        err.status === 429
          ? `Model rate limit reached; retrying in ${Math.round(wait / 1000)}s`
          : `Model error (${err.status ?? 'network'}); retrying in ${Math.round(wait / 1000)}s`,
      );
      await new Promise((r) => setTimeout(r, wait));
      attempt++;
    }
  }
}

/** Parse JSON from a model reply that may include code fences or prose around it. */
export function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}
