import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        aiProvider: true,
        openAiApiKey: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const envKeyConfigured = Boolean(process.env.OPENAI_API_KEY);
    const hasApiKey = Boolean(user.openAiApiKey || envKeyConfigured);

    return NextResponse.json({
      provider: user.aiProvider || "ollama",
      apiKey: user.openAiApiKey || "",
      hasApiKey,
      envKeyConfigured,
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

    const body = await request.json().catch(() => ({}));
    const { action, provider, apiKey } = body;

    // Test API key with OpenAI without saving
    if (action === "test") {
      const keyToTest = (typeof apiKey === "string" ? apiKey.trim() : "") || process.env.OPENAI_API_KEY;

      if (!keyToTest) {
        return NextResponse.json(
          { valid: false, error: "Please enter an OpenAI API key to test." },
          { status: 400 }
        );
      }

      try {
        const testRes = await fetch("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${keyToTest}`,
          },
        });

        if (testRes.ok) {
          return NextResponse.json({
            valid: true,
            message: "Successfully connected to OpenAI! Your API key is valid.",
          });
        }

        const errData = await testRes.json().catch(() => null);
        const errMsg =
          errData?.error?.message ||
          `OpenAI rejected key (HTTP ${testRes.status}: ${testRes.statusText})`;

        return NextResponse.json({ valid: false, error: errMsg }, { status: 400 });
      } catch (networkErr: any) {
        return NextResponse.json(
          {
            valid: false,
            error: `Network error connecting to OpenAI: ${networkErr?.message || "Connection failed"}`,
          },
          { status: 500 }
        );
      }
    }

    // Normal save operation
    if (provider !== "ollama" && provider !== "openai") {
      return NextResponse.json(
        { error: "Invalid provider. Must be 'ollama' or 'openai'." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { openAiApiKey: true },
    });

    const newKey = typeof apiKey === "string" ? apiKey.trim() : undefined;
    const finalKey = newKey !== undefined ? (newKey || null) : existingUser?.openAiApiKey;

    // If switching to OpenAI, verify an API key exists either in payload, DB, or env
    if (provider === "openai" && !finalKey && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "An OpenAI API key is required when selecting OpenAI mode. Please enter your key.",
        },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: payload.id },
      data: {
        aiProvider: provider,
        ...(newKey !== undefined ? { openAiApiKey: newKey || null } : {}),
      },
      select: {
        id: true,
        aiProvider: true,
        openAiApiKey: true,
      },
    });

    return NextResponse.json({
      success: true,
      provider: updatedUser.aiProvider,
      hasApiKey: Boolean(updatedUser.openAiApiKey || process.env.OPENAI_API_KEY),
      message: `AI provider updated to ${updatedUser.aiProvider === "openai" ? "OpenAI" : "Ollama"}.`,
    });
  } catch (error: any) {
    console.error("POST /api/settings/ai error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update AI settings" },
      { status: 500 }
    );
  }
}
