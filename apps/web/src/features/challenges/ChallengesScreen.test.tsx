import { describe,expect,it } from 'vitest'; import { progressPercent,unit } from './ChallengesScreen';
const t=(k:string)=>k; const base:any={type:'focus_minutes',progressValue:140,targetValue:100};
describe('challenge formatting',()=>{it('clamps progress',()=>expect(progressPercent(base)).toBe(100));it('formats units',()=>expect(unit(base,t)).toBe('challenges.minutes'));it('supports sessions and tasks',()=>{expect(unit({...base,type:'focus_sessions'},t)).toBe('challenges.sessions');expect(unit({...base,type:'tasks_completed'},t)).toBe('challenges.tasks')})});
