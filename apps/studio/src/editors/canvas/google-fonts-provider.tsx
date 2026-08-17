import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import type { PropsWithChildren } from "react";

import { fetchGoogleFonts, GOOGLE_FONTS_API_KEY, type GoogleFont } from "./google-fonts";

export interface GoogleFontsState {
  readonly data: readonly GoogleFont[];
  readonly isPending: boolean;
  readonly isError: boolean;
}

const GoogleFontsContext = createContext<GoogleFontsState | null>(null);

export function GoogleFontsProvider({ children }: PropsWithChildren) {
  const query = useQuery({
    queryKey: ["google-fonts"],
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchGoogleFonts(signal),
    enabled: Boolean(GOOGLE_FONTS_API_KEY),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const value = useMemo<GoogleFontsState>(
    () => ({
      data: query.data ?? [],
      isPending: query.isPending,
      isError: query.isError,
    }),
    [query.data, query.isError, query.isPending],
  );
  return <GoogleFontsContext.Provider value={value}>{children}</GoogleFontsContext.Provider>;
}

export function StaticGoogleFontsProvider({
  children,
  fonts,
}: PropsWithChildren<{ fonts: readonly GoogleFont[] }>) {
  const value = useMemo<GoogleFontsState>(
    () => ({ data: fonts, isPending: false, isError: false }),
    [fonts],
  );
  return <GoogleFontsContext.Provider value={value}>{children}</GoogleFontsContext.Provider>;
}

export function useGoogleFonts(): GoogleFontsState {
  const value = useContext(GoogleFontsContext);
  if (!value) throw new Error("useGoogleFonts must be used within a GoogleFontsProvider");
  return value;
}
