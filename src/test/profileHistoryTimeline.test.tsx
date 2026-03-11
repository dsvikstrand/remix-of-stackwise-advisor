import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ProfileHistoryTimeline } from '@/components/profile/ProfileHistoryTimeline';

describe('ProfileHistoryTimeline', () => {
  it('renders blueprint and creator history links without legacy feed copy', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ProfileHistoryTimeline
            isLoading={false}
            items={[
              {
                id: 'item_blueprint',
                kind: 'blueprint',
                title: 'Morning Routine Blueprint',
                subtitle: 'Creator Alpha',
                href: '/blueprint/bp_123',
                createdAt: '2026-03-10T12:00:00.000Z',
                avatarUrl: 'https://img.example.com/creator.jpg',
                badge: 'Blueprint',
                statusText: 'Published to wellness',
                bannerUrl: 'https://img.example.com/banner.jpg',
              },
              {
                id: 'item_creator',
                kind: 'creator',
                title: 'Creator Beta',
                subtitle: 'Subscribed creator',
                href: '/s/youtube/UC_beta',
                createdAt: '2026-03-10T11:00:00.000Z',
                avatarUrl: 'https://img.example.com/creator-beta.jpg',
                badge: 'Creator',
                statusText: null,
                bannerUrl: null,
              },
            ]}
          />
        </MemoryRouter>,
      );
    });

    const html = container.innerHTML;

    act(() => {
      root.unmount();
    });

    expect(html).toContain('Morning Routine Blueprint');
    expect(html).toContain('Creator Alpha');
    expect(html).toContain('Published to wellness');
    expect(html).toContain('href="/blueprint/bp_123"');
    expect(html).toContain('Creator Beta');
    expect(html).toContain('Subscribed creator');
    expect(html).toContain('href="/s/youtube/UC_beta"');
    expect(html).not.toContain('Imported source');
    expect(html).not.toContain('Imported to My Feed');
  });
});
