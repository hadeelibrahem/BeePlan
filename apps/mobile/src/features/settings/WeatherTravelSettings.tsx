import { useEffect, useState } from 'react'
import { Pressable, Switch, Text, TextInput, View } from 'react-native'
import { getWeatherTravelPreferences, updateWeatherTravelPreferences, type WeatherTravelPreferences } from '../../lib/tasksApi'
import { SectionCard } from '../../components/layout'
import { useTheme } from '../../theme/useTheme'

export function WeatherTravelSettings({ token }: { token: string }) {
  const { theme: { colors } } = useTheme()
  const [value, setValue] = useState<WeatherTravelPreferences | null>(null)
  const [status, setStatus] = useState('')
  useEffect(() => { void getWeatherTravelPreferences(token).then(setValue).catch(() => setStatus('Could not load settings.')) }, [token])
  if (!value) return null
  const set = <K extends keyof WeatherTravelPreferences>(key: K, next: WeatherTravelPreferences[K]) => setValue({ ...value, [key]: next })
  return <SectionCard>
    <Text accessibilityRole="header" className="text-base font-black" style={{ color: colors.text }}>Weather &amp; Travel</Text>
    <Text className="mb-3 text-xs" style={{ color: colors.secondaryText }}>BeePlan checks the expected route and forecast before scheduled tasks away from Home so it can suggest when to leave and what to prepare.</Text>
    <Row label="Enable weather and travel advice"><Switch value={value.enabled} onValueChange={(v) => set('enabled', v)} /></Row>
    <Text className="mt-2 text-xs font-bold" style={{ color: colors.secondaryText }}>Default travel mode</Text>
    <View className="flex-row gap-2">{(['driving','walking','cycling'] as const).map((mode) => <Pressable accessibilityRole="button" key={mode} onPress={() => set('defaultTravelMode', mode)} className="rounded-xl border px-3 py-2" style={{ borderColor: value.defaultTravelMode === mode ? colors.accent : colors.border }}><Text style={{ color: colors.text }}>{mode}</Text></Pressable>)}</View>
    {fields.map(([key,label]) => <View key={key} className="mt-2"><Text className="text-xs font-bold" style={{ color: colors.secondaryText }}>{label}</Text><TextInput accessibilityLabel={label} keyboardType="numeric" value={String(value[key])} onChangeText={(text) => set(key, Number(text) as never)} className="rounded-xl border px-3 py-2" style={{ borderColor: colors.border, color: colors.text }} /></View>)}
    <Row label="Use current location fallback"><Switch value={value.currentLocationFallbackEnabled} onValueChange={(v) => set('currentLocationFallbackEnabled', v)} /></Row>
    <Row label="Allow approximate travel fallback"><Switch value={value.approximateTravelFallbackEnabled} onValueChange={(v) => set('approximateTravelFallbackEnabled', v)} /></Row>
    <Row label="AI message polishing"><Switch value={value.aiPolishingEnabled} onValueChange={(v) => set('aiPolishingEnabled', v)} /></Row>
    {adviceLabels.map(([key,label]) => <Row key={key} label={label}><Switch value={value.advice[key] !== false} onValueChange={(v) => set('advice', { ...value.advice, [key]: v })} /></Row>)}
    <TextInput accessibilityLabel="IANA timezone" value={value.timezone} onChangeText={(v) => set('timezone', v)} className="mt-2 rounded-xl border px-3 py-2" style={{ borderColor: colors.border, color: colors.text }} />
    <Pressable accessibilityRole="button" onPress={() => void updateWeatherTravelPreferences(token, value).then(setValue).then(() => setStatus('Saved')).catch(() => setStatus('Could not save settings.'))} className="mt-3 rounded-xl p-3" style={{ backgroundColor: colors.accent }}><Text className="text-center font-black" style={{ color: colors.accentText }}>Save Weather &amp; Travel</Text></Pressable>
    <Text accessibilityLiveRegion="polite" className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{status}</Text>
  </SectionCard>
}
function Row({ label, children }: { label: string; children: React.ReactNode }) { const { theme: { colors } } = useTheme(); return <View className="mt-2 flex-row items-center justify-between"><Text className="flex-1 text-sm font-bold" style={{ color: colors.text }}>{label}</Text>{children}</View> }
const fields: [keyof WeatherTravelPreferences,string][] = [['homeRadiusMeters','Home radius (m)'],['preparationBufferMinutes','Preparation buffer (min)'],['parkingWalkingBufferMinutes','Parking/walking buffer (min)'],['uncertaintyBufferMinutes','Uncertainty buffer (min)'],['weatherLeadMinutes','Weather lead (min)'],['currentLocationFreshnessMinutes','Location freshness (min)'],['coldThresholdC','Cold threshold °C'],['veryColdThresholdC','Very cold threshold °C'],['hotThresholdC','Hot threshold °C'],['extremeHeatThresholdC','Extreme heat threshold °C'],['rainThresholdPercent','Rain probability %'],['rainAmountThresholdMm','Rain amount mm'],['windThresholdKph','Wind threshold km/h'],['uvThreshold','UV threshold'],['visibilityThresholdMeters','Visibility threshold m']]
const adviceLabels = [['coat','Coat advice'],['lightClothing','Light-clothing advice'],['umbrella','Umbrella advice'],['hydration','Hydration advice'],['uv','UV advice'],['wind','Wind warning'],['severeWeather','Severe weather alerts']] as const
