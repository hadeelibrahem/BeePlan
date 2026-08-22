import { fireEvent } from '@testing-library/react-native';
import TasksDashboardScreen from './TasksDashboardScreen';
import { renderWithProviders } from '../test/renderWithProviders';
import { challengesApi } from '../features/challenges/challengesApi';

const mockNavigation = { navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('../features/challenges/challengesApi', () => ({ challengesApi: { list: jest.fn() } }));
const list = challengesApi.list as jest.Mock;
const dashboard:any={greeting:'Hello',dailyStatus:{status:'On track',statusTone:'positive',summaryLines:[]},progress:{percent:0,completedWorkUnits:0,totalWorkUnits:0,focusMinutes:0,remainingEstimatedMinutes:0},whyNow:[],tomorrowPreview:{estimatedWorkMinutes:0,dueWorkUnits:0},recommendation:null,activeFocus:null,timeline:[],suggestions:[]};
const challenge:any={id:'soon',title:'Admin title',description:'Admin description',type:'focus_minutes',targetValue:100,progressValue:140,status:'active',completed:false,completedAt:null,startAt:'2026-01-01T00:00:00Z',endAt:'2026-06-01T00:00:00Z'};
function screen(){return <TasksDashboardScreen dashboard={dashboard} onSignOut={()=>{}} onViewTasks={()=>{}} onViewReminders={()=>{}} onStartFocus={async()=>{}} onContinueFocus={()=>{}}/>}
describe('mobile dashboard Challenge widget',()=>{
  beforeEach(()=>mockNavigation.navigate.mockClear());
  it('renders localized active widget, clamps progress, selects incomplete earliest active and navigates',async()=>{list.mockResolvedValue([{...challenge,id:'later',endAt:'2026-07-01T00:00:00Z'}, {...challenge,id:'completed',completed:true,endAt:'2026-01-01T00:00:00Z'},challenge]);const r=await renderWithProviders(screen());expect(await r.findByText('Community Challenge')).toBeTruthy();expect(r.getByText('Admin title')).toBeTruthy();expect(r.getByText('100 / 100 minutes')).toBeTruthy();fireEvent.press(r.getByText('View challenge'));expect(mockNavigation.navigate).toHaveBeenCalledWith('ChallengeDetail',{challengeId:'soon'})});
  it('uses a completed active fallback and omits the widget with no active challenge',async()=>{list.mockResolvedValueOnce([{...challenge,id:'fallback',completed:true}]);const fallback=await renderWithProviders(screen());expect(await fallback.findByText('Admin title')).toBeTruthy();list.mockResolvedValueOnce([{...challenge,status:'scheduled'}]);const none=await renderWithProviders(screen());expect(await none.findByText('Hello')).toBeTruthy();expect(none.queryByText('Community Challenge')).toBeNull()});
});
