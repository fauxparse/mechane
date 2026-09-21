import type { ImageInputOnUploadProps } from "@mechane/design-system";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Badge,
  Button,
  ChevronRight,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DownloadIcon,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UploadIcon,
  XIcon,
} from "@mechane/design-system";
import {
  type ImageAssetReference,
  type ResolvedImageValue,
  type Shape,
  typeLabel,
} from "@mechane/domain";
import type { SourceValueRow } from "../inspector/source-value-types";
import { ArrayValueEditor } from "./ArrayValueEditor";
import { type ArrayValueFocus, type ArrayValueSelection } from "./ArrayValueEditor/types";
import { ValueEditor } from "./ValueEditor";

type ShapeArrayType = { kind: "array"; of: { kind: "shape"; shapeId: string } };

type SourceValueBreadcrumb = {
  label: string;
  focus: ArrayValueFocus | null;
};

type SourceValueViewProps = {
  row: SourceValueRow;
  shapeArrayType: ShapeArrayType | null;
  breadcrumbs: readonly SourceValueBreadcrumb[];
  open: boolean;
  onOpenChange(open: boolean): void;
  draft: unknown;
  shapes: readonly Shape[];
  arrayFocus: ArrayValueFocus;
  isLongText: boolean;
  onImmediateChange(value: unknown): void;
  columnSizes?: Record<string, number>;
  onColumnSizesChange?: (columnSizes: Record<string, number>) => void;
  imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  errors: Map<string, string>;
  readOnly: boolean;
  onClear?: () => void;
  pendingFocus: ArrayValueFocus | null;
  navigationError: string | null;
  updateDraft(next: unknown): void;
  updateErrors(path: readonly (string | number)[], error: string | null): void;
  requestFocus(focus: ArrayValueFocus): void;
  onSelectionChange(selection: ArrayValueSelection | null): void;
  saveDraft(): boolean;
  onCancelNavigation(): void;
  onDiscardNavigation(): void;
  onSaveNavigation(): void;
};

export function SourceValueView({
  row,
  shapeArrayType,
  breadcrumbs,
  open,
  onOpenChange,
  draft,
  shapes,
  arrayFocus,
  onImmediateChange,
  columnSizes,
  onColumnSizesChange,
  isLongText,
  imageAssets,
  onImageUpload,
  errors,
  readOnly,
  onClear,
  pendingFocus,
  navigationError,
  updateDraft,
  updateErrors,
  requestFocus,
  onSelectionChange,
  saveDraft,
  onCancelNavigation,
  onDiscardNavigation,
  onSaveNavigation,
}: SourceValueViewProps) {
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          aria-label={`${readOnly ? "View" : "Edit"} ${row.label}`}
          className={
            shapeArrayType
              ? "h-[min(90vh,780px)] w-[min(76rem,calc(100vw-2rem))] max-w-none overflow-hidden p-0"
              : undefined
          }
        >
          <header className="p-5 pb-0 flex items-center justify-between gap-4">
            <div className="flex flex-col items-start gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <DialogTitle className="min-w-0">
                  <nav aria-label="Value path">
                    <ol className="flex min-w-0 items-center gap-1 text-base">
                      {breadcrumbs.map((breadcrumb, index) => {
                        const isCurrent = index === breadcrumbs.length - 1;
                        const focus = breadcrumb.focus;
                        return (
                          <li
                            key={`${breadcrumb.label}-${index}`}
                            className="flex min-w-0 items-center gap-1"
                          >
                            {index > 0 ? (
                              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                            ) : null}
                            {focus && shapeArrayType ? (
                              <button
                                type="button"
                                className={`truncate rounded-sm px-1 -mx-1 py-0.5 ${isCurrent ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                                onClick={() => requestFocus(focus)}
                              >
                                {breadcrumb.label}
                              </button>
                            ) : (
                              <span
                                className={`truncate ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}
                              >
                                {breadcrumb.label}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </nav>
                </DialogTitle>
                {readOnly && (
                  <Tooltip>
                    <TooltipTrigger render={<Badge variant="secondary">Read only</Badge>} />
                    <TooltipContent>
                      You can’t edit this content because it is owned by another node
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="label">{typeLabel(row.type, shapes)}</div>
            </div>
            <DialogDescription className="sr-only">
              {readOnly
                ? "This value is supplied by another node and cannot be edited."
                : "Committed changes update the draft and any active Run immediately."}
            </DialogDescription>
            <DialogClose
              render={
                <Button variant="ghost" size="icon" className="rounded-full">
                  <XIcon className="size-4 text-muted-foreground" />
                </Button>
              }
            />
          </header>
          {shapeArrayType ? (
            <ArrayValueEditor
              type={shapeArrayType}
              value={draft}
              shapes={shapes}
              columnSizes={columnSizes}
              onColumnSizesChange={onColumnSizesChange}
              imageAssets={imageAssets}
              onImageUpload={onImageUpload}
              readOnly={readOnly}
              path={[]}
              focus={arrayFocus}
              onImmediateChange={onImmediateChange}
              onChange={updateDraft}
              onValidityChange={updateErrors}
              onSelectionChange={onSelectionChange}
            />
          ) : isLongText ? (
            <Textarea
              readOnly={readOnly}
              autoFocus
              value={typeof draft === "string" ? draft : ""}
              aria-label={`${row.label} value`}
              onChange={(event) => {
                const next = event.target.value;
                updateDraft(next);
                onImmediateChange(next);
              }}
            />
          ) : (
            <ValueEditor
              type={row.type}
              value={draft}
              shapes={shapes}
              imageAssets={imageAssets}
              onImageUpload={onImageUpload}
              readOnly={readOnly}
              path={[]}
              onChange={(next) => {
                updateDraft(next);
                onImmediateChange(next);
              }}
              onValidityChange={updateErrors}
            />
          )}
          {errors.size > 0 ? (
            <p className="text-sm text-destructive">{[...errors.values()][0]}</p>
          ) : null}
          <DialogFooter className="justify-between p-6 border-t border-border">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled title="Import is a placeholder">
                <UploadIcon /> Import
              </Button>
              <Button variant="ghost" size="sm" disabled title="Export is a placeholder">
                <DownloadIcon /> Export
              </Button>
            </div>

            {!readOnly && onClear ? (
              <Button type="button" variant="ghost" onClick={onClear}>
                Clear default
              </Button>
            ) : null}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {!readOnly ? (
                <Button
                  type="button"
                  disabled={errors.size > 0}
                  onClick={() => {
                    if (saveDraft()) onOpenChange(false);
                  }}
                >
                  Apply
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={pendingFocus !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onCancelNavigation();
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Save changes before navigating?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes to this value. Save them first?
          </AlertDialogDescription>
          {navigationError ? <p className="text-sm text-destructive">{navigationError}</p> : null}
          <AlertDialogFooter>
            <Button type="button" variant="ghost" onClick={onCancelNavigation}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={onDiscardNavigation}>
              Discard changes
            </Button>
            <Button type="button" disabled={errors.size > 0} onClick={onSaveNavigation}>
              Save changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
