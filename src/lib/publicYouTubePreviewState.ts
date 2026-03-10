import type {
  PublicYouTubeSubscriptionPreviewItem,
  PublicYouTubeSubscriptionsPreviewResult,
} from '@/lib/subscriptionsApi';

export function mergePublicYouTubePreviewResults(
  previous: PublicYouTubeSubscriptionsPreviewResult | null,
  incoming: PublicYouTubeSubscriptionsPreviewResult,
  append: boolean,
): PublicYouTubeSubscriptionsPreviewResult {
  if (!append || !previous) {
    return incoming;
  }

  const mergedCreators: PublicYouTubeSubscriptionPreviewItem[] = [];
  const seenChannelIds = new Set<string>();
  for (const creator of [...previous.creators, ...incoming.creators]) {
    const channelId = String(creator.channel_id || '').trim();
    if (!channelId || seenChannelIds.has(channelId)) continue;
    seenChannelIds.add(channelId);
    mergedCreators.push(creator);
  }

  return {
    ...incoming,
    creators: mergedCreators,
    creators_total: mergedCreators.length,
  };
}

export function extendPublicYouTubePreviewSelection(
  previous: Record<string, boolean>,
  creators: PublicYouTubeSubscriptionPreviewItem[],
) {
  const nextSelection = { ...previous };
  for (const creator of creators) {
    const channelId = String(creator.channel_id || '').trim();
    if (!channelId || Object.prototype.hasOwnProperty.call(nextSelection, channelId)) {
      continue;
    }
    nextSelection[channelId] = false;
  }
  return nextSelection;
}
