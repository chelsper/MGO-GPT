import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export default function PortfolioCardActions({
  person,
  isReadOnly,
  fundraiserLabel,
  onOpenPortfolioNextStep,
  onOpenPortfolioDiscussion,
  onOpenPortfolioLogAction,
  onOpenPortfolioOpportunity,
  onAddToTopProspects,
  isAdding,
  isTopProspect,
  topProspect,
  onRemoveFromTopProspects,
  isRemovingFromTopProspects,
  allowSolicitorAssignmentRemoval,
  onRemoveSolicitorAssignment,
  isRemovingSolicitorAssignment,
  removingSolicitorConstituentId,
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const moreRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [placement, setPlacement] = useState({ above: false, maxHeight: 320 });

  useEffect(() => {
    if (!open || isReadOnly) return;
    const closeOutside = (event) => {
      if (!moreRef.current?.contains(event.target)) setOpen(false);
    };
    const placePanel = () => {
      const bar = moreRef.current?.parentElement?.getBoundingClientRect();
      if (!bar || !panelRef.current) return;
      const above = Math.max(0, bar.top - 12);
      const below = Math.max(0, window.innerHeight - bar.bottom - 12);
      const openAbove = below < panelRef.current.scrollHeight && above > below;
      setPlacement({ above: openAbove, maxHeight: Math.min(320, openAbove ? above : below) });
    };
    placePanel();
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    window.addEventListener("resize", placePanel);
    // Reposition on page/container scroll, but not while scrolling the menu itself.
    const onScroll = (event) => {
      if (!panelRef.current?.contains(event.target)) placePanel();
    };
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      window.removeEventListener("resize", placePanel);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open, isReadOnly]);

  useEffect(() => { setOpen(false); }, [isReadOnly]);

  if (isReadOnly) return null;

  const choose = (action) => {
    setOpen(false);
    // Restore focus before a handler opens its own dialog, not afterward.
    triggerRef.current?.focus();
    action?.();
  };
  const isRemovingThisAssignment = isRemovingSolicitorAssignment &&
    String(removingSolicitorConstituentId || "") === String(person.constituentId || "");

  return (
    <div className="portfolio-actions" role="group" aria-label={`Actions for ${person.name || "constituent"}`}>
      <button
        type="button"
        className="portfolio-actions__button portfolio-actions__button--primary"
        onClick={() => onOpenPortfolioNextStep?.(person)}
        disabled={!onOpenPortfolioNextStep}
      >
        Set next step
      </button>
      <button type="button" className="portfolio-actions__button"
        disabled={!onOpenPortfolioLogAction}
        onClick={() => onOpenPortfolioLogAction?.(person)}>
        Log action
      </button>
      <div ref={moreRef} className="portfolio-actions__more" onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          choose();
        }
      }}>
        <button
          ref={triggerRef}
          type="button"
          className="portfolio-actions__button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`More actions for ${person.name || "constituent"}`}
          onClick={() => setOpen(!open)}
        >
          More actions <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <div id={panelId} ref={panelRef}
            className={`portfolio-actions__panel${placement.above ? " portfolio-actions__panel--above" : ""}`}
            style={{ maxHeight: placement.maxHeight }}>
            <button type="button" disabled={!onOpenPortfolioOpportunity}
              onClick={() => choose(() => onOpenPortfolioOpportunity?.(person))}>
              Add opportunity
            </button>
            <button type="button" disabled={!onOpenPortfolioDiscussion}
              onClick={() => choose(() => onOpenPortfolioDiscussion?.(person))}>
              Team discussion
            </button>
            {isTopProspect ? (
              <button type="button"
                disabled={isRemovingFromTopProspects || !topProspect?.id || !onRemoveFromTopProspects}
                onClick={() => choose(() => onRemoveFromTopProspects?.(topProspect))}>
                {isRemovingFromTopProspects ? "Removing..." : "Remove from Top Prospects"}
              </button>
            ) : (
              <button type="button" disabled={isAdding || !onAddToTopProspects}
                onClick={() => choose(() => onAddToTopProspects?.(person))}>
                {isAdding ? "Adding..." : "Add to Top Prospects"}
              </button>
            )}
            {allowSolicitorAssignmentRemoval && (
              <div className="portfolio-actions__assignment">
                <span>Portfolio assignment</span>
                <button type="button" disabled={isRemovingSolicitorAssignment || !onRemoveSolicitorAssignment}
                  onClick={() => choose(() => onRemoveSolicitorAssignment?.(person))}>
                  {isRemovingThisAssignment ? "Removing..." : `Remove me as ${fundraiserLabel}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
