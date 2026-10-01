import { NextResponse } from "next/server";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    totalBytes: os.totalmem(),
    freeBytes: os.freemem(),
  });
}
