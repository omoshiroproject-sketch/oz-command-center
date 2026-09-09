import assert from "node:assert/strict";
import test from "node:test";
import { safeErrorContext } from "../packages/observability/src/safe-monitoring";

test("monitoring boundary accepts operational metadata only", () => {
  assert.deepEqual(safeErrorContext({ operation: "review.resolve", traceId: "trace", code: "FAILED", status: 500 }),
    { operation: "review.resolve", traceId: "trace", code: "FAILED", status: 500 });
  for (const key of ["taskBody", "email", "oauthToken", "message", "personName", "payload", "secret"]) {
    assert.throws(() => safeErrorContext({ operation: "test", traceId: "trace", [key]: "sensitive" }), /Unsafe/);
  }
});
