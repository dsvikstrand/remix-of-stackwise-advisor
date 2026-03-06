export type YouTubeRefreshSchedulerController = {
  start: (delayMs?: number) => void;
  schedule: (delayMs?: number) => void;
  getScheduled: () => boolean;
};

export type YouTubeRefreshSchedulerControllerDeps = {
  enabled: boolean;
  runIngestionWorker: boolean;
  intervalMinutes: number;
  runCycle: () => Promise<void>;
};

export function createYouTubeRefreshSchedulerController(
  deps: YouTubeRefreshSchedulerControllerDeps,
): YouTubeRefreshSchedulerController {
  let youtubeRefreshSchedulerTimer: ReturnType<typeof setTimeout> | null = null;

  function schedule(delayMs?: number) {
    if (!deps.enabled || !deps.runIngestionWorker) return;
    if (youtubeRefreshSchedulerTimer) return;

    const defaultDelayMs = Math.max(1, deps.intervalMinutes) * 60_000;
    const waitMs = Math.max(0, Math.floor(delayMs ?? defaultDelayMs));
    youtubeRefreshSchedulerTimer = setTimeout(() => {
      youtubeRefreshSchedulerTimer = null;
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
      return youtubeRefreshSchedulerTimer !== null;
    },
  };
}
