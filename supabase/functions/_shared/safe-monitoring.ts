export type EdgeSafeContext = { operation: string; traceId: string; code: string; status?: number };

export function captureSafeException(_error: unknown, context: EdgeSafeContext) {
  // Sentry can be attached here in each request scope. Do not add payloads,
  // task/message bodies, email addresses, names, or OAuth/authorization data.
  console.error("OZ Edge operation failed", {
    operation: context.operation.slice(0, 80),
    traceId: context.traceId.slice(0, 80),
    code: context.code.slice(0, 80),
    ...(Number.isInteger(context.status) ? { status: context.status } : {}),
    sentryConfigured: Boolean(Deno.env.get("SENTRY_DSN")),
  });
}
