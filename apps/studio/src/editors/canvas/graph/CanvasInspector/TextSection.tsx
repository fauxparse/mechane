import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  PaintBucketIcon,
  PencilIcon,
  Textarea,
  TypeIcon,
} from "@mechane/design-system";
import { Fragment, useState } from "react";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { PropertyField } from "./CanvasInspectorFields";
import { Section, SectionRow } from "./Section";

const textValue = (value: unknown): string => (typeof value === "string" ? value : "");

function InlineTextField({
  value,
  onChange,
  onMultilineEdit,
}: {
  value: string;
  onChange(value: string): void;
  onMultilineEdit(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const beginEditing = () => {
    if (value.includes("\n")) {
      onMultilineEdit();
      return;
    }
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    if (draft !== value) onChange(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        aria-label="Text content"
        className="col-span-2 h-7 min-w-0 bg-muted/50 px-2"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
            setDraft(value);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="col-span-2 flex h-7 min-w-0 items-center gap-2 rounded-sm bg-muted/50 px-2 text-left text-sm hover:bg-muted"
      aria-label="Edit text content"
      onClick={beginEditing}
    >
      <TypeIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">
        {value
          ? value.split(/\r?\n/).map((line, index) => (
              <Fragment key={index}>
                {index > 0 && <span className="text-muted-foreground opacity-50 px-0.5">↵</span>}
                {line}
              </Fragment>
            ))
          : "Empty text"}
      </span>
    </button>
  );
}

export function TextSection() {
  const { target, common, update } = useCanvasInspectorContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDraft, setDialogDraft] = useState("");
  if (target.type !== "text") return null;

  const content = textValue(common("content"));
  const openDialog = () => {
    setDialogDraft(content);
    setDialogOpen(true);
  };
  const saveDialog = () => {
    if (dialogDraft !== content) update({ content: dialogDraft });
    setDialogOpen(false);
  };

  return (
    <>
      <Section label="Text">
        <SectionRow>
          <InlineTextField
            value={content}
            onChange={(value) => update({ content: value })}
            onMultilineEdit={openDialog}
          />
          <Button size="icon-sm" variant="ghost" aria-label="Edit text" onClick={openDialog}>
            <PencilIcon />
          </Button>
        </SectionRow>
        <SectionRow>
          <PropertyField name="color" icon={PaintBucketIcon} className="col-span-2" />
        </SectionRow>
        <SectionRow>
          <PropertyField name="fontFamily" />
        </SectionRow>
        <PropertyField name="fontSize" />
        <PropertyField name="textAlign" />
        <PropertyField name="letterSpacing" />
      </Section>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-label="Edit text">
          <DialogTitle>Edit text</DialogTitle>
          <DialogDescription>Plain text only. Formatting is not supported yet.</DialogDescription>
          <Textarea
            autoFocus
            value={dialogDraft}
            aria-label="Text content"
            className="min-h-40 resize-y"
            onChange={(event) => setDialogDraft(event.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveDialog}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
