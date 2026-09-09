/** Cloudflare Worker entry point for OZ COMMAND CENTER. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { AuthError, requireOwner, type OwnerAuthEnvironment } from "../packages/auth/src/owner-context";
import { createConsoleMonitor } from "../packages/observability/src/safe-monitoring";
import { getIntegrationStatus } from "./integrations";
import { handleMcpProtectedResource, handleMcpRequest, type OzMcpEnvironment } from "./mcp";
import { handleOzApi } from "./oz-data";
import { createRealtimeClientSecret, type OzRealtimeEnvironment } from "./realtime";

interface Env extends OzMcpEnvironment, OzRealtimeEnvironment, OwnerAuthEnvironment {
  ASSETS: { fetch(input: Request): Promise<Response> };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  SENTRY_DSN?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const monitor = createConsoleMonitor();

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") return handleMcpRequest(request, env);
    if (url.pathname === "/.well-known/oauth-protected-resource") return handleMcpProtectedResource(env);

    if (url.pathname === "/health" || url.pathname === "/session" || url.pathname.startsWith("/api/")) {
      try {
        const owner = await requireOwner(request, env);
        if (url.pathname === "/session") {
          return json({ error: { code: "REALTIME_ENDPOINT_MOVED", message: "Use /api/realtime/client-secret." } }, { status: 410 });
        }
        if (url.pathname === "/api/realtime/client-secret") return createRealtimeClientSecret(request, env, owner);
        if (url.pathname === "/health") {
          return json({
            ok: true,
            liveOzConfigured: Boolean(env.OPENAI_API_KEY && (env.OZ_SAFETY_IDENTIFIER_SALT?.trim().length ?? 0) >= 16),
            realtimeModel: env.OZ_REALTIME_MODEL || "gpt-realtime-2.1",
            realtimeCredential: "short-lived-client-secret",
            integrations: getIntegrationStatus(env),
          });
        }
        if (url.pathname === "/api/integrations/status") return json({ integrations: getIntegrationStatus(env) });
        if (url.pathname.startsWith("/api/oz/")) return handleOzApi(request, env, owner, url.pathname);
        return json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
      } catch (error) {
        if (error instanceof AuthError) return json({ error: { code: "AUTH_REQUIRED", message: error.message } }, { status: error.status });
        await monitor.capture(error, { operation: "request.auth", traceId: crypto.randomUUID(), status: 503, code: "AUTH_BOUNDARY_FAILED" });
        return json({ error: { code: "AUTH_UNAVAILABLE", message: "Authentication service is unavailable." } }, { status: 503 });
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
