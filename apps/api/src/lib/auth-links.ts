export function buildStudioResetUrl(authUrl: string, studioOrigin: string): string {
  const token = new URL(authUrl).pathname.split("/").filter(Boolean).at(-1);
  if (!token) throw new Error("Better Auth reset URL is missing its token.");

  const resetUrl = new URL("/reset-password", studioOrigin);
  resetUrl.searchParams.set("token", token);
  return resetUrl.toString();
}
