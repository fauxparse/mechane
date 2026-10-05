import { useEffect, useState } from "react";

export interface QueryRead<T> {
  readonly data: T | undefined;
  readonly isFetching: boolean;
}

/**
 * The first data a query delivers once it has settled, captured once.
 *
 * An editor opens a document and keeps it: its command stack owns the document from then on.
 * Opening from whatever the cache holds is wrong when the cache is behind the server — another
 * editor saved edits the cache does not mirror, such as a Scene created in the Show editor and
 * then opened in the Canvas. React Query hands that cached copy over while the mount refetch is
 * still in flight, so the latch waits for the fetch to settle and opens the server's answer.
 */
export function useOpenedQueryData<T>({ data, isFetching }: QueryRead<T>): T | undefined {
  const [opened, setOpened] = useState<{ readonly data: T } | null>(null);
  useEffect(() => {
    if (!opened && data !== undefined && !isFetching) setOpened({ data });
  }, [data, isFetching, opened]);
  return opened?.data;
}
