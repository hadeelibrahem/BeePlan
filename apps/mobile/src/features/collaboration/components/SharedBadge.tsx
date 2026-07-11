import { Text, View } from 'react-native';
import { useTheme } from '../../../theme/useTheme';
import { ROLE_META, type TaskRole } from '../types';

export function SharedBadge({ memberCount }: { memberCount?: number }) {
  const { theme } = useTheme();
  const { colors } = theme;
  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
      style={{ backgroundColor: `${colors.accent}1a`, borderWidth: 1, borderColor: `${colors.accent}4d` }}
      accessibilityLabel={memberCount ? `Shared task with ${memberCount} members` : 'Shared task'}
    >
      <Text style={{ color: colors.accent }} className="text-[10px] font-black">
        👥 SHARED{memberCount ? ` · ${memberCount}` : ''}
      </Text>
    </View>
  );
}

export function RoleBadge({ role }: { role: TaskRole }) {
  const { theme } = useTheme();
  const { colors } = theme;
  const meta = ROLE_META[role];
  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
      style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
    >
      <Text style={{ color: colors.text }} className="text-[10px] font-bold">
        {meta.icon} {meta.label}
      </Text>
    </View>
  );
}
