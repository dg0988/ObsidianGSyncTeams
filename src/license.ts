import { requestUrl } from "obsidian";
import nacl from "tweetnacl";

/**
 * GSync Teams licensing.
 * - License key (GST-…): Ed25519-signed by the seller; says who bought it and for how many users.
 * - Activation (GSA-…): signed by the seller's server for one device. Each user may use
 *   DEVICES_PER_USER devices. Activating needs the internet once; after that it works offline
 *   until it expires, and it's refreshed in the background while online.
 */
export const PUBLIC_KEY = "1gnCE3y5G9vtHYG2CkXCv60Iqr9T7UK0fZR9Ds8ckms";
/** The GSync Teams store and activation server. */
export const SERVER = "https://gsync-teams.dima0988.workers.dev";
/** The sales page on ID Communications' site. */
export const BUY_URL = "https://idcomm.tech/gsync-teams";
export const DEVICES_PER_USER = 2;
export const PRICE = "from $49 one-time for 3 users";
/** Refresh an activation in the background once it's this old. */
const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface License {
  name: string;
  tier: string;
  issued: string;
  id: string;
  users: number;
  devices: number;
}

export interface Activation {
  licenseId: string;
  device: string;
  issuedAt: number;
  expiresAt: number;
}

export interface DeviceInfo {
  id: string;
  name: string;
  added: string;
  seen: string;
}

export interface DeviceList {
  used: number;
  limit: number;
  devices: DeviceInfo[];
}

const unb64u = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

/** Verify `<prefix><payload>.<signature>` and return the parsed payload. */
function readSigned(token: string, prefix: string, publicKey: string): Record<string, unknown> | null {
  const m = (token || "").trim().match(new RegExp(`^${prefix}([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$`));
  if (!m) return null;
  try {
    if (!nacl.sign.detached.verify(new TextEncoder().encode(m[1]), unb64u(m[2]), unb64u(publicKey))) return null;
    const p: unknown = JSON.parse(new TextDecoder().decode(unb64u(m[1])));
    return p && typeof p === "object" ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Returns the license if the key's signature is valid and it's a Teams key, otherwise null. */
export function verifyLicense(key: string, publicKey = PUBLIC_KEY): License | null {
  const p = readSigned(key, "GST-", publicKey);
  if (!p || p.t !== "teams" || typeof p.n !== "string") return null;
  const users = typeof p.s === "number" && Number.isInteger(p.s) && p.s > 0 ? p.s : 3;
  return {
    name: p.n,
    tier: "teams",
    issued: typeof p.i === "string" ? p.i : "",
    id: typeof p.id === "string" ? p.id : "",
    users,
    devices: users * DEVICES_PER_USER,
  };
}

/** Returns the activation if it was signed for this license and this device and hasn't expired. */
export function verifyActivation(token: string, license: License, device: string, now = Date.now(), publicKey = PUBLIC_KEY): Activation | null {
  const p = readSigned(token, "GSA-", publicKey);
  if (!p || p.l !== license.id || p.d !== device || typeof p.e !== "number" || typeof p.iat !== "number") return null;
  if (now > p.e) return null;
  return { licenseId: license.id, device, issuedAt: p.iat, expiresAt: p.e };
}

export const needsRefresh = (a: Activation, now = Date.now()) => now - a.issuedAt > REFRESH_AFTER_MS;

/**
 * Per-device storage, outside the vault, so a vault synced between devices (by GSync's settings
 * sync, Drive for Desktop or anything else) never copies one device's identity to another.
 */
export class DeviceStore {
  private memory = new Map<string, string>();

  private get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  private set(key: string, value: string | null): void {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      if (value === null) this.memory.delete(key);
      else this.memory.set(key, value);
    }
  }

  /** A random id for this device, created once. */
  deviceId(): string {
    let id = this.get("gsync-teams:device");
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = crypto.randomUUID().replace(/-/g, "");
      this.set("gsync-teams:device", id);
    }
    return id;
  }

  activation(licenseId: string): string | null {
    return this.get(`gsync-teams:activation:${licenseId}`);
  }

  saveActivation(licenseId: string, token: string | null): void {
    this.set(`gsync-teams:activation:${licenseId}`, token);
  }
}

/** Error from the activation server, with the device list when the limit is reached. */
export class ServerError extends Error {
  constructor(message: string, readonly status: number, readonly list?: DeviceList) {
    super(message);
  }
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let r;
  try {
    r = await requestUrl({ url: `${SERVER}${path}`, method: "POST", contentType: "application/json", body: JSON.stringify(body), throw: false });
  } catch {
    throw new ServerError("Couldn't reach the GSync Teams server. Check your internet connection.", 0);
  }
  let data: Record<string, unknown> = {};
  try {
    data = r.json as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  if (r.status >= 400) {
    const list = Array.isArray(data.devices) ? (data as unknown as DeviceList) : undefined;
    throw new ServerError(typeof data.error === "string" ? data.error : `GSync Teams server error (${r.status}).`, r.status, list);
  }
  return data as T;
}

/** Activate this device (takes a slot), or with `refresh`, only renew an existing activation. */
export const activateDevice = (key: string, device: string, name: string, refresh = false) =>
  post<DeviceList & { token: string }>("/api/activate", { key, device, name, refresh });
export const listDevices = (key: string) => post<DeviceList>("/api/devices", { key });
export const removeDevice = (key: string, device: string) => post<DeviceList>("/api/deactivate", { key, device });
