import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext'
import { ChallengesScreen } from './ChallengesScreen'
import { challengesApi } from './challengesApi'

vi.mock('./challengesApi', () => ({ challengesApi: { list: vi.fn(), get: vi.fn() } }))
const list = vi.mocked(challengesApi.list); const get = vi.mocked(challengesApi.get)
const active:any = { id:'active', title:'Admin active title', description:'Admin active description', type:'focus_minutes', targetValue:100, progressValue:140, status:'active', completed:false, completedAt:null, startAt:'2026-01-01T00:00:00Z', endAt:'2026-12-31T00:00:00Z' }
const upcoming:any = { ...active, id:'upcoming', title:'Scheduled title', status:'scheduled', progressValue:0 }
const done:any = { ...active, id:'done', title:'Finished title', status:'completed', progressValue:100, completed:true }
const ended:any = { ...done, id:'ended', title:'Ended title', completed:false }
function Arabic(){ const { setLanguage }=useLanguage(); useEffect(()=>setLanguage('ar'),[setLanguage]); return null }
function renderChallenges(path='/challenges', arabic=false) { const client=new QueryClient({defaultOptions:{queries:{retry:false}}}); return render(<QueryClientProvider client={client}><LanguageProvider>{arabic?<Arabic/>:null}<MemoryRouter initialEntries={[path]}><Routes><Route path="/challenges" element={<ChallengesScreen token="token"/>}/><Route path="/challenges/:id" element={<ChallengesScreen token="token"/>}/></Routes></MemoryRouter></LanguageProvider></QueryClientProvider>) }
describe('ChallengesScreen rendered UI',()=>{
  beforeEach(()=>{list.mockResolvedValue([active,upcoming,done,ended]);get.mockResolvedValue(active)})
  it('renders header, tabs, active card, clamp, and correct link',async()=>{renderChallenges(); expect(await screen.findByRole('heading',{name:'Challenges'})).toBeInTheDocument(); expect(screen.getByRole('button',{name:'Active'})).toBeInTheDocument(); expect(await screen.findByText('Admin active title')).toBeInTheDocument(); expect(document.querySelector('[style*="width: 100%"]')).not.toBeNull(); expect(screen.getByRole('link',{name:/Admin active title/})).toHaveAttribute('href','/challenges/active')})
  it('switches upcoming and completed states including user-completed and ended labels',async()=>{renderChallenges(); await screen.findByText('Admin active title'); fireEvent.click(screen.getByRole('button',{name:'Upcoming'})); expect(screen.getByText('Scheduled title')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button',{name:'Completed'})); expect(screen.getByText('Finished title')).toBeInTheDocument(); expect(screen.getByText('Completed by you')).toBeInTheDocument(); expect(screen.getByText('Challenge ended')).toBeInTheDocument()})
  it('renders empty and retryable error states safely',async()=>{list.mockResolvedValueOnce([]); renderChallenges(); expect(await screen.findByText('No active challenges right now.')).toBeInTheDocument(); list.mockRejectedValueOnce(new Error('offline')); renderChallenges(); expect(await screen.findByText('Unable to load challenges right now.')).toBeInTheDocument(); expect(screen.getByRole('button',{name:'Retry'})).toBeInTheDocument()})
  it('renders detail metadata and preserves admin copy in Arabic',async()=>{get.mockResolvedValueOnce(active); renderChallenges('/challenges/active',true); await waitFor(()=>expect(screen.getByText('Admin active title')).toBeInTheDocument()); expect(screen.getByText('Admin active description')).toBeInTheDocument(); expect(screen.getByText(/تبدأ خلال/)).toBeInTheDocument(); expect(screen.getByRole('link',{name:/التحديات/})).toHaveAttribute('href','/challenges')})
})
