import { fireEvent, waitFor } from '@testing-library/react-native';
import ChallengesScreen from './ChallengesScreen';
import ChallengeDetailScreen from './ChallengeDetailScreen';
import { renderWithProviders } from '../test/renderWithProviders';
import { challengesApi } from '../features/challenges/challengesApi';

jest.mock('../features/challenges/challengesApi', () => ({ challengesApi: { list: jest.fn(), get: jest.fn() } }));
const list = challengesApi.list as jest.Mock; const get = challengesApi.get as jest.Mock;
const active:any={id:'active',title:'Admin active title',description:'Admin active description',type:'focus_minutes',targetValue:100,progressValue:140,status:'active',completed:false,completedAt:null,startAt:'2026-01-01T00:00:00Z',endAt:'2026-12-31T00:00:00Z'};
const scheduled:any={...active,id:'scheduled',title:'Scheduled title',status:'scheduled',progressValue:0}; const completed:any={...active,id:'completed',title:'Completed title',status:'completed',completed:true,progressValue:100}; const ended:any={...completed,id:'ended',title:'Ended title',completed:false};
describe('Challenge rendered screens',()=>{
  beforeEach(()=>{list.mockResolvedValue([active,scheduled,completed,ended]);get.mockResolvedValue(active)});
  it('renders active, upcoming, completed-by-user and ended challenge states with clamped progress',async()=>{const navigation={navigate:jest.fn()};const r=await renderWithProviders(<ChallengesScreen navigation={navigation}/>);expect(await r.findByText('Admin active title')).toBeTruthy();expect(r.getAllByText('100 / 100 minutes').length).toBeGreaterThan(0);expect(r.getByText('Scheduled title')).toBeTruthy();expect(r.getByText('Completed by you')).toBeTruthy();expect(r.getByText('Challenge ended')).toBeTruthy();fireEvent.press(r.getByText('Admin active title'));expect(navigation.navigate).toHaveBeenCalledWith('ChallengeDetail',{challengeId:'active'})});
  it('renders safe empty and error states',async()=>{list.mockResolvedValueOnce([]);const empty=await renderWithProviders(<ChallengesScreen navigation={{navigate:jest.fn()}}/>);expect(await empty.findByText('Challenges')).toBeTruthy(); list.mockRejectedValueOnce(new Error('offline'));const error=await renderWithProviders(<ChallengesScreen navigation={{navigate:jest.fn()}}/>);expect(await error.findByText('Unable to load challenges right now.')).toBeTruthy()});
  it('renders authoritative detail title, description, and lifecycle metadata',async()=>{const r=await renderWithProviders(<ChallengeDetailScreen route={{params:{challengeId:'active'}}}/>);expect(await r.findByText('Admin active title')).toBeTruthy();expect(r.getByText('Admin active description')).toBeTruthy();expect(r.getByText(/Ends/)).toBeTruthy();expect(get).toHaveBeenCalledWith('test-access-token','active')});
  it('renders detail error safely',async()=>{get.mockRejectedValueOnce(new Error('offline'));const r=await renderWithProviders(<ChallengeDetailScreen route={{params:{challengeId:'active'}}}/>);expect(await r.findByText('Unable to load challenges right now.')).toBeTruthy()});
});
