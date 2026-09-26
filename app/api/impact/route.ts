import { NextResponse } from "next/server";
import { assessImpact, type ImpactInput } from "@/lib/impact";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<ImpactInput>;
    if (typeof body.targetPath !== "string" || typeof body.diff !== "string" || !Array.isArray(body.importers) || !body.importers.every((path) => typeof path === "string")) {
      return NextResponse.json({ error: "targetPath, diff, and importers are required." }, { status: 400 });
    }
    return NextResponse.json(assessImpact({ targetPath: body.targetPath, diff: body.diff, importers: body.importers }));
  } catch {
    return NextResponse.json({ error: "Invalid impact analysis request." }, { status: 400 });
  }
}