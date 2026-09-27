import { buildDonorBriefing } from "@/utils/donorBriefing";
import { briefingDraftContext } from "@/utils/outreachDrafts";
import OutreachDraft from "./OutreachDraft";
import "./DonorBriefing.css";

export default function DonorBriefing(props) {
  const sections = buildDonorBriefing(props);
  return <section className="donor-briefing" aria-label="Donor briefing">
    <p className="donor-briefing__intro">A quick read of the information already saved for this constituent.</p>
    {sections.length ? <dl className="donor-briefing__sections">
      {sections.map(section => <div key={section.key}>
        <dt>{section.title}</dt>
        <dd><p>{section.text}</p><small>{section.source}</small></dd>
      </div>)}
    </dl> : <p>There isn't enough saved information for a briefing yet.</p>}
    <p className="donor-briefing__note">Saved records may not include recent changes in NXT. Only available details are shown.</p>
    <OutreachDraft key={`${props.draftScope || ""}:${props.constituentId}`} label="Prepare for a meeting"
      context={briefingDraftContext({ constituentId: props.constituentId, name: props.name, sections })} />
  </section>;
}
