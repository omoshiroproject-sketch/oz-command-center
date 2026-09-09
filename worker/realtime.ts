import type { OwnerContext } from "../packages/auth/src/owner-context";
import { OZ_TOOL_DEFINITIONS } from "../packages/application/src/tool-contracts";
import { createConsoleMonitor } from "../packages/observability/src/safe-monitoring";
import { buildOpenAiConnectorTools } from "./integrations";
import type { OzDataEnvironment } from "./oz-data";
import { OZ_SYSTEM_INSTRUCTIONS } from "./oz-system-prompt";

export interface OzRealtimeEnvironment extends OzDataEnvironment {
  OPENAI_API_KEY?: string;
  OZ_REALTIME_MODEL?: string;
  OZ_VOICE?: string;
  OZ_TRANSCRIPTION_MODEL?: string;
  OZ_SAFETY_IDENTIFIER_SALT?: string;
}

const monitor = createConsoleMonitor();

export const OZ_REALTIME_REVIEW_TOOLS = [
  {
    type: "function" as const,
    name: "oz_prepare_project_review_batch",
    description: "Prepare, but never execute, a bulk decision for all currently pending PROJECT_CREATE reviews. Use on the first user request so OZ can read back the exact count and names and ask for a second explicit confirmation.",
    parameters: {
      type: "object",
      properties: { decision: { type: "string", enum: ["APPROVED", "REJECTED", "NEEDS_EDIT"] } },
      required: ["decision"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "oz_confirm_project_review_batch",
    description: "Confirm a prepared PROJECT_CREATE review batch. Use only after OZ read back that batch and the owner gave a clear approval in the immediately following user turn. Never guess a confirmation id.",
    parameters: {
      type: "object",
      properties: { confirmationId: { type: "string", minLength: 1, maxLength: 100 } },
      required: ["confirmationId"],
      additionalProperties: false,
    },
  },
] as const;

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function safetyIdentifier(owner: OwnerContext, env: OzRealtimeEnvironment) {
  const salt = env.OZ_SAFETY_IDENTIFIER_SALT?.trim() ?? "";
  if (salt.length < 16) throw new Error("REALTIME_SAFETY_IDENTIFIER_NOT_CONFIGURED");
  const value = `${salt}:${owner.userId}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function realtimeSessionConfiguration(env: OzRealtimeEnvironment) {
  const model = env.OZ_REALTIME_MODEL?.trim() || "gpt-realtime-2.1";
  const voice = env.OZ_VOICE?.trim() || "cedar";
  const transcriptionModel = env.OZ_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe";
  const functionTools = OZ_TOOL_DEFINITIONS.map((tool) => ({
    type: "function",
    name: tool.name,
    description: `${tool.description}${tool.approval === "explicit" ? " Explicit owner approval in the OZ UI is required before calling." : ""}`,
    parameters: tool.inputSchema,
  }));
  return {
    type: "realtime",
    model,
    instructions: OZ_SYSTEM_INSTRUCTIONS,
    output_modalities: ["audio"],
    audio: {
      input: {
        noise_reduction: { type: "far_field" },
        transcription: { model: transcriptionModel, language: "ja" },
        turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
      },
      output: { voice },
    },
    tools: [...functionTools, ...OZ_REALTIME_REVIEW_TOOLS, ...buildOpenAiConnectorTools(env)],
    tool_choice: "auto",
  };
}

export async function createRealtimeClientSecret(request: Request, env: OzRealtimeEnvironment, owner: OwnerContext) {
  if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, { status: 405, headers: { allow: "POST" } });
  if (!env.OPENAI_API_KEY?.trim() || (env.OZ_SAFETY_IDENTIFIER_SALT?.trim() ?? "").length < 16) {
    return json({ error: { code: "OPENAI_NOT_CONFIGURED", message: "LIVE OZはこのlocal/development環境で未設定です。タスク機能は引き続き利用できます。" } }, { status: 503 });
  }
  const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
      "OpenAI-Safety-Identifier": await safetyIdentifier(owner, env),
    },
    body: JSON.stringify({ session: realtimeSessionConfiguration(env) }),
  });
  const payload = await upstream.json().catch(() => null) as { value?: unknown; expires_at?: unknown } | null;
  if (!upstream.ok || typeof payload?.value !== "string" || payload.value.length < 16) {
    await monitor.capture(new Error("Realtime client secret upstream failed"), {
      operation: "realtime.client_secret",
      traceId: crypto.randomUUID(),
      status: upstream.status,
      code: "UPSTREAM_REJECTED",
    });
    return json({ error: { code: "REALTIME_UNAVAILABLE", message: "OpenAI Realtimeへの接続準備に失敗しました。設定と利用状況を確認してください。" } }, { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 });
  }
  return json({
    value: payload.value,
    expiresAt: typeof payload.expires_at === "number" ? payload.expires_at : null,
    model: env.OZ_REALTIME_MODEL?.trim() || "gpt-realtime-2.1",
    voice: env.OZ_VOICE?.trim() || "cedar",
  });
}
