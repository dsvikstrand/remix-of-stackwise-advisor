import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreatorSetupSection } from '@/components/subscriptions/CreatorSetupSection';
import { PwaInstallCta } from '@/components/pwa/PwaInstallCta';
import { useCreatorSetupController } from '@/hooks/useCreatorSetupController';
import { useToast } from '@/hooks/use-toast';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useTagsBySlugs } from '@/hooks/useTags';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { getChannelIcon } from '@/lib/channelIcons';
import { useYouTubeOnboarding } from '@/hooks/useYouTubeOnboarding';

const ONBOARDING_JOINABLE_CHANNELS = CHANNELS_CATALOG
  .filter((c) => c.isJoinEnabled && c.status === 'active')
  .sort((a, b) => a.priority - b.priority);

const ONBOARDING_TAG_SLUGS = ONBOARDING_JOINABLE_CHANNELS.map((c) => c.tagSlug);

function OnboardingChannelPicker({
  onJoinedCountChange,
}: {
  onJoinedCountChange?: (count: number) => void;
}) {
  const { data: tags = [], isLoading: tagsLoading } = useTagsBySlugs(ONBOARDING_TAG_SLUGS);
  const {
    followedIds,
    joinChannel,
    leaveChannel,
    getFollowState,
    isLoading: followsLoading,
  } = useTagFollows();

  const tagBySlug = useMemo(
    () => new Map(tags.map((t) => [t.slug, t])),
    [tags],
  );

  const handleToggle = async (tagId: string, tagSlug: string, isJoined: boolean) => {
    try {
      if (isJoined) {
        await leaveChannel({ id: tagId, slug: tagSlug });
      } else {
        await joinChannel({ id: tagId, slug: tagSlug });
      }
    } catch {
      // useTagFollows already handles error state
    }
  };

  const joinedCount = useMemo(
    () => tags.reduce((count, tag) => (followedIds.has(tag.id) ? count + 1 : count), 0),
    [followedIds, tags],
  );

  useEffect(() => {
    onJoinedCountChange?.(joinedCount);
  }, [joinedCount, onJoinedCountChange]);

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Step 2: Join channels</CardTitle>
        <CardDescription>
          Join at least one channel to finish onboarding. You can update this anytime from Channels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {tagsLoading || followsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
          </div>
        ) : (
          <div className="max-h-[40vh] overflow-y-auto space-y-0.5 pr-1">
            {ONBOARDING_JOINABLE_CHANNELS.map((channel) => {
              const tag = tagBySlug.get(channel.tagSlug);
              const tagId = tag?.id ?? null;
              const state = tagId ? getFollowState({ id: tagId }) : null;
              const isJoined = state === 'joined' || state === 'leaving';
              const isPending = state === 'joining' || state === 'leaving';
              const unavailable = !tagId;

              const ChannelIcon = getChannelIcon(channel.icon);

              return (
                <div
                  key={channel.slug}
                  className="flex items-center justify-between gap-3 py-2 px-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <ChannelIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{channel.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{channel.description}</p>
                    </div>
                  </div>
                  {unavailable ? (
                    <Button size="sm" variant="outline" disabled className="h-7 px-2 text-xs shrink-0">
                      Unavailable
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={isJoined ? 'outline' : 'default'}
                      disabled={isPending}
                      className="h-7 px-2 text-xs shrink-0"
                      onClick={() => handleToggle(tagId!, channel.tagSlug, isJoined)}
                    >
                      {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      {state === 'joining' ? 'Joining...' : state === 'leaving' ? 'Leaving...' : isJoined ? 'Joined' : 'Join'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function WelcomeOnboarding() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const creatorSetup = useCreatorSetupController();
  const onboardingQuery = useYouTubeOnboarding();
  const onboardingRow = onboardingQuery.data;
  const onboardingLoading = onboardingQuery.isLoading || onboardingQuery.isFetching;
  const onboardingError = onboardingQuery.isError;
  const refetchOnboarding = onboardingQuery.refetch;
  const updateOnboarding = onboardingQuery.updateOnboarding;
  const didMarkPromptRef = useRef(false);
  const didRetryMissingRowRef = useRef(false);
  const [joinedChannelCount, setJoinedChannelCount] = useState(0);

  const completeMutation = useMutation({
    mutationFn: async () => updateOnboarding({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }),
    onSuccess: () => {
      navigate('/wall', { replace: true });
    },
    onError: () => {
      toast({
        title: 'Could not finish setup',
        description: 'Please retry in a moment.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (onboardingLoading) return;
    if (onboardingError) return;
    if (!onboardingRow) {
      if (!didRetryMissingRowRef.current) {
        didRetryMissingRowRef.current = true;
        refetchOnboarding();
        return;
      }
      navigate('/wall', { replace: true });
      return;
    }
    if (onboardingRow.status === 'completed') {
      navigate('/wall', { replace: true });
      return;
    }
    if (!onboardingRow.first_prompted_at && !didMarkPromptRef.current) {
      didMarkPromptRef.current = true;
      updateOnboarding({
        first_prompted_at: new Date().toISOString(),
      }).catch(() => {
        didMarkPromptRef.current = false;
      });
    }
  }, [
    navigate,
    onboardingLoading,
    onboardingError,
    onboardingRow,
    updateOnboarding,
    refetchOnboarding,
  ]);
  const canFinishOnboarding = joinedChannelCount > 0;

  if (onboardingQuery.isLoading) {
    return (
      <PageRoot>
        <AppHeader />
        <PageMain className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </PageMain>
      </PageRoot>
    );
  }

  if (onboardingError) {
    return (
      <PageRoot>
        <AppHeader />
        <PageMain className="space-y-6">
          <PageSection>
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="text-base">Could not load onboarding state</CardTitle>
                <CardDescription>
                  Retry to continue setup, or continue to Home and return later.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => refetchOnboarding()}>
                  Retry
                </Button>
                <Button size="sm" asChild>
                  <Link to="/wall">Continue to Home</Link>
                </Button>
              </CardContent>
            </Card>
          </PageSection>
          <AppFooter />
        </PageMain>
      </PageRoot>
    );
  }

  return (
    <PageRoot>
      <AppHeader />

      <PageMain className="space-y-6">
        <PageSection>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Welcome</p>
            <h1 className="text-2xl font-semibold">Set up your starting feed</h1>
            <p className="text-sm text-muted-foreground">
              Add creators if you want to personalize faster, then join at least one Bleu channel to continue.
            </p>
          </div>
        </PageSection>

        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Step 1: Add YouTube creators (optional)</CardTitle>
            <CardDescription>
              Optional. Search creators first, or import your YouTube subscriptions by handle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <PwaInstallCta compact />
            </div>
            <CreatorSetupSection controller={creatorSetup} showBackendDisabledHint />
          </CardContent>
        </Card>

        <OnboardingChannelPicker onJoinedCountChange={setJoinedChannelCount} />

        <Card className="border-border/40">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="text-sm font-medium">Welcome</p>
              {joinedChannelCount <= 0 ? (
                <p className="text-xs text-muted-foreground">Join at least one channel to continue.</p>
              ) : (
                <p className="text-xs text-muted-foreground">You're all set. Continue to your feed.</p>
              )}
            </div>
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={!canFinishOnboarding || completeMutation.isPending || onboardingQuery.isUpdating}
            >
              {completeMutation.isPending ? 'Opening...' : 'Welcome to Bleup'}
            </Button>
          </CardContent>
        </Card>

        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}
