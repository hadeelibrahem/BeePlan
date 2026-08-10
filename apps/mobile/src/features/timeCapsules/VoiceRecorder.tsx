import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useTheme } from '../../theme/useTheme';

export function VoiceRecorder({ onRecorded }: { onRecorded: (file: { uri: string; name: string; mimeType: string }) => void }) {
  const { theme } = useTheme(); const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY); const state = useAudioRecorderState(recorder);
  const [uri, setUri] = useState<string | null>(null), [error, setError] = useState('');
  useEffect(() => () => { if (state.isRecording) void recorder.stop().catch(() => undefined); }, [recorder, state.isRecording]);
  async function toggle() { setError(''); try { if (state.isRecording) { await recorder.stop(); const next = recorder.uri; if (!next) throw new Error('No recording was created.'); setUri(next); onRecorded({ uri: next, name: `voice-${Date.now()}.m4a`, mimeType: 'audio/m4a' }); return; } const permission = await requestRecordingPermissionsAsync(); if (!permission.granted) { setError('Microphone permission was denied.'); return; } await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); await recorder.prepareToRecordAsync(); recorder.record(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to record voice.'); } }
  return <View style={{ marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: theme.colors.surface }}><Pressable accessibilityLabel={state.isRecording ? 'Stop recording voice' : 'Record voice'} onPress={() => void toggle()} style={{ padding: 10, borderRadius: 10, backgroundColor: '#FDEF4B', alignItems: 'center' }}><Text style={{ color: '#111827', fontWeight: '900' }}>{state.isRecording ? `Stop recording (${Math.floor((state.durationMillis ?? 0) / 1000)}s)` : uri ? 'Record again' : 'Record voice'}</Text></Pressable>{uri ? <Text style={{ color: theme.colors.secondaryText, marginTop: 8 }}>Voice note ready to attach. It will not play automatically.</Text> : null}{error ? <Text accessibilityRole="alert" style={{ color: theme.colors.error, marginTop: 8 }}>{error}</Text> : null}</View>;
}
