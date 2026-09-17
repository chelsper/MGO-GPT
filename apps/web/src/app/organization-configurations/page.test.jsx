import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Page from "./page";
import { DEFAULT_ORGANIZATION_SETTINGS as settings } from "@/utils/organizationSettings";
import { ORGANIZATION_REPORTING_POLICY as reportingPolicy } from "@/utils/organizationRuntimePolicy";
vi.mock("@/utils/useUser", () => { const user = { email:'admin@example.test' }; return { default: () => ({data:user, loading:false}) }; });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
let client, respond;
beforeEach(() => {
  client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  respond = () => reply({settings:{...settings, applicationName:'Updated Hub'}, revision:'version-2', reportingPolicy, change:{id:1,created_at:'2026-09-17T16:00:00Z',changed_fields:['applicationName']}});
  vi.spyOn(window,'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch',vi.fn(async(url,options) => {
    if (url === '/api/users/profile') return reply({user:{id:7,name:'Test Admin',role:'admin'}});
    if (url === '/api/admin/giving-societies') return reply({societies:[],countSourceOptions:[]});
    if (url === '/api/admin/organization-settings') return options?.method ? respond() : reply({settings,revision:'version-1',reportingPolicy,history:[]});
    throw Error(`Unexpected request: ${url}`);
  }));
});
afterEach(()=>{cleanup();client.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
const mount = async () => {render(<QueryClientProvider client={client}><Page/></QueryClientProvider>);await screen.findByRole('heading',{name:'Institution Profile'});};

it('shows active reporting rules separately and keeps protected fields disabled', async()=>{
  await mount();
  expect(screen.getByRole('region',{name:'Active reporting rules'})).toHaveTextContent('query 12033, Gift records, QRECID');
  for(const name of ['Time Zone','Fiscal Year Starts','Currency Code','Date Format']) expect(screen.getByLabelText(name,{exact:true})).toBeDisabled();
  expect(screen.getByLabelText('Application Name')).toBeEnabled();
  expect(fetch.mock.calls.every(([, options])=>!options?.method)).toBe(true);
});

it('submits the loaded revision and updates shared branding and bounded audit history', async()=>{
  await mount();
  fireEvent.change(screen.getByLabelText('Application Name'),{target:{value:'Updated Hub'}});
  fireEvent.click(screen.getByRole('button',{name:'Save Organization Settings'}));
  await screen.findByText(/Institution profile saved in app/);
  const [, options] = fetch.mock.calls.find(([, options])=>options?.method==='PUT');
  expect(JSON.parse(options.body)).toMatchObject({settings:{applicationName:'Updated Hub'},expectedRevision:'version-1'});
  expect(client.getQueryData(['organization-settings','admin@example.test']).settings.applicationName).toBe('Updated Hub');
  fireEvent.click(screen.getByText('Recent organization changes'));
  expect(within(screen.getByText('Recent organization changes').closest('details')).getByText('Test Admin')).toBeVisible();
});

it('retains a conflicting draft and requires explicit reload before a retry', async()=>{
  respond = () => reply({error:'Settings changed. Reload saved profile.'},409);
  await mount();
  fireEvent.change(screen.getByLabelText('Application Name'),{target:{value:'My draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Save Organization Settings'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Settings changed');
  expect(screen.getByLabelText('Application Name')).toHaveValue('My draft');
  expect(screen.getByRole('button',{name:'Save Organization Settings'})).toBeDisabled();
  window.confirm.mockReturnValueOnce(false);
  fireEvent.click(screen.getByRole('button',{name:'Reload saved profile'}));
  expect(screen.getByLabelText('Application Name')).toHaveValue('My draft');
  fireEvent.click(screen.getByRole('button',{name:'Reload saved profile'}));
  await waitFor(()=>expect(screen.getByLabelText('Application Name')).toHaveValue('JUMGOGPT'));
  expect(screen.getByRole('button',{name:'Save Organization Settings'})).toBeEnabled();
});

it('disables profile fields in flight and preserves the draft after an uncertain response', async()=>{
  let finish; respond = () => new Promise(resolve => {finish=resolve;});
  await mount();
  fireEvent.change(screen.getByLabelText('Application Name'),{target:{value:'My draft'}});
  fireEvent.click(screen.getByRole('button',{name:'Save Organization Settings'}));
  await waitFor(()=>expect(screen.getByLabelText('Application Name')).toBeDisabled());
  finish(reply({error:'Reload saved profile before retrying'},500));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Application Name')).toHaveValue('My draft');
  expect(screen.getByRole('button',{name:'Save Organization Settings'})).toBeDisabled();
});

it('keeps the current draft when a profile reload returns an incomplete success', async()=>{
  await mount();
  fireEvent.change(screen.getByLabelText('Application Name'),{target:{value:'Keep this draft'}});
  fetch.mockResolvedValueOnce(reply({}));
  fireEvent.click(screen.getByRole('button',{name:'Reload saved profile'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('response is incomplete');
  expect(screen.getByLabelText('Application Name')).toHaveValue('Keep this draft');
});
