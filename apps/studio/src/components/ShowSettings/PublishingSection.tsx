// The Show settings section that chooses between auto-publication and staged
// publishing (#856). Presentational: the settings route owns the mutation.
import { Switch } from "@mechane/design-system";
import { useId } from "react";

export interface PublishingSectionProps {
  autoPublish: boolean;
  /** True while a change to the setting is being saved. */
  saving?: boolean;
  error?: string;
  onAutoPublishChange(autoPublish: boolean): void;
}

export function PublishingSection({
  autoPublish,
  saving = false,
  error,
  onAutoPublishChange,
}: PublishingSectionProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="publishing-heading">
      <h2 id="publishing-heading" className="text-lg font-medium">
        Publishing
      </h2>
      <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
        <span className="flex flex-col gap-1">
          <span id={labelId} className="text-sm font-medium">
            Publish changes automatically
          </span>
          <span id={descriptionId} className="text-sm text-muted-foreground">
            Every change reaches this Show's Devices as soon as it is saved. Turn this off to
            collect changes in a draft and publish them together.
          </span>
        </span>
        <Switch
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          checked={autoPublish}
          disabled={saving}
          onCheckedChange={(checked) => onAutoPublishChange(checked)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
