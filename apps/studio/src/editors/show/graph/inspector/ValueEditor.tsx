import { typeLabel as graphTypeLabel } from "../node-kinds";

import { Button } from "@mechane/design-system";
import { defaultValueForType, formatValuePath } from "@mechane/domain";

import { ArrayEditor } from "./ArrayEditor";
import { ShapeEditor } from "./ShapeEditor";
import { SourcePrimitiveInput } from "./SourcePrimitiveInput";
import type { ValueEditorProps } from "./source-value-types";

export function ValueEditor(props: ValueEditorProps) {
  const { type, value, shapes, onChange } = props;
  if (typeof type === "string") {
    return (
      <SourcePrimitiveInput key={formatValuePath(props.path.map(String))} {...props} type={type} />
    );
  }
  if (value === null) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange(defaultValueForType(type, shapes))}
      >
        Use {graphTypeLabel(type, shapes) ?? "value"} value
      </Button>
    );
  }
  if (type.kind === "array") {
    return <ArrayEditor {...props} type={type} renderValue={ValueEditor} />;
  }
  if (type.kind === "shape") {
    return <ShapeEditor {...props} type={type} renderValue={ValueEditor} />;
  }
  if (type.kind === "object") {
    return (
      <p className="text-sm text-destructive">Object values must reference a defined shape.</p>
    );
  }
  const exhaustive: never = type;
  return exhaustive;
}
