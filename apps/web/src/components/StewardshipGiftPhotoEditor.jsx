import { useEffect, useRef, useState } from "react";
import { giftPhotoUrl, prepareGiftPhoto } from "@/utils/stewardshipPhoto";
import { GiftPhotoImage } from "./StewardshipGiftPhoto";

export default function StewardshipGiftPhotoEditor({ item, value, disabled, onChange, onBusyChange }) {
  const attempt = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { attempt.current++; }, []);
  const src = value?.operation === "remove" ? null : value?.operation === "replace" ? value.dataUrl : item?.has_photo ? giftPhotoUrl(item) : null;
  const alt = value?.alt ?? item?.photo_alt ?? "";
  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const version = ++attempt.current;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const dataUrl = await prepareGiftPhoto(file);
      if (version === attempt.current) onChange({ operation: "replace", dataUrl, alt });
    } catch (failure) { if (version === attempt.current) setError(failure.message); }
    finally { if (version === attempt.current) { setBusy(false); onBusyChange(false); } }
  }
  return <section className="grid min-w-0 gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4" aria-label="Item photo">
    <h3 className="font-semibold">Item photo <span className="text-sm font-normal text-gray-500">(optional)</span></h3>
    <p className="text-sm text-gray-600">Help staff identify this gift. Changes apply when you save the item; stock and recipient history stay unchanged.</p>
    {src && <GiftPhotoImage src={src} alt={alt || "Selected gift photo preview"} className="h-40 w-full" />}
    <label className="grid min-w-0 gap-2 text-sm font-semibold">{src ? "Replace photo" : "Choose photo"}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || busy} onChange={choose} className="block min-w-0 w-full text-sm font-normal file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3" />
    </label>
    <p className="text-xs text-gray-500">PNG, JPEG, or WebP, up to 2 MB. Resized to a small PNG (up to 512 pixels / 96 KB); metadata is removed. No external image links.</p>
    {src && <>
      <label className="grid gap-2 text-sm font-semibold">Photo description
        <input required maxLength={240} value={alt} disabled={disabled || busy} placeholder="For example, green JU blanket with embroidered logo" className="min-h-11 min-w-0 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 font-normal"
          onChange={event => onChange(value?.operation === "replace" ? { ...value, alt: event.target.value } : { operation: "describe", alt: event.target.value })} />
        <span className="text-xs font-normal text-gray-500">A short visual description for people using a screen reader.</span>
      </label>
      <button type="button" disabled={disabled || busy} onClick={() => { setError(""); onChange(item?.has_photo ? { operation: "remove" } : undefined); }} className="min-h-11 justify-self-start rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold">Remove photo</button>
    </>}
    {value && <button type="button" disabled={disabled || busy} className="min-h-11 justify-self-start text-sm font-semibold text-emerald-800 underline" onClick={() => { setError(""); onChange(undefined); }}>Undo photo changes</button>}
    {busy && <p role="status" className="text-sm">Preparing photo preview...</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </section>;
}
