import { z } from "zod";
import { AuthError, requireOwner, type OwnerAuthEnvironment, type OwnerContext } from "../packages/auth/src/owner-context";
import { OZ_TOOL_DEFINITIONS } from "../packages/application/src/tool-contracts";
import { executeOzTool, type OzDataEnvironment } from "./oz-data";

export interface OzMcpEnvironment extends OwnerAuthEnvironment, OzDataEnvironment {
  OZ_MCP_LOCAL_INSPECTOR_TOKEN?: string;
  OZ_MCP_LOCAL_OWNER_ID?: string;
  OZ_MCP_RESOURCE_URL?: string;
  OZ_MCP_AUTHORIZATION_SERVER?: string;
}

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function jsonRpc(id: JsonRpcId, value: Record<string, unknown>, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, ...value }, {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
  });
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: Record<string, unknown>) {
  return jsonRpc(id, { error: { code, message, ...(data ? { data } : {}) } });
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(bytes);
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function localInspectorOwner(request: Request, env: OzMcpEnvironment): Promise<OwnerContext | null> {
  const url = new URL(request.url);
  if (!localHosts.has(url.hostname)) return null;
  const configuredToken = env.OZ_MCP_LOCAL_INSPECTOR_TOKEN?.trim() ?? "";
  const presentedToken = request.headers.get("x-oz-local-token")?.trim() ?? "";
  const ownerId = env.OZ_MCP_LOCAL_OWNER_ID?.trim() ?? "";
  if (!configuredToken || !presentedToken || !z.uuid().safeParse(ownerId).success) return null;
  if (!equalBytes(await digest(configuredToken), await digest(presentedToken))) return null;
  return { userId: ownerId, email: "", accessToken: "" };
}

async function requireMcpOwner(request: Request, env: OzMcpEnvironment) {
  const url = new URL(request.url);
  if (!localHosts.has(url.hostname)) throw new AuthError("Production MCP authorization is not implemented.", 503);
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).hostname; } catch { throw new AuthError("Invalid MCP origin.", 403); }
    if (!localHosts.has(originHost)) throw new AuthError("Invalid MCP origin.", 403);
  }
  const local = await localInspectorOwner(request, env);
  if (local) return local;
  return requireOwner(request, env);
}

function authenticationFailure(env: OzMcpEnvironment, status: number) {
  const headers = new Headers({ "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
  if (env.OZ_MCP_RESOURCE_URL?.startsWith("https://")) {
    headers.set("www-authenticate", `Bearer resource_metadata="${env.OZ_MCP_RESOURCE_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource"`);
  }
  return new Response(JSON.stringify({ error: { code: "MCP_AUTH_REQUIRED", message: "MCP authentication is required." } }), { status, headers });
}

export function handleMcpProtectedResource(env: OzMcpEnvironment) {
  const resource = env.OZ_MCP_RESOURCE_URL?.trim().replace(/\/$/, "");
  const authorizationServer = env.OZ_MCP_AUTHORIZATION_SERVER?.trim().replace(/\/$/, "");
  if (!resource || !authorizationServer || !resource.startsWith("https://") || !authorizationServer.startsWith("https://")) {
    return Response.json({ error: { code: "MCP_PRODUCTION_AUTH_NOT_CONFIGURED", message: "Production MCP authorization is not configured." } }, { status: 503 });
  }
  return Response.json({ error: { code: "MCP_PRODUCTION_AUTH_NOT_IMPLEMENTED", message: "Production MCP OAuth validation is not implemented." } }, { status: 503, headers: { "cache-control": "no-store" } });
}

export async function handleMcpRequest(request: Request, env: OzMcpEnvironment) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS", "cache-control": "no-store" } });
  }
  if (request.method !== "POST") {
    return Response.json({ error: { code: "MCP_METHOD_NOT_ALLOWED", message: "Use Streamable HTTP POST." } }, { status: 405, headers: { allow: "POST, OPTIONS" } });
  }
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return Response.json({ error: { code: "MCP_ACCEPT_REQUIRED", message: "Accept must include application/json and text/event-stream." } }, { status: 406 });
  }
  if (!contentType.includes("application/json")) {
    return Response.json({ error: { code: "MCP_CONTENT_TYPE_REQUIRED", message: "Content-Type must be application/json." } }, { status: 415 });
  }

  let owner: OwnerContext;
  try {
    owner = await requireMcpOwner(request, env);
  } catch (error) {
    return authenticationFailure(env, error instanceof AuthError ? error.status : 401);
  }

  let message: JsonRpcRequest;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_JSONRPC");
    message = body as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  const id = typeof message.id === "string" || typeof message.id === "number" ? message.id : null;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return rpcError(id, -32600, "Invalid Request");

  if (message.method === "notifications/initialized") return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
  if (message.method === "initialize") {
    return jsonRpc(id, { result: {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "oz-command-center", title: "OZ COMMAND CENTER", version: "1.1.0-local" },
      instructions: "Owner-only OZ data. Candidate tools never create formal records until review approval.",
    } });
  }
  if (message.method === "ping") return jsonRpc(id, { result: {} });
  if (message.method === "tools/list") {
    return jsonRpc(id, { result: { tools: OZ_TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
      _meta: { "oz/approval": tool.approval },
    })) } });
  }
  if (message.method === "tools/call") {
    const params = message.params as { name?: unknown; arguments?: unknown; _meta?: Record<string, unknown> } | undefined;
    const name = typeof params?.name === "string" ? params.name : "";
    const definition = OZ_TOOL_DEFINITIONS.find((tool) => tool.name === name);
    if (!definition) return rpcError(id, -32602, "Unknown tool", { code: "TOOL_NOT_FOUND" });
    const headers = new Headers(request.headers);
    if (!headers.has("idempotency-key")) headers.set("idempotency-key", `mcp:${String(id)}:${name}:phase1b`);
    headers.set("x-oz-tool-source", "CONNECTOR");
    if (definition.approval === "explicit" && params?._meta?.["oz/explicitApproval"] === true) headers.set("x-oz-explicit-approval", "true");
    const toolRequest = new Request(request.url, { method: "POST", headers });
    try {
      const output = await executeOzTool(toolRequest, env, owner, name, (params?.arguments ?? {}) as Record<string, unknown>);
      return jsonRpc(id, { result: {
        content: [{ type: "text", text: `${output.code}.` }],
        structuredContent: output,
        isError: false,
      } });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "TOOL_EXECUTION_FAILED";
      return jsonRpc(id, { result: {
        content: [{ type: "text", text: "The OZ tool could not be completed." }],
        structuredContent: { ok: false, code, data: {} },
        isError: true,
      } });
    }
  }
  return rpcError(id, -32601, "Method not found");
}
