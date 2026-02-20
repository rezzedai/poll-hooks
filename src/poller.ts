import { PRIORITY_ORDER, type Task, type Message, type PollHooksOptions, type LifecycleHooks, type LifecyclePhase } from "./types.js";

export class Poller<T = unknown> {
  private workerId: string;
  private source: PollHooksOptions<T>["source"];
  private baseInterval: number;
  private maxInterval: number;
  private backoffMultiplier: number;
  private currentInterval: number;
  private hooks: LifecycleHooks<T>;
  private phase: LifecyclePhase = "boot";
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PollHooksOptions<T>, hooks?: LifecycleHooks<T>) {
    this.workerId = options.workerId;
    this.source = options.source;
    this.baseInterval = options.intervalMs ?? 5000;
    this.maxInterval = options.maxIntervalMs ?? 60000;
    this.backoffMultiplier = options.backoffMultiplier ?? 1.5;
    this.currentInterval = this.baseInterval;
    this.hooks = hooks || {};
  }

  get currentPhase(): LifecyclePhase { return this.phase; }
  get isRunning(): boolean { return this.running; }

  /** Start the polling loop */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.phase = "boot";

    try {
      const proceed = await this.hooks.onBoot?.(this.workerId);
      if (proceed === false) {
        this.running = false;
        return;
      }
    } catch (err) {
      await this.handleError(err as Error, "boot");
      this.running = false;
      return;
    }

    // Initial poll
    await this.poll();
  }

  /** Stop the polling loop and run shutdown hooks */
  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.phase = "shutdown";
    try {
      await this.hooks.onShutdown?.(this.workerId);
    } catch (err) {
      await this.handleError(err as Error, "shutdown");
    }
  }

  /** Execute a single poll cycle (public for testing) */
  async poll(): Promise<{ tasks: Task<T>[]; messages: Message[] }> {
    if (!this.running) return { tasks: [], messages: [] };

    let tasks: Task<T>[] = [];
    let messages: Message[] = [];

    try {
      [tasks, messages] = await Promise.all([
        this.source.getTasks(),
        this.source.getMessages(),
      ]);
    } catch (err) {
      await this.handleError(err as Error, this.phase);
      this.scheduleNext();
      return { tasks: [], messages: [] };
    }

    // Triage: sort tasks by priority
    const sorted = this.triage(tasks);

    if (sorted.length > 0 || messages.length > 0) {
      this.phase = "work";
      this.currentInterval = this.baseInterval; // Reset backoff

      try {
        await this.hooks.onWork?.(sorted, messages);
      } catch (err) {
        await this.handleError(err as Error, "work");
      }

      // Process tasks in priority order
      for (const task of sorted) {
        if (!this.running) break;
        await this.processTask(task);
      }

      // ACK messages
      for (const msg of messages) {
        try {
          await this.source.ack(msg.source, `Received ${msg.type}: ${msg.id}`);
        } catch (err) {
          await this.handleError(err as Error, "work");
        }
      }
    } else {
      this.phase = "idle";
      // Exponential backoff
      this.currentInterval = Math.min(
        this.currentInterval * this.backoffMultiplier,
        this.maxInterval
      );

      try {
        await this.hooks.onIdle?.(this.workerId);
      } catch (err) {
        await this.handleError(err as Error, "idle");
      }
    }

    this.scheduleNext();
    return { tasks: sorted, messages };
  }

  /** Sort tasks by priority (interrupt first, backlog last) */
  triage(tasks: Task<T>[]): Task<T>[] {
    return [...tasks].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 999;
      const pb = PRIORITY_ORDER[b.priority] ?? 999;
      return pa - pb;
    });
  }

  private async processTask(task: Task<T>): Promise<void> {
    try {
      // Claim
      const claimed = await this.source.claim(task.id);
      if (!claimed) return; // Someone else got it

      await this.hooks.onTaskStart?.(task);

      // Execute (the hook handles actual work)
      // The caller is responsible for the actual task logic via onTaskStart/onTaskComplete hooks

      await this.source.complete(task.id);
      await this.hooks.onTaskComplete?.(task);
    } catch (err) {
      await this.handleError(err as Error, "work", task);
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => this.poll(), this.currentInterval);
  }

  private async handleError(error: Error, phase: LifecyclePhase, task?: Task<T>): Promise<void> {
    try {
      await this.hooks.onError?.(error, { phase, task });
    } catch {
      // Prevent error handler errors from crashing the loop
    }
  }
}

/** Convenience factory */
export function createPoller<T = unknown>(
  options: PollHooksOptions<T>,
  hooks?: LifecycleHooks<T>
): Poller<T> {
  return new Poller(options, hooks);
}
