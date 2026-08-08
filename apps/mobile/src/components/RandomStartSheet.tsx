import { useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { Dices, X } from 'lucide-react-native'
import { changeTaskStatus, getRandomStart, updateSubtask, type RandomStartItem, type RandomStartMode } from '../lib/tasksApi'
import { SectionCard } from './layout'
import { useTheme } from '../theme/useTheme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const WHEEL_LIMIT = 12
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function point(cx: number, cy: number, radius: number, degrees: number) {
  const radians = degrees * Math.PI / 180
  return { x: cx + radius * Math.sin(radians), y: cy - radius * Math.cos(radians) }
}

function sectorPath(size: number, start: number, end: number) {
  const center = size / 2; const radius = center - 4; const from = point(center, center, radius, start); const to = point(center, center, radius, end); const largeArc = end - start > 180 ? 1 : 0
  return `M ${center} ${center} L ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y} Z`
}

function isRtlText(title: string) { return /[\u0590-\u08FF]/.test(title) }

function Wheel({ candidates, rotation, colors, size }: { candidates: RandomStartItem[]; rotation: Animated.Value; colors: any; size: number }) {
  const center = size / 2; const radius = center - 4; const slice = 360 / candidates.length; const labelRadius = radius * .60
  const surfaces = [colors.accentSoft, colors.surface, colors.accentSoft, colors.card]
  return <View style={{ width: size, height: size, alignSelf: 'center' }}>
    <Text className="absolute -top-5 left-0 right-0 z-20 text-center text-4xl" style={{ color: colors.text }}>▼</Text>
    <Animated.View style={{ width: size, height: size, transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {candidates.map((candidate, index) => {
          const start = index * slice; const end = start + slice
          return <Path key={candidate.candidateKey} d={candidates.length === 1 ? `M ${center} ${center} m -${radius}, 0 a ${radius},${radius} 0 1,0 ${radius * 2},0 a ${radius},${radius} 0 1,0 -${radius * 2},0` : sectorPath(size, start, end)} fill={surfaces[index % surfaces.length]} stroke={colors.accent} strokeWidth={1.5} />
        })}
        <Circle cx={center} cy={center} r={radius * .23} fill={colors.accent} stroke={colors.accentSoft} strokeWidth={4} />
      </Svg>
      {candidates.map((candidate, index) => { const middle = index * slice + slice / 2; const label = point(center, center, labelRadius, middle); const labelWidth = Math.min(size * .30, Math.max(70, size * .8 * Math.sin((slice * Math.PI / 180) / 2))); const rtl = isRtlText(candidate.title); return <View key={`${candidate.candidateKey}-label`} pointerEvents="none" style={{ position: 'absolute', left: label.x - labelWidth / 2, top: label.y - 24, width: labelWidth, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text numberOfLines={2} ellipsizeMode="tail" style={{ color: colors.text, fontSize: candidates.length > 8 ? 11 : 13, fontWeight: '700', lineHeight: candidates.length > 8 ? 13 : 16, textAlign: 'center', writingDirection: rtl ? 'rtl' : 'ltr' }}>{candidate.title}</Text></View> })}
      <View pointerEvents="none" className="absolute items-center justify-center" style={{ width: radius * .42, height: radius * .42, left: center - radius * .21, top: center - radius * .21 }}><Text className="text-3xl">🐝</Text></View>
    </Animated.View>
  </View>
}

export function RandomStartSheet({ accessToken, onOpenTask }: { accessToken: string; onOpenTask: (id: string) => void }) {
  const { theme } = useTheme(); const { colors } = theme; const { width } = useWindowDimensions(); const insets = useSafeAreaInsets(); const wheelSize = Math.min(Math.max(width - 64, 240), 320)
  const [visible, setVisible] = useState(false); const [task, setTask] = useState<RandomStartItem | null>(null); const [candidates, setCandidates] = useState<RandomStartItem[]>([]); const [mode, setMode] = useState<RandomStartMode>('anything'); const [lastId, setLastId] = useState<string>(); const [loading, setLoading] = useState(false); const [spinning, setSpinning] = useState(false); const [error, setError] = useState('')
  const rotation = useRef(new Animated.Value(0)).current; const rotationRef = useRef(0)
  const wheelCandidates = useMemo(() => { if (candidates.length <= WHEEL_LIMIT || !task) return candidates; const first = candidates.slice(0, WHEEL_LIMIT - 1); return first.some(item => item.candidateKey === task.candidateKey) ? first : [...first, task] }, [candidates, task])

  const spinWheel = async (items: RandomStartItem[], selected: RandomStartItem) => {
    const reduced = await AccessibilityInfo.isReduceMotionEnabled(); const index = items.findIndex(item => item.candidateKey === selected.candidateKey); const slice = 360 / items.length; const target = 360 - (index * slice + slice / 2); const current = rotationRef.current; const delta = ((target - (current % 360) + 360) % 360) + (reduced ? 0 : (items.length === 1 ? 360 : 360 * 5)); const next = current + delta; rotationRef.current = next
    if (reduced) { rotation.setValue(next); await wait(280); return }
    await new Promise<void>(resolve => Animated.timing(rotation, { toValue: next, duration: items.length === 1 ? 850 : 2450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => resolve()))
  }
  const spin = async () => {
    if (loading) return
    setLoading(true); setSpinning(true); setError(''); setTask(null); setCandidates([]); setVisible(true)
    try { const result = await getRandomStart(accessToken, mode, lastId); if (!result.task || !result.candidates.length) { setSpinning(false); setLoading(false); return }; setTask(result.task); setLastId(result.task.candidateKey); setCandidates(result.candidates); const items = result.candidates.length <= WHEEL_LIMIT ? result.candidates : result.candidates.slice(0, WHEEL_LIMIT - 1).some(item => item.candidateKey === result.task!.candidateKey) ? result.candidates.slice(0, WHEEL_LIMIT - 1) : [...result.candidates.slice(0, WHEEL_LIMIT - 1), result.task]; await spinWheel(items, result.task) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to find a task.') } finally { setSpinning(false); setLoading(false) }
  }
  const start = async () => { if (!task || loading) return; setLoading(true); try { if (task.itemType === 'subtask') await updateSubtask(accessToken, task.taskId!, task.id, { status: 'in_progress', isDone: false }); else await changeTaskStatus(accessToken, task.id, { status: 'in_progress', progress: Math.max(task.progress, 1) }); setVisible(false); onOpenTask(task.taskId ?? task.id) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start this task.') } finally { setLoading(false) } }
  return <>
    <SectionCard><View className="flex-row items-center justify-between"><View className="flex-1"><View className="flex-row items-center gap-2"><Dices size={18} color={colors.accent} /><Text className="text-base font-black" style={{ color: colors.text }}>Random Start</Text></View><Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>Don’t know where to start? Let BeePlan pick something for you.</Text></View><Pressable onPress={() => void spin()} disabled={loading} accessibilityRole="button" accessibilityLabel="Random Start" className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.accent, opacity: loading ? .6 : 1 }}><Text className="font-black" style={{ color: colors.accentText }}>{loading ? 'Picking…' : 'Random Start'}</Text></Pressable></View></SectionCard>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!loading) setVisible(false) }}><View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,.55)' }}><Pressable className="flex-1" onPress={() => { if (!loading) setVisible(false) }} /><View className="max-h-[92%] rounded-t-[28px] border" style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border, paddingBottom: insets.bottom }}><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 24 }}><View className="flex-row items-start justify-between"><View className="flex-1"><Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.accent }}>Your Random Start</Text><Text className="mt-2 text-3xl font-black" style={{ color: colors.text }}>Let’s pick something for you</Text><Text className="mt-2 text-sm" style={{ color: colors.secondaryText }}>{spinning ? 'Spinning through your available tasks…' : 'Your next step is ready.'}</Text></View><Pressable onPress={() => { if (!loading) setVisible(false) }} disabled={loading} accessibilityLabel="Close"><X size={20} color={colors.secondaryText} /></Pressable></View>{error ? <View className="items-center py-12"><Text className="text-lg font-black" style={{ color: colors.text }}>Nothing to pick right now</Text></View> : wheelCandidates.length ? <><View className="mt-8 items-center"><Wheel candidates={wheelCandidates} rotation={rotation} colors={colors} size={wheelSize} /></View><View className="mt-4 items-center"><Text className="text-lg font-black" style={{ color: colors.text }}>{spinning ? 'Spinning…' : 'Your pick'}</Text><Text className="mt-1 text-center text-base" style={{ color: colors.secondaryText }}>{spinning ? 'We’ll stop on one for you' : task?.parentTitle ? `${task.title} · ${task.parentTitle}` : task?.title}</Text></View>{!spinning && task ? <><View className="mt-5 flex-row flex-wrap justify-center gap-2">{(['anything', 'quick_win', 'important'] as RandomStartMode[]).map(value => <Pressable key={value} onPress={() => setMode(value)} disabled={loading} className="rounded-xl border px-3 py-2" style={{ borderColor: mode === value ? colors.accent : colors.border, backgroundColor: mode === value ? colors.accentSoft : colors.surface }}><Text className="text-xs font-bold capitalize" style={{ color: colors.text }}>{value.replace('_', ' ')}</Text></Pressable>)}<Pressable onPress={() => void spin()} disabled={loading} className="rounded-xl px-3 py-2"><Text className="font-black" style={{ color: colors.accent }}>🎲 Spin Again</Text></Pressable></View><Pressable onPress={() => void start()} disabled={loading} className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: colors.accent }}><Text className="text-center font-black" style={{ color: colors.accentText }}>Start Task</Text></Pressable><Pressable onPress={() => { setVisible(false); onOpenTask(task.taskId ?? task.id) }} disabled={loading} className="mt-3"><Text className="text-center text-sm font-bold" style={{ color: colors.secondaryText }}>View Task</Text></Pressable></> : null}</> : <View className="items-center py-12"><Text style={{ color: colors.secondaryText }}>Loading your available tasks…</Text></View>}</ScrollView></View></View></Modal>
  </>
}
