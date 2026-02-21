import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Inbox, MessageSquare, Heart, ArrowRight } from 'lucide-react';
import { useUserLikedBlueprints, useUserComments } from '@/hooks/useUserProfile';
import { useProfileFeed } from '@/hooks/useProfileFeed';
import { useMyFeed } from '@/hooks/useMyFeed';
import { MyFeedTimeline } from '@/components/feed/MyFeedTimeline';

interface ProfileTabsProps {
  userId: string;
  isOwnerView: boolean;
  profileIsPublic: boolean;
}

export function ProfileTabs({ userId, isOwnerView, profileIsPublic }: ProfileTabsProps) {
  const { data: myFeedItems, isLoading: myFeedLoading } = useMyFeed();
  const { data: profileFeed, isLoading: profileFeedLoading, isError: profileFeedIsError, error: profileFeedError } = useProfileFeed(userId, !isOwnerView);
  const { data: likedBlueprints, isLoading: likedLoading } = useUserLikedBlueprints(userId, 12);
  const { data: comments, isLoading: commentsLoading } = useUserComments(userId, 20);

  const feedItems = isOwnerView ? myFeedItems : (profileFeed?.items || []);
  const feedLoading = isOwnerView ? myFeedLoading : profileFeedLoading;

  return (
    <Tabs defaultValue="feed" className="w-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="feed" className="gap-1.5">
          <Inbox className="h-4 w-4" />
          Feed
        </TabsTrigger>
        <TabsTrigger value="comments" className="gap-1.5">
          <MessageSquare className="h-4 w-4" />
          Comments
        </TabsTrigger>
        <TabsTrigger value="liked" className="gap-1.5">
          <Heart className="h-4 w-4" />
          Liked
        </TabsTrigger>
      </TabsList>

      <TabsContent value="feed" className="mt-4">
        {!isOwnerView && !profileIsPublic ? (
          <EmptyState icon={<Inbox className="h-8 w-8" />} message="This feed is private." />
        ) : !isOwnerView && profileFeedIsError ? (
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            message={profileFeedError instanceof Error ? profileFeedError.message : 'Failed to load feed.'}
          />
        ) : (
          <MyFeedTimeline
            items={feedItems}
            isLoading={feedLoading}
            isOwnerView={isOwnerView}
            profileUserId={userId}
            showUnlockActivityPanel={false}
            emptyMessage="No feed items yet."
          />
        )}
      </TabsContent>

      <TabsContent value="comments" className="mt-4">
        {commentsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : comments && comments.length > 0 ? (
          <div className="space-y-3">
            {comments.map((row) => (
              <Card key={row.id} className="transition hover:border-primary/40">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm text-muted-foreground line-clamp-2">{row.content}</p>
                    <Link to={`/blueprint/${row.blueprint_id}`} className="text-sm font-medium hover:underline break-words">
                      {row.blueprint_title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={<MessageSquare className="h-8 w-8" />} message="No comments yet." />
        )}
      </TabsContent>

      <TabsContent value="liked" className="mt-4">
        {likedLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : likedBlueprints && likedBlueprints.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {likedBlueprints.map((bp) => (
              <Link key={bp.id} to={`/blueprint/${bp.id}`}>
                <Card className="h-full transition hover:border-primary/40">
                  <CardContent className="p-4">
                    <h4 className="font-medium truncate">{bp.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      by {bp.creator_profile?.display_name || 'Anonymous'}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <Heart className="h-3 w-3 fill-current text-destructive" />
                      <span>{bp.likes_count}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Heart className="h-8 w-8" />} message="No liked blueprints yet" />
        )}
      </TabsContent>

    </Tabs>
  );
}

function EmptyState({ icon, message }: { icon: JSX.Element; message: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
          <p className="text-muted-foreground">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}
