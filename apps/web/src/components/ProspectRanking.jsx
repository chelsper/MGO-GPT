"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { GripVertical, ListOrdered, X } from "lucide-react";

const buttonClass = "min-h-11 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

function RankingRow({ prospect, index, count, disabled, onMove }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: prospect.id, disabled });
  return <li ref={setNodeRef}
    style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition, opacity: isDragging ? 0.25 : 1 }}
    className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
    <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
      aria-label={`Drag ${prospect.name} to reorder`} disabled={disabled}
      className="flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-lg border border-gray-200 text-gray-500 focus-visible:outline-indigo-600"
      style={{ cursor: disabled ? "default" : "grab" }}>
      <GripVertical size={20} aria-hidden="true" />
    </button>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-bold text-indigo-700" aria-label={`Rank ${index + 1}`}>{index + 1}</span>
    <div className="min-w-0 flex-1 basis-32">
      <p className="break-words font-semibold text-gray-900">{prospect.name}</p>
      <p className="text-xs text-gray-500">{prospect.askType || "Unspecified ask type"}</p>
    </div>
    <div className="ml-auto flex items-center gap-2">
      <label className="text-xs font-semibold text-gray-600">Position
        <select aria-label={`Position for ${prospect.name}`} disabled={disabled} value={index}
          onChange={(event) => onMove(prospect.id, Number(event.target.value))}
          className="ml-2 min-h-11 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900">
          {Array.from({ length: count }, (_, rank) => <option key={rank} value={rank}>{rank + 1}</option>)}
        </select>
      </label>
      <button type="button" disabled={disabled || index === 0} onClick={() => onMove(prospect.id, 0)} className={buttonClass}
        aria-label={`Move ${prospect.name} to top`}>To top</button>
    </div>
  </li>;
}

export function ProspectRankingDialog({ workspaceId, workspaceName, onClose, onSaved }) {
  const dialog = useRef(null);
  const busyRef = useRef(false);
  const labelId = useId();
  const descriptionId = useId();
  const [loadKey, setLoadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState([]);
  const [error, setError] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dirty = Boolean(snapshot && draft.some((person, index) => person.id !== snapshot.prospects[index]?.id));
  const locked = loading || saving || needsReload;
  const dragged = draft.find((person) => person.id === draggedId);

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setNeedsReload(false);
    async function load() {
      try {
        const response = await fetch(`/api/prospects/reorder?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Could not load the current ranking.");
        if (payload?.workspaceId !== String(workspaceId) || !/^[a-f0-9]{32}$/.test(payload?.version || "") ||
          !Array.isArray(payload?.prospects) || payload.prospects.some((p) => !p?.id || typeof p.name !== "string") ||
          new Set(payload.prospects.map((p) => p.id)).size !== payload.prospects.length) {
          throw new Error("The ranking response was incomplete. Reload to try again.");
        }
        if (controller.signal.aborted) return;
        setSnapshot(payload); setDraft(payload.prospects); setAnnouncement("");
      } catch (err) {
        if (!controller.signal.aborted) { setError(err.message); setNeedsReload(true); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [workspaceId, loadKey]);

  useEffect(() => {
    if (!dirty && !saving) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  function close() {
    if (busyRef.current) return;
    if (!dirty || window.confirm("Discard your unsaved ranking changes?")) onClose();
  }
  function move(id, target) {
    if (locked) return;
    const from = draft.findIndex((person) => person.id === id);
    if (from < 0 || target < 0 || target >= draft.length || from === target) return;
    setDraft(arrayMove(draft, from, target));
    setAnnouncement(`${draft[from].name} moved to position ${target + 1}. Not yet saved.`);
  }
  async function save() {
    if (busyRef.current || locked || !dirty || draggedId) return;
    busyRef.current = true; setSaving(true); setError("");
    const orderedIds = draft.map((person) => person.id);
    try {
      const response = await fetch("/api/prospects/reorder", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: String(workspaceId), orderedIds, version: snapshot.version }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Could not confirm the saved order. Reload before trying again.");
      if (!payload?.success || payload.workspaceId !== String(workspaceId) || JSON.stringify(payload.orderedIds) !== JSON.stringify(orderedIds)) {
        throw new Error("Could not confirm the saved order. Reload before trying again.");
      }
      onSaved(orderedIds);
      onClose();
    } catch (err) {
      setError(err.message || "Could not confirm the saved order. Reload before trying again.");
      setNeedsReload(true);
    } finally { busyRef.current = false; setSaving(false); }
  }

  return <dialog ref={dialog} aria-labelledby={labelId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); close(); }}
    className="m-auto max-h-[92dvh] w-[min(800px,96vw)] overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-0 text-gray-900 shadow-xl backdrop:bg-black/40">
    <div className="flex max-h-[92dvh] flex-col">
      <header className="shrink-0 border-b border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id={labelId} className="text-xl font-bold">Reorder Top Prospects</h2>
            <p className="mt-1 text-sm font-semibold text-indigo-700">{workspaceName}</p></div>
          <button type="button" aria-label="Close ranking" disabled={saving} onClick={close} className={buttonClass}><X size={20} aria-hidden="true" /></button>
        </div>
        <p id={descriptionId} className="mt-3 text-sm text-gray-600">All active prospects are included, regardless of page filters. Drag the handle or choose a position. Changes stay in this draft until you save; nothing is changed in NXT.</p>
        <p className="mt-2 text-xs text-gray-500">On touch screens, hold the handle to drag. With a keyboard, focus a handle, press Space, use the arrow keys, then Space to drop or Escape to cancel.</p>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5" aria-busy={loading || saving}>
        {loading && <p role="status" className="py-6 text-center">Loading the current ranking...</p>}
        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p role="alert" className="text-sm text-red-800">{error}</p>
          <button type="button" className={`${buttonClass} mt-3`} disabled={loading || saving} onClick={() => {
            if (!dirty || window.confirm("Reload the saved ranking and discard this draft?")) setLoadKey((value) => value + 1);
          }}>Reload current ranking</button>
        </div>}
        {!loading && snapshot && <DndContext sensors={sensors} collisionDetection={closestCenter}
          accessibility={{ container: dialog.current,
            announcements: {
              onDragStart: ({ active }) => `Picked up ${draft.find((p) => p.id === active.id)?.name || "prospect"}.`,
              onDragOver: ({ over }) => over ? `Position ${draft.findIndex((p) => p.id === over.id) + 1} of ${draft.length}.` : "Outside the ranking. Drop here to cancel this move.",
              onDragEnd: ({ over }) => over ? "Move complete. Save order to keep your changes." : "Move cancelled.",
              onDragCancel: () => "Move cancelled. Your draft order is unchanged.",
            },
            screenReaderInstructions: { draggable: "Press Space to pick up a prospect. Use arrow keys to move, Space to drop, or Escape to cancel. You can also choose a position from the list." } }}
          onDragStart={({ active }) => setDraggedId(active.id)}
          onDragCancel={() => setDraggedId(null)}
          onDragEnd={({ active, over }) => { setDraggedId(null); if (over) move(active.id, draft.findIndex((p) => p.id === over.id)); }}>
          <SortableContext items={draft.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ol aria-label="Active prospect ranking" className="space-y-2">
              {draft.map((prospect, index) => <RankingRow key={prospect.id} prospect={prospect} index={index} count={draft.length} disabled={locked} onMove={move} />)}
            </ol>
          </SortableContext>
          <DragOverlay dropAnimation={null}>{dragged && <div className="rounded-xl border-2 border-indigo-500 bg-white p-4 font-semibold shadow-lg">{dragged.name}</div>}</DragOverlay>
        </DndContext>}
        {!loading && snapshot && !draft.length && <p className="py-6 text-center text-gray-600">No active prospects to rank.</p>}
      </div>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">{saving ? "Saving order..." : dirty ? "Unsaved order changes" : `${draft.length} active prospects`}</p>
        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={close} className={buttonClass}>Cancel</button>
          <button type="button" disabled={locked || !dirty || Boolean(draggedId)} onClick={save}
            className="min-h-11 rounded-lg bg-[#5B4BFA] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Save order"}</button>
        </div>
      </footer>
    </div>
  </dialog>;
}

export default function ProspectRanking({ workspaceId, workspaceName, onSaved }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  return <div>
    <button type="button" disabled={!workspaceId} onClick={() => { setMessage(""); setOpen(true); }} className={`${buttonClass} inline-flex items-center gap-2`}>
      <ListOrdered size={17} aria-hidden="true" />Reorder prospects
    </button>
    {message && <p role="status" className="mt-2 text-sm font-semibold text-green-700">{message}</p>}
    {open && <ProspectRankingDialog workspaceId={workspaceId} workspaceName={workspaceName} onClose={() => setOpen(false)}
      onSaved={(ids) => { onSaved(ids); setMessage("Prospect order saved."); }} />}
  </div>;
}
