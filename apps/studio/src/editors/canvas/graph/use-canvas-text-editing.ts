import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

type TextEditState = {
  artId: string;
  canvasId: string;
  elementId: string;
  originalContent: string;
};

type TextEditingProps = {
  ordered: readonly { artId: string; canvasId: string }[];
  workspaceRef: RefObject<HTMLElement | null>;
  onUpdateElement?(canvasId: string, elementId: string, properties: Record<string, unknown>): void;
};

function findTextElement(workspace: HTMLElement | null, edit: TextEditState): HTMLElement | null {
  const artboard = workspace
    ? [...workspace.querySelectorAll<HTMLElement>("[data-artboard-id]")].find(
        (candidate) => candidate.dataset.artboardId === edit.artId,
      )
    : null;
  return (
    [...(artboard?.querySelectorAll<HTMLElement>("[data-element-type='text']") ?? [])].find(
      (candidate) => candidate.dataset.elementId === edit.elementId,
    ) ?? null
  );
}

export function useCanvasTextEditing({ ordered, workspaceRef, onUpdateElement }: TextEditingProps) {
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const textEditRef = useRef<TextEditState | null>(null);
  const beginTextEdit = useCallback(
    (elementId: string, event: ReactMouseEvent<HTMLElement>) => {
      const source =
        event.currentTarget.dataset.elementType === "text"
          ? event.currentTarget
          : event.currentTarget.ownerDocument
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>("[data-element-type='text']");
      const artboard = source?.closest<HTMLElement>("[data-artboard-id]");
      const artId = artboard?.dataset.artboardId;
      const artboardDocument = ordered.find((candidate) => candidate.artId === artId);
      if (!artId || !artboardDocument || !source) return;
      event.preventDefault();
      event.stopPropagation();
      const next = {
        artId,
        canvasId: artboardDocument.canvasId,
        elementId,
        originalContent: source.textContent ?? "",
      };
      textEditRef.current = next;
      setTextEdit(next);
    },
    [ordered],
  );
  const commitTextEdit = useCallback(() => {
    const edit = textEditRef.current;
    if (!edit) return;
    const current = findTextElement(workspaceRef.current, edit)?.textContent ?? "";
    textEditRef.current = null;
    setTextEdit(null);
    if (current !== edit.originalContent) {
      onUpdateElement?.(edit.canvasId, edit.elementId, { content: current });
    }
  }, [onUpdateElement, workspaceRef]);
  useLayoutEffect(() => {
    if (!textEdit) return;
    const element = findTextElement(workspaceRef.current, textEdit);
    if (!element) return;
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [textEdit, workspaceRef]);
  const handleTextKeyDown = useCallback(
    (_elementId: string, event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        commitTextEdit();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        commitTextEdit();
        return;
      }
      // Let browser editing commands (typing, deletion, undo) work without letting the
      // Canvas keyboard handlers interpret the same key as an Element command.
      event.stopPropagation();
    },
    [commitTextEdit],
  );
  return {
    textEdit,
    textEditRef,
    beginTextEdit,
    commitTextEdit,
    handleTextKeyDown,
  };
}
