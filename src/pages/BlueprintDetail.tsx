import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { BlueprintAnalysisView } from '@/components/blueprint/BlueprintAnalysisView';
import { useBlueprint, useBlueprintComments, useCreateBlueprintComment, useToggleBlueprintLike } from '@/hooks/useBlueprints';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, GitBranch, Heart } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

type ItemValue = string | { name?: string; context?: string };

function formatItem(item: ItemValue) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item);
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

export default function BlueprintDetail() {
  const navigate = useNavigate();
  const { blueprintId } = useParams();
  const { data: blueprint, isLoading } = useBlueprint(blueprintId);
  const { data: comments, isLoading: commentsLoading } = useBlueprintComments(blueprintId);
  const createComment = useCreateBlueprintComment();
  const toggleLike = useToggleBlueprintLike();
  const { toast } = useToast();
  const [comment, setComment] = useState('');

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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ) : blueprint ? (
          <>
            <section className="space-y-2">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(-1)}
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-3xl font-semibold">{blueprint.title}</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                {blueprint.tags.map((tag) => (
                  <Badge key={tag.id} variant="outline">#{tag.slug}</Badge>
                ))}
              </div>
            </section>

            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={blueprint.creator_profile?.avatar_url || undefined} />
                      <AvatarFallback>
                        {(blueprint.creator_profile?.display_name || 'U').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {blueprint.creator_profile?.display_name || 'Anonymous'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(blueprint.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground"
                      asChild
                    >
                      <Link to={`/blueprint/${blueprint.id}/remix`} aria-label="Remix blueprint">
                        <GitBranch className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={blueprint.user_liked ? 'text-red-500' : 'text-muted-foreground'}
                      onClick={handleLike}
                    >
                      <Heart className={`h-4 w-4 ${blueprint.user_liked ? 'fill-current' : ''}`} />
                      <span className="ml-1 text-xs">{blueprint.likes_count}</span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {blueprint.mix_notes && (
                  <div>
                    <h3 className="font-semibold">Mix notes</h3>
                    <p className="text-sm text-muted-foreground mt-1">{blueprint.mix_notes}</p>
                  </div>
                )}
                <div>
                  <h3 className="font-semibold">Selected items</h3>
                  <div className="mt-2 space-y-2">
                    {parseSelectedItems(blueprint.selected_items).map(([category, items]) => (
                      <div key={category} className="rounded-lg border border-border/60 p-3">
                        <p className="text-sm font-medium">{category}</p>
                        <p className="text-sm text-muted-foreground">
                          {items.length > 0 ? items.map(formatItem).join(', ') : 'No items listed'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold">LLM Review</h3>
                  <div className="mt-3">
                    <BlueprintAnalysisView review={blueprint.llm_review || ''} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
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
                  <div className="space-y-3">
                    {comments.map((row) => (
                      <div key={row.id} className="rounded-lg border border-border/60 p-3">
                        <div className="flex items-center gap-2">
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
                        </div>
                        <p className="text-sm mt-2">{row.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">Blueprint not found.</CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
