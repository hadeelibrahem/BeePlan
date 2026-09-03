import { API_BASE_URL, ApiRequestError, apiFetch, readJsonOrThrow } from '../../lib/apiClient'
import { getAuthToken } from '../../lib/authToken'
export type SafeIdentity={id:string;displayName:string;username:string|null;avatarUrl:string|null;relationshipState?:{id:string;status:'pending'|'active';direction:'guardian'|'supervised'}|null}
export type Relationship={id:string;guardianUserId:string;supervisedUserId:string;currentRole?:'guardian'|'supervised';guardian:SafeIdentity;supervisedUser:SafeIdentity;status:string;permissions:{level:string;can_view_task_progress:boolean;can_view_focus_progress:boolean;can_view_achievement_summary:boolean;can_view_weekly_summary:boolean}}
async function req<T>(path:string,init?:RequestInit){const r=await fetch(`${API_BASE_URL}${path}`,{...init,headers:{Authorization:`Bearer ${getAuthToken()}`,'Content-Type':'application/json',...init?.headers}});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message??'Could not load supervision data.');return d as T}
const APP_GUARD_HTTP_TIMEOUT_MS = 42_000
type AppGuardAccessResponse = { decision: string; reason?: string | null; signedGrant?: string | null }

function appGuardErrorType(error: unknown): 'timeout' | 'network' | 'http' | 'parse' {
  if (error instanceof ApiRequestError) return error.kind === 'timeout' ? 'timeout' : error.kind === 'network' || error.kind === 'config' ? 'network' : 'http'
  return error instanceof SyntaxError ? 'parse' : 'network'
}

async function requestAppGuardAccess(packageName: string, justification: string, requestId: string): Promise<AppGuardAccessResponse> {
  const startedAt = Date.now()
  if (__DEV__) console.info(`[AppGuard:Mobile] API request started requestId=${requestId}`)
  try {
    const response = await apiFetch('/supervision/app-guard/access-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageName, justification, requestId }),
    }, APP_GUARD_HTTP_TIMEOUT_MS)
    const result = await readJsonOrThrow<AppGuardAccessResponse>(response, `${API_BASE_URL}/supervision/app-guard/access-requests`)
    if (!result || (result.decision !== 'allow' && result.decision !== 'deny')) throw new SyntaxError('Malformed App Guard decision response.')
    if (__DEV__) console.info(`[AppGuard:Mobile] API completed requestId=${requestId} status=${response.status} durationMs=${Date.now() - startedAt}`)
    return result
  } catch (error) {
    if (__DEV__) console.info(`[AppGuard:Mobile] API request failed requestId=${requestId} errorType=${appGuardErrorType(error)} durationMs=${Date.now() - startedAt}`)
    throw error
  }
}
export const mobileSupervisionApi={relationships:()=>req<Relationship[]>('/supervision/relationships'),requests:()=>req<Relationship[]>('/supervision/requests'),people:(q:string)=>req<SafeIdentity[]>(`/supervision/people?q=${encodeURIComponent(q)}`),send:(body:object)=>req('/supervision/requests',{method:'POST',body:JSON.stringify(body)}),respond:(id:string,a:string)=>req(`/supervision/requests/${id}/${a}`,{method:'POST'}),updatePermissions:(id:string,permissions:object)=>req<Relationship>(`/supervision/relationships/${id}/permissions`,{method:'PATCH',body:JSON.stringify({permissions})}),revoke:(id:string)=>req<Relationship>(`/supervision/relationships/${id}`,{method:'DELETE'}),progress:(id:string)=>req<any>(`/supervision/relationships/${id}/progress`),tasks:(id:string,f:string)=>req<any[]>(`/supervision/relationships/${id}/tasks?filter=${f}`),focus:(id:string)=>req<any>(`/supervision/relationships/${id}/focus-summary`),achievements:(id:string)=>req<any>(`/supervision/relationships/${id}/achievements`),weekly:(id:string)=>req<any>(`/supervision/relationships/${id}/weekly-summary`),rules:(id:string)=>req<any[]>(`/supervision/relationships/${id}/rules`),devices:()=>req<any[]>('/supervision/devices'),registerDevice:(body:object)=>req('/supervision/devices/register',{method:'POST',body:JSON.stringify(body)}),managedApps:(id:string)=>req<any[]>(`/supervision/devices/${id}/managed-apps`),configureApps:(id:string,body:object)=>req(`/supervision/devices/${id}/managed-apps`,{method:'PUT',body:JSON.stringify(body)}),deviceRestrictions:()=>req<any[]>('/supervision/device-restrictions'),reconcile:()=>req('/supervision/restrictions/reconcile',{method:'POST'}),requestAccess:(packageName:string,justification:string)=>req<any>('/supervision/access-requests',{method:'POST',body:JSON.stringify({packageName,justification})})}
export const mobileAppGuardApi = { settings: () => req<any>('/supervision/app-guard'), updateSettings: (body: object) => req<any>('/supervision/app-guard', { method: 'PUT', body: JSON.stringify(body) }), replaceApps: (apps: { packageName: string; displayName?: string }[]) => req<any>('/supervision/app-guard/apps', { method: 'PUT', body: JSON.stringify({ apps }) }), restrictions: () => req<{ enabled: boolean; packages: string[] }>('/supervision/app-guard/restrictions'), requestAccess: requestAppGuardAccess, decisions: () => req<any[]>('/supervision/app-guard/decisions') }
