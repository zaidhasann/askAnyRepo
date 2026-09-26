import { NextResponse } from "next/server";
import { askAgents } from "@/lib/agents";
import type { RepositorySnapshot } from "@/lib/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { snapshot?: RepositorySnapshot; question?: string; mode?: "question" | "error" };
    if (!body.snapshot || !body.question?.trim()) return NextResponse.json({ error: "A snapshot and question are required." }, { status: 400 });
    return NextResponse.json(await askAgents(body.question.trim(), body.snapshot, body.mode === "error" ? "error" : "question"));
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Ask failed.";
    const message = rawMessage.includes("429") || rawMessage.toLowerCase().includes("rate limit")
      ? "Groq rate limit reached (30 requests/minute on the free tier). Wait before asking again."
      : rawMessage;
    const status = message.includes("GROQ_API_KEY") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}