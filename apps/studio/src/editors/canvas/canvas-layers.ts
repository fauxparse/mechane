import type { Element, FrameElement } from "@mechane/domain";

export interface CanvasLayerEntry {
  readonly element: Element;
  readonly depth: number;
  readonly parentId: string | null;
}

export function layerChildren(element: FrameElement): readonly Element[] {
  return [...(element.children ?? [])].sort(
    (left, right) =>
      (right.rank ?? "").localeCompare(left.rank ?? "") || right.id.localeCompare(left.id),
  );
}

export function flattenCanvasLayers(root: FrameElement): CanvasLayerEntry[] {
  const result: CanvasLayerEntry[] = [{ element: root, depth: 0, parentId: null }];
  const visit = (element: Element, depth: number) => {
    if (element.type !== "frame") return;
    for (const child of layerChildren(element)) {
      result.push({ element: child, depth, parentId: element.id });
      visit(child, depth + 1);
    }
  };
  visit(root, 1);
  return result;
}

export function layerMatches(entry: CanvasLayerEntry, query: string): boolean {
  if (!query.trim()) return true;
  const text = `${entry.element.name ?? ""} ${entry.element.id} ${entry.element.type}`.toLowerCase();
  return text.includes(query.trim().toLowerCase());
}
