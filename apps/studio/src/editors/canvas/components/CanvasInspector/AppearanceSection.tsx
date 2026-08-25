import {
  Section,
  SectionRow,
  cn,
  EyeClosedIcon,
  EyeIcon,
  OpacityIcon,
  PropertyInput,
  RadiusBottomLeftIcon,
  RadiusBottomRightIcon,
  RadiusIcon,
  RadiusTopLeftIcon,
  RadiusTopRightIcon,
  SquareRoundCornerIcon,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type LucideIcon,
} from "@mechane/design-system";
import type { CornerRadius, CornerRadiusElement } from "@mechane/domain";
import { hasCornerRadius, isPropertyConnection } from "@mechane/domain";
import { Dispatch, SetStateAction, useState } from "react";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { PropertyField } from "./CanvasInspectorFields";
import { isVariableInput } from "./canvas-inspector-values";

type RadiusSide = keyof CornerRadius;

const cornerRadiusSides = (
  radius: CornerRadiusElement["cornerRadius"],
): Record<RadiusSide, number> => {
  if (typeof radius === "number") {
    return { topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius };
  }
  if (!radius || isPropertyConnection(radius)) {
    return { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
  }
  return {
    topLeft: radius.topLeft ?? 0,
    topRight: radius.topRight ?? 0,
    bottomRight: radius.bottomRight ?? 0,
    bottomLeft: radius.bottomLeft ?? 0,
  };
};

const hasAsymmetricCornerRadius = (radius: CornerRadiusElement["cornerRadius"]): boolean => {
  const values = cornerRadiusSides(radius);
  return (
    values.topLeft !== values.topRight ||
    values.topLeft !== values.bottomRight ||
    values.topLeft !== values.bottomLeft
  );
};

const RadiusInput = ({
  icon,
  value,
  mixed = false,
  onChange,
}: {
  icon: LucideIcon;
  value: number;
  mixed?: boolean;
  onChange: (value: number) => void;
}) => (
  <PropertyInput
    icon={icon}
    type="number"
    value={mixed ? undefined : { kind: "number", value }}
    placeholder={mixed ? "Mixed" : undefined}
    min={0}
    onChange={(next) => {
      if (!isVariableInput(next) && next?.kind === "number") onChange(next.value);
    }}
  />
);

const CornerRadiusControl = ({
  radius,
  mixed = false,
  update,
  expanded,
  setExpanded,
}: {
  radius: CornerRadiusElement["cornerRadius"];
  mixed?: boolean;
  update: (properties: Record<string, unknown>) => void;
  expanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
}) => {
  const values = cornerRadiusSides(radius);
  const updateRadius = (changes: Partial<CornerRadius>) => {
    update({ cornerRadius: { ...values, ...changes } });
  };

  if (expanded) {
    return (
      <div className="grid grid-cols-subgrid gap-2 col-start-1 col-span-full">
        <RadiusInput
          icon={RadiusTopLeftIcon}
          value={values.topLeft}
          mixed={mixed}
          onChange={(value) => updateRadius({ topLeft: value })}
        />
        <RadiusInput
          icon={RadiusTopRightIcon}
          value={values.topRight}
          mixed={mixed}
          onChange={(value) => updateRadius({ topRight: value })}
        />
        <Toggle
          aria-label="Use one corner radius"
          aria-pressed={true}
          onClick={() => {
            update({ cornerRadius: values.topLeft });
            setExpanded(false);
          }}
        >
          <RadiusIcon />
        </Toggle>
        <RadiusInput
          icon={RadiusBottomLeftIcon}
          value={values.bottomLeft}
          mixed={mixed}
          onChange={(value) => updateRadius({ bottomLeft: value })}
        />
        <RadiusInput
          icon={RadiusBottomRightIcon}
          value={values.bottomRight}
          mixed={mixed}
          onChange={(value) => updateRadius({ bottomRight: value })}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-subgrid col-start-2 col-span-2">
      <RadiusInput
        icon={SquareRoundCornerIcon}
        value={values.topLeft}
        mixed={mixed}
        onChange={(value) => update({ cornerRadius: value })}
      />
      <Toggle
        aria-label="Edit corner radii individually"
        aria-pressed={false}
        onClick={() => setExpanded(true)}
      >
        <RadiusIcon />
      </Toggle>
    </div>
  );
};

export const AppearanceSection = () => {
  const { focused, selected, common, update } = useCanvasInspectorContext();
  const selectionKey = `${focused?.artId ?? ""}:${selected.map((element) => element.id).join(",")}`;
  const allCornerRadiusElements =
    selected.length > 0 && selected.every((element) => hasCornerRadius(element));
  const rawRadius = common("cornerRadius") as CornerRadiusElement["cornerRadius"];
  const radiusMixed =
    allCornerRadiusElements &&
    rawRadius === undefined &&
    selected.some((element) => Reflect.get(element, "cornerRadius") !== undefined);
  const radius = allCornerRadiusElements ? rawRadius : undefined;
  const [expanded, setExpanded] = useState(
    () => radius !== undefined && hasAsymmetricCornerRadius(radius),
  );

  return (
    <Section
      label="Appearance"
      buttons={
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="p-0 size-7"
                pressed={common("hidden") === true}
                onPressedChange={(hidden) => update({ hidden })}
              >
                {common("hidden") === true ? <EyeClosedIcon /> : <EyeIcon />}
              </Toggle>
            }
          />
          <TooltipContent>{common("hidden") === true ? "Show" : "Hide"}</TooltipContent>
        </Tooltip>
      }
    >
      <SectionRow>
        <div className="grid grid-cols-subgrid gap-2 col-start-1 col-span-full">
          <PropertyField
            name="opacity"
            icon={OpacityIcon}
            className={cn(expanded && "col-span-2")}
          />
          {allCornerRadiusElements && (
            <CornerRadiusControl
              key={selectionKey}
              radius={radius}
              mixed={radiusMixed}
              update={update}
              expanded={expanded}
              setExpanded={setExpanded}
            />
          )}
        </div>
      </SectionRow>
    </Section>
  );
};
