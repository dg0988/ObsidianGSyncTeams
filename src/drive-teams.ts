import type { GSyncApi } from "./gsync-api";

const API = "https://www.googleapis.com/drive/v3";

export type DriveRole = "reader" | "commenter" | "writer" | "fileOrganizer" | "organizer" | "owner";

export interface DrivePermission {
  id: string;
  type: "user" | "group" | "domain" | "anyone";
  role: DriveRole;
  emailAddress?: string;
  displayName?: string;
  domain?: string;
  /** Inherited from a parent folder or the Shared Drive (can't be changed here). */
  inherited?: boolean;
}

/** Escape a value for a Drive query string. */
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Look up a Shared Drive the user belongs to, by its exact name. */
export async function findSharedDrive(api: GSyncApi, name: string): Promise<string> {
  const params = new URLSearchParams({ q: `name = '${q(name)}'`, fields: "drives(id,name)", pageSize: "10" });
  const r = await api.request(`${API}/drives?${params.toString()}`);
  const drives = (r.json as { drives?: { id: string; name: string }[] }).drives ?? [];
  const match = drives.find((d) => d.name === name);
  if (!match) throw new Error(`Shared drive "${name}" not found, or you're not a member of it.`);
  return match.id;
}

export async function listPermissions(api: GSyncApi, fileId: string): Promise<DrivePermission[]> {
  const fields = "permissions(id,type,role,emailAddress,displayName,domain,permissionDetails(inherited))";
  const r = await api.request(`${API}/files/${encodeURIComponent(fileId)}/permissions?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`);
  const list = (r.json as { permissions?: (DrivePermission & { permissionDetails?: { inherited?: boolean }[] })[] }).permissions ?? [];
  return list.map(({ permissionDetails, ...p }) => ({ ...p, inherited: !!permissionDetails?.length && permissionDetails.every((d) => d.inherited) }));
}

export async function addPermission(api: GSyncApi, fileId: string, emailAddress: string, role: DriveRole, notify: boolean): Promise<void> {
  await api.request(`${API}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true&sendNotificationEmail=${notify}`, {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({ type: "user", role, emailAddress }),
    retry: false,
  });
}

export async function updatePermission(api: GSyncApi, fileId: string, permissionId: string, role: DriveRole): Promise<void> {
  await api.request(`${API}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`, {
    method: "PATCH",
    contentType: "application/json",
    body: JSON.stringify({ role }),
  });
}

export async function removePermission(api: GSyncApi, fileId: string, permissionId: string): Promise<void> {
  await api.request(`${API}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`, {
    method: "DELETE",
  });
}
