export type DeleteAlertButton = {
  text: string;
  style?: 'cancel' | 'default' | 'destructive';
  onPress?: () => void;
};

export type ShowDeleteAlert = (title: string, message?: string, buttons?: DeleteAlertButton[]) => void;

export function createTaskDeleteConfirmationController(
  executeDelete: () => Promise<void> | void,
  showAlert: ShowDeleteAlert,
) {
  let pendingDelete: Promise<void> | null = null;

  const confirm = (): Promise<void> => {
    if (pendingDelete) return pendingDelete;

    const deletion = Promise.resolve()
      .then(executeDelete)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not delete task.';
        showAlert('Failed to delete task', message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => void confirm() },
        ]);
      })
      .finally(() => {
        if (pendingDelete === deletion) pendingDelete = null;
      });

    pendingDelete = deletion;
    return deletion;
  };

  return {
    requestConfirmation(taskTitle: string) {
      showAlert(
        'Delete Task?',
        `Delete "${taskTitle}"?\n\nRelated subtasks and attachments may also be removed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void confirm() },
        ],
      );
    },
    confirm,
    get isDeleting() {
      return pendingDelete !== null;
    },
  };
}
