import { Image, Text, View } from 'react-native';
import { useTheme } from '../../../theme/useTheme';

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  fullName,
  avatarUrl,
  size = 40,
}: {
  fullName: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const { theme } = useTheme();
  const { colors } = theme;
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        accessibilityLabel={fullName}
      />
    );
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft }}
      className="items-center justify-center"
    >
      <Text style={{ color: colors.accent }} className="text-xs font-black">
        {initials(fullName)}
      </Text>
    </View>
  );
}
