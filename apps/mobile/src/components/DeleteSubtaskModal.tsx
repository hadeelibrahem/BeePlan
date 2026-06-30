import { Modal, Text, TouchableOpacity, View } from 'react-native';

const palette = {
  bg: '#1F2937',
  card: '#2B3443',
  border: 'rgba(255,255,255,0.08)',
  muted: '#94A3B8',
};

type Props = {
  visible: boolean;
  subtaskTitle?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteSubtaskModal({ visible, subtaskTitle, onCancel, onConfirm }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center p-6" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <View className="w-full max-w-md rounded-3xl border p-6" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
          <View className="mx-auto mb-5 h-16 w-16 items-center justify-center rounded-full border border-red-400/50" style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}>
            <Text className="text-2xl font-black text-red-300">!</Text>
          </View>

          <Text className="text-center text-xl font-black text-white">Delete Subtask?</Text>
          <Text className="mt-3 text-center text-sm leading-5" style={{ color: palette.muted }}>
            This action cannot be undone. Are you sure you want to permanently delete
            {subtaskTitle ? <Text className="font-bold text-white"> "{subtaskTitle}"</Text> : ' this subtask'}?
          </Text>

          <View className="mt-7 flex-row gap-3">
            <TouchableOpacity onPress={onCancel} className="flex-1 rounded-2xl border py-4" style={{ borderColor: palette.border }}>
              <Text className="text-center font-black text-white">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} className="flex-1 rounded-2xl bg-red-500 py-4">
              <Text className="text-center font-black text-white">Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
