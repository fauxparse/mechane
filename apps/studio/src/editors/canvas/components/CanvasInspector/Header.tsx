import {
  EditableName,
  InputGroupAddon,
  SidebarHeader,
  TabsList,
  TabsTrigger,
} from "@mechane/design-system";
import { canvasDisplayName, canvasElementDisplayName } from "../../data/canvas-names";
import { elementIconFor } from "../utils";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";

export const Header = () => {
  const { focused, elements, update, onRenameArtboard } = useCanvasInspectorContext();
  const Icon = elementIconFor(elements.map((element) => element.type));
  const selectedElement = elements.length === 1 ? elements[0] : null;
  const selectedCanvas = elements.length === 0 ? focused : null;
  const editable = selectedElement ?? selectedCanvas;
  const label =
    elements.length > 1
      ? `${elements.length} Elements`
      : selectedElement
        ? canvasElementDisplayName(selectedElement)
        : focused
          ? canvasDisplayName(focused)
          : "Selection";

  const commitName = (name: string) => {
    const next = name.trim();
    if (selectedElement) {
      if (next !== (selectedElement.name ?? "")) update({ name: next });
    } else if (selectedCanvas && next && next !== selectedCanvas.name) {
      onRenameArtboard?.(selectedCanvas.artId, next);
    }
  };

  return (
    <SidebarHeader className="pb-0">
      {editable ? (
        <EditableName
          key={selectedElement?.id ?? selectedCanvas?.artId}
          value={editable.name ?? ""}
          placeholder={label}
          ariaLabel="Name"
          onCommit={commitName}
        >
          <InputGroupAddon align="inline-start" className="px-1 mr-0">
            <Icon className="size-4 shrink-0" />
          </InputGroupAddon>
        </EditableName>
      ) : (
        <>
          <span className="truncate grow">{label}</span>
          <Icon className="size-4 shrink-0" />
        </>
      )}
      <TabsList variant="line" className="justify-start -ml-2">
        <TabsTrigger value="properties">Properties</TabsTrigger>
        <TabsTrigger value="interactions">Interactions</TabsTrigger>
      </TabsList>
    </SidebarHeader>
  );
};
