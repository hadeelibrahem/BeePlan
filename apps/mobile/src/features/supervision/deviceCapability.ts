import { Linking, Platform } from 'react-native'
import { getManagementCapability, isFocusBlockerAvailable } from '../../../modules/beeplan-focus-blocker'

export type DeviceCapability = 'none' | 'accountability_only' | 'device_restrictions' | 'managed_device'
export type PermissionState = 'not_requested' | 'granted' | 'denied' | 'revoked' | 'unavailable'
export type DeviceCapabilityState = { platform: 'ios' | 'android'; capabilityLevel: DeviceCapability; permissionState: PermissionState; enforceable: boolean; message: string }

/** Native enforcement boundary. Expo Go cannot provide Screen Time or managed-device controls. */
export async function getDeviceCapability(): Promise<DeviceCapabilityState> {
  if (Platform.OS === 'ios') return { platform: 'ios', capabilityLevel: 'none', permissionState: 'unavailable', enforceable: false, message: 'Screen Time restrictions require the BeePlan iOS Development Build native module.' }
  if (!isFocusBlockerAvailable) return { platform: 'android', capabilityLevel: 'accountability_only', permissionState: 'unavailable', enforceable: false, message: 'Hard app blocking unavailable on this device.' }
  const management = getManagementCapability()
  const enforceable = management.hardBlockingAvailable
  return { platform: 'android', capabilityLevel: enforceable ? 'managed_device' : 'accountability_only', permissionState: enforceable ? 'granted' : 'not_requested', enforceable, message: enforceable ? `Hard app blocking available (${management.mode.replaceAll('_', ' ')}).` : 'Hard app blocking unavailable on this device.' }
}
export async function openUsageAccessSettings() { if (Platform.OS === 'android') await Linking.openSettings() }
export async function requestAuthorization() { return getDeviceCapability() }
export async function applyRuleRestrictions() { return { applied: false, reason: 'Native enforcement module is not installed in this build.' } }
export async function removeRuleRestrictions() { return { removed: true } }
