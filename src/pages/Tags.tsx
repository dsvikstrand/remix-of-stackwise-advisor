import { useMemo, useState } from 'react';
import { useTagsDirectory } from '@/hooks/useTags';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { normalizeTag } from '@/lib/tagging';

export default function Tags() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { tags, isLoading, followTag, unfollowTag, muteTag, unmuteTag, createTag, isUpdating } = useTagsDirectory();

  const [search, setSearch] = useState('');
  const [newTag, setNewTag] = useState('');

  const filteredTags = useMemo(() => {
    const query = normalizeTag(search);
    if (!query) return tags;
    return tags.filter((tag) => tag.slug.includes(query));
  }, [search, tags]);

  const handleCreate = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to create or follow tags.',
      });
      return;
    }

    const slug = normalizeTag(newTag);
    if (!slug) {
      toast({
        title: 'Invalid tag',
        description: 'Use letters, numbers, and dashes only.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createTag(slug);
      setNewTag('');
      toast({
        title: 'Tag created',
        description: `#${slug} is ready to follow.`,
      });
    } catch (error) {
      toast({
        title: 'Failed to create tag',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Tag Directory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Search tags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button variant="outline" onClick={() => setSearch('')}>Clear</Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Create a tag (e.g. sleep, pre-workout)"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                disabled={isUpdating}
              />
              <Button onClick={handleCreate} disabled={isUpdating}>
                Create Tag
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center text-muted-foreground">Loading tags...</div>
        ) : filteredTags.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground">No tags found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTags.map((tag) => (
              <Card key={tag.id}>
                <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">#{tag.slug}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {tag.follower_count} follower{tag.follower_count === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tag.is_following ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!user) {
                            toast({
                              title: 'Sign in required',
                              description: 'Please sign in to manage tags.',
                            });
                            return;
                          }
                          unfollowTag(tag.id).catch((error) => {
                            toast({
                              title: 'Failed to unfollow',
                              description: error instanceof Error ? error.message : 'Please try again',
                              variant: 'destructive',
                            });
                          });
                        }}
                        disabled={isUpdating}
                      >
                        Unfollow
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!user) {
                            toast({
                              title: 'Sign in required',
                              description: 'Please sign in to manage tags.',
                            });
                            return;
                          }
                          followTag(tag.id).catch((error) => {
                            toast({
                              title: 'Failed to follow',
                              description: error instanceof Error ? error.message : 'Please try again',
                              variant: 'destructive',
                            });
                          });
                        }}
                        disabled={isUpdating}
                      >
                        Follow
                      </Button>
                    )}

                    {tag.is_muted ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!user) {
                            toast({
                              title: 'Sign in required',
                              description: 'Please sign in to manage tags.',
                            });
                            return;
                          }
                          unmuteTag(tag.id).catch((error) => {
                            toast({
                              title: 'Failed to unmute',
                              description: error instanceof Error ? error.message : 'Please try again',
                              variant: 'destructive',
                            });
                          });
                        }}
                        disabled={isUpdating}
                      >
                        Unmute
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!user) {
                            toast({
                              title: 'Sign in required',
                              description: 'Please sign in to manage tags.',
                            });
                            return;
                          }
                          muteTag(tag.id).catch((error) => {
                            toast({
                              title: 'Failed to mute',
                              description: error instanceof Error ? error.message : 'Please try again',
                              variant: 'destructive',
                            });
                          });
                        }}
                        disabled={isUpdating}
                      >
                        Mute
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
