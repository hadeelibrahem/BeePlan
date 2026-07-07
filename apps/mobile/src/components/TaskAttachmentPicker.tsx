import { useMemo } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

const ALLOWED_TYPES = [
  'image/*',
  'audio/*',
  'video/*',
  'application/pdf',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/html',
] as const;

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

type Props = {
  files: DocumentPicker.DocumentPickerAsset[];
  onChange: (files: DocumentPicker.DocumentPickerAsset[]) => void;
  disabled?: boolean;
  onValidationError?: (message: string) => void;
};

export default function TaskAttachmentPicker({ files, onChange, disabled, onValidationError }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const fileKeySet = useMemo(
    () => new Set(files.map((file) => `${file.uri}:${file.name ?? ''}:${file.size ?? 0}`)),
    [files],
  );

  async function handlePick() {
    if (disabled) return;

    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: ALLOWED_TYPES as any,
    });

    if (result.canceled) return;

    const accepted: DocumentPicker.DocumentPickerAsset[] = [];
    for (const asset of result.assets ?? []) {
      const validationError = getValidationError(asset);
      if (validationError) {
        onValidationError?.(validationError);
        continue;
      }

      const key = `${asset.uri}:${asset.name ?? ''}:${asset.size ?? 0}`;
      if (fileKeySet.has(key) || accepted.some((item) => `${item.uri}:${item.name ?? ''}:${item.size ?? 0}` === key)) {
        continue;
      }

      accepted.push(asset);
    }

    if (accepted.length) {
      onChange([...files, ...accepted]);
    }
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Upload files"
        onPress={() => void handlePick()}
        className="rounded-xl border border-dashed p-4 active:opacity-80"
        style={{
          borderColor: disabled ? colors.border : colors.border,
          backgroundColor: colors.background,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Text className="text-center text-sm font-black" style={{ color: colors.accent }}>
          Upload files
        </Text>
        <Text className="mt-2 text-center text-sm" style={{ color: colors.secondaryText }}>
          Drag-and-drop is available on web. On mobile, tap to browse.
        </Text>
        <Text className="mt-1 text-center text-xs" style={{ color: colors.secondaryText }}>
          Images, PDF, Word, Excel, PowerPoint, and text files
        </Text>
      </Pressable>

      {files.length ? (
        <View className="mt-3 gap-2">
          {files.map((file) => (
            <AttachmentDraftRow
              key={`${file.uri}:${file.name ?? ''}:${file.size ?? 0}`}
              file={file}
              onRemove={() => onChange(files.filter((item) => item.uri !== file.uri))}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AttachmentDraftRow({
  file,
  onRemove,
}: {
  file: DocumentPicker.DocumentPickerAsset;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View className="flex-row items-center gap-3 rounded-xl p-3" style={{ backgroundColor: colors.card }}>
      <View className={`h-9 w-9 items-center justify-center rounded-lg ${attachmentColor(file.mimeType, file.name)}`}>
        <Text className="text-[9px] font-black text-white">{attachmentLabel(file.mimeType, file.name)}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold" style={{ color: colors.text }} numberOfLines={1}>
          {file.name ?? 'Attachment'}
        </Text>
        <Text className="text-xs" style={{ color: colors.secondaryText }}>
          {formatFileSize(file.size)}
          {file.mimeType ? ` - ${file.mimeType}` : ''}
        </Text>
      </View>
      <Pressable onPress={onRemove} className="rounded-lg px-3 py-1.5 active:opacity-80" style={{ backgroundColor: `${colors.error}22` }}>
        <Text className="text-xs font-bold" style={{ color: colors.error }}>
          Remove
        </Text>
      </Pressable>
    </View>
  );
}

function getValidationError(asset: DocumentPicker.DocumentPickerAsset) {
  if (asset.size && asset.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `${asset.name ?? 'Selected file'} is too large. Maximum size is 10MB.`;
  }

  if (asset.mimeType && !isAllowedMimeType(asset.mimeType)) {
    return `${asset.name ?? 'Selected file'} is not a supported file type.`;
  }

  if (!asset.mimeType && asset.name && !isAllowedByExtension(asset.name)) {
    return `${asset.name} is not a supported file type.`;
  }

  return '';
}

function isAllowedMimeType(mimeType: string) {
  return (
    ALLOWED_TYPES.includes(mimeType as (typeof ALLOWED_TYPES)[number]) ||
    mimeType.startsWith('image/') ||
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('text/')
  );
}

function isAllowedByExtension(name: string) {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'svg',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'txt',
    'csv',
    'json',
    'log',
    'html',
    'htm',
    'mp3',
    'm4a',
    'ogg',
    'oga',
    'wav',
    'mp4',
    'webm',
    'ogv',
  ].includes(extension);
}

function formatFileSize(size?: number) {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentLabel(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLowerCase();
  if (normalized.includes('pdf')) return 'PDF';
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'IMG';
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'DOC';
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'XLS';
  if (normalized.match(/\.(pptx?)$/) || normalized.includes('powerpoint')) return 'SLD';
  return 'FILE';
}

function attachmentColor(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLowerCase();
  if (normalized.includes('pdf')) return 'bg-red-500';
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'bg-green-500';
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'bg-blue-500';
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'bg-indigo-500';
  return 'bg-orange-500';
}

