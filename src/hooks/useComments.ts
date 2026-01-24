import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CommentNode {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  likes_count: number;
  created_at: string;
  updated_at: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  };
  user_liked: boolean;
  children: CommentNode[];
}

function buildCommentTree(
  comments: CommentNode[],
  likedSet: Set<string>
): CommentNode[] {
  const map = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  comments.forEach((comment) => {
    map.set(comment.id, {
      ...comment,
      user_liked: likedSet.has(comment.id),
      children: [],
    });
  });

  map.forEach((comment) => {
    if (comment.parent_id && map.has(comment.parent_id)) {
      map.get(comment.parent_id)!.children.push(comment);
    } else {
      roots.push(comment);
    }
  });

  return roots;
}

function sortTree(nodes: CommentNode[], sortMode: 'top' | 'latest') {
  const sortFn = (a: CommentNode, b: CommentNode) => {
    if (sortMode === 'latest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (b.likes_count !== a.likes_count) return b.likes_count - a.likes_count;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  };

  nodes.sort(sortFn);
  nodes.forEach((node) => sortTree(node.children, sortMode));
}

export function useComments(postId: string, sortMode: 'top' | 'latest') {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const commentsQuery = useQuery({
    queryKey: ['wall-comments', postId, user?.id, sortMode],
    queryFn: async () => {
      const { data: commentsData, error: commentsError } = await supabase
        .from('wall_comments')
        .select('id, post_id, user_id, parent_id, body, likes_count, created_at, updated_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (commentsError) throw commentsError;
      if (!commentsData || commentsData.length === 0) return [] as CommentNode[];

      const commentIds = commentsData.map((comment) => comment.id);
      const userIds = [...new Set(commentsData.map((comment) => comment.user_id))];

      const [profilesRes, likesRes] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds),
        user
          ? supabase.from('comment_likes').select('comment_id').eq('user_id', user.id).in('comment_id', commentIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profilesMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      const likedSet = new Set((likesRes.data || []).map((like) => like.comment_id));

      const hydrated = commentsData.map((comment) => ({
        ...comment,
        profile: profilesMap.get(comment.user_id) || { display_name: null, avatar_url: null },
        user_liked: likedSet.has(comment.id),
        children: [],
      })) as CommentNode[];

      const tree = buildCommentTree(hydrated, likedSet);
      sortTree(tree, sortMode);
      return tree;
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId?: string | null }) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase.from('wall_comments').insert({
        post_id: postId,
        user_id: user.id,
        body,
        parent_id: parentId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wall-comments', postId] }),
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, body }: { commentId: string; body: string }) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase
        .from('wall_comments')
        .update({ body })
        .eq('id', commentId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wall-comments', postId] }),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase
        .from('wall_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wall-comments', postId] }),
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async ({ commentId, liked }: { commentId: string; liked: boolean }) => {
      if (!user) throw new Error('Must be logged in');
      if (liked) {
        const { error } = await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wall-comments', postId] }),
  });

  return {
    comments: commentsQuery.data || [],
    isLoading: commentsQuery.isLoading,
    addComment: addCommentMutation.mutateAsync,
    updateComment: updateCommentMutation.mutateAsync,
    deleteComment: deleteCommentMutation.mutateAsync,
    toggleLike: toggleLikeMutation.mutateAsync,
    isUpdating: addCommentMutation.isPending || updateCommentMutation.isPending || deleteCommentMutation.isPending || toggleLikeMutation.isPending,
  };
}
