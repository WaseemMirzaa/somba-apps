import { authApi } from "@/lib/realtime/auth-api";

/** Photos the shopper may attach (returns, disputes, chat, support): JPEG/PNG/WebP up to 5 MB each. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Upload one photo to the platform (`POST /api/v1/uploads`) and return its public URL. */
export async function uploadShopPhoto(file: File, fr = false): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error(fr ? "Seules les images JPEG, PNG ou WebP sont acceptées." : "Only JPEG, PNG or WebP images are allowed.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(fr ? "Cette image dépasse 5 Mo." : "That image is larger than 5 MB.");
  }
  const send = (token: string | null) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${authApi.apiUrl}/api/v1/uploads`, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: fd,
    });
  };
  let res = await send(authApi.getAccess());
  if (res.status === 401) {
    const refresh = authApi.getRefresh();
    if (refresh) {
      try {
        const fresh = await authApi.refresh(refresh);
        authApi.saveTokens(fresh);
        res = await send(fresh.accessToken);
      } catch {
        /* fall through with the 401 */
      }
    }
  }
  const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string | string[] };
  if (!res.ok || !json.url) {
    const msg = Array.isArray(json.message) ? json.message.join(" ") : json.message;
    throw new Error(msg ?? (fr ? `Échec du téléversement (${res.status}).` : `Upload failed (${res.status}).`));
  }
  return json.url;
}
