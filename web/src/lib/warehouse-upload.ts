import { httpErrorText, currentLocale } from "@/lib/api-errors";
import { authApi } from "@/lib/realtime/auth-api";

/** Upload one photo (JPEG/PNG/WebP, ≤ 5 MB) to the platform and return its URL (used for support attachments). */
export async function uploadPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Only JPEG, PNG or WebP images are allowed.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("That image is larger than 5 MB.");
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
    if (authApi.getRefresh()) {
      try {
        // Rotates the refresh token and stores the new pair (shared with any other refresh in flight in this tab).
        const fresh = await authApi.refreshStored();
        res = await send(fresh.accessToken);
      } catch {
        /* fall through with the 401 */
      }
    }
  }
  const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string | string[]; messageFr?: string | string[] };
  if (!res.ok || !json.url) {
    const msg = httpErrorText(json, currentLocale());
    throw new Error(msg ?? `Upload failed (${res.status}).`);
  }
  return json.url;
}
