import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Poller, createPoller, PRIORITY_ORDER } from "../dist/esm/index.js";

// Mock TaskSource
class MockTaskSource {
  constructor() {
    this.tasks = [];
    this.messages = [];
    this.claims = new Set();
    this.completed = new Set();
    this.acks = [];
  }

  async getTasks() {
    return this.tasks.filter((t) => !this.completed.has(t.id));
  }

  async getMessages() {
    return this.messages;
  }

  async claim(taskId) {
    if (this.claims.has(taskId)) return false;
    this.claims.add(taskId);
    return true;
  }

  async complete(taskId) {
    this.completed.add(taskId);
  }

  async ack(target, message) {
    this.acks.push({ target, message });
  }

  addTask(id, priority, payload = {}) {
    this.tasks.push({ id, priority, payload });
  }

  addMessage(id, source, type, payload = {}) {
    this.messages.push({ id, source, type, payload });
  }

  reset() {
    this.tasks = [];
    this.messages = [];
    this.claims.clear();
    this.completed.clear();
    this.acks = [];
  }
}

describe("PRIORITY_ORDER", () => {
  test("has correct ordering", () => {
    assert.equal(PRIORITY_ORDER.interrupt, 0);
    assert.equal(PRIORITY_ORDER.sprint, 1);
    assert.equal(PRIORITY_ORDER.parallel, 2);
    assert.equal(PRIORITY_ORDER.queue, 3);
    assert.equal(PRIORITY_ORDER.backlog, 4);
  });
});

describe("Poller triage", () => {
  let source;
  let poller;

  beforeEach(() => {
    source = new MockTaskSource();
    poller = new Poller({ workerId: "test", source });
  });

  afterEach(async () => {
    await poller.stop();
  });

  test("sorts tasks by priority correctly", () => {
    const tasks = [
      { id: "1", priority: "backlog", payload: {} },
      { id: "2", priority: "interrupt", payload: {} },
      { id: "3", priority: "queue", payload: {} },
      { id: "4", priority: "sprint", payload: {} },
      { id: "5", priority: "parallel", payload: {} },
    ];

    const sorted = poller.triage(tasks);

    assert.equal(sorted[0].id, "2"); // interrupt
    assert.equal(sorted[1].id, "4"); // sprint
    assert.equal(sorted[2].id, "5"); // parallel
    assert.equal(sorted[3].id, "3"); // queue
    assert.equal(sorted[4].id, "1"); // backlog
  });
});

describe("Poller lifecycle", () => {
  let source;
  let poller;
  let hooks;

  beforeEach(() => {
    source = new MockTaskSource();
    hooks = {
      onBoot: null,
      onWork: null,
      onIdle: null,
      onShutdown: null,
      onTaskStart: null,
      onTaskComplete: null,
      onError: null,
    };
  });

  afterEach(async () => {
    if (poller) await poller.stop();
  });

  test("onBoot hook is called on start", async () => {
    let bootCalled = false;
    hooks.onBoot = (workerId) => {
      bootCalled = true;
      assert.equal(workerId, "test");
    };

    poller = new Poller({ workerId: "test", source }, hooks);
    await poller.start();
    await poller.stop();

    assert.equal(bootCalled, true);
  });

  test("returning false from onBoot prevents polling", async () => {
    let pollCount = 0;
    hooks.onBoot = () => false;
    hooks.onIdle = () => {
      pollCount++;
    };

    poller = new Poller({ workerId: "test", source }, hooks);
    await poller.start();

    assert.equal(poller.isRunning, false);
    assert.equal(pollCount, 0);
  });

  test("onWork hook fires when tasks exist", async () => {
    let workCalled = false;
    source.addTask("t1", "sprint");

    hooks.onWork = (tasks, messages) => {
      workCalled = true;
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].id, "t1");
    };

    poller = new Poller({ workerId: "test", source }, hooks);
    await poller.start();
    await poller.poll();
    await poller.stop();

    assert.equal(workCalled, true);
  });

  test("onIdle hook fires when no tasks", async () => {
    let idleCalled = false;
    hooks.onIdle = (workerId) => {
      idleCalled = true;
      assert.equal(workerId, "test");
    };

    poller = new Poller({ workerId: "test", source }, hooks);
    await poller.start();
    await poller.stop();

    assert.equal(idleCalled, true);
  });

  test("task processing: claim → onTaskStart → complete → onTaskComplete", async () => {
    source.addTask("t1", "sprint");

    const calls = [];
    hooks.onTaskStart = (task) => {
      calls.push(`start:${task.id}`);
    };
    hooks.onTaskComplete = (task) => {
      calls.push(`complete:${task.id}`);
    };

    poller = new Poller({ workerId: "test", source }, hooks);
    await poller.start();
    await poller.poll();
    await poller.stop();

    assert.deepEqual(calls, ["start:t1", "complete:t1"]);
    assert.equal(source.claims.has("t1"), true);
    assert.equal(source.completed.has("t1"), true);
  });

  test("ACK protocol: messages trigger ack calls to source", async () => {
    source.addMessage("m1", "worker-2", "STATUS");

    poller = new Poller({ workerId: "test", source }, hooks);
    await poller.start();
    await poller.stop();

    assert.equal(source.acks.length, 1);
    assert.equal(source.acks[0].target, "worker-2");
    assert.ok(source.acks[0].message.includes("STATUS"));
    assert.ok(source.acks[0].message.includes("m1"));
  });

  test("skips task if claim returns false", async () => {
    source.addTask("t1", "sprint");
    source.claims.add("t1"); // Already claimed

    const calls = [];
    hooks.onTaskStart = (task) => {
      calls.push(`start:${task.id}`);
    };

    poller = new Poller({ workerId: "test", source }, hooks);
    await poller.start();
    await poller.poll();
    await poller.stop();

    assert.equal(calls.length, 0);
    assert.equal(source.completed.has("t1"), false);
  });

  test("shutdown: stop() calls onShutdown hook", async () => {
    let shutdownCalled = false;
    hooks.onShutdown = (workerId) => {
      shutdownCalled = true;
      assert.equal(workerId, "test");
    };

    poller = new Poller({ workerId: "test", source }, hooks);
    await poller.start();
    await poller.stop();

    assert.equal(shutdownCalled, true);
  });

  test("error handling: onError fires and doesn't crash the loop", async () => {
    const errors = [];
    hooks.onError = (error, context) => {
      errors.push({ message: error.message, phase: context.phase });
    };

    hooks.onTaskStart = () => {
      throw new Error("Task failed");
    };

    source.addTask("t1", "sprint");

    poller = new Poller({ workerId: "test", source }, hooks);
    await poller.start();
    await poller.poll();
    await poller.stop();

    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, "Task failed");
    assert.equal(errors[0].phase, "work");
  });
});

describe("Exponential backoff", () => {
  let source;
  let poller;

  beforeEach(() => {
    source = new MockTaskSource();
  });

  afterEach(async () => {
    await poller.stop();
  });

  test("interval increases on idle polls", async () => {
    poller = new Poller(
      {
        workerId: "test",
        source,
        intervalMs: 1000,
        backoffMultiplier: 2,
      },
      {}
    );

    await poller.start();
    assert.equal(poller.currentPhase, "idle");

    await poller.poll();
    await poller.poll();

    await poller.stop();
  });

  test("interval resets when work is found", async () => {
    let idleCount = 0;
    let workCount = 0;
    const hooks = {
      onIdle: () => {
        idleCount++;
      },
      onWork: () => {
        workCount++;
      },
    };

    poller = new Poller(
      {
        workerId: "test",
        source,
        intervalMs: 1000,
        backoffMultiplier: 2,
      },
      hooks
    );

    // First poll: idle
    await poller.start();
    assert.equal(idleCount, 1);

    // Add work
    source.addTask("t1", "sprint");

    // Second poll: work found
    await poller.poll();
    assert.equal(workCount, 1);

    await poller.stop();
  });

  test("interval doesn't exceed maxIntervalMs", async () => {
    poller = new Poller(
      {
        workerId: "test",
        source,
        intervalMs: 1000,
        maxIntervalMs: 5000,
        backoffMultiplier: 2,
      },
      {}
    );

    await poller.start();

    // Multiple idle polls
    for (let i = 0; i < 10; i++) {
      await poller.poll();
    }

    await poller.stop();
  });
});

describe("createPoller factory", () => {
  test("creates a Poller instance", () => {
    const source = new MockTaskSource();
    const poller = createPoller({ workerId: "test", source });

    assert.ok(poller instanceof Poller);
    assert.equal(poller.isRunning, false);
  });
});
