import { Text, View } from 'react-native';
import { MobileIcon } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import type { TaskRole } from '../types';

const ROLE_ICON: Record<TaskRole, 'people' | 'check' | 'focus' | 'priority'> = { owner: 'priority', editor: 'check', viewer: 'focus' };
const ROLE_LABEL: Record<TaskRole, string> = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

export function SharedBadge({ memberCount }: { memberCount?: number }) {
  const { theme } = useTheme();
  const { colors } = theme;
  return <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: `${colors.accent}1a`, borderWidth: 1, borderColor: `${colors.accent}4d` }} accessibilityLabel={memberCount ? `Shared task with ${memberCount} members` : 'Shared task'}><MobileIcon name="people" color={colors.accent} size={12} /><Text style={{ color: colors.accent }} className="text-[10px] font-black">Shared{memberCount ? ` · ${memberCount}` : ''}</Text></View>;
}

export function RoleBadge({ role }: { role: TaskRole }) {
  const { theme } = useTheme();
  const { colors } = theme;
  return <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}><MobileIcon name={ROLE_ICON[role]} color={colors.text} size={12} /><Text style={{ color: colors.text }} className="text-[10px] font-bold">{ROLE_LABEL[role]}</Text></View>;
}
