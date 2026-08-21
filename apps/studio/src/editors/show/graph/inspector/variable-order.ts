/** Returns the ids after moving an item to its projected sortable index, or null for a no-op. */
export function reorderVariableIndices(
  variableIds: readonly string[],
  sourceIndex: number,
  targetIndex: number,
): string[] | null {
  if (
    sourceIndex < 0 ||
    sourceIndex >= variableIds.length ||
    targetIndex < 0 ||
    targetIndex >= variableIds.length ||
    sourceIndex === targetIndex
  ) {
    return null;
  }
  const next = [...variableIds];
  const [source] = next.splice(sourceIndex, 1);
  if (!source) return null;
  next.splice(targetIndex, 0, source);
  return next;
}
