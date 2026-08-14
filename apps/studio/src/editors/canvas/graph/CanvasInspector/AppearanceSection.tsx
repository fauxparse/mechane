import {
  EyeClosedIcon,
  EyeIcon,
  SquareRoundCornerIcon,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@mechane/design-system";

import { Section, SectionRow } from "./Section";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { PropertyField } from "./CanvasInspectorFields";

export function AppearanceSection() {
  const { target, common, update } = useCanvasInspectorContext();

  return (
    <Section
      label="Appearance"
      buttons={
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
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
        <PropertyField name="opacity" icon={EyeIcon} />
        {target.type === "rect" && (
          <PropertyField name="cornerRadius" icon={SquareRoundCornerIcon} />
        )}
      </SectionRow>
    </Section>
  );
}
