import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useComments, CommentNode } from '@/hooks/useComments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, Reply, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommentsThreadProps {
  postId: string;
}

function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
  onToggleLike,
  currentUserId,
  depth = 0,
}: {
  comment: CommentNode;
  onReply: (commentId: string, body: string) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onToggleLike: (commentId: string, liked: boolean) => Promise<void>;
  currentUserId?: string;
  depth?: number;
}) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [editBody, setEditBody] = useState(comment.body);
  const [visibleReplies, setVisibleReplies] = useState(5);

  const displayName = comment.profile.display_name || 'Anonymous';
  const initials = displayName.slice(0, 2).toUpperCase();
  const isOwner = currentUserId === comment.user_id;
  const isEdited = comment.updated_at !== comment.created_at;

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    await onReply(comment.id, replyBody.trim());
    setReplyBody('');
    setIsReplying(false);
  };

  const handleEdit = async () => {
    if (!editBody.trim()) return;
    await onEdit(comment.id, editBody.trim());
    setIsEditing(false);
  };

  return (
    <div className={cn('space-y-2', depth > 0 && 'border-l border-border/50 pl-4')}>
      <div className="flex gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.profile.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{displayName}</span>
            <span>{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
            {isEdited && <span>(edited)</span>}
          </div>

          {isEditing ? (
            <div className="space-y-2 mt-2">
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleEdit}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm mt-1 whitespace-pre-wrap">{comment.body}</p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs">
            <Button
              variant="ghost"
              size="sm"
              className={comment.user_liked ? 'text-red-500' : ''}
              onClick={() => onToggleLike(comment.id, comment.user_liked)}
            >
              <Heart className={cn('h-3 w-3 mr-1', comment.user_liked && 'fill-current')} />
              {comment.likes_count}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsReplying(!isReplying)}>
              <Reply className="h-3 w-3 mr-1" /> Reply
            </Button>
            {isOwner && (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(!isEditing)}>
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            )}
            {isOwner && (
              <Button variant="ghost" size="sm" onClick={() => onDelete(comment.id)}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            )}
          </div>

          {isReplying && (
            <div className="space-y-2 mt-2">
              <Textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply..."
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleReply}>Reply</Button>
                <Button size="sm" variant="outline" onClick={() => setIsReplying(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {comment.children.length > 0 && (
        <div className="space-y-3">
          {comment.children.slice(0, visibleReplies).map((child) => (
            <CommentItem
              key={child.id}
              comment={child}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleLike={onToggleLike}
              currentUserId={currentUserId}
              depth={depth + 1}
            />
          ))}
          {comment.children.length > visibleReplies && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisibleReplies((count) => count + 5)}
            >
              Load more replies ({comment.children.length - visibleReplies})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function CommentsThread({ postId }: CommentsThreadProps) {
  const { user } = useAuth();
  const [sortMode, setSortMode] = useState<'top' | 'latest'>('top');
  const { comments, isLoading, addComment, updateComment, deleteComment, toggleLike } = useComments(postId, sortMode);
  const [newComment, setNewComment] = useState('');

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await addComment({ body: newComment.trim(), parentId: null });
    setNewComment('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Comments</p>
        <div className="flex items-center gap-2">
          <Button
            variant={sortMode === 'top' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortMode('top')}
          >
            Top
          </Button>
          <Button
            variant={sortMode === 'latest' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortMode('latest')}
          >
            Latest
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={user ? 'Join the discussion...' : 'Sign in to comment'}
          rows={3}
          disabled={!user}
        />
        <Button onClick={handleAddComment} disabled={!user || !newComment.trim()}>
          Post Comment
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={async (commentId, body) => addComment({ body, parentId: commentId })}
              onEdit={async (commentId, body) => updateComment({ commentId, body })}
              onDelete={deleteComment}
              onToggleLike={(commentId, liked) => toggleLike({ commentId, liked })}
              currentUserId={user?.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
