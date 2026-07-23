export type FocusDisplayItem = {
  taskTitle: string | null;
  subtaskId?: string | null;
  subtaskTitle?: string | null;
};

/** Keeps every Focus surface focused on the selected work unit. */
export function focusPrimaryTitle(item: FocusDisplayItem): string {
  return item.subtaskTitle ?? item.taskTitle ?? 'Focus session';
}

export function focusParentLabel(item: FocusDisplayItem): string | null {
  return item.subtaskId ? `Part of: ${item.taskTitle ?? ''}` : null;
}
