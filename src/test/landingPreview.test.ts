import { describe, expect, it } from 'vitest';

import {
  buildLandingPreviewFromBlueprint,
  extractLandingPreviewTakeaways,
  pickStableItem,
  pickStableItems,
} from '@/lib/landingPreview';

const fallback = {
  id: 'fallback',
  title: 'Fallback blueprint',
  creator: 'Bleup community',
  channel: 'Fallback',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  summary: 'Fallback summary text.',
  takeaways: ['Fallback takeaway'],
  statsLabel: 'Fallback',
};

describe('extractLandingPreviewTakeaways', () => {
  it('extracts and caps takeaway bullets from sections_json', () => {
    const takeaways = extractLandingPreviewTakeaways({
      schema_version: 'blueprint_sections_v1',
      takeaways: {
        bullets: [
          'Takeaways: First useful point that should stay.',
          'Second useful point that should also stay.',
          'Third useful point that should also stay.',
          'Fourth useful point that should be dropped.',
        ],
      },
    });

    expect(takeaways).toEqual([
      'First useful point that should stay.',
      'Second useful point that should also stay.',
      'Third useful point that should also stay.',
    ]);
  });

  it('returns an empty array when takeaways are missing', () => {
    expect(extractLandingPreviewTakeaways(null)).toEqual([]);
    expect(extractLandingPreviewTakeaways({})).toEqual([]);
  });
});

describe('buildLandingPreviewFromBlueprint', () => {
  it('builds a compact landing preview from blueprint summary and takeaways', () => {
    const preview = buildLandingPreviewFromBlueprint({
      id: 'bp_1',
      title: 'Leucine After 35',
      banner_url: 'https://example.com/banner.jpg',
      preview_summary: null,
      sections_json: {
        summary: {
          text: 'Use leucine as a maintenance lever first, not a hypertrophy shortcut.',
        },
        takeaways: {
          bullets: [
            'Use leucine for maintenance and function, not as a growth hack.',
            'Meal-timed dosing matters more than random use.',
          ],
        },
      },
    }, fallback);

    expect(preview).toMatchObject({
      id: 'bp_1',
      title: 'Leucine After 35',
      creator: 'Bleup community',
      channel: 'Live public sample',
      thumbnailUrl: 'https://example.com/banner.jpg',
      summary: 'Use leucine as a maintenance lever first, not a hypertrophy shortcut.',
      takeaways: [
        'Use leucine for maintenance and function, not as a growth hack.',
        'Meal-timed dosing matters more than random use.',
      ],
      statsLabel: 'Live sample',
    });
  });

  it('falls back to null when there are no takeaways to show', () => {
    const preview = buildLandingPreviewFromBlueprint({
      id: 'bp_2',
      title: 'No takeaways',
      banner_url: null,
      preview_summary: 'Summary only',
      sections_json: {
        schema_version: 'blueprint_sections_v1',
        summary: {
          text: 'Summary only',
        },
      },
    }, fallback);

    expect(preview).toBeNull();
  });
});

describe('pickStableItem', () => {
  it('returns a stable item for a given seed', () => {
    expect(pickStableItem(['a', 'b', 'c'], 4)).toBe('b');
  });
});

describe('pickStableItems', () => {
  it('returns a stable unique slice for a given seed', () => {
    expect(pickStableItems(['a', 'b', 'c', 'd'], 2, 3)).toEqual(['c', 'd', 'a']);
  });

  it('caps at the number of available items', () => {
    expect(pickStableItems(['a', 'b'], 1, 3)).toEqual(['b', 'a']);
  });
});
