import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Youtube, Layers, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useTagsBySlugs } from '@/hooks/useTags';
import { getChannelIcon } from '@/lib/channelIcons';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { buildUrlWithChannel, getCatalogChannelTagSlugs, isPostableChannelSlug } from '@/lib/channelPostContext';

type CreateFlowStep = 'pick_channel' | 'pick_source';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetChannelSlug?: string | null;
}

export function CreateBlueprintFlowModal({ open, onOpenChange, presetChannelSlug }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { getFollowState, joinChannel } = useTagFollows();

  const [step, setStep] = useState<CreateFlowStep>('pick_channel');
  const [search, setSearch] = useState('');
  const [selectedChannelSlug, setSelectedChannelSlug] = useState<string | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const catalogTagSlugs = useMemo(() => getCatalogChannelTagSlugs(), []);
  const { data: tagsBySlugs = [], isLoading: tagsLoading } = useTagsBySlugs(open ? catalogTagSlugs : []);
  const tagIdBySlug = useMemo(() => {
    const map = new Map<string, string>();
    tagsBySlugs.forEach((t) => map.set(t.slug, t.id));
    return map;
  }, [tagsBySlugs]);

  const postableChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CHANNELS_CATALOG
      .filter((c) => isPostableChannelSlug(c.slug))
      .filter((c) => {
        if (!q) return true;
        return (
          c.slug.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.priority - b.priority);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setPendingSlug(null);

    if (presetChannelSlug && isPostableChannelSlug(presetChannelSlug)) {
      setSelectedChannelSlug(presetChannelSlug);
      setStep('pick_source');
      return;
    }

    setSelectedChannelSlug(null);
    setStep('pick_channel');
  }, [open, presetChannelSlug]);

  async function handleSelectChannel(channelSlug: string, channelTagSlug: string) {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to post a blueprint.',
        variant: 'destructive',
      });
      onOpenChange(false);
      navigate('/auth');
      return;
    }

    const tagId = tagIdBySlug.get(channelTagSlug) || null;
    if (!tagId) {
      toast({
        title: 'Channel not ready',
        description: 'Channel activation pending. Please try another channel.',
        variant: 'destructive',
      });
      return;
    }

    const state = getFollowState({ id: tagId });
    if (state === 'joining' || state === 'leaving') return;

    if (state !== 'joined') {
      setPendingSlug(channelSlug);
      try {
        await joinChannel({ id: tagId, slug: channelTagSlug });
        toast({
          title: `Joined b/${channelSlug}`,
          description: 'You can post in this channel now.',
        });
      } catch (error) {
        toast({
          title: 'Join failed',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
        return;
      } finally {
        setPendingSlug(null);
      }
    }

    setSelectedChannelSlug(channelSlug);
    setStep('pick_source');
  }

  function goToSource(source: 'library' | 'youtube') {
    if (!selectedChannelSlug) return;
    const extra = { intent: 'post' };
    const target = source === 'library'
      ? buildUrlWithChannel('/inventory', selectedChannelSlug, extra)
      : buildUrlWithChannel('/youtube', selectedChannelSlug, extra);
    onOpenChange(false);
    navigate(target);
  }

  const title = step === 'pick_channel' ? 'Where do you want to post?' : 'How do you want to create?';
  const description = step === 'pick_channel'
    ? 'Pick a curated channel. You will join automatically when you select it.'
    : selectedChannelSlug
      ? `Posting to b/${selectedChannelSlug}`
      : 'Pick a source.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {step === 'pick_channel' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search channels..."
              />
            </div>

            <div className="max-h-[52vh] overflow-auto rounded-md border border-border/50">
              {postableChannels.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No channels match your search.</div>
              ) : (
                <div className="divide-y divide-border/40">
                  {postableChannels.map((channel) => {
                    const ChannelIcon = getChannelIcon(channel.icon);
                    const tagId = tagIdBySlug.get(channel.tagSlug) || null;
                    const state = tagId ? getFollowState({ id: tagId }) : 'not_joined';
                    const isJoined = state === 'joined' || state === 'leaving';
                    const isPending = pendingSlug === channel.slug || state === 'joining' || state === 'leaving';
                    const isDisabled = tagsLoading || !tagId || !!pendingSlug;

                    return (
                      <button
                        key={channel.slug}
                        type="button"
                        className="w-full text-left p-3 hover:bg-muted/20 transition-colors disabled:opacity-60 disabled:hover:bg-transparent"
                        disabled={isDisabled}
                        onClick={() => handleSelectChannel(channel.slug, channel.tagSlug)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                              <ChannelIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <div className="text-sm font-semibold">{channel.name}</div>
                              <div className="text-xs text-muted-foreground line-clamp-2">{channel.description}</div>
                              {!tagId && !tagsLoading && (
                                <div className="text-[11px] text-muted-foreground">Channel activation pending</div>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                            {isJoined ? (
                              <span className="text-xs text-muted-foreground">Joined</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Select</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Card className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm font-semibold">Library</div>
                </div>
                <div className="text-xs text-muted-foreground">Build from a library you already have.</div>
                <Button onClick={() => goToSource('library')} className="mt-2">
                  Continue
                </Button>
              </Card>

              <Card className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Youtube className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm font-semibold">YouTube</div>
                </div>
                <div className="text-xs text-muted-foreground">Generate a blueprint from a YouTube video.</div>
                <Button onClick={() => goToSource('youtube')} className="mt-2">
                  Continue
                </Button>
              </Card>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('pick_channel')}>
                Back
              </Button>
              <Button variant="outline" onClick={() => { onOpenChange(false); }} className="gap-2">
                <Plus className="h-4 w-4" />
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
