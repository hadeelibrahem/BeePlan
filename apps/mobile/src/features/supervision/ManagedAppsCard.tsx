import { useEffect, useState } from 'react'
import { Image, Pressable, Switch, Text, View } from 'react-native'
import { getInstalledApps, isFocusBlockerAvailable, type InstalledApp } from '../../../modules/beeplan-focus-blocker'
import { getDeviceCapability } from './deviceCapability'
import { mobileSupervisionApi as api } from './api'

export const buildApprovedAppPayload = (apps: InstalledApp[], selected: string[]) => apps.filter(app => selected.includes(app.packageName)).map(app => ({ platformAppIdentifier: app.packageName, displayName: app.appName, iconReference: app.icon }))

export function ManagedAppsCard({ device, colors, onSaved, onError }: { device: any; colors: any; onSaved: () => void; onError: (message: string) => void }) {
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [hardBlocking, setHardBlocking] = useState(false)
  useEffect(() => { void getDeviceCapability().then(capability => setHardBlocking(capability.enforceable)) }, [])
  const setEnabled = (enabled: boolean) => api.configureApps(device.id, device.platform === 'ios' ? { enabled, selectionConfigured: false, selectedAppCount: 0, categoriesConfigured: false } : { enabled }).then(onSaved).catch(error => onError(error.message))
  const loadAndroidApps = async () => {
    if (!isFocusBlockerAvailable) { setStatus('Permission required: use the BeePlan Android development build.'); return }
    setStatus('Loading eligible apps…')
    try { const [eligible, approved] = await Promise.all([getInstalledApps(), api.managedApps(device.id)]); setApps(eligible); setSelected(approved.map(app => app.platformAppIdentifier)); setStatus(eligible.length ? '' : 'No eligible apps were exposed by Android package visibility.') } catch { setStatus('Permission required or eligible apps could not be loaded.') }
  }
  const save = async () => {
    setStatus('Saving…')
    try { await api.configureApps(device.id, { enabled: true, apps: buildApprovedAppPayload(apps, selected) }); setStatus('Guardian app permissions updated.'); onSaved() } catch (error) { setStatus('Could not save. Your selection is still available for retry.'); onError(error instanceof Error ? error.message : 'Could not save.') }
  }
  return <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginTop: 10 }}>
    <Text style={{ color: colors.text, fontWeight: '800' }}>{device.deviceName ?? `${device.platform} device`}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: colors.text, flex: 1 }}>Allow your Guardian to manage restrictions for the apps you select.</Text><Switch value={device.appManagementEnabled} onValueChange={value => void setEnabled(value)} /></View>
    <Text style={{ color: colors.secondaryText }}>Only selected apps are shared. Unselected apps, app content, and usage outside active supervision rules are not shared.</Text>
    {device.platform === 'ios' ? <Text style={{ color: colors.secondaryText }}>Screen Time selection requires FamilyControls in the BeePlan iOS development build. Opaque app tokens remain local; Guardians receive only the configured count.</Text> : <>
      <Text style={{ color: colors.secondaryText }}>{hardBlocking ? 'Managed-device blocking available.' : 'Hard app blocking unavailable on this device. Device Owner/Profile Owner provisioning is required; Accessibility is not used.'}</Text>
      {device.appManagementEnabled ? <Pressable onPress={() => void loadAndroidApps()}><Text style={{ color: colors.primary, marginTop: 8 }}>Manage Apps</Text></Pressable> : <Text style={{ color: colors.secondaryText }}>Consent required before apps can be selected.</Text>}
      {apps.map(app => <Pressable key={app.packageName} onPress={() => setSelected(ids => ids.includes(app.packageName) ? ids.filter(id => id !== app.packageName) : [...ids, app.packageName])} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>{app.icon ? <Image source={{ uri: app.icon }} style={{ width: 28, height: 28, borderRadius: 6 }} /> : null}<Text style={{ color: colors.text }}>{selected.includes(app.packageName) ? '☑' : '☐'} {app.appName}</Text></Pressable>)}
      {apps.length ? <Pressable onPress={() => void save()}><Text style={{ color: colors.primary, fontWeight: '800', marginTop: 8 }}>Save Approved Apps</Text></Pressable> : null}
    </>}
    {device.selectionConfigured ? <Text style={{ color: colors.primary }}>{device.selectedAppCount} supervised apps configured</Text> : null}
    {status ? <Text style={{ color: status.startsWith('Could not') ? colors.error : colors.secondaryText }}>{status}</Text> : null}
  </View>
}
