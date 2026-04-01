export type OracleSubscriptionSchedulerController = {
  start: (delayMs?: number) => void;
  schedule: (delayMs?: number) => void;
  getScheduled: () => boolean;
};

export type OracleSubscriptionSchedulerControllerDeps = {
  enabled: boolean;
  intervalMs: number;
  runCycle: () => Promise<void>;
};

export function createOracleSubscriptionSchedulerController(
  deps: OracleSubscriptionSchedulerControllerDeps,
): OracleSubscriptionSchedulerController {
  let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

  function schedule(delayMs?: number) {
    if (!deps.enabled) return;
    if (schedulerTimer) return;

    const waitMs = Math.max(0, Math.floor(delayMs ?? deps.intervalMs));
    schedulerTimer = setTimeout(() => {
      schedulerTimer = null;
      void deps.runCycle().finally(() => {
        schedule();
      });
    }, waitMs);
  }

  return {
    start(delayMs = 0) {
      schedule(delayMs);
    },
    schedule,
    getScheduled() {
      return schedulerTimer !== null;
    },
  };
}
