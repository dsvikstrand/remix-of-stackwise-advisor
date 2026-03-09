export type NotificationPushDispatcherController = {
  start: (delayMs?: number) => void;
  schedule: (delayMs?: number) => void;
  getScheduled: () => boolean;
};

export type NotificationPushDispatcherControllerDeps = {
  enabled: boolean;
  runIngestionWorker: boolean;
  intervalMs: number;
  runCycle: () => Promise<void>;
};

export function createNotificationPushDispatcherController(
  deps: NotificationPushDispatcherControllerDeps,
): NotificationPushDispatcherController {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(delayMs?: number) {
    if (!deps.enabled || !deps.runIngestionWorker) return;
    if (timer) return;
    const waitMs = Math.max(0, Math.floor(delayMs ?? deps.intervalMs));
    timer = setTimeout(() => {
      timer = null;
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
      return timer !== null;
    },
  };
}
