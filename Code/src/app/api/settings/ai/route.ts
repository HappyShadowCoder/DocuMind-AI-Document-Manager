import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyJwt(token);
    if (!payload?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    return NextResponse.json({
      provider: "ollama",
      isOfflineOnly: true,
      model: process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b",
      embeddingModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
      baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    });
  } catch (error: any) {
    console.error("GET /api/settings/ai error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load AI settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await verifyJwt(token);
    if (!payload?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      provider: "ollama",
      isOfflineOnly: true,
      message: "DocuMind is configured for 100% offline local AI (Ollama).",
    });
  } catch (error: any) {
    console.error("POST /api/settings/ai error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update AI settings" },
      { status: 500 }
    );
  }
}
