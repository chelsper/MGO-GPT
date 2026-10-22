import { inventoryAccess } from "../route";
import { readGiftPhoto } from "@/app/api/utils/stewardshipInventory";
import { inventoryId } from "@/utils/stewardshipInventory";
import { isGiftPhoto } from "@/utils/stewardshipPhoto";

const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin" };
export async function GET(request) {
  try {
    const context = await inventoryAccess(request);
    if (context.error) return context.error;
    const url = new URL(request.url);
    const id = url.searchParams.get("id"), rawVersion = url.searchParams.get("v");
    if (!inventoryId(id) || !/^[1-9]\d{0,9}$/.test(rawVersion || "") || Number(rawVersion) > 2147483647) return new Response(null, { status: 400, headers });
    const photo = await readGiftPhoto(context.actor, id, Number(rawVersion));
    if (!isGiftPhoto(photo)) return new Response(null, { status: 404, headers });
    return new Response(Buffer.from(photo.split(",")[1], "base64"), { headers: { ...headers, "Content-Type": "image/png", "Content-Disposition": 'inline; filename="gift-photo.png"' } });
  } catch { return new Response(null, { status: 500, headers }); }
}
