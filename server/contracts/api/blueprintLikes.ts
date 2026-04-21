export type BlueprintLikeStateRouteItem = {
  blueprint_id: string;
  user_liked: boolean;
  likes_count: number;
};

export type BlueprintLikeStateBatchRouteItem = {
  blueprint_id: string;
  user_liked: boolean;
};

export type BlueprintLikesRouteDeps = {
  getBlueprintRow: (input: { blueprintId: string }) => Promise<{
    id: string;
    creator_user_id: string;
    title: string;
    is_public: boolean;
    likes_count: number;
  } | null>;
  getBlueprintLikeState: (input: {
    blueprintId: string;
    userId: string | null;
  }) => Promise<BlueprintLikeStateRouteItem | null>;
  setBlueprintLiked: (input: {
    blueprintId: string;
    userId: string;
    liked: boolean;
  }) => Promise<BlueprintLikeStateRouteItem | null>;
  listBlueprintLikeStates: (input: {
    blueprintIds: string[];
    userId: string | null;
  }) => Promise<BlueprintLikeStateBatchRouteItem[]>;
  listLikedBlueprintIds: (input: {
    userId: string;
    limit?: number;
  }) => Promise<string[]>;
};
