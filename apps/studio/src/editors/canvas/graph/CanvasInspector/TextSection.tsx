import {
  GOOGLE_FONTS_API_KEY,
  fontFamilyKey,
  googleFontVariant,
  loadGoogleFont,
  useGoogleFonts,
} from "../../google-fonts";
import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  FontSizeIcon,
  LineHeightIcon,
  NotebookPenIcon,
  PaintBucketIcon,
  PencilIcon,
  PropertyInput,
  TextAlignCenterIcon,
  TextAlignEndIcon,
  TextAlignStartIcon,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  TypeIcon,
  BoldIcon,
  UnderlineIcon,
  ItalicIcon,
} from "@mechane/design-system";
import type { ShapeValue } from "@mechane/domain";
import { Fragment, useEffect, useMemo, useState } from "react";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { PropertyField } from "./CanvasInspectorFields";
import { isVariableInput, variableInput } from "./canvas-inspector-values";
import { Section, SectionRow } from "./Section";

const FontFamilyField = () => {
  const { common, fontFamilies, update } = useCanvasInspectorContext();
  const current = typeof common("fontFamily") === "string" ? common("fontFamily") : "";
  const [open, setOpen] = useState(false);
  const [optionsReady, setOptionsReady] = useState(false);
  useEffect(() => {
    if (!open) {
      setOptionsReady(false);
      return;
    }
    const timeout = window.setTimeout(() => setOptionsReady(true), 0);
    return () => window.clearTimeout(timeout);
  }, [open]);
  const googleFontsQuery = useGoogleFonts();
  const googleFontKeys = useMemo(
    () => new Set((googleFontsQuery.data ?? []).map((font) => fontFamilyKey(font.family))),
    [googleFontsQuery.data],
  );
  const projectOptions = useMemo(
    () => [...fontFamilies].sort((left, right) => left.localeCompare(right)),
    [fontFamilies],
  );
  const googleOptions = useMemo(() => {
    const usedKeys = new Set(fontFamilies.map(fontFamilyKey));
    const available: string[] = [];
    for (const font of googleFontsQuery.data ?? []) {
      if (!usedKeys.has(fontFamilyKey(font.family))) available.push(font.family);
    }
    return available.sort((left, right) => left.localeCompare(right));
  }, [fontFamilies, googleFontsQuery.data]);
  const options = useMemo(
    () => [...projectOptions, ...googleOptions],
    [googleOptions, projectOptions],
  );

  return (
    <div className="col-span-2 min-w-0">
      <Combobox
        items={optionsReady ? options : fontFamilies}
        open={open}
        onOpenChange={setOpen}
        value={current || null}
        onValueChange={(value) => {
          if (value === null) {
            update({}, ["fontFamily"]);
            return;
          }
          if (typeof value !== "string") return;
          update({ fontFamily: value });
          if (googleFontKeys.has(fontFamilyKey(value))) loadGoogleFont(value);
        }}
      >
        <ComboboxInput
          className="w-full border-0 rounded-sm bg-muted/50 h-7"
          icon={TypeIcon}
          aria-label="Font family"
          placeholder="Search fonts"
        />
        <ComboboxContent>
          {!optionsReady || (GOOGLE_FONTS_API_KEY && googleFontsQuery.isPending) ? (
            <div role="status" className="px-2 py-2 text-sm text-muted-foreground">
              Loading Google Fonts...
            </div>
          ) : null}
          <ComboboxEmpty>
            {googleFontsQuery.isError ? "Google Fonts could not be loaded." : "No matching fonts."}
          </ComboboxEmpty>
          <ComboboxList>
            {projectOptions.length > 0 ? (
              <ComboboxGroup>
                <ComboboxLabel>Project fonts</ComboboxLabel>
                {projectOptions.map((fontFamily) => (
                  <ComboboxItem key={fontFamily} value={fontFamily}>
                    <span className="truncate">{fontFamily}</span>
                    <span className="ml-auto text-xs text-muted-foreground">In use</span>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            ) : null}
            {optionsReady && googleOptions.length > 0 ? (
              <>
                {projectOptions.length > 0 ? <ComboboxSeparator /> : null}
                <ComboboxGroup>
                  <ComboboxLabel>Google Fonts</ComboboxLabel>
                  {googleOptions.map((fontFamily) => (
                    <ComboboxItem key={fontFamily} value={fontFamily}>
                      <span className="truncate">{fontFamily}</span>
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              </>
            ) : null}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {!GOOGLE_FONTS_API_KEY && (
        <p className="mt-1 text-xs text-muted-foreground">
          Configure VITE_GOOGLE_FONTS_API_KEY to browse Google Fonts.
        </p>
      )}
    </div>
  );
};

const renderTextValue = (value: ShapeValue | null) => {
  const text = value?.kind === "text" ? value.value : "";
  return (
    <span className="block truncate">
      {text ? (
        text.split(/\r?\n/).map((line, index) => (
          <Fragment key={index}>
            {index > 0 && <span className="px-0.5 text-muted-foreground opacity-50">↵</span>}
            {line}
          </Fragment>
        ))
      ) : (
        <span className="text-muted-foreground">(Empty)</span>
      )}
    </span>
  );
};

const FONT_SIZE_PRESETS = [8, 10, 12, 14, 16, 18, 20, 24, 32, 40, 48, 64, 72, 96] as const;
const LINE_HEIGHT_PRESETS = [
  "auto",
  12,
  14,
  16,
  18,
  20,
  24,
  28,
  32,
  36,
  40,
  48,
  56,
  64,
  72,
  96,
] as const;

export const TextSection = () => {
  const { target, common, update, variables } = useCanvasInspectorContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDraft, setDialogDraft] = useState("");
  const googleFontsQuery = useGoogleFonts();

  const contentInput = variableInput(common("content"), "text", variables);
  const content =
    !isVariableInput(contentInput) && contentInput?.kind === "text" ? contentInput.value : "";
  const textVariables = variables.filter((variable) => variable.type === "text");
  const openDialog = () => {
    setDialogDraft(content);
    setDialogOpen(true);
  };
  const saveDialog = () => {
    if (dialogDraft !== content) update({ content: dialogDraft });
    setDialogOpen(false);
  };

  const fontFamilyValue = common("fontFamily");
  const fontFamily = typeof fontFamilyValue === "string" ? fontFamilyValue : null;
  const selectedGoogleFont = googleFontsQuery.data?.find(
    (font) => fontFamily !== null && fontFamilyKey(font.family) === fontFamilyKey(fontFamily),
  );
  const fontWeight = common("fontWeight");
  const fontStyle = common("fontStyle");
  const textDecoration = common("textDecoration");
  const bold = fontWeight === 700 || fontWeight === "bold";
  const italic = fontStyle === "italic";
  const underline = textDecoration === "underline";
  const activeStyles = [
    ...(bold ? ["bold"] : []),
    ...(italic ? ["italic"] : []),
    ...(underline ? ["underline"] : []),
  ];
  const updateTextStyles = (values: readonly string[]) => {
    const nextBold = values.includes("bold");
    const nextItalic = values.includes("italic");
    const nextUnderline = values.includes("underline");
    const properties: Record<string, unknown> = {};
    const unset: string[] = [];
    if (nextBold) properties.fontWeight = 700;
    else unset.push("fontWeight");
    if (nextItalic) properties.fontStyle = "italic";
    else unset.push("fontStyle");
    if (nextUnderline) properties.textDecoration = "underline";
    else unset.push("textDecoration");
    update(properties, unset);
    const variant = googleFontVariant(selectedGoogleFont, nextBold, nextItalic);
    if (fontFamily && selectedGoogleFont && variant) loadGoogleFont(fontFamily, variant);
  };
  useEffect(() => {
    if (!fontFamily || !selectedGoogleFont || (!bold && !italic)) return;
    const variant = googleFontVariant(selectedGoogleFont, bold, italic);
    if (variant) loadGoogleFont(fontFamily, variant);
  }, [bold, fontFamily, italic, selectedGoogleFont]);
  const textAlign = common("textAlign") as string | undefined;
  if (target.type !== "text") return null;

  return (
    <>
      <Section label="Text">
        <SectionRow>
          <PropertyInput
            className="col-span-2"
            type="text"
            icon={NotebookPenIcon}
            value={contentInput}
            variables={textVariables}
            renderInactiveValue={renderTextValue}
            onChange={(next) => {
              if (isVariableInput(next)) {
                update({ content: { kind: "variable", variableId: next.id } });
              } else if (next === null) {
                update({}, ["content"]);
              } else {
                update({ content: next.value });
              }
            }}
          />
          <Button size="icon-sm" variant="ghost" aria-label="Edit text" onClick={openDialog}>
            <PencilIcon />
          </Button>
        </SectionRow>
        <SectionRow>
          <PropertyField name="color" icon={PaintBucketIcon} className="col-span-2" />
        </SectionRow>
        <SectionRow>
          <FontFamilyField />
        </SectionRow>
        <SectionRow>
          <PropertyField name="fontSize" icon={FontSizeIcon} presets={FONT_SIZE_PRESETS} />
          <ToggleGroup multiple size="sm" value={activeStyles} onValueChange={updateTextStyles}>
            <ToggleGroupItem value="bold" aria-label="Toggle bold">
              <BoldIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label="Toggle italic">
              <ItalicIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="underline" aria-label="Toggle underline">
              <UnderlineIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </SectionRow>
        <SectionRow>
          <PropertyField name="lineHeight" icon={LineHeightIcon} presets={LINE_HEIGHT_PRESETS} />
          <ToggleGroup
            size="sm"
            value={textAlign ? [textAlign] : []}
            onValueChange={([value]) => {
              if (value) {
                update({ textAlign: value });
              }
            }}
          >
            <ToggleGroupItem value="left">
              <TextAlignStartIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="center">
              <TextAlignCenterIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="right">
              <TextAlignEndIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </SectionRow>
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
};
