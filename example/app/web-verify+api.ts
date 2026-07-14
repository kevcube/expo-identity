import type { NextFetchEvent, NextRequest } from "next/server";

export const runtime = "edge";

export default async function handler(req: NextRequest, _event: NextFetchEvent) {
  try {
    const payload = await req.json();
    console.log("Received credential response", payload);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to parse credential payload", error);
    return new Response("Invalid payload", { status: 400 });
  }
}
