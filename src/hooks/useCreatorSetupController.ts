import { FormEvent, useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { config } from '@/config/runtime';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  ApiRequestError,
  createSourceSubscription,
  importPublicYouTubeSubscriptions,
  previewPublicYouTubeSubscriptions,
  type PublicYouTubeSubscriptionPreviewItem,
  type PublicYouTubeSubscriptionsImportResult,
  type PublicYouTubeSubscriptionsPreviewResult,
} from '@/lib/subscriptionsApi';
import {
  extendPublicYouTubePreviewSelection,
  mergePublicYouTubePreviewResults,
} from '@/lib/publicYouTubePreviewState';
import {
  ApiRequestError as ChannelSearchApiRequestError,
  searchYouTubeChannels,
  type YouTubeChannelSearchResult,
} from '@/lib/youtubeChannelSearchApi';

function getChannelSearchErrorMessage(error: unknown) {
  if (error instanceof ChannelSearchApiRequestError) {
    switch (error.errorCode) {
      case 'INVALID_QUERY':
        return 'Enter at least 2 characters to search for channels.';
      case 'SEARCH_DISABLED':
        return 'Channel search is currently unavailable.';
      case 'RATE_LIMITED':
        return 'Search quota is currently limited. Please try again shortly.';
      case 'API_NOT_CONFIGURED':
        return 'Search requires VITE_AGENTIC_BACKEND_URL.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Channel search failed.';
}

function getPublicYouTubePreviewErrorCode(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.errorCode || null;
  }
  return null;
}

function getPublicYouTubePreviewErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    switch (error.errorCode) {
      case 'INVALID_INPUT':
        return 'Enter your YouTube handle.';
      case 'PUBLIC_IMPORT_CHANNEL_NOT_FOUND':
        return "We couldn't find that YouTube channel. Check the handle and try again.";
      case 'PUBLIC_SUBSCRIPTIONS_PRIVATE':
        return "We couldn't read this account's subscriptions.";
      case 'RATE_LIMITED':
        return error.message || 'Please wait a moment before trying again.';
      default:
        return error.message || 'Could not load public YouTube subscriptions.';
    }
  }
  return error instanceof Error ? error.message : 'Could not load public YouTube subscriptions.';
}

function normalizeFilterQuery(value: string) {
  return value.trim().toLowerCase();
}

function getFilterRank(values: string[], normalizedQuery: string) {
  if (!normalizedQuery) return 0;

  let bestRank = Number.POSITIVE_INFINITY;
  for (const rawValue of values) {
    const value = rawValue.trim().toLowerCase();
    if (!value) continue;
    if (value === normalizedQuery) {
      bestRank = Math.min(bestRank, 0);
      continue;
    }
    if (value.startsWith(normalizedQuery)) {
      bestRank = Math.min(bestRank, 1);
      continue;
    }
    if (
      value.includes(` ${normalizedQuery}`)
      || value.includes(`-${normalizedQuery}`)
      || value.includes(`_${normalizedQuery}`)
    ) {
      bestRank = Math.min(bestRank, 2);
      continue;
    }
    if (value.includes(normalizedQuery)) {
      bestRank = Math.min(bestRank, 3);
    }
  }

  return bestRank;
}

function rankChannelSearchResult(result: YouTubeChannelSearchResult, normalizedQuery: string) {
  return getFilterRank([
    result.channel_title || '',
    result.channel_id || '',
    result.channel_url || '',
    result.description || '',
  ], normalizedQuery);
}

function rankPublicPreviewItem(item: PublicYouTubeSubscriptionPreviewItem, normalizedQuery: string) {
  return getFilterRank([
    item.channel_title || '',
    item.channel_id || '',
    item.channel_url || '',
  ], normalizedQuery);
}

export type CreatorSetupController = ReturnType<typeof useCreatorSetupController>;

export function useCreatorSetupController() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const subscriptionsEnabled = Boolean(config.agenticBackendUrl);

  const [isAddSubscriptionOpen, setIsAddSubscriptionOpen] = useState(false);
  const [channelSearchQuery, setChannelSearchQuery] = useState('');
  const [channelSearchSubmittedQuery, setChannelSearchSubmittedQuery] = useState('');
  const [channelSearchResults, setChannelSearchResults] = useState<YouTubeChannelSearchResult[]>([]);
  const [channelSearchNextToken, setChannelSearchNextToken] = useState<string | null>(null);
  const [channelSearchError, setChannelSearchError] = useState<string | null>(null);
  const [subscribingChannelIds, setSubscribingChannelIds] = useState<Record<string, boolean>>({});

  const [publicYouTubeChannelInput, setPublicYouTubeChannelInput] = useState('');
  const [publicYouTubePreview, setPublicYouTubePreview] = useState<PublicYouTubeSubscriptionsPreviewResult | null>(null);
  const [publicYouTubePreviewFilterQuery, setPublicYouTubePreviewFilterQuery] = useState('');
  const [publicYouTubePreviewSelected, setPublicYouTubePreviewSelected] = useState<Record<string, boolean>>({});
  const [publicYouTubePreviewError, setPublicYouTubePreviewError] = useState<string | null>(null);
  const [publicYouTubePreviewErrorCode, setPublicYouTubePreviewErrorCode] = useState<string | null>(null);
  const [publicYouTubeImportSummary, setPublicYouTubeImportSummary] = useState<PublicYouTubeSubscriptionsImportResult | null>(null);
  const [publicYouTubePreviewLoadingMore, setPublicYouTubePreviewLoadingMore] = useState(false);
  const [publicYouTubePreviewRequestInput, setPublicYouTubePreviewRequestInput] = useState('');

  const invalidateSubscriptionViews = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['source-subscriptions', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['my-feed-items', user?.id] });
  }, [queryClient, user?.id]);

  const resetSearchDialogState = useCallback(() => {
    setChannelSearchQuery('');
    setChannelSearchSubmittedQuery('');
    setChannelSearchResults([]);
    setChannelSearchNextToken(null);
    setChannelSearchError(null);
  }, []);

  const handleAddSubscriptionDialogChange = useCallback((nextOpen: boolean) => {
    setIsAddSubscriptionOpen(nextOpen);
    if (!nextOpen) {
      resetSearchDialogState();
    }
  }, [resetSearchDialogState]);

  const publicYouTubePreviewMutation = useMutation({
    mutationFn: async (input: {
      channelInput: string;
      pageToken?: string | null;
      pageSize?: number;
      append: boolean;
    }) => {
      const channelInput = input.channelInput.trim();
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return previewPublicYouTubeSubscriptions({
        channelInput,
        pageToken: input.pageToken,
        pageSize: input.pageSize,
      });
    },
    onMutate: (input) => {
      if (input.append) {
        setPublicYouTubePreviewLoadingMore(true);
      } else {
        setPublicYouTubePreview(null);
        setPublicYouTubePreviewSelected({});
        setPublicYouTubePreviewFilterQuery('');
        setPublicYouTubePreviewLoadingMore(false);
        setPublicYouTubePreviewRequestInput(input.channelInput.trim());
      }
      setPublicYouTubePreviewError(null);
      setPublicYouTubePreviewErrorCode(null);
      setPublicYouTubeImportSummary(null);
    },
    onSuccess: (payload, input) => {
      setPublicYouTubePreviewLoadingMore(false);
      setPublicYouTubePreview((previous) => mergePublicYouTubePreviewResults(previous, payload, input.append));
      setPublicYouTubePreviewError(null);
      setPublicYouTubePreviewErrorCode(null);
      setPublicYouTubePreviewSelected((previous) => (
        input.append
          ? extendPublicYouTubePreviewSelection(previous, payload.creators || [])
          : extendPublicYouTubePreviewSelection({}, payload.creators || [])
      ));
    },
    onError: (error, input) => {
      setPublicYouTubePreviewLoadingMore(false);
      if (!input.append) {
        setPublicYouTubePreview(null);
        setPublicYouTubePreviewSelected({});
      }
      setPublicYouTubeImportSummary(null);
      setPublicYouTubePreviewErrorCode(getPublicYouTubePreviewErrorCode(error));
      setPublicYouTubePreviewError(getPublicYouTubePreviewErrorMessage(error));
    },
  });

  const publicYouTubeImportMutation = useMutation({
    mutationFn: async (creators: PublicYouTubeSubscriptionPreviewItem[]) => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return importPublicYouTubeSubscriptions({ creators });
    },
    onSuccess: (result, creators) => {
      setPublicYouTubeImportSummary(result);
      setPublicYouTubePreviewSelected({});
      invalidateSubscriptionViews();

      const failedIds = new Set(result.failures.map((failure) => failure.channel_id));
      const importedIds = new Set(
        creators
          .map((creator) => String(creator.channel_id || '').trim())
          .filter((channelId) => channelId && !failedIds.has(channelId)),
      );
      setPublicYouTubePreview((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          creators: previous.creators.map((creator) => {
            if (!importedIds.has(creator.channel_id)) return creator;
            return {
              ...creator,
              already_active: true,
              already_exists_inactive: false,
            };
          }),
        };
      });

      toast({
        title: 'Import complete',
        description: `Imported ${result.imported_count}, reactivated ${result.reactivated_count}, already active ${result.already_active_count}, failed ${result.failed_count}.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Import failed',
        description: getPublicYouTubePreviewErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const channelSearchMutation = useMutation({
    mutationFn: async (input: { query: string; pageToken?: string | null; append?: boolean }) => {
      const data = await searchYouTubeChannels({
        q: input.query,
        limit: 10,
        pageToken: input.pageToken || undefined,
      });
      return {
        query: input.query,
        append: Boolean(input.append),
        ...data,
      };
    },
    onSuccess: (payload) => {
      setChannelSearchSubmittedQuery(payload.query);
      setChannelSearchError(null);
      setChannelSearchResults((previous) => (payload.append ? [...previous, ...payload.results] : payload.results));
      setChannelSearchNextToken(payload.next_page_token);
    },
    onError: (error) => {
      setChannelSearchError(getChannelSearchErrorMessage(error));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (inputRaw: string) => {
      const input = inputRaw.trim();
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      if (!input) throw new Error('Enter a channel to subscribe.');
      return createSourceSubscription({ channelInput: input });
    },
    onSuccess: () => {
      invalidateSubscriptionViews();
    },
    onError: (error) => {
      const description = error instanceof ApiRequestError && error.errorCode === 'INVALID_CHANNEL'
        ? 'Could not resolve that YouTube channel. Try another result.'
        : error instanceof Error
          ? error.message
          : 'Could not create subscription.';
      toast({ title: 'Subscribe failed', description, variant: 'destructive' });
    },
  });

  const normalizedChannelSearchQuery = useMemo(
    () => normalizeFilterQuery(channelSearchSubmittedQuery || channelSearchQuery),
    [channelSearchQuery, channelSearchSubmittedQuery],
  );

  const filteredChannelSearchResults = useMemo(() => {
    if (!normalizedChannelSearchQuery) return channelSearchResults;
    return channelSearchResults
      .map((result, index) => ({
        result,
        index,
        rank: rankChannelSearchResult(result, normalizedChannelSearchQuery),
      }))
      .filter((entry) => Number.isFinite(entry.rank))
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank;
        return left.index - right.index;
      })
      .map((entry) => entry.result);
  }, [channelSearchResults, normalizedChannelSearchQuery]);

  const publicYouTubePreviewCreators = publicYouTubePreview?.creators || [];
  const selectedPublicYouTubeCreators = useMemo(
    () => publicYouTubePreviewCreators.filter((creator) => publicYouTubePreviewSelected[creator.channel_id]),
    [publicYouTubePreviewCreators, publicYouTubePreviewSelected],
  );

  const normalizedPublicYouTubePreviewFilterQuery = useMemo(
    () => normalizeFilterQuery(publicYouTubePreviewFilterQuery),
    [publicYouTubePreviewFilterQuery],
  );

  const filteredPublicYouTubePreviewCreators = useMemo(() => {
    if (!normalizedPublicYouTubePreviewFilterQuery) return publicYouTubePreviewCreators;
    return publicYouTubePreviewCreators
      .map((item, index) => ({
        item,
        index,
        rank: rankPublicPreviewItem(item, normalizedPublicYouTubePreviewFilterQuery),
      }))
      .filter((entry) => Number.isFinite(entry.rank))
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank;
        return left.index - right.index;
      })
      .map((entry) => entry.item);
  }, [normalizedPublicYouTubePreviewFilterQuery, publicYouTubePreviewCreators]);

  const setSubscribing = useCallback((channelId: string, value: boolean) => {
    setSubscribingChannelIds((previous) => {
      if (value) return { ...previous, [channelId]: true };
      if (!previous[channelId]) return previous;
      const next = { ...previous };
      delete next[channelId];
      return next;
    });
  }, []);

  const handlePublicYouTubePreviewSubmit = useCallback((event: FormEvent) => {
    event.preventDefault();
    publicYouTubePreviewMutation.mutate({
      channelInput: publicYouTubeChannelInput,
      pageToken: null,
      pageSize: 50,
      append: false,
    });
  }, [publicYouTubeChannelInput, publicYouTubePreviewMutation]);

  const handlePublicYouTubePreviewLoadMore = useCallback(() => {
    if (
      !publicYouTubePreview?.next_page_token
      || publicYouTubePreviewLoadingMore
      || publicYouTubePreviewMutation.isPending
    ) {
      return;
    }
    publicYouTubePreviewMutation.mutate({
      channelInput: publicYouTubePreviewRequestInput || publicYouTubeChannelInput,
      pageToken: publicYouTubePreview.next_page_token,
      pageSize: 50,
      append: true,
    });
  }, [
    publicYouTubeChannelInput,
    publicYouTubePreviewRequestInput,
    publicYouTubePreview?.next_page_token,
    publicYouTubePreviewLoadingMore,
    publicYouTubePreviewMutation,
  ]);

  const togglePublicYouTubePreviewCreator = useCallback((channelId: string, checked: boolean) => {
    setPublicYouTubePreviewSelected((previous) => ({
      ...previous,
      [channelId]: checked,
    }));
  }, []);

  const handlePublicYouTubePreviewSelectAll = useCallback(() => {
    setPublicYouTubePreviewSelected((previous) => {
      const next = { ...previous };
      for (const creator of publicYouTubePreview?.creators || []) {
        if (creator.already_active) continue;
        next[creator.channel_id] = true;
      }
      return next;
    });
  }, [publicYouTubePreview]);

  const handlePublicYouTubePreviewClearSelection = useCallback(() => {
    setPublicYouTubePreviewSelected({});
  }, []);

  const handleImportSelectedPublicYouTubeCreators = useCallback(() => {
    if (selectedPublicYouTubeCreators.length === 0) {
      toast({
        title: 'No creators selected',
        description: 'Select one or more creators to import.',
        variant: 'destructive',
      });
      return;
    }
    publicYouTubeImportMutation.mutate(selectedPublicYouTubeCreators);
  }, [publicYouTubeImportMutation, selectedPublicYouTubeCreators, toast]);

  const handleChannelSearchSubmit = useCallback((event: FormEvent) => {
    event.preventDefault();
    const query = channelSearchQuery.trim();
    if (!query) {
      setChannelSearchError('Enter a channel query.');
      return;
    }
    channelSearchMutation.mutate({ query, append: false });
  }, [channelSearchMutation, channelSearchQuery]);

  const handleChannelSearchLoadMore = useCallback(() => {
    if (!channelSearchNextToken || channelSearchMutation.isPending) return;
    channelSearchMutation.mutate({
      query: channelSearchSubmittedQuery || channelSearchQuery.trim(),
      pageToken: channelSearchNextToken,
      append: true,
    });
  }, [channelSearchMutation, channelSearchNextToken, channelSearchQuery, channelSearchSubmittedQuery]);

  const runSubscribe = useCallback(async (input: string, successTitle = 'Subscription saved') => {
    await createMutation.mutateAsync(input);
    toast({
      title: successTitle,
      description: 'You are now subscribed. New uploads will appear in your feed.',
    });
  }, [createMutation, toast]);

  const handleSubscribeFromSearch = useCallback(async (result: YouTubeChannelSearchResult) => {
    if (!subscriptionsEnabled) return;
    if (subscribingChannelIds[result.channel_id]) return;
    setSubscribing(result.channel_id, true);
    try {
      await runSubscribe(result.channel_url || result.channel_id, 'Subscribed');
      handleAddSubscriptionDialogChange(false);
    } catch {
      // error toast handled in mutation
    } finally {
      setSubscribing(result.channel_id, false);
    }
  }, [handleAddSubscriptionDialogChange, runSubscribe, setSubscribing, subscribingChannelIds, subscriptionsEnabled]);

  return {
    subscriptionsEnabled,
    isAddSubscriptionOpen,
    channelSearchQuery,
    channelSearchSubmittedQuery,
    channelSearchResults: filteredChannelSearchResults,
    channelSearchNextToken,
    channelSearchError,
    publicYouTubeChannelInput,
    publicYouTubePreview,
    publicYouTubePreviewFilterQuery,
    publicYouTubePreviewSelected,
    publicYouTubePreviewError,
    publicYouTubePreviewErrorCode,
    publicYouTubeImportSummary,
    publicYouTubePreviewLoadingMore,
    publicYouTubePreviewMutation,
    publicYouTubeImportMutation,
    channelSearchMutation,
    createMutation,
    filteredPublicYouTubePreviewCreators,
    selectedPublicYouTubeCreators,
    setChannelSearchQuery,
    setPublicYouTubeChannelInput,
    setPublicYouTubePreviewFilterQuery,
    handleAddSubscriptionDialogChange,
    handlePublicYouTubePreviewSubmit,
    handlePublicYouTubePreviewLoadMore,
    togglePublicYouTubePreviewCreator,
    handlePublicYouTubePreviewSelectAll,
    handlePublicYouTubePreviewClearSelection,
    handleChannelSearchSubmit,
    handleChannelSearchLoadMore,
    handleSubscribeFromSearch,
    handleImportSelectedPublicYouTubeCreators,
    isChannelSubscribing: (channelId: string) => Boolean(subscribingChannelIds[channelId]),
  };
}
