import {expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
vi.mock('@/app/reports/SharedReportHeader',()=>({default:({title,backHref,backLabel,action})=><header><h1>{title}</h1><a href={backHref}>{backLabel}</a>{action}</header>}));
import {LifecycleReport} from './page';
import {buildProspectLifecycle} from '@/utils/prospectLifecycle';
const report=()=>buildProspectLifecycle({assignments:[{id:1,pool_id:1,constituent_id:'100',constituent_name:'Example Donor',fundraiser_id:7,fundraiser_name:'Alex',assigned_at:'2026-08-01T14:00:00Z'}]},new Date('2026-10-01T14:00:00Z'));
it('shows missing coverage honestly and keeps back navigation in the pipeline',()=>{
  render(<LifecycleReport report={report()} reload={vi.fn()}/>);
  expect(screen.getByRole('link',{name:'Back to Opportunity Pipeline'})).toHaveAttribute('href','/reports/opportunity-pipeline');
  expect(screen.getByText('Not available')).toBeInTheDocument();expect(screen.getByText(/Missing giving data is not a zero/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search prospects'),{target:{value:'absent'}});expect(screen.getByText('No assignments in this view')).toBeInTheDocument();
});
it('reloads saved data only and allows cohort selection',()=>{
  const reload=vi.fn();render(<LifecycleReport report={report()} reload={reload}/>);
  fireEvent.click(screen.getByRole('button',{name:'Reload saved data'}));expect(reload).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Assigned fiscal year'),{target:{value:'all'}});expect(screen.getByText('Example Donor')).toBeInTheDocument();
});
it('filters 60-89 day outreach review and can return to all assignments without a request',()=>{
  const reload=vi.fn();render(<LifecycleReport report={report()} reload={reload}/>);
  const bucket=screen.getByRole('button',{name:/60-89 days/});fireEvent.click(bucket);
  expect(bucket).toHaveAttribute('aria-pressed','true');expect(screen.getByText('Example Donor')).toBeInTheDocument();
  expect(screen.getByText('61 days since assignment')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/90\+ days/}));expect(screen.getByText('No assignments in this view')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'All assignments'}));expect(screen.getByText('Example Donor')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Sort by'),{target:{value:'oldest-outreach'}});
  expect(screen.getByLabelText('Sort by')).toHaveValue('oldest-outreach');expect(reload).not.toHaveBeenCalled();
});
