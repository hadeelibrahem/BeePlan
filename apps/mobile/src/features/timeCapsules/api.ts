import { apiFetch } from '../../lib/apiClient';
import { API_BASE_URL } from '../../lib/apiClient';
import { getAuthToken } from '../../lib/authToken';
export type Capsule={id:string;title:string;message?:string;unlockType:'date'|'task_completion'|'project_completion';unlockAt?:string|null;linkedTaskId?:string|null;linkedProjectId?:string|null;status:'locked'|'ready'|'opened'|'cancelled';createdAt:string;updatedAt?:string;openedAt?:string|null;attachmentCount:number;attachments?:Array<{id:string;type:'image'|'video'|'file'|'audio';fileName:string;mimeType:string;sizeBytes:number;durationSeconds?:number|null;url:string}>};
async function request(path:string,init:RequestInit={}){const token=getAuthToken();const response=await apiFetch(path,{...init,headers:{Authorization:`Bearer ${token}`,...(!(init.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...init.headers}});const data=response.status===204?null:await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.message??'Time Capsule request failed.');return data}
export const listCapsules=()=>request('/time-capsules') as Promise<Capsule[]>;
export const createCapsule=(body:object)=>request('/time-capsules',{method:'POST',body:JSON.stringify(body)}) as Promise<Capsule>;
export const getCapsule=(id:string)=>request(`/time-capsules/${id}`) as Promise<Capsule>;
export const updateCapsuleDraft=(id:string,body:object)=>request(`/time-capsules/${id}`,{method:'PATCH',body:JSON.stringify(body)}) as Promise<Capsule>;
export const sealCapsule=(id:string)=>request(`/time-capsules/${id}/seal`,{method:'POST'});
export const openCapsule=(id:string)=>request(`/time-capsules/${id}/open`,{method:'POST'}) as Promise<Capsule>;
export const deleteCapsule=(id:string)=>request(`/time-capsules/${id}`,{method:'DELETE'});
export const deleteAttachment=(id:string,attachmentId:string)=>request(`/time-capsules/${id}/attachments/${attachmentId}`,{method:'DELETE'});
export async function uploadAttachment(id:string,file:{uri:string;name:string;mimeType?:string|null}){const form=new FormData();form.append('file',{uri:file.uri,name:file.name,type:file.mimeType??'application/octet-stream'} as unknown as Blob);return request(`/time-capsules/${id}/attachments`,{method:'POST',body:form});}
export async function downloadAttachment(capsuleId:string,attachmentId:string){const token=getAuthToken();const response=await apiFetch(`/time-capsules/${capsuleId}/attachments/${attachmentId}/content`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Unable to load attachment.');return response;}
export { API_BASE_URL };
