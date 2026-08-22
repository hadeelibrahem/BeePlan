import { apiRequest, getAuthHeaders } from '../../lib/api'
export type Challenge = { id:string; title:string; description:string; type:'focus_minutes'|'focus_sessions'|'tasks_completed'; targetValue:number; status:'scheduled'|'active'|'completed'; startAt:string; endAt:string; progressValue:number; completed:boolean; completedAt:string|null }
const headers=(token:string)=>({headers:getAuthHeaders(token)})
export const challengesApi={ list:(token:string)=>apiRequest('/challenges',headers(token)) as Promise<Challenge[]>, get:(token:string,id:string)=>apiRequest(`/challenges/${id}`,headers(token)) as Promise<Challenge> }
