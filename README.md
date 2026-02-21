# @rezzed.ai/poll-hooks

[![npm version](https://img.shields.io/npm/v/@rezzed.ai/poll-hooks.svg)](https://www.npmjs.com/package/@rezzed.ai/poll-hooks)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Async work-polling with claim semantics, priority triage, and lifecycle hooks.

## Features

- **Priority-based triage**: Tasks are automatically sorted by priority (interrupt → sprint → parallel → queue → backlog)
- **Claim semantics**: Prevents multiple workers from processing the same task
- **Lifecycle hooks**: Full control over boot, work, idle, and shutdown phases
- **Exponential backoff**: Automatically reduces polling frequency when idle
- **Message acknowledgement protocol**: Every received message is acknowledged
- **Pluggable task source**: Bring your own database, API, or message queue
- **Zero dependencies**: Lightweight and production-ready
- **TypeScript**: Full type definitions included

## Installation

```bash
npm install @rezzed.ai/poll-hooks
```

## Quick Start

```typescript
import { createPoller, type TaskSource, type Task, type Message } from "@rezzed.ai/poll-hooks";

// Implement your task source (database, API, message queue, etc.)
class MyTaskSource implements TaskSource {
  async getTasks() {
    // Fetch tasks from your database/API
    return [
      { id: "task-1", priority: "sprint", payload: { action: "deploy" } },
    ];
  }

  async getMessages() {
    // Fetch messages/notifications
    return [];
  }

  async claim(taskId: string) {
    // Mark task as claimed in your database
    return true;
  }

  async complete(taskId: string, result?: unknown) {
    // Mark task as complete
  }

  async ack(target: string, message: string) {
    // Send acknowledgement back to sender
  }
}

// Create and start the poller
const poller = createPoller(
  {
    workerId: "worker-1",
    source: new MyTaskSource(),
    intervalMs: 5000,
    maxIntervalMs: 60000,
    backoffMultiplier: 1.5,
  },
  {
    onBoot: (workerId) => {
      console.log(`${workerId} booting...`);
    },
    onWork: (tasks, messages) => {
      console.log(`Found ${tasks.length} tasks, ${messages.length} messages`);
    },
    onIdle: (workerId) => {
      console.log(`${workerId} idle, backing off...`);
    },
    onTaskStart: (task) => {
      console.log(`Starting task ${task.id}`);
      // Do the actual work here
    },
    onTaskComplete: (task) => {
      console.log(`Completed task ${task.id}`);
    },
    onShutdown: (workerId) => {
      console.log(`${workerId} shutting down`);
    },
    onError: (error, context) => {
      console.error(`Error in ${context.phase}:`, error);
    },
  }
);

// Start polling
await poller.start();

// Later, gracefully shut down
await poller.stop();
```

## Priority Levels

Tasks are automatically triaged by priority:

| Priority | Order | Use Case |
|----------|-------|----------|
| `interrupt` | 0 (highest) | Critical alerts, emergency shutdowns |
| `sprint` | 1 | Current sprint work, active commitments |
| `parallel` | 2 | Background tasks that can run concurrently |
| `queue` | 3 | Standard queue items |
| `backlog` | 4 (lowest) | Future work, nice-to-haves |

## Lifecycle Phases

The poller moves through four phases:

```
boot → work → idle → shutdown
        ↑      ↓
        └──────┘
```

### Boot

Called once on startup, before the first poll. Return `false` to abort:

```typescript
onBoot: (workerId) => {
  // Check prerequisites, connect to services, etc.
  if (!prerequisitesMet()) return false;
}
```

### Work

Triggered when tasks or messages are found:

```typescript
onWork: (tasks, messages) => {
  // Tasks are already sorted by priority
  console.log(`Processing ${tasks.length} tasks`);
}
```

### Idle

Activated when no work is available. The poller automatically applies exponential backoff:

```typescript
onIdle: (workerId) => {
  // Reduced polling frequency
  console.log("Waiting for work...");
}
```

### Shutdown

Called when `stop()` is invoked:

```typescript
onShutdown: (workerId) => {
  // Clean up resources, persist state, etc.
}
```

## ACK Protocol

All received messages trigger an acknowledgement back to the sender:

```typescript
// When a message is received:
const message = { id: "msg-1", source: "worker-2", type: "STATUS", payload: {} };

// The poller automatically calls:
await source.ack("worker-2", "Received STATUS: msg-1");
```

Implement `TaskSource.ack()` to route acknowledgements back to the sender through your messaging system.

## Exponential Backoff

When idle, the polling interval increases exponentially:

```typescript
const poller = createPoller({
  workerId: "worker-1",
  source: mySource,
  intervalMs: 5000,        // Start at 5 seconds
  maxIntervalMs: 60000,    // Cap at 60 seconds
  backoffMultiplier: 1.5,  // Multiply by 1.5 each idle cycle
});

// Idle progression: 5s → 7.5s → 11.25s → ... → 60s (capped)
// When work is found, interval resets to 5s
```

## API Reference

### `createPoller(options, hooks?)`

Factory function to create a new `Poller` instance.

**Parameters:**

- `options: PollHooksOptions<T>` — Configuration
  - `workerId: string` — Unique worker identity
  - `source: TaskSource<T>` — Task source implementation
  - `intervalMs?: number` — Base polling interval (default: 5000)
  - `maxIntervalMs?: number` — Maximum backoff interval (default: 60000)
  - `backoffMultiplier?: number` — Backoff multiplier (default: 1.5)
- `hooks?: LifecycleHooks<T>` — Lifecycle hook handlers

**Returns:** `Poller<T>`

### `Poller<T>`

The polling engine.

#### Methods

- `async start(): Promise<void>` — Start the polling loop
- `async stop(): Promise<void>` — Stop the polling loop and run shutdown hooks
- `async poll(): Promise<{ tasks: Task<T>[]; messages: Message[] }>` — Execute a single poll cycle (public for testing)
- `triage(tasks: Task<T>[]): Task<T>[]` — Sort tasks by priority

#### Properties

- `currentPhase: LifecyclePhase` — Current lifecycle phase (boot | work | idle | shutdown)
- `isRunning: boolean` — Whether the poller is currently running

### `TaskSource<T>`

Interface to implement for your task storage backend.

```typescript
interface TaskSource<T = unknown> {
  getTasks(): Promise<Task<T>[]>;
  getMessages(): Promise<Message[]>;
  claim(taskId: string): Promise<boolean>;
  complete(taskId: string, result?: unknown): Promise<void>;
  ack(target: string, message: string): Promise<void>;
}
```

### `LifecycleHooks<T>`

Optional hooks for lifecycle events.

```typescript
interface LifecycleHooks<T = unknown> {
  onBoot?(workerId: string): Promise<boolean | void> | boolean | void;
  onWork?(tasks: Task<T>[], messages: Message[]): Promise<void> | void;
  onIdle?(workerId: string): Promise<void> | void;
  onShutdown?(workerId: string): Promise<void> | void;
  onTaskStart?(task: Task<T>): Promise<void> | void;
  onTaskComplete?(task: Task<T>, result?: unknown): Promise<void> | void;
  onError?(error: Error, context: { phase: LifecyclePhase; task?: Task<T> }): Promise<void> | void;
}
```

### Types

```typescript
type Priority = "interrupt" | "sprint" | "parallel" | "queue" | "backlog";
type LifecyclePhase = "boot" | "work" | "idle" | "shutdown";

interface Task<T = unknown> {
  id: string;
  priority: Priority;
  payload: T;
  createdAt?: Date;
}

interface Message<T = unknown> {
  id: string;
  source: string;
  type: string;
  payload: T;
  priority?: Priority;
  createdAt?: Date;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  interrupt: 0,
  sprint: 1,
  parallel: 2,
  queue: 3,
  backlog: 4,
};
```

## License

MIT

---

Built by [Rezzed.ai](https://rezzed.ai)
