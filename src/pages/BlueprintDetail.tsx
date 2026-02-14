import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { BlueprintAnalysisView } from '@/components/blueprint/BlueprintAnalysisView';
import { useBlueprint, useBlueprintComments, useCreateBlueprintComment, useToggleBlueprintLike } from '@/hooks/useBlueprints';
import { useToast } from '@/hooks/use-toast';
import { useTagFollows } from '@/hooks/useTagFollows';
import { ArrowLeft, Heart, Maximize2, Minimize2 } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { logMvpEvent } from '@/lib/logEvent';
import { PageDivider, PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { resolveChannelLabelForBlueprint } from '@/lib/channelMapping';

type ItemValue = string | { name?: string; context?: string };
type StepItem = { category?: string; name?: string; context?: string };
type BlueprintStep = { id?: string; title?: string; description?: string | null; items?: StepItem[] };

function formatItem(item: ItemValue) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item);
  const name = typeof item.name === 'string' ? item.name : 'Untitled';
  const context = typeof item.context === 'string' && item.context.trim() ? item.context.trim() : '';
  return context ? `${name} [${context}]` : name;
}

function formatStepItem(item: StepItem) {
  const name = typeof item.name === 'string' ? item.name : 'Untitled';
  const context = typeof item.context === 'string' && item.context.trim() ? item.context.trim() : '';
  return context ? `${name} [${context}]` : name;
}

function parseSelectedItems(selected: Json) {
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) {
    return [] as Array<[string, ItemValue[]]>;
  }
  return Object.entries(selected as Record<string, ItemValue[]>).filter(([, items]) => Array.isArray(items));
}

function parseSteps(steps: Json) {
  if (!steps || typeof steps !== 'object') return [] as BlueprintStep[];
  if (!Array.isArray(steps)) return [] as BlueprintStep[];
  return steps.filter((step): step is BlueprintStep => !!step && typeof step === 'object');
}

export default function BlueprintDetail() {
  const navigate = useNavigate();
  const { blueprintId } = useParams();
  const { data: blueprint, isLoading } = useBlueprint(blueprintId);
  const { data: comments, isLoading: commentsLoading } = useBlueprintComments(blueprintId);
  const createComment = useCreateBlueprintComment();
  const toggleLike = useToggleBlueprintLike();
  const { toast } = useToast();
  const { user } = useAuth();
  const { followedIds, toggleFollow } = useTagFollows();
  const [comment, setComment] = useState('');
  const [isBannerExpanded, setIsBannerExpanded] = useState(true);
  const location = useLocation();
  const loggedBlueprintId = useRef<string | null>(null);
  const steps = blueprint ? parseSteps(blueprint.steps) : [];
  const isOwner = !!(user && blueprint && user.id === blueprint.creator_user_id);

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

  const handleTagToggle = async (tag: { id: string; slug: string }) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to follow tags.',
      });
      return;
    }
    try {
      await toggleFollow(tag);
    } catch (error) {
      toast({
        title: 'Tag update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

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
                  <h1 className="text-2xl font-semibold leading-tight break-words">{blueprint.title}</h1>
                </div>
                {isOwner && (
                  <Link to={`/blueprint/${blueprint.id}/edit`} className="shrink-0">
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <Link
                  to={`/u/${blueprint.creator_user_id}`}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={blueprint.creator_profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px]">
                      {(blueprint.creator_profile?.display_name || 'U').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground truncate">
                    {blueprint.creator_profile?.display_name || 'Anonymous'}
                  </span>
                </Link>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(blueprint.created_at), { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                  {blueprint.tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="outline"
                      className={`text-xs cursor-pointer transition-colors border ${
                        followedIds.has(tag.id)
                          ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/20'
                          : 'bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/60'
                      }`}
                      onClick={() => handleTagToggle(tag)}
                    >
                      #{tag.slug}
                    </Badge>
                  ))}
                </div>
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
            </PageSection>

            <PageDivider />
            <section className="space-y-4">

              {blueprint.mix_notes && (
                <p className="text-sm text-muted-foreground">{blueprint.mix_notes}</p>
              )}

              {blueprint.banner_url && (
                <button
                  type="button"
                  className="relative w-full overflow-hidden rounded-md border border-border/40 bg-muted/30 p-2 text-left"
                  onClick={() => setIsBannerExpanded((current) => !current)}
                  title={isBannerExpanded ? 'Collapse banner' : 'Expand banner'}
                >
                  {isBannerExpanded ? (
                    <img
                      src={blueprint.banner_url}
                      alt="Blueprint banner"
                      className="w-full h-auto max-h-[560px] object-contain rounded-md"
                      loading="lazy"
                    />
                  ) : (
                    <div className="aspect-[3/1] w-full">
                      <img
                        src={blueprint.banner_url}
                        alt="Blueprint banner"
                        className="h-full w-full object-cover object-center rounded-md"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <span className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm">
                    {isBannerExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </span>
                </button>
              )}

              <div>
                {steps.length > 0 ? (
                  <>
                    <h3 className="font-semibold">Steps</h3>
                    <div className="mt-2 space-y-2">
                      {steps.map((step, index) => (
                        <div key={step.id || `${step.title}-${index}`} className="rounded-md border border-border/40 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              {step.title?.trim() ? step.title : `Step ${index + 1}`}
                            </p>
                            {step.items && step.items.length > 0 ? (
                              <Badge variant="secondary" className="text-xs">
                                {step.items.length} items
                              </Badge>
                            ) : null}
                          </div>
                          {step.description && (
                            <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                          )}
                          <div className="mt-1.5 space-y-1.5">
                            {step.items && step.items.length > 0 ? (
                              step.items.map((item, itemIndex) => (
                                <div key={`${step.id || index}-${itemIndex}`} className="text-sm">
                                  <p className="text-sm leading-snug">{formatStepItem(item)}</p>
                                  {item.category && (
                                    <p className="text-xs text-muted-foreground">{item.category}</p>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">No items assigned.</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold">Selected items</h3>
                    <div className="mt-2 space-y-2">
                      {parseSelectedItems(blueprint.selected_items).map(([category, items]) => (
                        <div key={category} className="rounded-md border border-border/40 p-3">
                          <p className="text-sm font-medium">{category}</p>
                          <p className="text-sm text-muted-foreground">
                            {items.length > 0 ? items.map(formatItem).join(', ') : 'No items listed'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <PageDivider />

              <div>
                <h3 className="font-semibold">AI Review</h3>
                <div className="mt-2">
                  <BlueprintAnalysisView review={blueprint.llm_review || ''} density="compact" />
                </div>
              </div>
            </section>

            <PageDivider />

            <section className="space-y-4">
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-lg font-semibold">Comments</h2>
              </div>

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
