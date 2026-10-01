import { useState } from "react";
import { ImageOff } from "lucide-react";
import { giftPhotoUrl } from "@/utils/stewardshipPhoto";

export function GiftPhotoImage({ src, alt, className = "" }) {
  const [failed, setFailed] = useState(null);
  return <div className={`relative grid place-items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 ${className}`}>
    {failed === src ? <span className="grid justify-items-center gap-2 p-3 text-center text-sm text-gray-500"><ImageOff aria-hidden="true" size={22} />Photo unavailable</span> :
      <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(src)} className="absolute inset-0 h-full w-full object-contain p-2" />}
  </div>;
}
export default function StewardshipGiftPhoto({ item, className }) {
  return item.has_photo ? <GiftPhotoImage src={giftPhotoUrl(item)} alt={item.photo_alt || item.name} className={className} /> : null;
}
