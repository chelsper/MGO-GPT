import { isOrganizationLogo, prepareOrganizationLogo } from "./organizationLogo";

export const prepareGiftPhoto = file => prepareOrganizationLogo(file, "photo");
export const isGiftPhoto = isOrganizationLogo;
export function validPhotoChange(photo, creating = false) {
  if (!photo || typeof photo !== "object" || Array.isArray(photo)) return false;
  const fields = { replace: ["operation", "dataUrl", "alt"], describe: ["operation", "alt"], remove: ["operation"] };
  if (!Object.hasOwn(fields, photo.operation) || Object.keys(photo).some(key => !fields[photo.operation].includes(key))) return false;
  if (creating && photo.operation !== "replace") return false;
  if (photo.operation === "remove") return true;
  return typeof photo.alt === "string" && photo.alt.trim().length > 0 && photo.alt.length <= 240 &&
    (photo.operation !== "replace" || isGiftPhoto(photo.dataUrl));
}
export const giftPhotoUrl = item => `/api/stewardship/inventory/photo?id=${encodeURIComponent(item.id)}&v=${encodeURIComponent(item.photo_version)}`;
