/** Priority levels for incoming work, highest to lowest */
export type Priority = "interrupt" | "sprint" | "parallel" | "queue" | "backlog";

/** Priority ordering (lower number = higher priority) */
export const PRIORITY_ORDER: Record<Priority, number> = {
  interrupt: 0,
  sprint: 1,
  parallel: 2,
  queue: 3,
  backlog: 4,
};

export interface Task<T = unknown> {
  id: string;
  priority: Priority;
  payload: T;
  createdAt?: Date;
}

export interface Message<T = unknown> {
  id: string;
  source: string;
  type: string;
  payload: T;
  priority?: Priority;
  createdAt?: Date;
}

/** Pluggable task source — your database, API, message queue, etc. */
export interface TaskSource<T = unknown> {
  /** Fetch pending tasks for this worker */
  getTasks(): Promise<Task<T>[]>;
  /** Fetch pending messages for this worker */
  getMessages(): Promise<Message[]>;
  /** Claim a task (prevents other workers from picking it up) */
  claim(taskId: string): Promise<boolean>;
  /** Mark a task as complete */
  complete(taskId: string, result?: unknown): Promise<void>;
  /** Send an acknowledgement message */
  ack(target: string, message: string): Promise<void>;
}

export interface PollHooksOptions<T = unknown> {
  /** Unique worker/agent identity */
  workerId: string;
  /** Task source implementation */
  source: TaskSource<T>;
  /** Base polling interval in ms (default: 5000) */
  intervalMs?: number;
  /** Maximum backoff interval in ms (default: 60000) */
  maxIntervalMs?: number;
  /** Backoff multiplier when idle (default: 1.5) */
  backoffMultiplier?: number;
}

export type LifecyclePhase = "boot" | "work" | "idle" | "shutdown";

export interface LifecycleHooks<T = unknown> {
  /** Called on boot — before first poll. Return false to abort. */
  onBoot?(workerId: string): Promise<boolean | void> | boolean | void;
  /** Called when new tasks are found and triaged */
  onWork?(tasks: Task<T>[], messages: Message[]): Promise<void> | void;
  /** Called when entering idle state (no work found) */
  onIdle?(workerId: string): Promise<void> | void;
  /** Called before shutdown */
  onShutdown?(workerId: string): Promise<void> | void;
  /** Called for each task before execution */
  onTaskStart?(task: Task<T>): Promise<void> | void;
  /** Called after each task completes */
  onTaskComplete?(task: Task<T>, result?: unknown): Promise<void> | void;
  /** Called on errors during polling or task execution */
  onError?(error: Error, context: { phase: LifecyclePhase; task?: Task<T> }): Promise<void> | void;
}
