import { Client } from "@heroiclabs/nakama-js";

const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey";
const browserHost = typeof window !== "undefined" ? window.location.hostname : undefined;
const browserProtocol = typeof window !== "undefined" ? window.location.protocol : undefined;
const host = import.meta.env.VITE_NAKAMA_HOST ?? browserHost ?? "127.0.0.1";
const port = import.meta.env.VITE_NAKAMA_PORT ?? "7350";
const useSSL = import.meta.env.VITE_NAKAMA_SSL ? import.meta.env.VITE_NAKAMA_SSL === "true" : browserProtocol === "https:";

export const nakamaClient = new Client(serverKey, host, port, useSSL);
export const nakamaConfig = {
  host,
  port,
  serverKey,
  useSSL,
};

export function getDeviceId() {
  const storageKey = "nakama-device-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  window.localStorage.setItem(storageKey, created);
  return created;
}
