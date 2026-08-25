import { describeDeletion } from "@mechane/commands";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
} from "@mechane/design-system";
import type { DeletionScope } from "@mechane/commands";
import type { Dispatch, SetStateAction } from "react";

import { EditorSlot } from "../../components/EditorLayout/editor-slots";
import { CommandPalette } from "./commands/CommandPalette";
import type { PaletteCommand } from "./commands/palette-commands";
import { GraphInspector } from "./graph/inspector/GraphInspector";
import type { GraphNode } from "@mechane/domain";
import type { GraphInspectorEditing } from "./commands/use-graph-editing";

export interface ShowGraphEditorOverlaysProps {
  selectedNodes: GraphNode[];
  inspector: GraphInspectorEditing;
  message: string | null;
  paletteOpen: boolean;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  paletteCommands: PaletteCommand[];
  pendingDelete: DeletionScope | null;
  setPendingDelete: Dispatch<SetStateAction<DeletionScope | null>>;
  confirmDelete(): void;
}

export function ShowGraphEditorOverlays({
  selectedNodes,
  inspector,
  message,
  paletteOpen,
  setPaletteOpen,
  paletteCommands,
  pendingDelete,
  setPendingDelete,
  confirmDelete,
}: ShowGraphEditorOverlaysProps) {
  return (
    <>
      <EditorSlot name="right">
        <GraphInspector selected={selectedNodes} editing={inspector} />
      </EditorSlot>

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className="absolute inset-x-0 bottom-6 mx-auto w-fit rounded-full border border-border bg-card px-4 py-1.5 text-sm text-card-foreground shadow-lg"
        >
          {message}
        </p>
      ) : null}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={paletteCommands} />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {pendingDelete && pendingDelete.nonEmptyFlows.length === 1
              ? `Delete “${pendingDelete.nonEmptyFlows[0]?.name}”?`
              : "Delete these Flows?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDelete ? `This deletes ${describeDeletion(pendingDelete)}.` : ""} You can undo
            it.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
