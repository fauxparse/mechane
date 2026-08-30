import { blockExtractionProblem } from "@mechane/commands";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommandPalette } from "../../show/commands/CommandPalette";
import type { PaletteCommand } from "../../show/commands/palette-commands";
import { focusContext } from "../../show/keyboard/focus-context";
import { useEditorKeys } from "../../show/keyboard/use-editor-keys";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import type {
  CanvasBlockCreationResult,
  CanvasWorkspaceEditorProps,
} from "../canvas-workspace-types";
import type { CanvasSelection } from "./canvas-selection";
import type { CanvasTool } from "../Toolbar/Toolbar";
import { canvasToolFor } from "../keyboard/canvas-keyboard";

interface CanvasWorkspaceEditorCommandsProps {
  readonly ordered: readonly CanvasArtboardDocument[];
  readonly focused: CanvasArtboardDocument | null;
  readonly selection: CanvasSelection;
  setTool(tool: CanvasTool): void;
  zoomIn(): void;
  zoomOut(): void;
  resetCamera(): void;
  setRenamingArtId(artId: string | null): void;
  onFocusArtboard(artId: string): void;
  frameCreatedBlock(result: CanvasBlockCreationResult): void;
  setSelection(selection: CanvasSelection): void;
  blocks?: CanvasWorkspaceEditorProps["blocks"];
  onPlaceBlock: CanvasWorkspaceEditorProps["onPlaceBlock"];
  onCreateBlockFromSelection: CanvasWorkspaceEditorProps["onCreateBlockFromSelection"];
  onDeleteElements: CanvasWorkspaceEditorProps["onDeleteElements"];
}

/** Owns the Canvas editor's command palette and keyboard command wiring. */
export function CanvasWorkspaceEditorCommands({
  ordered,
  focused,
  selection,
  setTool,
  zoomIn,
  zoomOut,
  resetCamera,
  setRenamingArtId,
  onFocusArtboard,
  blocks,
  onPlaceBlock,
  onCreateBlockFromSelection,
  onDeleteElements,
  frameCreatedBlock,
  setSelection,
}: CanvasWorkspaceEditorCommandsProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const deleteSelection = useCallback(() => {
    const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
    if (artboard && selection.elementIds.length > 0) {
      onDeleteElements?.(artboard.canvasId, selection.elementIds);
    }
  }, [onDeleteElements, ordered, selection.artId, selection.elementIds]);
  const selectedArtboard = useMemo(
    () => ordered.find((candidate) => candidate.artId === selection.artId) ?? null,
    [ordered, selection.artId],
  );
  // Why the command is unavailable, said in the palette rather than discovered by pressing it.
  const blockFromSelectionProblem = useMemo(() => {
    if (!selectedArtboard || selection.elementIds.length === 0) return "select an Element first";
    return blockExtractionProblem(selectedArtboard.canvas, selection.elementIds);
  }, [selectedArtboard, selection.elementIds]);
  const createBlockFromSelection = useCallback(() => {
    if (!selectedArtboard || blockFromSelectionProblem) return;
    const created = onCreateBlockFromSelection?.(selectedArtboard.canvasId, selection.elementIds);
    if (created) {
      setSelection({ artId: created.canvasId, elementIds: [] });
      frameCreatedBlock(created);
      onFocusArtboard(created.canvasId);
    }
  }, [
    blockFromSelectionProblem,
    frameCreatedBlock,
    onCreateBlockFromSelection,
    onFocusArtboard,
    selectedArtboard,
    selection.elementIds,
    setSelection,
  ]);
  const selectAll = useCallback(() => {
    if (!focused) return;
    const ids = (focused.canvas.root.children ?? []).flatMap((element) => [
      element.id,
      ...(element.children ?? []).map((child) => child.id),
    ]);
    setSelection({ artId: focused.artId, elementIds: ids });
  }, [focused, setSelection]);
  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "create-rectangle",
        label: "Create Rectangle",
        scope: "canvas",
        run: () => setTool("rect"),
      },
      {
        id: "create-ellipse",
        label: "Create Ellipse",
        scope: "canvas",
        run: () => setTool("ellipse"),
      },
      { id: "create-text", label: "Create Text", scope: "canvas", run: () => setTool("text") },
      { id: "create-image", label: "Create Image", scope: "canvas", run: () => setTool("image") },
      ...(blocks ?? []).map((block) => ({
        id: `place-block-${block.id}`,
        label: `Place ${block.name}`,
        scope: "canvas" as const,
        run: () => onPlaceBlock?.(block.id),
      })),
      { id: "create-frame", label: "Create Frame", scope: "canvas", run: () => setTool("frame") },
      { id: "create-block", label: "Create Block", scope: "canvas", run: () => setTool("block") },
      { id: "zoom-in", label: "Zoom In", scope: "canvas", run: zoomIn },
      { id: "zoom-out", label: "Zoom Out", scope: "canvas", run: zoomOut },
      { id: "reset-view", label: "Reset View", scope: "canvas", run: resetCamera },
      {
        id: "create-block-from-selection",
        label: "Create Block from Selection",
        scope: "selection",
        disabledReason: blockFromSelectionProblem ?? undefined,
        run: createBlockFromSelection,
      },
      {
        id: "delete-selection",
        label: "Delete Selection",
        scope: "selection",
        disabledReason: selection.elementIds.length === 0 ? "select an Element first" : undefined,
        run: deleteSelection,
      },
    ],
    [
      blockFromSelectionProblem,
      blocks,
      createBlockFromSelection,
      deleteSelection,
      onPlaceBlock,
      resetCamera,
      selection.elementIds.length,
      setTool,
      zoomIn,
      zoomOut,
    ],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const nextTool = canvasToolFor(event, focusContext());
      if (!nextTool) return;
      event.preventDefault();
      setTool(nextTool);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool]);
  useEditorKeys(
    useMemo(
      () => ({
        "open-palette": () => setPaletteOpen(true),
        "delete-selection": deleteSelection,
        rename: () => setRenamingArtId(selection.artId),
        "select-all": selectAll,
        "create-block": createBlockFromSelection,
        "fit-graph": resetCamera,
        "zoom-to-selection": resetCamera,
        deselect: () => setSelection({ artId: null, elementIds: [] }),
      }),
      [
        createBlockFromSelection,
        deleteSelection,
        focused,
        resetCamera,
        selection.artId,
        selectAll,
        setRenamingArtId,
        setSelection,
      ],
    ),
    { allowCanvasPanelCommands: true },
  );
  return (
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={paletteCommands} />
  );
}
