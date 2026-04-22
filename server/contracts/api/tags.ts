export type TagRouteItem = {
  id: string;
  slug: string;
  follower_count: number;
  created_at: string;
  is_following?: boolean;
};

export type FollowedTagRouteItem = {
  id: string;
  slug: string;
  created_at: string;
};

export type TagsRouteDeps = {
  listTags: (input: {
    viewerUserId: string | null;
    limit?: number;
  }) => Promise<TagRouteItem[]>;
  listTagsBySlugs: (input: {
    slugs: string[];
    viewerUserId: string | null;
  }) => Promise<TagRouteItem[]>;
  listFollowedTags: (input: {
    userId: string;
    limit?: number;
  }) => Promise<FollowedTagRouteItem[]>;
  setTagFollowed: (input: {
    tagId: string;
    userId: string;
    followed: boolean;
  }) => Promise<TagRouteItem | null>;
  clearTagFollows: (input: {
    tagIds: string[];
    userId: string;
  }) => Promise<{ removedCount: number }>;
  createTag: (input: {
    slug: string;
    userId: string;
    follow?: boolean;
  }) => Promise<TagRouteItem | null>;
};
