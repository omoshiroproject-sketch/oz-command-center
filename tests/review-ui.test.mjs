import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "public/oz-network.js"), "utf8");

function element(initialClasses = []) {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Set(initialClasses);
  return {
    attributes, listeners, dataset: {}, disabled: false, hidden: false, innerHTML: "", textContent: "", value: "",
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name, force) {
        if (force === undefined) force = !classes.has(name);
        if (force) classes.add(name); else classes.delete(name);
        return force;
      },
      contains(name) { return classes.has(name); },
    },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    focus() {},
    setCustomValidity() {}, reportValidity() {},
  };
}

function runtime(options = {}) {
  const ids = new Map();
  const documentListeners = new Map();
  const get = (id) => {
    if (!ids.has(id)) ids.set(id, element(id === "reviewBatchDialog" ? ["hidden"] : []));
    return ids.get(id);
  };
  const addButton = element();
  get("quickTaskForm").querySelector = (selector) => selector === "button" ? addButton : null;
  const window = {
    dispatchEvent() {},
    OZ_AUTH: {
      configured: true,
      async waitUntilReady() {},
      async getAccessToken() { return "test-access-token-not-a-real-secret"; },
    },
  };
  if (options.metrics) window.OZ_LATENCY = options.metrics;
  const context = vm.createContext({
    window,
    document: {
      getElementById: get,
      querySelectorAll() { return []; },
      addEventListener(type, listener) {
        const current = documentListeners.get(type) ?? [];
        current.push(listener); documentListeners.set(type, current);
      },
    },
    Headers, Response, crypto, console: { error() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout() { return 0; },
    fetch: async () => { throw new Error("fetch is not configured"); },
  });
  vm.runInContext(source, context);
  return {
    addButton, context, get, window,
    async fire(elementValue, type, event = {}) {
      for (const listener of elementValue.listeners.get(type) ?? []) await listener(event);
    },
    async keydown(key) {
      for (const listener of documentListeners.get("keydown") ?? []) await listener({ key });
    },
  };
}

test("NETWORK opens from the implemented control and Escape closes it", async () => {
  const app = runtime();
  const drawer = app.get("networkDrawer");

  await app.fire(app.get("networkBtn"), "click");
  assert.equal(drawer.classList.contains("open"), true);
  assert.equal(drawer.attributes.get("aria-hidden"), "false");

  await app.keydown("Escape");
  assert.equal(drawer.classList.contains("open"), false);
  assert.equal(drawer.attributes.get("aria-hidden"), "true");
});

test("pending reviews render as confirmation cards with all supported decisions", () => {
  const app = runtime();
  app.window.OZ_NETWORK.renderReviews([
    { id: "review-one", status: "PENDING", source_type: "QUICK_ADD", candidate_data: { title: "<candidate>", importance: 3 } },
    { id: "review-two", status: "APPROVED", source_type: "QUICK_ADD", candidate_data: { title: "already-approved" } },
  ]);
  const markup = app.get("reviewList").innerHTML;
  assert.match(markup, /&lt;candidate&gt;/);
  assert.doesNotMatch(markup, /already-approved/);
  assert.match(markup, /data-review-decision="APPROVED"/);
  assert.match(markup, /data-review-decision="REJECTED"/);
  assert.match(markup, /data-review-decision="NEEDS_EDIT"/);
  assert.equal(app.get("reviewMeta").textContent, "1 確認待ち");
});

test("quick add suppresses a duplicate submit and refreshes context after success", async () => {
  const app = runtime();
  let postCount = 0;
  let contextCount = 0;
  app.context.fetch = async (url, options = {}) => {
    if (url === "/api/oz/tools" && options.method === "POST") {
      postCount += 1;
      await Promise.resolve();
      return Response.json({ result: { requiresApproval: true } });
    }
    if (url === "/api/oz/context") {
      contextCount += 1;
      return Response.json({ projects: [], tasks: [], reviews: [], integrations: [], memories: [] });
    }
    throw new Error("Unexpected request");
  };
  app.get("quickTaskInput").value = "test candidate";
  const submit = app.get("quickTaskForm").listeners.get("submit")[0];
  const event = { preventDefault() {} };
  await Promise.all([submit(event), submit(event)]);

  assert.equal(postCount, 1);
  assert.equal(contextCount, 1);
  assert.equal(app.get("quickTaskInput").value, "");
  assert.match(app.get("quickTaskFeedback").textContent, /確認待ち候補を作成しました/);
  assert.equal(app.addButton.disabled, false);
});

test("runtime initialization guard prevents duplicate form listeners", () => {
  const app = runtime();
  vm.runInContext(source, app.context);
  assert.equal(app.get("quickTaskForm").listeners.get("submit").length, 1);
});

function projectReview(id, name) {
  return { id, version: 1, kind: "PROJECT_CREATE", status: "PENDING", source_type: "MANUAL", candidate_data: { name, status: "PLANNED", importance: 3 } };
}

function resolutionResponse(reviewId, decision, replayed = false) {
  return Response.json({
    result: {
      ok: true,
      code: "REVIEW_RESOLVED",
      data: { outcome: { reviewId, status: decision, replayed } },
    },
  });
}

function contextResponse(reviews, projects = []) {
  return Response.json({ projects, tasks: [], reviews, integrations: [], auditLogs: [] });
}

test("bulk selection targets only visible pending project reviews and can be cleared", () => {
  const app = runtime();
  const pendingProjects = Array.from({length:17}, (_, index) => projectReview(`project-${index + 1}`, `Project ${index + 1}`));
  app.window.OZ_NETWORK.renderReviews([
    ...pendingProjects,
    { ...projectReview("already-done", "Done"), status: "APPROVED" },
    { id: "task-review", kind: "TASK_CREATE", status: "PENDING", candidate_data: { title: "Task" } },
  ]);

  assert.equal(app.window.OZ_NETWORK.selectAllPendingReviews(), 17);
  assert.equal(app.window.OZ_NETWORK.getState().selectedReviewIds.length, 17);
  assert.equal(app.get("reviewSelectionCount").textContent, "17件選択中");
  assert.equal(app.window.OZ_NETWORK.clearReviewSelection(), 0);
  assert.equal(app.get("reviewSelectionCount").textContent, "0件選択中");
  assert.equal(app.window.OZ_NETWORK.toggleReviewSelection("project-2", true), true);
  const partial = app.window.OZ_NETWORK.prepareReviewBatch({decision:"REJECTED", reviewIds:app.window.OZ_NETWORK.getState().selectedReviewIds});
  assert.equal(partial.count, 1);
  assert.deepEqual([...partial.names], ["Project 2"]);
});

for (const count of [1, 16, 100]) {
  test(`NETWORK bulk controls remain visible and synchronized for ${count} pending reviews`, () => {
    const app = runtime();
    const reviews = Array.from({length:count}, (_, index) => projectReview(`layout-${count}-${index + 1}`, `Layout ${index + 1}`));
    app.window.OZ_NETWORK.renderReviews(reviews);
    assert.equal(app.get("reviewBulkToolbar").hidden, false);
    assert.equal(app.get("reviewSelectAllBtn").textContent, `${count}件すべて選択`);
    assert.equal(app.window.OZ_NETWORK.selectAllPendingReviews(), count);
    assert.equal(app.get("reviewSelectionCount").textContent, `${count}件選択中`);
    assert.equal(app.window.OZ_NETWORK.getState().selectedReviewIds.length, count);
    assert.equal(app.window.OZ_NETWORK.clearReviewSelection(), 0);
    assert.equal(app.get("reviewSelectionCount").textContent, "0件選択中");
  });
}

test("NETWORK review list binds keyboard paging to its independent scroll region", () => {
  assert.match(source, /function bindReviewScrollKeyboard\(\)/);
  assert.match(source, /closest\('\.task-review-scroll'\)/);
  assert.match(source, /event\.key === 'PageDown'/);
  assert.match(source, /event\.key === 'PageUp'/);
  assert.match(source, /event\.key === 'Home'/);
  assert.match(source, /event\.key === 'End'/);
});

test("bulk confirmation shows operation, names and impact, while cancel performs no mutation", async () => {
  const app = runtime();
  let writes = 0;
  app.context.fetch = async () => { writes += 1; throw new Error("must not write"); };
  app.window.OZ_NETWORK.renderReviews([projectReview("project-one", "Project One"), projectReview("project-two", "Project Two")]);
  app.window.OZ_NETWORK.selectAllPendingReviews();

  const plan = app.window.OZ_NETWORK.openBatchConfirmation("APPROVED");
  assert.equal(plan.count, 2);
  assert.equal(app.get("reviewBatchDialog").classList.contains("hidden"), false);
  assert.equal(app.get("reviewBatchOperation").textContent, "承認");
  assert.match(app.get("reviewBatchNames").innerHTML, /Project One/);
  assert.match(app.get("reviewBatchImpact").textContent, /正式projectsへ登録/);
  assert.match(app.get("reviewBatchImpact").textContent, /初期タスク候補8件は自動作成されません/);
  assert.equal(app.window.OZ_NETWORK.closeBatchConfirmation(), true);
  assert.equal(writes, 0);
});

for (const [decision, expected] of [["APPROVED", "承認"], ["REJECTED", "却下"], ["NEEDS_EDIT", "要修正"]]) {
  test(`bulk ${decision} uses one existing review-resolution request per candidate after final confirmation`, async () => {
    const app = runtime();
    const requests = [];
    app.context.fetch = async (url, options = {}) => {
      if (String(url).includes("/api/oz/reviews/") && options.method === "POST") {
        const reviewId = String(url).split("/").at(-2);
        requests.push({url:String(url), decision:JSON.parse(options.body).decision, headers:new Headers(options.headers)});
        return resolutionResponse(reviewId, decision);
      }
      if (url === "/api/oz/context") {
        const resolved = [projectReview("project-one", "Project One"), projectReview("project-two", "Project Two")]
          .map((review) => ({...review, status:decision}));
        return contextResponse(resolved, decision === "APPROVED" ? [{name:"formal"}, {name:"formal-2"}] : []);
      }
      throw new Error("Unexpected request");
    };
    app.window.OZ_NETWORK.renderReviews([projectReview("project-one", "Project One"), projectReview("project-two", "Project Two")]);
    app.window.OZ_NETWORK.selectAllPendingReviews();
    app.window.OZ_NETWORK.openBatchConfirmation(decision);
    await app.fire(app.get("reviewBatchConfirmBtn"), "click");

    assert.equal(requests.length, 2);
    assert.ok(requests.every((entry) => /^\/api\/oz\/reviews\/[^/]+\/resolve$/.test(entry.url)));
    assert.ok(requests.every((entry) => entry.decision === decision));
    assert.ok(requests.every((entry) => entry.headers.get("x-oz-explicit-approval") === "true"));
    assert.ok(requests.every((entry) => entry.headers.get("x-oz-tool-source") === "MANUAL"));
    assert.ok(requests.every((entry) => entry.headers.get("authorization") === "Bearer test-access-token-not-a-real-secret"));
    assert.ok(requests.every((entry) => entry.headers.get("idempotency-key").startsWith("review-resolve:")));
    assert.match(app.get("reviewBatchResult").innerHTML, /成功 2件 \/ 失敗 0件/);
    assert.match(app.get("reviewBatchTitle").textContent, new RegExp(expected));
    assert.equal(app.window.OZ_NETWORK.getState().projects.length, decision === "APPROVED" ? 2 : 0);
  });
}

test("bulk execution reports partial failure, keeps only failed selection, and suppresses duplicate execution", async () => {
  const app = runtime();
  let writes = 0;
  const reviews = [projectReview("project-one", "Project One"), projectReview("project-two", "Project Two")];
  app.context.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/oz/reviews/") && options.method === "POST") {
      writes += 1;
      return String(url).endsWith("project-two/resolve")
        ? Response.json({error:{code:"SAFE_TEST_FAILURE", message:"failed"}}, {status:409})
        : resolutionResponse("project-one", "APPROVED");
    }
    if (url === "/api/oz/context") return contextResponse([{...reviews[0], status:"APPROVED"}, reviews[1]], [{name:"formal"}]);
    throw new Error("Unexpected request");
  };
  app.window.OZ_NETWORK.renderReviews(reviews);
  const plan = app.window.OZ_NETWORK.prepareReviewBatch({decision:"APPROVED"});
  const [first, replay] = await Promise.all([
    app.window.OZ_NETWORK.executeReviewBatch(plan),
    app.window.OZ_NETWORK.executeReviewBatch(plan),
  ]);

  assert.equal(writes, 2);
  assert.equal(first.successCount, 1);
  assert.equal(first.failureCount, 1);
  assert.deepEqual(first, replay);
  assert.deepEqual(app.window.OZ_NETWORK.getState().reviews.filter((review) => review.status === "PENDING").map((review) => review.id), ["project-two"]);
});

for (const status of [401, 400, 409, 500]) {
  test(`HTTP ${status} is never counted as a successful review resolution`, async () => {
    const app = runtime();
    const review = projectReview("http-failure", "HTTP Failure");
    let contextReads = 0;
    app.context.fetch = async (url) => {
      if (String(url).includes("/api/oz/reviews/")) return Response.json({error:{code:`HTTP_${status}`}}, {status});
      if (url === "/api/oz/context") { contextReads += 1; return contextResponse([review]); }
      throw new Error("Unexpected request");
    };
    app.window.OZ_NETWORK.renderReviews([review]);
    const result = await app.window.OZ_NETWORK.executeReviewBatch(app.window.OZ_NETWORK.prepareReviewBatch({decision:"APPROVED"}));
    assert.equal(result.successCount, 0);
    assert.equal(result.failureCount, 1);
    assert.equal(result.results[0].ok, false);
    assert.equal(contextReads, 1);
  });
}

test("a fulfilled fetch with HTTP 400 remains a failure", async () => {
  const app = runtime();
  const review = projectReview("fulfilled-http-400", "Fulfilled HTTP 400");
  app.context.fetch = async (url) => String(url).includes("/api/oz/reviews/")
    ? Promise.resolve(Response.json({error:{code:"INVALID_ARGUMENTS"}}, {status:400}))
    : contextResponse([review]);
  app.window.OZ_NETWORK.renderReviews([review]);
  const result = await app.window.OZ_NETWORK.executeReviewBatch(app.window.OZ_NETWORK.prepareReviewBatch({decision:"APPROVED"}));
  assert.equal(result.successCount, 0);
  assert.equal(result.results[0].code, "INVALID_ARGUMENTS");
});

test("HTTP 200 with an invalid response body never becomes success", async () => {
  const app = runtime();
  const review = projectReview("invalid-contract", "Invalid Contract");
  app.context.fetch = async (url) => String(url).includes("/api/oz/reviews/")
    ? Response.json({result:{status:"APPROVED"}})
    : contextResponse([review]);
  app.window.OZ_NETWORK.renderReviews([review]);
  const result = await app.window.OZ_NETWORK.executeReviewBatch(app.window.OZ_NETWORK.prepareReviewBatch({decision:"APPROVED"}));
  assert.equal(result.successCount, 0);
  assert.equal(result.results[0].code, "INVALID_REVIEW_RESOLUTION_RESPONSE");
});

test("all-failure final confirmation shows an error and never a success message", async () => {
  const app = runtime();
  const review = projectReview("all-failure", "All Failure");
  app.context.fetch = async (url) => String(url).includes("/api/oz/reviews/")
    ? Response.json({result:{status:"APPROVED"}})
    : contextResponse([review]);
  app.window.OZ_NETWORK.renderReviews([review]);
  app.window.OZ_NETWORK.selectAllPendingReviews();
  app.window.OZ_NETWORK.openBatchConfirmation("APPROVED");
  await app.fire(app.get("reviewBatchConfirmBtn"), "click");

  assert.match(app.get("reviewBatchResult").innerHTML, /全件失敗 1件/);
  assert.equal(app.get("reviewBatchResult").dataset.tone, "error");
  assert.match(app.get("quickTaskFeedback").textContent, /完了しませんでした/);
  assert.equal(app.get("quickTaskFeedback").dataset.tone, "error");
});

test("single review resolution uses the same verified endpoint and context contract", async () => {
  const app = runtime();
  const review = projectReview("single-review", "Single Review");
  let writes = 0;
  app.context.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/oz/reviews/")) {
      writes += 1;
      assert.equal(options.method, "POST");
      return resolutionResponse(review.id, "APPROVED");
    }
    if (url === "/api/oz/context") return contextResponse([{...review, status:"APPROVED"}], [{name:"formal"}]);
    throw new Error("Unexpected request");
  };
  app.window.OZ_NETWORK.renderReviews([review]);
  const result = await app.window.OZ_NETWORK.executeReviewResolution(review.id, "APPROVED");
  assert.equal(writes, 1);
  assert.equal(result.ok, true);
  assert.equal(result.code, "RESOLVED");
});

test("HTTP success is not confirmed when the refreshed server context remains pending", async () => {
  const app = runtime();
  const review = projectReview("still-pending", "Still Pending");
  app.context.fetch = async (url) => String(url).includes("/api/oz/reviews/")
    ? resolutionResponse(review.id, "APPROVED")
    : contextResponse([review]);
  app.window.OZ_NETWORK.renderReviews([review]);
  const result = await app.window.OZ_NETWORK.executeReviewBatch(app.window.OZ_NETWORK.prepareReviewBatch({decision:"APPROVED"}));
  assert.equal(result.successCount, 0);
  assert.equal(result.results[0].code, "SERVER_STATE_NOT_RESOLVED");
});

test("context refresh failure turns every provisional API success into failure", async () => {
  const app = runtime();
  const reviews = [projectReview("context-one", "Context One"), projectReview("context-two", "Context Two")];
  app.context.fetch = async (url) => {
    if (String(url).includes("/api/oz/reviews/")) {
      const reviewId = String(url).split("/").at(-2);
      return resolutionResponse(reviewId, "APPROVED");
    }
    if (url === "/api/oz/context") return Response.json({error:{code:"CONTEXT_UNAVAILABLE"}}, {status:500});
    throw new Error("Unexpected request");
  };
  app.window.OZ_NETWORK.renderReviews(reviews);
  const result = await app.window.OZ_NETWORK.executeReviewBatch(app.window.OZ_NETWORK.prepareReviewBatch({decision:"APPROVED"}));
  assert.equal(result.successCount, 0);
  assert.equal(result.failureCount, 2);
  assert.ok(result.results.every((item) => item.code === "CONTEXT_VERIFICATION_FAILED"));
  assert.deepEqual(app.window.OZ_NETWORK.getState().reviews.map((review) => review.id), reviews.map((review) => review.id));
});

test("all-success and idempotent replay require matching server context", async () => {
  const app = runtime();
  const reviews = [projectReview("replay-one", "Replay One"), projectReview("replay-two", "Replay Two")];
  app.context.fetch = async (url) => {
    if (String(url).includes("/api/oz/reviews/")) {
      const reviewId = String(url).split("/").at(-2);
      return resolutionResponse(reviewId, "APPROVED", reviewId === "replay-one");
    }
    if (url === "/api/oz/context") return contextResponse(reviews.map((review) => ({...review, status:"APPROVED"})), [{name:"formal-one"}, {name:"formal-two"}]);
    throw new Error("Unexpected request");
  };
  app.window.OZ_NETWORK.renderReviews(reviews);
  const result = await app.window.OZ_NETWORK.executeReviewBatch(app.window.OZ_NETWORK.prepareReviewBatch({decision:"APPROVED"}));
  assert.equal(result.successCount, 2);
  assert.deepEqual(result.results.map((item) => item.code), ["RESOLVED_REPLAY", "RESOLVED"]);
});

test("review resolution idempotency keys remain stable across a page reload", async () => {
  const keys = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const app = runtime();
    app.context.fetch = async (url, options = {}) => {
      if (String(url).includes("/api/oz/reviews/")) {
        keys.push(new Headers(options.headers).get("idempotency-key"));
        return resolutionResponse("stable-review", "APPROVED", attempt === 1);
      }
      if (url === "/api/oz/context") return contextResponse([{...projectReview("stable-review", "Stable Project"), status:"APPROVED"}]);
      throw new Error("Unexpected request");
    };
    app.window.OZ_NETWORK.renderReviews([projectReview("stable-review", "Stable Project")]);
    const plan = app.window.OZ_NETWORK.prepareReviewBatch({decision:"APPROVED"});
    await app.window.OZ_NETWORK.executeReviewBatch(plan);
  }
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

function metricsRecorder() {
  const events = [];
  return {
    events,
    metrics: {
      toolNetworkStarted(sequence) { events.push(["network-start", sequence]); },
      toolNetworkFinished(sequence, outcome) { events.push(["network-finish", sequence, outcome]); },
      contextRefreshStarted(sequence) { events.push(["context-start", sequence]); },
      contextRefreshFinished(sequence, outcome) { events.push(["context-finish", sequence, outcome]); },
    },
  };
}

test("Realtime tool measurement wraps network and context refresh without changing payload contracts", async () => {
  const recorder = metricsRecorder();
  const app = runtime({ metrics: recorder.metrics });
  app.context.fetch = async (url) => {
    if (url === "/api/oz/tools") return Response.json({ result: { ok:true, code:"CANDIDATE_CREATED", data:{} } });
    if (url === "/api/oz/context") return contextResponse([]);
    throw new Error("Unexpected request");
  };

  const result = await app.window.OZ_NETWORK.executeTool("oz_create_task_candidate", { title:"mock only" }, {
    sourceType:"VOICE",
    idempotencyKey:"mock-idempotency",
    measurementSequence:41,
  });
  assert.equal(result.code, "CANDIDATE_CREATED");
  assert.deepEqual(recorder.events, [
    ["network-start", 41],
    ["network-finish", 41, "success"],
    ["context-start", 41],
    ["context-finish", 41, "success"],
  ]);
});

test("context fallback preserves tool behavior while measurement reports the primary refresh failure", async () => {
  const recorder = metricsRecorder();
  const app = runtime({ metrics: recorder.metrics });
  app.context.fetch = async (url) => {
    if (url === "/api/oz/tools") return Response.json({ result: { ok:true, code:"CANDIDATE_CREATED", data:{} } });
    if (url === "/api/oz/context") return Response.json({ error:{code:"CONTEXT_UNAVAILABLE"} }, {status:500});
    if (url === "/api/integrations/status") return Response.json({ integrations:[] });
    throw new Error("Unexpected request");
  };

  const result = await app.window.OZ_NETWORK.executeTool("oz_create_task_candidate", {}, { measurementSequence:43 });
  assert.equal(result.code, "CANDIDATE_CREATED");
  assert.deepEqual(recorder.events, [
    ["network-start", 43],
    ["network-finish", 43, "success"],
    ["context-start", 43],
    ["context-finish", 43, "failed"],
  ]);
});

test("voice batch measurement wraps resolution requests and strict server context verification", async () => {
  const recorder = metricsRecorder();
  const app = runtime({ metrics: recorder.metrics });
  const review = projectReview("measured-review", "Measured Review");
  app.context.fetch = async (url) => {
    if (String(url).includes("/api/oz/reviews/")) return resolutionResponse(review.id, "APPROVED");
    if (url === "/api/oz/context") return contextResponse([{...review, status:"APPROVED"}], [{name:"formal"}]);
    throw new Error("Unexpected request");
  };
  app.window.OZ_NETWORK.renderReviews([review]);
  const plan = app.window.OZ_NETWORK.prepareReviewBatch({ decision:"APPROVED" });
  const result = await app.window.OZ_NETWORK.executeReviewBatch(plan, { sourceType:"VOICE", measurementSequence:42 });

  assert.equal(result.successCount, 1);
  assert.deepEqual(recorder.events, [
    ["network-start", 42],
    ["network-finish", 42, "success"],
    ["context-start", 42],
    ["context-finish", 42, "success"],
  ]);
});
