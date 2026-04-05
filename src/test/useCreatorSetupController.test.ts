import { filterChannelSearchResultsForDisplay } from '@/hooks/useCreatorSetupController';

describe('useCreatorSetupController helpers', () => {
  it('keeps backend handle-mode matches even when the title does not literally contain the submitted handle', () => {
    const results = filterChannelSearchResultsForDisplay({
      mode: 'handle',
      normalizedQuery: '@sethcapehartmd',
      results: [
        {
          channel_id: 'UC1QTjGnvpPbTAgfqAQVbLHw',
          channel_title: 'Seth Capehart MD',
          channel_url: 'https://www.youtube.com/channel/UC1QTjGnvpPbTAgfqAQVbLHw',
          description: 'Helping high-achievers identify and fix the mental and physical gaps that hinder their performance.',
          thumbnail_url: null,
          published_at: null,
          subscriber_count: null,
        },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.channel_title).toBe('Seth Capehart MD');
  });

  it('still narrows creator-name searches by the submitted query', () => {
    const results = filterChannelSearchResultsForDisplay({
      mode: 'creator_name',
      normalizedQuery: 'seth capehart',
      results: [
        {
          channel_id: 'UC1QTjGnvpPbTAgfqAQVbLHw',
          channel_title: 'Seth Capehart MD',
          channel_url: 'https://www.youtube.com/channel/UC1QTjGnvpPbTAgfqAQVbLHw',
          description: '',
          thumbnail_url: null,
          published_at: null,
          subscriber_count: null,
        },
        {
          channel_id: 'UC12345678901234567890',
          channel_title: 'Different Creator',
          channel_url: 'https://www.youtube.com/channel/UC12345678901234567890',
          description: '',
          thumbnail_url: null,
          published_at: null,
          subscriber_count: null,
        },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.channel_title).toBe('Seth Capehart MD');
  });
});
