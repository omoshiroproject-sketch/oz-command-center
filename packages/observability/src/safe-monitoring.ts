export type SafeErrorContext = {
  operation: string;
  traceId: string;
  status?: number;
  code?: string;
};

export interface ErrorMonitor {
  capture(error: unknown, context: SafeErrorContext): void | Promise<void>;
}

const allowedKeys = new Set(["operation", "traceId", "status", "code"]);
const sensitiveKey = /token|authorization|email|body|content|message|title|name|payload|secret|key/i;

export function safeErrorContext(value: Record<string, unknown>): SafeErrorContext {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key) || sensitiveKey.test(key)) {
      throw new Error(`Unsafe monitoring context key: ${key}`);
    }
  }
  return {
    operation: String(value.operation ?? "unknown").slice(0, 80),
    traceId: String(value.traceId ?? "missing").slice(0, 80),
    ...(Number.isInteger(value.status) ? { status: Number(value.status) } : {}),
    ...(typeof value.code === "string" ? { code: value.code.slice(0, 80) } : {}),
  };
}

export function createConsoleMonitor(): ErrorMonitor {
  return {
    capture(_error, context) {
      const safe = safeErrorContext(context as unknown as Record<string, unknown>);
      console.error("OZ operation failed", safe);
    },
  };
}
