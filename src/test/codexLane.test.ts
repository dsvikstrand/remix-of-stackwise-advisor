import { describe, expect, it } from 'vitest';
import { createCodexLane } from '../../server/services/codexLane';

describe('codex lane', () => {
  it('runs tasks in strict FIFO order with single concurrency', async () => {
    let nowMs = 0;
    const starts: number[] = [];
    const lane = createCodexLane(
      {
        enabled: true,
        concurrency: 4,
      },
      {
        now: () => nowMs,
        log: () => undefined,
      },
    );

    const work = async (label: string) => lane.runCodexTask(
      { stage: label },
      async () => {
        starts.push(nowMs);
        nowMs += 10;
        return label;
      },
    );

    const results = await Promise.all([work('a'), work('b'), work('c')]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(starts).toEqual([0, 10, 20]);
    expect(lane.concurrency).toBe(1);
  });
});
