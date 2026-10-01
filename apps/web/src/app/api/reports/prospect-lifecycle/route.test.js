import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),schema:vi.fn(),user:vi.fn(),access:vi.fn(),read:vi.fn()}));
vi.mock('@/auth',()=>({auth:m.auth}));
vi.mock('@/app/api/utils/ensureAppSchema',()=>({default:m.schema}));
vi.mock('@/app/api/utils/getOrCreateUser',()=>({default:m.user}));
vi.mock('@/app/api/utils/reportAccess',()=>({getReportAccessForUser:m.access}));
vi.mock('@/app/api/utils/prospectLifecycleStore',()=>({readProspectLifecycle:m.read}));
import {GET} from './route';
const request=()=>new Request('https://example.test/api/reports/prospect-lifecycle');
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({user:{email:'staff@example.test'}});m.user.mockResolvedValue({id:1,active:true});m.access.mockResolvedValue({canView:true});m.read.mockResolvedValue({assignments:[]});});
it('requires authentication and active report access before reading activity',async()=>{
  m.auth.mockResolvedValue(null);expect((await GET(request())).status).toBe(401);expect(m.schema).not.toHaveBeenCalled();
  m.auth.mockResolvedValue({user:{email:'staff@example.test'}});m.user.mockResolvedValue({id:1,active:false});expect((await GET(request())).status).toBe(403);
  m.user.mockResolvedValue({id:1,active:true});m.access.mockResolvedValue({canView:false});expect((await GET(request())).status).toBe(403);expect(m.read).not.toHaveBeenCalled();
});
it('inherits pipeline access and returns private saved-data only',async()=>{
  const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(m.access).toHaveBeenCalledWith('opportunity-pipeline',{id:1,active:true});expect(m.read).toHaveBeenCalledWith({origin:'https://example.test'});expect((await response.json()).rows).toEqual([]);
});
it('never discloses database diagnostics or partial core totals',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});m.read.mockRejectedValue(new Error('private connection'));const response=await GET(request());
  expect(response.status).toBe(500);expect(await response.text()).not.toContain('private connection');vi.restoreAllMocks();
});
