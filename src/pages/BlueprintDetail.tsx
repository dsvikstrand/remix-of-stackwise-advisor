import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { BlueprintAnalysisView } from '@/components/blueprint/BlueprintAnalysisView';
import { SummarySlides } from '@/components/blueprint/SummarySlides';
import { useBlueprint, useBlueprintComments, useCreateBlueprintComment, useToggleBlueprintLike } from '@/hooks/useBlueprints';
import {
  useBlueprintYoutubeRefreshMutation,
  useBlueprintYoutubeComments,
} from '@/hooks/useBlueprintYoutubeComments';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Heart, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { logMvpEvent } from '@/lib/logEvent';
import { PageDivider, PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { resolveChannelLabelForBlueprint } from '@/lib/channelMapping';
import { getCatalogChannelTagSlugs } from '@/lib/channelPostContext';
import { normalizeTag } from '@/lib/tagging';
import { supabase } from '@/integrations/supabase/client';
import { resolveEffectiveBanner } from '@/lib/bannerResolver';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';
import { splitSummaryIntoSlides } from '@/lib/summarySlides';
import { buildSourcePagePath } from '@/lib/sourcePagesApi';
import { lookupSourceItems } from '@/lib/sourceItemsApi';
import {
  buildRenderBlocksFromBlueprintSections,
  parseBlueprintSectionsV1,
} from '@/lib/blueprintSections';

type StepItem = { category?: string; name?: string; context?: string };
type RenderStep = { id?: string; title: string; description: string; items: StepItem[] };
function extractYouTubeVideoId(url: string) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return id || null;
    }
    if (host.endsWith('youtube.com')) {
      const directId = parsed.searchParams.get('v');
      if (directId) return directId;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && (parts[0] === 'embed' || parts[0] === 'shorts')) {
        return parts[1] || null;
      }
    }
  } catch {
    const match = raw.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseSourceViewCount(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  const candidates = [metadata.view_count, metadata.viewCount];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.floor(numeric);
    }
  }
  return null;
}

function formatCompactCount(value: number | null) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  if (value < 1000) return String(Math.floor(value));
  const units = [
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ];
  for (const unit of units) {
    if (value < unit.threshold) continue;
    const scaled = value / unit.threshold;
    const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    return `${String(rounded).replace(/\\.0$/, '')}${unit.suffix}`;
  }
  return String(Math.floor(value));
}

function formatStepItem(item: StepItem) {
  const name = typeof item.name === 'string' ? item.name : 'Untitled';
  const context = typeof item.context === 'string' && item.context.trim() ? item.context.trim() : '';
  return context ? `${name} [${context}]` : name;
}

function normalizeHeadingKey(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/^#+\s+/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/:$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTakeawaysKey(key: string) {
  return key === 'takeaways' || key === 'lightning takeaways' || key.startsWith('takeaways ');
}

function isSummaryKey(key: string) {
  return key === 'summary' || key.startsWith('summary ') || key.startsWith('summary(');
}

function isBleupKey(key: string) {
  return key === 'bleup'
    || key === 'beup'
    || key.startsWith('bleup ')
    || key.startsWith('bleup(')
    || key.startsWith('beup ')
    || key.startsWith('beup(');
}

function isCaveatsKey(key: string) {
  return key === 'open questions' || key === 'caveats';
}

function isNarrativeKey(key: string) {
  return isSummaryKey(key) || isBleupKey(key);
}

function sectionDisplayTitle(rawTitle: string) {
  const key = normalizeHeadingKey(rawTitle);
  if (isSummaryKey(key)) return 'Quick Read';
  if (isBleupKey(key)) return 'Storyline';
  if (isCaveatsKey(key)) return 'Caveats';
  return rawTitle;
}

function canonicalSectionTitle(rawTitle: string, fallbackIndex: number) {
  const normalized = normalizeHeadingKey(rawTitle);
  if (isTakeawaysKey(normalized)) return 'Takeaways';
  if (isSummaryKey(normalized)) return 'Summary';
  if (isBleupKey(normalized)) return 'Bleup';
  if (normalized === 'mechanism deep dive' || normalized === 'deep dive') return 'Deep Dive';
  if (normalized === 'tradeoffs') return 'Tradeoffs';
  if (normalized === 'decision rules' || normalized === 'practical rules') return 'Practical Rules';
  if (isCaveatsKey(normalized)) return 'Caveats';
  if (normalized === 'bottom line') return 'Bottom Line';
  const cleaned = (rawTitle || '').trim();
  return cleaned || `Section ${fallbackIndex + 1}`;
}

function parseDescriptionBlocks(description: string) {
  const lines = String(description || '').split(/\r?\n/);
  const textLines: string[] = [];
  const bullets: string[] = [];
  const isValidBullet = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (!/[a-z0-9]/i.test(trimmed)) return false;
    if (/^[-.]+$/.test(trimmed)) return false;
    return trimmed.length >= 3;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      textLines.push('');
      continue;
    }
    const bulletMatch = line.match(/^[-*•]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (bulletMatch) {
      const normalized = bulletMatch[1].trim();
      if (isValidBullet(normalized)) bullets.push(normalized);
      continue;
    }
    textLines.push(line);
  }

  return {
    text: textLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    bullets,
  };
}

function splitEmbeddedGoldenSections(step: RenderStep): RenderStep[] {
  const description = String(step.description || '').trim();
  if (!description) return [step];
  const lines = description.split(/\r?\n/);
  const sections: RenderStep[] = [];
  let currentTitle = step.title;
  let currentLines: string[] = [];
  let sectionIndex = 0;

  const flush = () => {
    const nextDescription = currentLines.join('\n').trim();
    const normalizedTitle = canonicalSectionTitle(currentTitle, sectionIndex);
    const normalizedKey = normalizeHeadingKey(normalizedTitle);
    if (!nextDescription && normalizedKey !== 'bottom line') {
      currentLines = [];
      return;
    }
    sections.push({
      id: step.id ? `${step.id}-${sectionIndex}` : undefined,
      title: normalizedTitle,
      description: nextDescription,
      items: [],
    });
    sectionIndex += 1;
    currentLines = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const headingOnlyMatch = trimmed.match(/^(deep dive|mechanism deep dive|tradeoffs|practical rules|decision rules|bottom line|open questions|caveats)\s*:?\s*$/i);
    if (headingOnlyMatch) {
      if (currentLines.length > 0) flush();
      currentTitle = canonicalSectionTitle(headingOnlyMatch[1], sectionIndex);
      continue;
    }
    currentLines.push(rawLine);
  }

  flush();

  if (sections.length <= 1) return [step];
  if (step.items.length > 0) {
    sections[0] = { ...sections[0], items: step.items };
  }
  return sections;
}

export default function BlueprintDetail() {
  const navigate = useNavigate();
  const { blueprintId } = useParams();
  const { data: blueprint, isLoading } = useBlueprint(blueprintId);
  const [youtubeCommentSort, setYouTubeCommentSort] = useState<'top' | 'new'>('top');
  const [commentView, setCommentView] = useState<'youtube' | 'community'>('youtube');
  const [communityCommentSort, setCommunityCommentSort] = useState<'top' | 'new'>('top');
  const { data: youtubeComments, isLoading: youtubeCommentsLoading } = useBlueprintYoutubeComments(blueprintId, youtubeCommentSort);
  const { data: comments, isLoading: commentsLoading } = useBlueprintComments(blueprintId, communityCommentSort);
  const createComment = useCreateBlueprintComment();
  const toggleLike = useToggleBlueprintLike();
  const { toast } = useToast();
  const { user } = useAuth();
  const canRefreshYouTubeComments = Boolean(user?.id && blueprint?.creator_user_id === user.id);
  const [comment, setComment] = useState('');
  const youtubeCommentsRefresh = useBlueprintYoutubeRefreshMutation(canRefreshYouTubeComments ? blueprintId : undefined);
  const [isBannerExpanded, setIsBannerExpanded] = useState(false);
  const [isBannerVideoPlaying, setIsBannerVideoPlaying] = useState(false);
  const [interactiveSectionsExpanded, setInteractiveSectionsExpanded] = useState(false);
  const [takeawaysExpanded, setTakeawaysExpanded] = useState(false);
  const [activeInteractiveTab, setActiveInteractiveTab] = useState('');
  const location = useLocation();
  const loggedBlueprintId = useRef<string | null>(null);
  const goldenSectionsSchema = useMemo(
    () => parseBlueprintSectionsV1(blueprint?.sections_json),
    [blueprint?.sections_json],
  );
  const hasCanonicalSections = Boolean(goldenSectionsSchema);
  const hasAiReview = !hasCanonicalSections && Boolean((blueprint?.llm_review || '').trim());
  const [sourceChannel, setSourceChannel] = useState<{
    title: string;
    url: string | null;
    sourcePagePath: string | null;
    avatarUrl: string | null;
    thumbnailUrl: string | null;
    viewCount: number | null;
  } | null>(null);
  const [sourceChannelLookupFailed, setSourceChannelLookupFailed] = useState(false);
  const [isSourceChannelResolved, setIsSourceChannelResolved] = useState(false);
  const curatedChannelTagSlugs = useMemo(() => new Set(getCatalogChannelTagSlugs().map(normalizeTag)), []);
  const displayTags = useMemo(() => {
    if (!blueprint?.tags?.length) return [];
    // Keep channel tags out of the hashtag row to preserve the "channel != hashtag" mental model.
    return blueprint.tags.filter((tag) => !curatedChannelTagSlugs.has(normalizeTag(tag.slug)));
  }, [blueprint?.tags, curatedChannelTagSlugs]);
  useEffect(() => {
    if (!blueprint?.id) return;
    if (loggedBlueprintId.current === blueprint.id) return;
    loggedBlueprintId.current = blueprint.id;
    void logMvpEvent({
      eventName: 'view_blueprint',
      userId: user?.id,
      blueprintId: blueprint.id,
      path: location.pathname,
    });
  }, [blueprint?.id, location.pathname, user?.id]);

  useEffect(() => {
    setInteractiveSectionsExpanded(false);
    setTakeawaysExpanded(false);
    setActiveInteractiveTab('');
    setIsBannerExpanded(false);
    setIsBannerVideoPlaying(false);
    setYouTubeCommentSort('top');
    setCommentView('youtube');
  }, [blueprint?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadSourceChannel() {
      setIsSourceChannelResolved(false);
      setSourceChannelLookupFailed(false);
      if (!blueprint?.id) {
        setSourceChannel(null);
        setIsSourceChannelResolved(true);
        return;
      }
      let sourceItemId: string | null = null;

      const { data: variantRow } = await supabase
        .from('source_item_blueprint_variants')
        .select('source_item_id, updated_at')
        .eq('blueprint_id', blueprint.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sourceItemId = String(variantRow?.source_item_id || '').trim() || null;

      const initialLookup = !sourceItemId
        ? await lookupSourceItems({ blueprintIds: [blueprint.id] })
        : null;
      if (!sourceItemId && initialLookup) {
        sourceItemId = initialLookup.source_item_id_by_blueprint_id[blueprint.id] || null;
      }

      if (!sourceItemId) {
        if (!cancelled) {
          setSourceChannel(null);
          setSourceChannelLookupFailed(true);
          setIsSourceChannelResolved(true);
        }
        return;
      }
      const source = initialLookup?.items.find((row) => row.id === sourceItemId)
        || (await lookupSourceItems({ sourceIds: [sourceItemId] })).items[0]
        || null;
      const sourceError = null;
      if (sourceError || !source) {
        if (!cancelled) {
          setSourceChannel(null);
          setSourceChannelLookupFailed(true);
          setIsSourceChannelResolved(true);
        }
        return;
      }
      const sourceMetadata =
        source.metadata && typeof source.metadata === 'object'
          ? (source.metadata as Record<string, unknown>)
          : null;
      const metadataChannelTitle =
        sourceMetadata && typeof sourceMetadata.source_channel_title === 'string'
          ? String(sourceMetadata.source_channel_title || '').trim() || null
          : (
              sourceMetadata && typeof sourceMetadata.channel_title === 'string'
                ? String(sourceMetadata.channel_title || '').trim() || null
                : null
            );
      const channelTitle = source.source_channel_title || metadataChannelTitle || null;
      const metadataChannelAvatarUrl =
        sourceMetadata && typeof sourceMetadata.source_channel_avatar_url === 'string'
          ? String(sourceMetadata.source_channel_avatar_url || '').trim() || null
          : (
            sourceMetadata && typeof sourceMetadata.channel_avatar_url === 'string'
              ? String(sourceMetadata.channel_avatar_url || '').trim() || null
              : null
          );
      let sourcePageAvatarUrl: string | null = null;
      let sourcePagePath: string | null = null;
      const sourcePageId = String(source.source_page_id || '').trim();
      if (sourcePageId) {
        const { data: sourcePage } = await supabase
          .from('source_pages')
          .select('avatar_url, platform, external_id')
          .eq('id', sourcePageId)
          .maybeSingle();
        sourcePageAvatarUrl = sourcePage?.avatar_url || null;
        const sourcePagePlatform = String(sourcePage?.platform || '').trim();
        const sourcePageExternalId = String(sourcePage?.external_id || '').trim();
        if (sourcePagePlatform && sourcePageExternalId) {
          sourcePagePath = buildSourcePagePath(sourcePagePlatform, sourcePageExternalId);
        }
      }
      const sourceChannelId = String(source.source_channel_id || '').trim();
      let sourceExternalAvatarUrl: string | null = null;
      if (!sourcePageAvatarUrl && sourceChannelId) {
        const { data: sourcePageByExternal } = await supabase
          .from('source_pages')
          .select('avatar_url, platform, external_id')
          .eq('platform', 'youtube')
          .eq('external_id', sourceChannelId)
          .maybeSingle();
        sourceExternalAvatarUrl = sourcePageByExternal?.avatar_url || null;
        const sourcePagePlatform = String(sourcePageByExternal?.platform || '').trim();
        const sourcePageExternalId = String(sourcePageByExternal?.external_id || '').trim();
        if (!sourcePagePath && sourcePagePlatform && sourcePageExternalId) {
          sourcePagePath = buildSourcePagePath(sourcePagePlatform, sourcePageExternalId);
        }
      }
      if (!cancelled) {
        const viewCount = parseSourceViewCount(sourceMetadata);
        setSourceChannel({
          title: channelTitle || source.title || 'Source channel',
          url: source.source_url || null,
          sourcePagePath,
          avatarUrl: sourcePageAvatarUrl || metadataChannelAvatarUrl || sourceExternalAvatarUrl || null,
          thumbnailUrl: String(source.thumbnail_url || '').trim() || null,
          viewCount,
        });
        setSourceChannelLookupFailed(false);
        setIsSourceChannelResolved(true);
      }
    }
    void loadSourceChannel();
    return () => {
      cancelled = true;
    };
  }, [blueprint?.id]);

  const handleLike = async () => {
    if (!blueprint) return;
    try {
      await toggleLike.mutateAsync({ blueprintId: blueprint.id, liked: blueprint.user_liked });
    } catch (error) {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmitComment = async () => {
    if (!blueprintId) return;
    if (!comment.trim()) return;
    try {
      await createComment.mutateAsync({ blueprintId, content: comment.trim() });
      setComment('');
    } catch (error) {
      toast({
        title: 'Comment failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleTagClick = (slug: string) => {
    navigate(`/explore?q=${encodeURIComponent(slug)}`);
  };

  const effectiveBannerUrl = resolveEffectiveBanner({
    bannerUrl: blueprint?.banner_url || null,
    sourceThumbnailUrl: sourceChannel?.thumbnailUrl || null,
  });
  const compactSourceViewCount = formatCompactCount(sourceChannel?.viewCount ?? null);
  const sourceVideoUrl = String(sourceChannel?.url || '').trim();
  const youtubeVideoId = extractYouTubeVideoId(sourceVideoUrl);
  const youtubeEmbedUrl = youtubeVideoId
    ? `https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
    : '';
  const hasInlineVideo = Boolean(youtubeEmbedUrl);
  const goldenSections = useMemo(
    () => (goldenSectionsSchema ? buildRenderBlocksFromBlueprintSections(goldenSectionsSchema) : []),
    [goldenSectionsSchema],
  );
  const visibleGoldenSections = goldenSections.filter((step) => normalizeHeadingKey(step.title) !== 'bottom line');
  const takeawaysSection = visibleGoldenSections.find((step) => {
    const key = normalizeHeadingKey(step.title);
    return isTakeawaysKey(key);
  });
  const topSummarySection = visibleGoldenSections.find((step) => {
    const key = normalizeHeadingKey(step.title);
    return isSummaryKey(key);
  });
  const selectedSummaryText = topSummarySection?.description || '';
  const bleupSection = visibleGoldenSections.find((step) => {
    const key = normalizeHeadingKey(step.title);
    return isBleupKey(key);
  });
  const deepDiveAndMoreSections = visibleGoldenSections.filter(
    (step) =>
      step !== topSummarySection
      && step !== bleupSection
      && step !== takeawaysSection,
  );
  const splitSections = deepDiveAndMoreSections.flatMap((step) => splitEmbeddedGoldenSections(step));
  const fallbackNarrativeFromSplit = splitSections.find((step) => isNarrativeKey(normalizeHeadingKey(step.title))) || null;
  const effectiveTopSummarySection = topSummarySection
    ? {
        ...topSummarySection,
        description: selectedSummaryText,
      }
    : null;
  const effectiveBleupSection = bleupSection || fallbackNarrativeFromSplit;
  const deepDiveInteractiveSections = deepDiveAndMoreSections
    .flatMap((step) => splitEmbeddedGoldenSections(step))
    .filter((step) => {
      const key = normalizeHeadingKey(step.title);
      return key !== 'bottom line' && !isNarrativeKey(key);
    })
    .sort((a, b) => {
        const rank = (value: RenderStep) => {
          const key = normalizeHeadingKey(value.title);
          if (key === 'practical rules') return 1;
          if (key === 'deep dive') return 2;
          if (isCaveatsKey(key)) return 3;
          if (key === 'tradeoffs') return 4;
          return 99;
        };
      return rank(a) - rank(b);
    });
  const renderGoldenGroup = (group: RenderStep[]) => {
    if (group.length === 0) return null;
    return (
      <div className="space-y-0">
        {group.map((step, index) => {
          const sectionKey = normalizeHeadingKey(step.title);
          const isTopSummarySection = isSummaryKey(sectionKey);
          const isTakeawaysSection = isTakeawaysKey(sectionKey);
          const isBleupSection = isBleupKey(sectionKey);
          const displayTitle = sectionDisplayTitle(step.title);
          const summarySlides = isBleupSection ? splitSummaryIntoSlides(step.description) : [];
          const parsedDescription = parseDescriptionBlocks(step.description);
          const combinedBullets = [
            ...parsedDescription.bullets,
            ...step.items.map((item) => formatStepItem(item)),
          ];
          const takeawaysPreviewRows = 2;
          const takeawaysCanExpand = isTakeawaysSection && combinedBullets.length > takeawaysPreviewRows;
          const takeawaysVisibleBullets = takeawaysCanExpand && !takeawaysExpanded
            ? combinedBullets.slice(0, takeawaysPreviewRows)
            : combinedBullets;
          const useSummarySlider =
            isBleupSection &&
            step.description.trim().length > 0 &&
            (summarySlides.length > 1 || hasCanonicalSections);
          return (
            <div
              key={step.id || `${step.title}-${index}`}
              className={index === 0 ? 'space-y-1.5' : 'mt-3 pt-1 space-y-1.5'}
            >
              {useSummarySlider ? (
                <SummarySlides
                  title={displayTitle}
                  slides={summarySlides.length > 0 ? summarySlides : [step.description]}
                  surface={isBleupSection ? 'flat' : 'boxed'}
                />
              ) : (
                <>
                  {displayTitle.trim().length > 0 ? (
                    <p className="text-sm font-medium">{displayTitle}</p>
                  ) : null}
                  {parsedDescription.text ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{parsedDescription.text}</p>
                  ) : null}
                  {combinedBullets.length > 0 && !isTopSummarySection ? (
                    <div
                      role={takeawaysCanExpand ? 'button' : undefined}
                      tabIndex={takeawaysCanExpand ? 0 : -1}
                      className={takeawaysCanExpand ? 'cursor-pointer' : ''}
                      onClick={() => {
                        if (!takeawaysCanExpand) return;
                        setTakeawaysExpanded((current) => !current);
                      }}
                      onKeyDown={(event) => {
                        if (!takeawaysCanExpand) return;
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setTakeawaysExpanded((current) => !current);
                      }}
                      aria-label={takeawaysCanExpand ? (takeawaysExpanded ? 'Collapse takeaways' : 'Expand takeaways') : undefined}
                    >
                      <ul className="space-y-1 list-disc pl-5">
                        {(isTakeawaysSection ? takeawaysVisibleBullets : combinedBullets).map((itemText, itemIndex) => (
                          <li key={`${step.id || index}-${itemIndex}`} className="text-sm leading-snug">
                            {itemText}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {takeawaysCanExpand ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-0 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setTakeawaysExpanded((current) => !current)}
                    >
                      {takeawaysExpanded ? 'Show less' : 'Show more'}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderGoldenInteractiveGroup = (group: RenderStep[]) => {
    if (group.length === 0) return null;
    const previewBulletRows = 2;
    const isExpandableSectionKey = (key: string) =>
      key === 'practical rules' || key === 'deep dive' || isCaveatsKey(key);
    const practicalRulesIndex = group.findIndex((step) => normalizeHeadingKey(step.title) === 'practical rules');
    const defaultTabIndex = practicalRulesIndex >= 0 ? practicalRulesIndex : 0;
    const defaultTabValue = `golden-section-${defaultTabIndex}`;
    const currentTabValue = activeInteractiveTab || defaultTabValue;
    return (
      <div className="space-y-2">
        <Tabs value={currentTabValue} onValueChange={setActiveInteractiveTab} className="w-full">
          <TabsList className="w-full justify-center bg-transparent flex-nowrap overflow-x-auto px-0 py-1">
            {group.map((step, index) => (
              <TabsTrigger
                key={step.id || `trigger-${step.title}-${index}`}
                value={`golden-section-${index}`}
                className="shrink-0 text-[11px] px-2.5 py-1 uppercase tracking-wide data-[state=active]:bg-muted/50"
              >
                {step.title}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="px-0 py-1">
            {group.map((step, index) => {
              const sectionKey = normalizeHeadingKey(step.title);
              const expandable = isExpandableSectionKey(sectionKey);
              const parsedDescription = parseDescriptionBlocks(step.description);
              const combinedBullets = [
                ...parsedDescription.bullets,
                ...step.items.map((item) => formatStepItem(item)),
              ];
              const isExpanded = interactiveSectionsExpanded;
              const visibleBullets = expandable && !isExpanded
                ? combinedBullets.slice(0, previewBulletRows)
                : combinedBullets;
              const canExpand = expandable && combinedBullets.length > previewBulletRows;
              return (
                <TabsContent key={step.id || `content-${step.title}-${index}`} value={`golden-section-${index}`} className="mt-0 space-y-2.5">
                  {parsedDescription.text ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{parsedDescription.text}</p>
                  ) : null}
                  {visibleBullets.length > 0 ? (
                    <div
                      role={canExpand ? 'button' : undefined}
                      tabIndex={canExpand ? 0 : -1}
                      className={canExpand ? 'cursor-pointer' : ''}
                      onClick={() => {
                        if (!canExpand) return;
                        setInteractiveSectionsExpanded((current) => !current);
                      }}
                      onKeyDown={(event) => {
                        if (!canExpand) return;
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setInteractiveSectionsExpanded((current) => !current);
                      }}
                      aria-label={canExpand ? (isExpanded ? 'Collapse section details' : 'Expand section details') : undefined}
                    >
                    <ul className="space-y-1 list-disc pl-5">
                      {visibleBullets.map((itemText, itemIndex) => (
                        <li key={`${step.id || index}-${itemIndex}`} className="text-sm leading-snug">
                          {itemText}
                        </li>
                      ))}
                    </ul>
                    </div>
                  ) : null}
                  {canExpand ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-0 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setInteractiveSectionsExpanded((current) => !current)}
                    >
                      {isExpanded ? 'Show less' : 'Show more'}
                    </Button>
                  ) : null}
                  {!parsedDescription.text && combinedBullets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No details yet.</p>
                  ) : null}
                </TabsContent>
              );
            })}
          </div>
        </Tabs>
      </div>
    );
  };

  const handleBannerExpandToggle = () => {
    setIsBannerExpanded((current) => {
      const next = !current;
      if (!next) setIsBannerVideoPlaying(false);
      return next;
    });
  };

  const renderBanner = effectiveBannerUrl ? (
    <div className="relative w-full overflow-hidden rounded-md border border-border/40 text-left">
      {!isBannerExpanded ? (
        <button
          type="button"
          className="w-full text-left"
          onClick={handleBannerExpandToggle}
          title="Expand banner"
        >
          <div className="aspect-[3/1] w-full">
            <img
              src={effectiveBannerUrl}
              alt="Blueprint banner"
              className="h-full w-full object-cover object-center rounded-md"
              loading="lazy"
            />
          </div>
        </button>
      ) : (
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-md">
          <div className="aspect-video w-full bg-black/5">
            {hasInlineVideo && isBannerVideoPlaying ? (
              <iframe
                src={youtubeEmbedUrl}
                title="Blueprint source video"
                className="h-full w-full border-0"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : hasInlineVideo ? (
              <button
                type="button"
                className="relative h-full w-full text-left"
                onClick={() => setIsBannerVideoPlaying(true)}
                title="Play source video"
              >
                <img
                  src={effectiveBannerUrl}
                  alt="Blueprint banner"
                  className="h-full w-full object-cover object-center"
                  loading="lazy"
                />
                <span className="absolute bottom-3 left-3 inline-flex items-center rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                  Play video
                </span>
              </button>
            ) : (
              <img
                src={effectiveBannerUrl}
                alt="Blueprint banner"
                className="h-full w-full object-cover object-center"
                loading="lazy"
              />
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm"
        onClick={handleBannerExpandToggle}
        title={isBannerExpanded ? 'Collapse banner' : 'Expand banner'}
        aria-label={isBannerExpanded ? 'Collapse banner' : 'Expand banner'}
      >
        {isBannerExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
  ) : null;

  return (
    <PageRoot>
      <AppHeader />

      <PageMain className="space-y-6">
        {isLoading ? (
          <div className="border border-border/40 px-3 py-3 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : blueprint ? (
          <>
            <PageSection className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">
                {resolveChannelLabelForBlueprint(blueprint.tags.map((tag) => tag.slug))}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate(-1)}
                    aria-label="Go back"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h1 className="text-2xl font-semibold leading-tight break-words">{decodeHtmlEntities(blueprint.title)}</h1>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {sourceChannel?.sourcePagePath ? (
                    <Link to={sourceChannel.sourcePagePath} className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={sourceChannel?.avatarUrl || undefined}
                        />
                        <AvatarFallback className="text-[10px]">
                          {(sourceChannel?.title || (isSourceChannelResolved && sourceChannelLookupFailed ? (blueprint.creator_profile?.display_name || 'U') : 'S'))
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground truncate hover:underline">
                        {sourceChannel?.title || (isSourceChannelResolved && sourceChannelLookupFailed ? (blueprint.creator_profile?.display_name || 'Anonymous') : 'Source')}
                      </span>
                    </Link>
                  ) : (
                    <>
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={sourceChannel?.avatarUrl || undefined}
                        />
                        <AvatarFallback className="text-[10px]">
                          {(sourceChannel?.title || (isSourceChannelResolved && sourceChannelLookupFailed ? (blueprint.creator_profile?.display_name || 'U') : 'S'))
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground truncate">
                        {sourceChannel?.title || (isSourceChannelResolved && sourceChannelLookupFailed ? (blueprint.creator_profile?.display_name || 'Anonymous') : 'Source')}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  {compactSourceViewCount ? (
                    <span>{compactSourceViewCount} views</span>
                  ) : null}
                  <span>{formatDistanceToNow(new Date(blueprint.created_at), { addSuffix: true })}</span>
                </div>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                  {displayTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="outline"
                      className="text-xs cursor-pointer transition-colors border bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/60"
                      onClick={() => handleTagClick(tag.slug)}
                    >
                      {tag.slug}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canRefreshYouTubeComments ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => youtubeCommentsRefresh.mutate()}
                      disabled={youtubeCommentsRefresh.isPending}
                      aria-label={youtubeCommentsRefresh.isPending ? 'Refreshing YouTube data' : 'Refresh YouTube data'}
                      title={youtubeCommentsRefresh.isPending ? 'Refreshing YouTube data' : 'Refresh YouTube data'}
                    >
                      <RefreshCw className={`h-4 w-4 ${youtubeCommentsRefresh.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`shrink-0 ${blueprint.user_liked ? 'text-red-500' : 'text-muted-foreground'}`}
                    onClick={handleLike}
                  >
                    <Heart className={`h-4 w-4 ${blueprint.user_liked ? 'fill-current' : ''}`} />
                    <span className="ml-1 text-xs">{blueprint.likes_count}</span>
                  </Button>
                </div>
              </div>

              
            </PageSection>

            <PageDivider />
            <section className="space-y-4">

              {blueprint.mix_notes && (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{blueprint.mix_notes}</p>
              )}

              {hasCanonicalSections ? (
                <>
                  {renderGoldenGroup(effectiveTopSummarySection ? [effectiveTopSummarySection] : [])}
                  {renderBanner}
                  {renderGoldenGroup(takeawaysSection ? [takeawaysSection] : [])}
                  {renderGoldenGroup(effectiveBleupSection ? [effectiveBleupSection] : [])}
                  {renderGoldenInteractiveGroup(deepDiveInteractiveSections)}
                </>
              ) : (
                <>
                  {renderBanner}
                  <div className="rounded-md border border-border/40 bg-muted/20 px-4 py-3">
                    <h3 className="font-semibold">Legacy blueprint format</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This blueprint does not have canonical `sections_json`, so the current detail view will not
                      reconstruct old step data. Open a newer blueprint or regenerate this one through the current
                      pipeline.
                    </p>
                  </div>
                </>
              )}

              {hasAiReview ? (
                <>
                  <PageDivider />
                  <div>
                    <h3 className="font-semibold">AI Review</h3>
                    <div className="mt-2">
                      <BlueprintAnalysisView review={blueprint.llm_review || ''} density="compact" />
                    </div>
                  </div>
                </>
              ) : null}
            </section>

            <PageDivider />

            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <h2 className="text-lg font-semibold">{commentView === 'youtube' ? 'Comments' : 'Bleu Comments'}</h2>
                <div className="flex shrink-0 flex-nowrap items-center gap-2">
                  {commentView === 'youtube' && canRefreshYouTubeComments ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => youtubeCommentsRefresh.mutate()}
                      disabled={youtubeCommentsRefresh.isPending}
                      aria-label={youtubeCommentsRefresh.isPending ? 'Refreshing YouTube data' : 'Refresh YouTube data'}
                      title={youtubeCommentsRefresh.isPending ? 'Refreshing YouTube data' : 'Refresh YouTube data'}
                    >
                      <RefreshCw className={`h-4 w-4 ${youtubeCommentsRefresh.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                  ) : null}
                  <Select value={commentView} onValueChange={(value) => setCommentView(value as 'youtube' | 'community')}>
                    <SelectTrigger className="h-9 w-auto min-w-0 border-input px-2.5 outline-none ring-0 transition-none [-webkit-tap-highlight-color:transparent] focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:ring-0 data-[state=open]:ring-offset-0 [&>svg]:hidden">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youtube">YouTube</SelectItem>
                      <SelectItem value="community">Bleu</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={commentView === 'youtube' ? youtubeCommentSort : communityCommentSort}
                    onValueChange={(value) => {
                      const next = value as 'top' | 'new';
                      if (commentView === 'youtube') {
                        setYouTubeCommentSort(next);
                      } else {
                        setCommunityCommentSort(next);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 w-auto min-w-0 border-input px-2.5 outline-none ring-0 transition-none [-webkit-tap-highlight-color:transparent] focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=open]:ring-0 data-[state=open]:ring-offset-0 [&>svg]:hidden">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top">Top</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {commentView === 'youtube' ? (
                youtubeCommentsLoading ? (
                  <div className="space-y-3 border-y border-border/40 py-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : youtubeComments && youtubeComments.length > 0 ? (
                  <div className="divide-y divide-border/40 border-y border-border/40">
                    {youtubeComments.map((row) => (
                      <div key={row.id} className="py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={row.author_avatar_url || undefined} />
                            <AvatarFallback>
                              {(row.author_name || 'YT').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {row.author_name || 'YouTube user'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {row.published_at
                                ? formatDistanceToNow(new Date(row.published_at), { addSuffix: true })
                                : 'Unknown time'}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm">{row.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No source comments available.</p>
                )
              ) : (
                <>
                  <div className="space-y-2 border border-border/40 px-3 py-3">
                    <Textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Share your thoughts"
                      rows={3}
                    />
                    <Button onClick={handleSubmitComment} disabled={createComment.isPending}>
                      Post Comment
                    </Button>
                  </div>

                  {commentsLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : comments && comments.length > 0 ? (
                    <div className="divide-y divide-border/40 border-y border-border/40">
                      {comments.map((row) => (
                        <div key={row.id} className="py-3">
                          <Link
                            to={`/u/${row.user_id}`}
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity w-fit"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={row.profile?.avatar_url || undefined} />
                              <AvatarFallback>
                                {(row.profile?.display_name || 'U').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">
                                {row.profile?.display_name || 'Anonymous'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                              </p>
                            </div>
                          </Link>
                          <p className="text-sm mt-2">{row.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No comments yet.</p>
                  )}
                </>
              )}
            </section>
          </>
        ) : (
          <div className="border border-border/40 py-12 text-center">Blueprint not found.</div>
        )}
        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}
