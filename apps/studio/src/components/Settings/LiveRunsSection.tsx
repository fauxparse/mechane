// The user Settings section for how Studio behaves around live Runs (#857).
// Presentational: the settings route owns the mutation.
import { Switch } from "@mechane/design-system";
import { useId } from "react";

export interface LiveRunsSectionProps {
  askToEndRunOnClose: boolean;
  onAskToEndRunOnCloseChange(askToEndRunOnClose: boolean): void;
}

export function LiveRunsSection({
  askToEndRunOnClose,
  onAskToEndRunOnCloseChange,
}: LiveRunsSectionProps) {
  const headingId = useId();
  const labelId = useId();
  const descriptionId = useId();
  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-lg font-medium">
        Live runs
      </h2>
      <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
        <span className="flex flex-col gap-1">
          <span id={labelId} className="text-sm font-medium">
            Ask to end the run when closing Studio
          </span>
          <span id={descriptionId} className="text-sm text-muted-foreground">
            Closing the last Studio window on a live Show asks whether to end its run first. Without
            this, the run carries on for every connected Device.
          </span>
        </span>
        <Switch
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          checked={askToEndRunOnClose}
          onCheckedChange={(checked) => onAskToEndRunOnCloseChange(checked)}
        />
      </label>
    </section>
  );
}
