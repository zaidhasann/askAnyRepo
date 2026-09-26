import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json() as { diff?: unknown };
  console.info("[approval stub] would apply diff:", body.diff);
  return NextResponse.json({ applied: true });
}