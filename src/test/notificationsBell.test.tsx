import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsBell } from '@/components/shared/NotificationsBell';

const {
  navigateMock,
  markAllReadMock,
  refetchNotificationsMock,
  refetchQueueMock,
  notificationsState,
  generationQueueState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  markAllReadMock: vi.fn(async () => undefined),
  refetchNotificationsMock: vi.fn(async () => undefined),
  refetchQueueMock: vi.fn(async () => undefined),
  notificationsState: {
    current: {
      items: [],
      unreadCount: 0,
      isEnabled: true,
      isLoading: false,
      isFetching: false,
      isOfflineSnapshot: false,
      lastSyncedAt: null,
    },
  },
  generationQueueState: {
    current: {
      items: [],
      isLoading: false,
      isFetching: false,
      refetch: null as unknown,
    },
  },
}));

generationQueueState.current.refetch = refetchQueueMock;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    ...notificationsState.current,
    markAllRead: markAllReadMock,
    refetch: refetchNotificationsMock,
  }),
}));

vi.mock('@/hooks/useGenerationQueue', () => ({
  useGenerationQueue: () => ({
    isEnabled: true,
    isError: false,
    error: null,
    summary: { active_count: 0, queued_count: 0, running_count: 0 },
    ...generationQueueState.current,
  }),
}));

vi.mock('@/components/pwa/PwaPushCta', () => ({
  PwaPushCta: () => null,
}));

vi.mock('@/components/queue/GenerationQueueRow', () => ({
  GenerationQueueRow: ({ job }: { job: { job_id: string } }) => <div data-job-id={job.job_id}>job</div>,
}));

vi.mock('@/components/ui/dropdown-menu', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const DropdownContext = React.createContext<{ onOpenChange?: (open: boolean) => void }>({});
  return {
    DropdownMenu: ({
      onOpenChange,
      children,
    }: {
      onOpenChange?: (open: boolean) => void;
      children: React.ReactNode;
    }) => (
      <DropdownContext.Provider value={{ onOpenChange }}>
        <div>{children}</div>
      </DropdownContext.Provider>
    ),
    DropdownMenuTrigger: ({
      asChild,
      children,
    }: {
      asChild?: boolean;
      children: React.ReactElement;
    }) => {
      const { onOpenChange } = React.useContext(DropdownContext);
      if (!asChild) return <button type="button" onClick={() => onOpenChange?.(true)}>{children}</button>;
      return React.cloneElement(children, {
        onClick: () => onOpenChange?.(true),
      });
    },
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children: React.ReactNode;
      onSelect?: (event: { preventDefault: () => void }) => void;
    }) => (
      <button
        type="button"
        onClick={() => onSelect?.({ preventDefault: () => undefined })}
      >
        {children}
      </button>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
  };
});

describe('NotificationsBell', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    markAllReadMock.mockClear();
    refetchNotificationsMock.mockClear();
    refetchQueueMock.mockClear();
    notificationsState.current = {
      items: [],
      unreadCount: 0,
      isEnabled: true,
      isLoading: false,
      isFetching: false,
      isOfflineSnapshot: false,
      lastSyncedAt: null,
    };
    generationQueueState.current = {
      items: [],
      isLoading: false,
      isFetching: false,
      refetch: refetchQueueMock,
    };
  });

  it('shows queue checking while a fresh queue refetch is in flight and refetches on open', async () => {
    generationQueueState.current = {
      items: [],
      isLoading: false,
      isFetching: true,
      refetch: refetchQueueMock,
    };

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<NotificationsBell />);
    });

    const openButton = container.querySelector('button');
    expect(openButton).not.toBeNull();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(refetchNotificationsMock).toHaveBeenCalledTimes(1);
    expect(refetchQueueMock).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toContain('Checking queue...');
    expect(container.innerHTML).not.toContain('No active generations.');

    await act(async () => {
      root.unmount();
    });
  });

  it('shows notification checking while a fresh notification refetch is in flight', async () => {
    notificationsState.current = {
      items: [],
      unreadCount: 0,
      isEnabled: true,
      isLoading: false,
      isFetching: true,
      isOfflineSnapshot: false,
      lastSyncedAt: null,
    };

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<NotificationsBell />);
    });

    const openButton = container.querySelector('button');
    expect(openButton).not.toBeNull();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.innerHTML).toContain('Checking notifications...');
    expect(container.innerHTML).not.toContain('No notifications yet.');

    await act(async () => {
      root.unmount();
    });
  });
});
