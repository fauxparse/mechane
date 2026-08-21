export const DEPLOYED_API_URL = "https://api.mechane.dev";
export const LOCAL_API_URL = "http://localhost:4000";

export function defaultApiBaseUrl(production: boolean, devProxy: boolean): string {
  return production || devProxy ? DEPLOYED_API_URL : LOCAL_API_URL;
}
export function shouldUseRealtimeSocket(production: boolean, devProxy: boolean): boolean {
  return !production || devProxy;
}
