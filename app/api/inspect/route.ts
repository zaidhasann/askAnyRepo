import { NextResponse } from "next/server";
import { cloneAndInspectRepository, DEFAULT_FILE_CAP } from "@/lib/repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown; fileCap?: unknown };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const fileCap = typeof body.fileCap === "number" ? body.fileCap : DEFAULT_FILE_CAP;

    if (!url) {
      return NextResponse.json({ error: "A GitHub repository URL is required." }, { status: 400 });
    }

    const snapshot = await cloneAndInspectRepository(url, fileCap);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repository inspection failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}