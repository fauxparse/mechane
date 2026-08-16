import {
  GapHorizontalIcon,
  GapVerticalIcon,
  LayoutHorizontalIcon,
  LayoutNoneIcon,
  LayoutVerticalIcon,
  Link2Icon,
  LucideIcon,
  PaddingAllIcon,
  PaddingBottomIcon,
  PaddingHorizontalIcon,
  PaddingLeftIcon,
  PaddingRightIcon,
  PaddingTopIcon,
  PaddingVerticalIcon,
  PropertyInput,
  Switch,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Unlink2Icon,
} from "@mechane/design-system";

import { Section, SectionRow } from "./Section";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { SizeField } from "./CanvasInspectorFields";
import { isVariableInput } from "./canvas-inspector-values";
import { AlignmentSelector } from "./AlignmentSelector";
import { FrameElement, isContainerElement, Padding, TextElement } from "@mechane/domain";
import { useState } from "react";

export const LayoutSection = () => {
  const { focused, target, selected, update, common, isAspectRatioLocked, setAspectRatioLock } =
    useCanvasInspectorContext();
  const isFrame = selected.length > 0 && selected.every(isContainerElement);
  const isText = selected.length > 0 && selected.every((element) => element.type === "text");
  const frame = isFrame ? (target as FrameElement) : null;
  const paddingTarget = isFrame || isText ? (target as FrameElement | TextElement) : null;
  const hasAutoLayout = isFrame && common("layoutMode") === "auto";
  const selectionKey = `${focused?.artId ?? ""}:${selected.map((element) => element.id).join(",")}`;
  const clipChildren = common("clip");

  return (
    <Section label="Layout">
      <SectionRow>
        <SizeField axis="width" />
        <SizeField axis="height" />
        <Toggle
          aria-label={`${isAspectRatioLocked ? "Unlock" : "Lock"} aspect ratio`}
          pressed={isAspectRatioLocked}
          onPressedChange={setAspectRatioLock}
          size="sm"
        >
          {isAspectRatioLocked ? <Link2Icon /> : <Unlink2Icon />}
        </Toggle>
      </SectionRow>
      {frame && (
        <>
          <ToggleGroup
            className="w-full rounded-sm *:grow"
            spacing={0}
            value={[frame.layoutMode === "auto" ? (frame.direction ?? "horizontal") : "absolute"]}
            onValueChange={([value]) => {
              switch (value) {
                case "horizontal":
                case "vertical":
                  update({ layoutMode: "auto", direction: value });
                  break;
                default:
                  update({ layoutMode: "absolute", direction: null });
              }
            }}
          >
            <ToggleGroupItem value="absolute" size="sm">
              <LayoutNoneIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="horizontal" size="sm">
              <LayoutHorizontalIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="vertical" size="sm">
              <LayoutVerticalIcon />
            </ToggleGroupItem>
          </ToggleGroup>
          {hasAutoLayout && (
            <>
              <AlignmentSelector
                className="row-span-2"
                direction={frame.direction ?? "horizontal"}
                alignPrimary={frame.alignPrimary ?? "start"}
                alignCounter={frame.alignCounter ?? "start"}
                auto={frame.gap === "auto"}
                onChange={(props) => update(props)}
              />
              <PropertyInput
                className="col-start-1"
                type="number"
                icon={frame.direction === "vertical" ? GapVerticalIcon : GapHorizontalIcon}
                value={
                  frame.gap === "auto"
                    ? null
                    : { kind: "number", value: typeof frame.gap === "number" ? frame.gap : 0 }
                }
                placeholder={frame.gap === "auto" ? "Auto" : undefined}
                allowAuto
                auto={frame.gap === "auto"}
                onAutoChange={(auto) => update({ gap: auto ? "auto" : 0 })}
                onChange={(next) => {
                  if (!isVariableInput(next) && next?.kind === "number")
                    update({ gap: next.value });
                }}
              />
            </>
          )}
          <PaddingControl key={selectionKey} padding={frame.padding} update={update} />
          <div className="col-span-2">
            <label className="flex items-center gap-2 w-fit">
              <Switch
                aria-label="Clip children"
                checked={clipChildren === true}
                indeterminate={clipChildren === undefined}
                onCheckedChange={() => update({ clip: !clipChildren })}
              />
              Clip children
            </label>
          </div>
        </>
      )}
      {paddingTarget && !frame && (
        <PaddingControl key={selectionKey} padding={paddingTarget.padding} update={update} />
      )}
    </Section>
  );
};

type PaddingSide = keyof Padding;
type PaddingValue = FrameElement["padding"] | TextElement["padding"];

const paddingSides = (padding: PaddingValue): Record<PaddingSide, number> => {
  if (typeof padding === "number") {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  return {
    top: padding?.top ?? 0,
    right: padding?.right ?? 0,
    bottom: padding?.bottom ?? 0,
    left: padding?.left ?? 0,
  };
};

const hasAsymmetricPadding = (padding: PaddingValue): boolean => {
  const values = paddingSides(padding);
  return values.top !== values.bottom || values.left !== values.right;
};

const PaddingInput = ({
  icon,
  value,
  onChange,
}: {
  icon: LucideIcon;
  value: number;
  onChange: (value: number) => void;
}) => (
  <PropertyInput
    icon={icon}
    type="number"
    value={{ kind: "number", value }}
    min={0}
    onChange={(next) => {
      if (!isVariableInput(next) && next?.kind === "number") onChange(next.value);
    }}
  />
);

const PaddingControl = ({
  padding,
  update,
}: {
  padding: PaddingValue;
  update: (properties: Record<string, unknown>) => void;
}) => {
  const [expanded, setExpanded] = useState(() => hasAsymmetricPadding(padding));
  const values = paddingSides(padding);
  const updatePadding = (changes: Partial<Padding>) => {
    update({ padding: { ...values, ...changes } });
  };

  if (expanded) {
    return (
      <div className="grid grid-cols-subgrid gap-2 col-start-1 col-span-full">
        <PaddingInput
          icon={PaddingLeftIcon}
          value={values.left}
          onChange={(value) => updatePadding({ left: value })}
        />
        <PaddingInput
          icon={PaddingTopIcon}
          value={values.top}
          onChange={(value) => updatePadding({ top: value })}
        />
        <Toggle
          size="sm"
          aria-label="Use horizontal and vertical padding"
          aria-pressed={true}
          onClick={() => {
            updatePadding({
              top: values.top,
              right: values.left,
              bottom: values.top,
              left: values.left,
            });
            setExpanded(false);
          }}
        >
          <PaddingAllIcon />
        </Toggle>
        <PaddingInput
          icon={PaddingRightIcon}
          value={values.right}
          onChange={(value) => updatePadding({ right: value })}
        />
        <PaddingInput
          icon={PaddingBottomIcon}
          value={values.bottom}
          onChange={(value) => updatePadding({ bottom: value })}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-subgrid gap-2 xcol-start-1 col-span-full">
      <PaddingInput
        icon={PaddingHorizontalIcon}
        value={values.left}
        onChange={(value) => updatePadding({ left: value, right: value })}
      />
      <PaddingInput
        icon={PaddingVerticalIcon}
        value={values.top}
        onChange={(value) => updatePadding({ top: value, bottom: value })}
      />
      <Toggle
        type="button"
        size="sm"
        aria-label="Edit padding individually"
        aria-pressed={false}
        onClick={() => setExpanded(true)}
      >
        <PaddingAllIcon />
      </Toggle>
    </div>
  );
};
