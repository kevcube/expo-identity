import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function GET() {
  return json({ nonce: randomBytes(32).toString("base64") });
}

export function POST() {
  return GET();
}
