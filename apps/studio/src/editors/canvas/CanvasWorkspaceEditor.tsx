import type { CanvasArtboardDocument } from "../../api/canvas";
import { CanvasRenderer } from "@mechane/rendering";
import { useMemo } from "react";

import "./canvas-workspace-editor.css";

export interface CanvasWorkspaceEditorProps {
  artboards: readonly CanvasArtboardDocument[];
  focusedArtId: string | null;
  onFocusArtboard(artId: string): void;
  onBack(): void;
}

function artboardLabel(artboard: CanvasArtboardDocument): string {
  return (
    artboard.name.trim() || `${artboard.kind === "scene" ? "Scene" : "Block"} ${artboard.artId}`
  );
}

export function CanvasWorkspaceEditor({
  artboards,
  focusedArtId,
  onFocusArtboard,
  onBack,
}: CanvasWorkspaceEditorProps) {
  const ordered = useMemo(
    () =>
      [...artboards].sort(
        (left, right) =>
          left.kind.localeCompare(right.kind) ||
          artboardLabel(left).localeCompare(artboardLabel(right)) ||
          left.artId.localeCompare(right.artId),
      ),
    [artboards],
  );
  const focused = ordered.find((artboard) => artboard.artId === focusedArtId) ?? ordered[0] ?? null;

  return (
    <div className="canvas-workspace-editor" data-focused-art-id={focused?.artId ?? ""}>
      <header className="canvas-workspace-editor__toolbar">
        <button type="button" onClick={onBack}>
          Back to Show
        </button>
        <strong>Canvas</strong>
        <span>
          {ordered.length} artboard{ordered.length === 1 ? "" : "s"}
        </span>
      </header>

      <aside className="canvas-workspace-editor__layers" aria-label="Canvas artboards">
        <h2>Artboards</h2>
        {ordered.length === 0 ? <p>No artboards yet.</p> : null}
        {ordered.map((artboard) => (
          <button
            key={artboard.artId}
            type="button"
            data-artboard-id={artboard.artId}
            data-selected={artboard.artId === focused?.artId ? "true" : "false"}
            onClick={() => onFocusArtboard(artboard.artId)}
          >
            <span>{artboardLabel(artboard)}</span>
            <small>{artboard.kind === "scene" ? "Scene" : "Block"}</small>
          </button>
        ))}
      </aside>

      <main className="canvas-workspace-editor__viewport" aria-label="Canvas workspace">
        <div className="canvas-workspace-editor__world">
          {ordered.map((artboard) => (
            <section
              key={artboard.artId}
              className="canvas-workspace-editor__artboard"
              data-artboard-id={artboard.artId}
              data-focused={artboard.artId === focused?.artId ? "true" : "false"}
              style={{ left: artboard.position.x, top: artboard.position.y }}
              aria-label={artboardLabel(artboard)}
              onClick={() => onFocusArtboard(artboard.artId)}
            >
              <div className="canvas-workspace-editor__artboard-header">
                <span>{artboardLabel(artboard)}</span>
                <small>{artboard.kind === "scene" ? "Scene" : "Block"}</small>
              </div>
              <div className="canvas-workspace-editor__artboard-surface">
                <CanvasRenderer canvas={artboard.canvas} />
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
