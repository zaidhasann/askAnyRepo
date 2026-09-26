import Groq from "groq-sdk";
import type { RepositorySnapshot } from "@/lib/repository";

const MODEL = "openai/gpt-oss-120b";
const STEP_CAP = 24;
const TIMEOUT_MS = 90_000;

export type TraceRecord = {
  agent: "Planner" | "Executor" | "Critic";
  input: string;
  output: string;
  tool_calls: string[];
  latency_ms: number;
};

type Citation = { path: string; line: number };
type PartialAnswer = { question: string; answer: string; citation?: Citation; reason?: string; diff?: string; confidence: "high" | "low" };
type AskResult = { answer: string; citations: string[]; locations: { citation: string; reason?: string; question: string }[]; confidence: "high" | "low" | "refused"; refused: string[]; trace: TraceRecord[]; consistency: string; suggestedDiff?: string; stopped?: "budget_exceeded" };

class Budget {
  steps = 0;
  stopped = false;
  readonly deadline = Date.now() + TIMEOUT_MS;

  consume() {
    if (this.stopped || this.steps >= STEP_CAP || Date.now() >= this.deadline) {
      this.stopped = true;
      throw new Error("budget_exceeded");
    }
    this.steps += 1;
  }
}

function getClients() {
  const keys = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_FALLBACK].filter((key): key is string => Boolean(key));
  if (!keys.length) throw new Error("GROQ_API_KEY or GROQ_API_KEY_FALLBACK is required to ask questions.");
  return [...new Set(keys)].map((apiKey) => new Groq({ apiKey }));
}

function isRateLimited(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? error.status : undefined;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return status === 429 || message.includes("rate limit") || message.includes("rate_limit") || message.includes("exhausted");
}

async function askModel(prompt: string, budget: Budget) {
  const clients = getClients();
  for (let index = 0; index < clients.length; index += 1) {
    budget.consume();
    const remaining = Math.max(1, budget.deadline - Date.now());
    try {
      const response = await Promise.race([
        clients[index].chat.completions.create({ model: MODEL, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("budget_exceeded")), remaining)),
      ]);
      return response.choices[0]?.message?.content?.trim() ?? "";
    } catch (error) {
      if (!isRateLimited(error) || index === clients.length - 1) throw error;
    }
  }
  throw new Error("No Groq client available.");
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) as T : fallback;
  } catch { return fallback; }
}

function candidates(snapshot: RepositorySnapshot, question: string, budget: Budget) {
  const terms = question.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  const ranked = snapshot.files.map((file) => ({
    file,
    score: terms.reduce((score, term) => {
      const pathMatch = file.path.toLowerCase().includes(term);
      const contentMatch = (file.content ?? "").toLowerCase().includes(term);
      return score + (pathMatch ? 3 : 0) + (contentMatch ? 1 : 0);
    }, 0),
  })).sort((a, b) => b.score - a.score);
  const selected = ranked.filter(({ score }) => score > 0).slice(0, 1).map(({ file }) => file);
  for (let index = 0; index < selected.length; index += 1) {
    budget.consume();
  }
  return selected;
}

function inspectCitation(answer: PartialAnswer, snapshot: RepositorySnapshot) {
  if (!answer.citation) return false;
  const file = snapshot.files.find((candidate) => candidate.path === answer.citation?.path);
  if (!file || answer.citation.line < 1) return false;
  return answer.citation.line <= (file.content ?? "").split("\n").length;
}

function trace(agent: TraceRecord["agent"], input: string, output: string, tool_calls: string[], started: number): TraceRecord {
  return { agent, input, output, tool_calls, latency_ms: Date.now() - started };
}

async function planner(question: string, mode: "question" | "error", budget: Budget, traceLog: TraceRecord[]) {
  const started = Date.now();
  const instruction = mode === "error"
    ? "identify likely file(s)/function(s) responsible for this error, and what specifically to check in each"
    : "break this question into at most 3 focused sub-questions";
  const prompt = `You are Planner. ${instruction}. Return ONLY JSON in the form {"questions":["..."]}. Input: ${question}`;
  const output = await askModel(prompt, budget);
  traceLog.push(trace("Planner", question, output, ["groq.chat.completions.create"], started));
  const parsed = parseJson<{ questions?: string[] }>(output, { questions: [] });
  return (parsed.questions ?? []).filter(Boolean).slice(0, 3).length
    ? (parsed.questions ?? []).filter(Boolean).slice(0, 3)
    : [question];
}

async function executor(question: string, snapshot: RepositorySnapshot, budget: Budget, traceLog: TraceRecord[]): Promise<PartialAnswer> {
  const started = Date.now();
  const files = candidates(snapshot, question, budget);
  const context = files.map((file) => `FILE: ${file.path}\n${file.content ?? ""}`).join("\n\n");
  const prompt = `You are Executor. Answer the sub-question using only the files below. Return ONLY JSON: {"answer":"...","reason":"one sentence explaining why this file/line is likely responsible","citation":{"path":"exact/path","line":number},"diff":"optional unified diff or empty string"}. The citation must be an exact path and line from the supplied files. If the files do not contain evidence, return an answer saying it could not be verified and set citation to null; never invent a file or line. Sub-question: ${question}\n\n${context}`;
  const output = await askModel(prompt, budget);
  traceLog.push(trace("Executor", question, output, ["snapshot.file_content", "groq.chat.completions.create"], started));
  const parsed = parseJson<{ answer?: string; reason?: string; citation?: Citation; diff?: string }>(output, {});
  return { question, answer: parsed.answer ?? output, reason: parsed.reason, citation: parsed.citation, diff: parsed.diff, confidence: "low" };
}

async function runPipeline(question: string, mode: "question" | "error", snapshot: RepositorySnapshot, budget: Budget, traceLog: TraceRecord[]): Promise<PartialAnswer[]> {
  const subQuestions = await planner(question, mode, budget, traceLog);
  const results: PartialAnswer[] = [];
  for (const subQuestion of subQuestions) {
    let result: PartialAnswer;
    try { result = await executor(subQuestion, snapshot, budget, traceLog); } catch (error) {
      if (error instanceof Error && error.message === "budget_exceeded") return results;
      result = { question: subQuestion, answer: "The Executor could not complete this part.", confidence: "low" };
    }
    const criticStarted = Date.now();
    let valid = inspectCitation(result, snapshot);
    traceLog.push(trace("Critic", subQuestion, JSON.stringify({ valid, retry: !valid }), ["citation.line_count"], criticStarted));
    if (!valid) {
      try { result = await executor(subQuestion, snapshot, budget, traceLog); } catch (error) {
        if (error instanceof Error && error.message === "budget_exceeded") return results;
      }
      const retryStarted = Date.now();
      valid = inspectCitation(result, snapshot);
      traceLog.push(trace("Critic", subQuestion, JSON.stringify({ valid, retry: true }), ["citation.line_count"], retryStarted));
    }
    result.confidence = valid ? "high" : "low";
    results.push(result);
  }
  return results;
}

export async function askAgents(question: string, snapshot: RepositorySnapshot, mode: "question" | "error" = "question"): Promise<AskResult> {
  const budget = new Budget();
  const traceLog: TraceRecord[] = [];
  const runs: PartialAnswer[][] = [];
  try {
    for (let run = 0; run < 3; run += 1) runs.push(await runPipeline(question, mode, snapshot, budget, traceLog));
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "budget_exceeded") throw error;
  }
  const complete = runs.flat();
  const citations = [...new Set(complete.flatMap((item) => item.citation ? [`${item.citation.path}:${item.citation.line}`] : []))];
  const locations = complete.flatMap((item) => item.citation ? [{ citation: `${item.citation.path}:${item.citation.line}`, reason: item.reason, question: item.question }] : []);
  const refused = [...new Set(complete.filter((item) => item.confidence === "low").map((item) => `I could not verify a confident answer for: ${item.question}`))];
  const answer = complete.map((item) => `${item.answer}${item.confidence === "low" ? ` I could not verify a confident answer to this part: ${item.question}.` : ""}`).join("\n\n") || "No sub-answers completed before the request budget was exhausted.";
  const citationSets = runs.map((run) => new Set(run.flatMap((item) => item.citation ? [`${item.citation.path}:${item.citation.line}`] : [])));
  const first = citationSets[0];
  const agreed = first ? citationSets.filter((set) => set.size === first.size && [...first].every((citation) => set.has(citation))).length : 0;
  const suggestedDiff = complete.find((item) => item.diff)?.diff;
  return { answer, citations, locations, confidence: refused.length ? "low" : complete.length ? "high" : "refused", refused, trace: traceLog, consistency: `${agreed}/3`, ...(budget.stopped || runs.length < 3 ? { stopped: "budget_exceeded" as const } : {}), ...(suggestedDiff ? { suggestedDiff } : {}) };
}