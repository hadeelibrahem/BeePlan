import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { getStatistics, type BlockStatistics } from '../../../modules/beeplan-focus-blocker';
import { useTheme } from '../../theme/useTheme';
import { latestTimestampFor, summarizeEndReason } from './strictStats';

/**
 * Post-session summary of Strict Mode: total blocked attempts, a per-app
 * breakdown with the latest timestamp, and whether the session completed
 * normally or ended via emergency exit. Pulls the authoritative numbers from the
 * native store (bounded to 500 events) rather than the live JS counter.
 */
export function StrictStatsSheet({
  visible,
  sessionId,
  focusMinutes,
  endReason,
  onClose,
}: {
  visible: boolean;
  sessionId: string | null;
  focusMinutes: number;
  endReason: string | null;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [stats, setStats] = useState<BlockStatistics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    void getStatistics(sessionId)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [visible, sessionId]);

  const { usedEmergencyExit, completedNormally } = summarizeEndReason(endReason);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            maxHeight: '86%',
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>Focus session summary</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <StatTile colors={colors} label="Focused" value={formatMinutes(focusMinutes)} />
            <StatTile colors={colors} label="Blocked attempts" value={String(stats?.totalAttempts ?? 0)} />
          </View>

          <View
            style={{
              marginTop: 12,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <Tag
              colors={colors}
              tone={completedNormally ? 'success' : 'muted'}
              label={completedNormally ? 'Completed normally' : endReason ? 'Ended early' : 'In progress'}
            />
            {usedEmergencyExit ? <Tag colors={colors} tone="warning" label="Used emergency exit" /> : null}
          </View>

          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 20, marginBottom: 8 }}>
            By app
          </Text>

          {loading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : stats && stats.byPackage.length > 0 ? (
            <ScrollView style={{ maxHeight: 260 }}>
              {stats.byPackage.map((row) => {
                const latest = latestTimestampFor(stats, row.packageName);
                return (
                  <View
                    key={row.packageName}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ fontSize: 14, color: colors.text }} numberOfLines={1}>
                        {row.appName}
                      </Text>
                      {latest ? (
                        <Text style={{ fontSize: 11, color: colors.secondaryText, marginTop: 2 }}>
                          Last at {formatClock(latest)}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.primary }}>
                      {row.attempts}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={{ fontSize: 13, color: colors.secondaryText, paddingVertical: 12 }}>
              No blocked attempts — nice focus. 🐝
            </Text>
          )}

          <Pressable
            onPress={onClose}
            style={{
              marginTop: 18,
              paddingVertical: 14,
              borderRadius: 14,
              backgroundColor: colors.accent,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.accentText, fontWeight: '800' }}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function StatTile({ colors, label, value }: { colors: any; label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: colors.secondaryText }}>
        {label}
      </Text>
      <Text style={{ fontSize: 22, fontWeight: '900', color: colors.text, marginTop: 4 }}>{value}</Text>
    </View>
  );
}

function Tag({ colors, tone, label }: { colors: any; tone: 'success' | 'warning' | 'muted'; label: string }) {
  const color = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.secondaryText;
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: `${color}33` }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color }}>{label}</Text>
    </View>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatClock(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
}
