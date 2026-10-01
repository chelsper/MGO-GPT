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
