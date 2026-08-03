export type CommentTargetItem = { id: string };
export type CommentTargetDecision = { type: 'scroll'; index: number } | { type: 'load-more' } | { type: 'missing' } | { type: 'none' };

export function commentTargetDecision(input: { targetId?: string; comments: CommentTargetItem[]; loading: boolean; loadingMore: boolean; hasMore: boolean; handledTarget?: string | null }): CommentTargetDecision {
  const { targetId, comments, loading, loadingMore, hasMore, handledTarget } = input;
  if (!targetId || loading || loadingMore || handledTarget === targetId) return { type: 'none' };
  const index = comments.findIndex((comment) => comment.id === targetId);
  if (index >= 0) return { type: 'scroll', index };
  if (hasMore) return { type: 'load-more' };
  return { type: 'missing' };
}
