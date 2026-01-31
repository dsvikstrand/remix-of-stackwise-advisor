import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers, Package, Heart, Activity, ArrowRight } from 'lucide-react';
import { useUserBlueprints, useUserInventories, useUserLikedBlueprints, useUserActivity } from '@/hooks/useUserProfile';
import type { Json } from '@/integrations/supabase/types';

interface ProfileTabsProps {
  userId: string;
}

function countItems(selected: Json) {
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) return 0;
  return Object.values(selected as Record<string, unknown[]>).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
    0
  );
}

export function ProfileTabs({ userId }: ProfileTabsProps) {
  const { data: blueprints, isLoading: blueprintsLoading } = useUserBlueprints(userId, 4);
  const { data: inventories, isLoading: inventoriesLoading } = useUserInventories(userId, 4);
  const { data: likedBlueprints, isLoading: likedLoading } = useUserLikedBlueprints(userId, 4);
  const { data: activities, isLoading: activityLoading } = useUserActivity(userId, 4);

  return (
    <Tabs defaultValue="blueprints" className="w-full">
      <TabsList className="w-full justify-start">
        <TabsTrigger value="blueprints" className="gap-1.5">
          <Layers className="h-4 w-4" />
          Blueprints
        </TabsTrigger>
        <TabsTrigger value="inventories" className="gap-1.5">
          <Package className="h-4 w-4" />
          Inventories
        </TabsTrigger>
        <TabsTrigger value="liked" className="gap-1.5">
          <Heart className="h-4 w-4" />
          Liked
        </TabsTrigger>
        <TabsTrigger value="activity" className="gap-1.5">
          <Activity className="h-4 w-4" />
          Activity
        </TabsTrigger>
      </TabsList>

      <TabsContent value="blueprints" className="mt-4">
        {blueprintsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : blueprints && blueprints.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {blueprints.map((bp) => (
              <Link key={bp.id} to={`/blueprint/${bp.id}`}>
                <Card className="h-full transition hover:border-primary/40">
                  <CardContent className="p-4">
                    <h4 className="font-medium truncate">{bp.title}</h4>
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <Badge variant="secondary" className="text-xs">
                        {countItems(bp.selected_items)} items
                      </Badge>
                      <span>•</span>
                      <Heart className="h-3 w-3" />
                      <span>{bp.likes_count}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Layers className="h-8 w-8" />} message="No public blueprints yet" />
        )}
      </TabsContent>

      <TabsContent value="inventories" className="mt-4">
        {inventoriesLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : inventories && inventories.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {inventories.map((inv) => (
              <Link key={inv.id} to={`/inventory/${inv.id}`}>
                <Card className="h-full transition hover:border-primary/40">
                  <CardContent className="p-4">
                    <h4 className="font-medium truncate">{inv.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {inv.prompt_categories}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <Heart className="h-3 w-3" />
                      <span>{inv.likes_count}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Package className="h-8 w-8" />} message="No public inventories yet" />
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

      <TabsContent value="activity" className="mt-4">
        {activityLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : activities && activities.length > 0 ? (
          <div className="space-y-3">
            {activities.map((activity) => (
              <Link key={activity.id} to={`/blueprint/${activity.target_id}`}>
                <Card className="transition hover:border-primary/40">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      {activity.type === 'blueprint_created' && <Layers className="h-4 w-4 text-primary" />}
                      {activity.type === 'blueprint_liked' && <Heart className="h-4 w-4 text-destructive" />}
                      {activity.type === 'comment' && <Activity className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Activity className="h-8 w-8" />} message="No recent activity" />
        )}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
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
