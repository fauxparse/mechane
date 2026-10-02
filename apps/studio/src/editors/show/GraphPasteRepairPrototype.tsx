// Throwaway: three repair layouts inside the Show Editor, shareable via ?variant=A/B/C.
import { Button } from "@mechane/design-system";
import { createContext, useCallback, useContext, useEffect, useReducer } from "react";
import type { PropsWithChildren } from "react";
import { MockEditorChrome } from "../../components/EditorLayout/MockEditorChrome";
import { ShowGraphEditor } from "./ShowGraphEditor";
import type {
  PasteRepairFixture,
  RepairImage,
  RepairSource,
  RepairTarget,
} from "./graph-paste-repair-prototype-fixture";

type Variant = "A" | "B" | "C";
type Step = "targets" | "images" | "inputs" | "review";
interface PrototypeState {
  variant: Variant;
  stage: "editing" | "stale" | "submitted" | "unknown" | "committed" | "cancelled";
  step: Step;
  navigateId: string;
  sourceId: string;
  fieldId: string;
  imageId: string;
  inputId: string;
  baseVersion: number;
  destinationVersion: number;
  imageUnavailable: boolean;
  navigateUnavailable: boolean;
  reuseChanged: boolean;
  reuseReviewed: boolean;
  message: string;
  showState: boolean;
}
const INITIAL_STATE: PrototypeState = {
  variant: "A",
  stage: "editing",
  step: "targets",
  navigateId: "",
  sourceId: "",
  fieldId: "",
  imageId: "",
  inputId: "",
  baseVersion: 41,
  destinationVersion: 41,
  imageUnavailable: false,
  navigateUnavailable: false,
  reuseChanged: false,
  reuseReviewed: false,
  message:
    "Nothing has been added to The Tempest. Resolve the required items, then paste explicitly.",
  showState: true,
};
const FixtureContext = createContext<PasteRepairFixture | null>(null);
const VARIANTS: readonly Variant[] = ["A", "B", "C"];
const VARIANT_NAMES = {
  A: "Repair dialog",
  B: "Docked repair panel",
  C: "Guided review workspace",
};
const STEPS: readonly { id: Step; label: string }[] = [
  { id: "targets", label: "1. Action targets" },
  { id: "images", label: "2. Images" },
  { id: "inputs", label: "3. Optional inputs" },
  { id: "review", label: "4. Review" },
];
const SELECT_CLASS = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function GraphPasteRepairFixtureProvider({
  value,
  children,
}: PropsWithChildren<{ value: PasteRepairFixture }>) {
  return <FixtureContext.Provider value={value}>{children}</FixtureContext.Provider>;
}

function readVariant(): Variant {
  const value = new URL(window.location.href).searchParams.get("variant");
  return value === "B" || value === "C" ? value : "A";
}

function usePrototypeModel(fixture: PasteRepairFixture) {
  const [state, update] = useReducer(
    (previous: PrototypeState, patch: Partial<PrototypeState>) => ({ ...previous, ...patch }),
    INITIAL_STATE,
    (initial) => ({ ...initial, variant: readVariant() }),
  );
  const source = fixture.updateSources.find((candidate) => candidate.id === state.sourceId);
  const chosenField = source?.fields.find((candidate) => candidate.id === state.fieldId);
  const chosenImage = fixture.replacementImages.find((candidate) => candidate.id === state.imageId);
  const navigateTargets = fixture.navigateTargets.map((target) =>
    state.navigateUnavailable && target.id === "scene_results"
      ? { ...target, unavailableReason: "This Scene is no longer available." }
      : target,
  );
  const chosenNavigate = navigateTargets.find((candidate) => candidate.id === state.navigateId);
  const navigateValid = Boolean(chosenNavigate && !chosenNavigate.unavailableReason);
  const fieldValid = Boolean(chosenField && !chosenField.unavailableReason);
  const imageValid = Boolean(
    chosenImage && !(state.imageUnavailable && state.imageId === "asset_wash"),
  );
  const requiredRemaining = Number(!navigateValid) + Number(!fieldValid) + Number(!imageValid);
  const ready =
    state.stage === "editing" &&
    requiredRemaining === 0 &&
    state.baseVersion === state.destinationVersion &&
    (!state.reuseChanged || state.reuseReviewed);

  const changeVariant = useCallback((next: Variant) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    update({ variant: next });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable]")
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        changeVariant(
          VARIANTS[(VARIANTS.indexOf(state.variant) + (event.key === "ArrowRight" ? 1 : 2)) % 3] ??
            "A",
        );
      }
    }
    function onPopState() {
      update({ variant: readVariant() });
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
    };
  }, [state.variant, changeVariant]);

  function refresh() {
    update({
      navigateId: navigateValid ? state.navigateId : "",
      imageId: imageValid ? state.imageId : "",
      baseVersion: state.destinationVersion,
      reuseReviewed: state.reuseChanged,
      stage: "editing",
      message:
        "Preview refreshed explicitly. Still-valid choices were retained; unavailable choices were cleared. Review before pasting again.",
    });
  }
  return {
    state,
    update,
    changeVariant,
    refresh,
    fixture,
    source,
    chosenField,
    chosenImage,
    chosenNavigate,
    navigateTargets,
    requiredRemaining,
    ready,
    locked: state.stage !== "editing",
  };
}
interface Model {
  state: PrototypeState;
  update(patch: Partial<PrototypeState>): void;
  changeVariant(next: Variant): void;
  refresh(): void;
  fixture: PasteRepairFixture;
  source: RepairSource | undefined;
  chosenField: RepairTarget | undefined;
  chosenImage: RepairImage | undefined;
  chosenNavigate: RepairTarget | undefined;
  navigateTargets: RepairTarget[];
  requiredRemaining: number;
  ready: boolean;
  locked: boolean;
}

function TargetSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly RepairTarget[];
  disabled: boolean;
  onChange(value: string): void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        className={SELECT_CLASS}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a destination</option>
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={Boolean(option.unavailableReason)}>
            {option.label}
            {option.unavailableReason ? ` · ${option.unavailableReason}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
function RepairGroup({
  title,
  detail,
  children,
}: PropsWithChildren<{ title: string; detail: string }>) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      {children}
    </section>
  );
}

function ActionRepairs({ model }: { model: Model }) {
  const { state, update, fixture, source, locked } = model;
  return (
    <RepairGroup
      title="Required Action targets"
      detail="These Actions belong to the copied Scene. They remain intact; there is no drop-Action option."
    >
      <p className="text-xs">
        Copied Scene: Opening cue → Audience vote. Navigate stays inside that Flow.
      </p>
      <TargetSelect
        label="Navigate · Continue → destination Scene"
        value={state.navigateId}
        options={model.navigateTargets}
        disabled={locked}
        onChange={(value) => update({ navigateId: value })}
      />
      <TargetSelect
        label="Update · Record vote → destination Source"
        value={state.sourceId}
        options={fixture.updateSources}
        disabled={locked}
        onChange={(value) => update({ sourceId: value, fieldId: "" })}
      />
      {source ? (
        <TargetSelect
          label="Update · copied Number → destination Field/path"
          value={state.fieldId}
          options={source.fields}
          disabled={locked}
          onChange={(value) => update({ fieldId: value })}
        />
      ) : null}
      <p className="text-xs text-muted-foreground">
        Number stays Number. This mapping does not rename Fields, edit the destination Source, or
        coerce the Action value.
      </p>
    </RepairGroup>
  );
}
function ImageRepairs({ model }: { model: Model }) {
  const { state, update, fixture, locked } = model;
  return (
    <RepairGroup
      title="Required image replacement"
      detail="Backdrop · unavailable or not authorized. No missing-image placeholder can be committed."
    >
      <div className="grid grid-cols-2 gap-2">
        {fixture.replacementImages.map((image) => {
          const unavailable = state.imageUnavailable && image.id === "asset_wash";
          return (
            <button
              key={image.id}
              type="button"
              disabled={locked || unavailable}
              aria-pressed={state.imageId === image.id}
              onClick={() => update({ imageId: image.id })}
              className={`rounded-md border p-2 text-left text-sm ${state.imageId === image.id ? "border-primary ring-1 ring-primary" : "border-border"}`}
            >
              <span
                aria-hidden="true"
                className="mb-2 block h-10 rounded"
                style={{ backgroundColor: image.color }}
              />
              {image.name}
              <span className="block text-xs text-muted-foreground">
                {unavailable
                  ? "Unavailable or not authorized"
                  : `Destination-owned · ${image.revision}`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Replace all 3 copied uses of Backdrop, including its nested Block, with this exact revision.
        No public URL or new upload.
      </p>
    </RepairGroup>
  );
}
function OptionalInputs({ model }: { model: Model }) {
  return (
    <RepairGroup
      title="Optional input · disconnected"
      detail="Opening cue.message used a producer outside the copied content. This warning is not a required repair."
    >
      <label className="block text-sm font-medium">
        Destination producer/port
        <select
          className={SELECT_CLASS}
          value={model.state.inputId}
          disabled={model.locked}
          onChange={(event) => model.update({ inputId: event.target.value })}
        >
          <option value="">Leave disconnected</option>
          {model.fixture.optionalInputs.map((input) => (
            <option key={input.id} value={input.id}>
              {input.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        Only the copied consumer changes. Existing consumer wiring and Device drivers are untouched.
      </p>
    </RepairGroup>
  );
}
function RepairReview({ model }: { model: Model }) {
  const { state, source, chosenField, chosenImage, chosenNavigate } = model;
  return (
    <RepairGroup
      title="Review the pending paste"
      detail="Only authored draft content will be added. Source Defaults and Current Source Values remain separate."
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Destination</dt>
        <dd>The Tempest · Audience vote · draft v{state.baseVersion}</dd>
        <dt className="text-muted-foreground">Navigate</dt>
        <dd>{chosenNavigate?.label ?? "Needs a Scene"}</dd>
        <dt className="text-muted-foreground">Update</dt>
        <dd>
          {source
            ? `${source.label} → ${chosenField?.label ?? "choose a Field"}`
            : "Needs a Source and Field"}
        </dd>
        <dt className="text-muted-foreground">Backdrop</dt>
        <dd>
          {chosenImage
            ? `${chosenImage.name} · ${chosenImage.revision} · replaces 3 copied uses`
            : "Needs an authorized replacement"}
        </dd>
        <dt className="text-muted-foreground">Optional input</dt>
        <dd>
          {state.inputId ? "House message → copied message input" : "message remains disconnected"}
        </dd>
      </dl>
      <details className="text-sm">
        <summary className="cursor-pointer">Automatic definitions and asset reconciliation</summary>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-muted-foreground">
          <li>
            Opening cue → Opening cue 2. Imported Card → Card 2, Vote → Vote 2. Existing definitions
            are not changed or matched by name.
          </li>
          <li>
            Logo reuses destination asset asset_logo / rev_7 with its existing name and alt metadata
            unchanged.
          </li>
          <li>
            {state.reuseChanged && state.reuseReviewed
              ? "Backdrop texture now reuses verified destination asset asset_texture / rev_8 after explicit preview refresh."
              : "Backdrop texture creates a destination-owned entry only with successful application, sharing the verified immutable blob."}
          </li>
          <li>
            Mappings do not redirect unselected consumers, edit their Actions, or replace this
            Flow's default Scene.
          </li>
        </ul>
      </details>
    </RepairGroup>
  );
}
function RepairHeader({ model }: { model: Model }) {
  return (
    <div className="border-b border-border p-5">
      <p className="text-xs font-medium text-muted-foreground">Pending graph paste · The Tempest</p>
      <h2 id="repair-title" className="mt-1 text-xl font-semibold">
        Resolve before pasting
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Opening cue from The Winter's Tale · 1 Scene, 2 Blocks, 1 Shape · destination Flow: Audience
        vote
      </p>
      <p className="mt-2 text-sm">
        {model.requiredRemaining
          ? `${model.requiredRemaining} required repairs`
          : "Required repairs complete"}{" "}
        · {model.state.inputId ? "input mapped" : "1 optional input disconnected"}
      </p>
    </div>
  );
}
function RepairActions({ model }: { model: Model }) {
  const { state, update } = model;
  const submitted = state.stage === "submitted" || state.stage === "unknown";
  return (
    <div className="space-y-3 border-t border-border bg-card p-4">
      <p role="status" className="text-sm">
        {state.message}
      </p>
      {state.stage === "stale" ? (
        <p className="text-sm text-destructive">
          Destination/resource checks changed. Nothing was applied. Refresh explicitly; do not retry
          into a new version.
        </p>
      ) : null}
      {submitted ? (
        <p className="text-xs text-muted-foreground">
          Operation prototype-paste-1 is pinned. Cancellation cannot promise rollback. Fixture
          controls establish its exact outcome.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          disabled={submitted || state.stage === "committed" || state.stage === "cancelled"}
          onClick={() =>
            update({
              stage: "cancelled",
              message:
                "Cancelled before submission. No graph/catalog entries created; existing and independently adopted assets remain.",
            })
          }
        >
          Cancel paste
        </Button>
        {state.stage === "stale" ? (
          <Button variant="outline" onClick={model.refresh}>
            Refresh preview
          </Button>
        ) : null}
        <Button
          disabled={!model.ready}
          onClick={() =>
            update({
              stage: "submitted",
              message: "Submitted in the fixture only. No API request or real paste has occurred.",
            })
          }
        >
          Paste 1 Scene{state.inputId ? "" : " with 1 disconnected input"}
        </Button>
      </div>
    </div>
  );
}
function PrototypeControls({ model }: { model: Model }) {
  const { state, update, locked } = model;
  const submitted = state.stage === "submitted" || state.stage === "unknown";
  return (
    <details className="border-t border-border p-4 text-xs">
      <summary className="cursor-pointer font-medium">
        Prototype controls · local state only
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() =>
            update({
              destinationVersion: state.destinationVersion + 1,
              stage: "stale",
              message:
                "Another authored edit advanced the destination version. Nothing from this paste was applied.",
            })
          }
        >
          Simulate destination edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() =>
            update({
              imageUnavailable: true,
              stage: "stale",
              message:
                "Evening wash became unavailable. No fallback revision or replacement was selected.",
            })
          }
        >
          Lose image access
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() =>
            update({
              navigateUnavailable: true,
              stage: "stale",
              message:
                "The house has spoken is no longer available. The Action remains pending, not dropped.",
            })
          }
        >
          Remove Navigate target
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() =>
            update({
              reuseChanged: true,
              stage: "stale",
              message:
                "A matching destination texture appeared. Refresh to review its exact reuse mapping before applying.",
            })
          }
        >
          Matching asset appears
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={state.stage !== "submitted"}
          onClick={() =>
            update({
              stage: "unknown",
              message:
                "Response lost. Outcome unknown; do not resubmit or proceed with source deletion.",
            })
          }
        >
          Lose response
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!submitted}
          onClick={() =>
            update({
              stage: "committed",
              message:
                "Fixture outcome: draft accepted atomically. Publication blocked; Devices keep the previous publication. Adopted assets remain on graph Undo.",
            })
          }
        >
          Confirm exact operation committed
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!submitted}
          onClick={() =>
            update({
              stage: "stale",
              message:
                "Fixture outcome: definitive commit rejection. No graph, imported definitions, or staged asset entries were created.",
            })
          }
        >
          Confirm exact operation rejected
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={submitted}
          onClick={() => update({ ...INITIAL_STATE, variant: state.variant })}
        >
          Reset fixture
        </Button>
      </div>
      <label className="mt-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={state.showState}
          onChange={(event) => update({ showState: event.target.checked })}
        />
        Show full relevant state
      </label>
      {state.showState ? (
        <pre className="mt-2 max-h-52 overflow-auto rounded bg-muted p-2">
          {JSON.stringify(
            {
              ...state,
              imageRevision: model.chosenImage?.revision ?? null,
              requiredRemaining: model.requiredRemaining,
              ready: model.ready,
              operationId: submitted || state.stage === "committed" ? "prototype-paste-1" : null,
              actualGraphWrites: 0,
              actualCatalogWrites: 0,
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </details>
  );
}
function PrototypeSwitcher({ model }: { model: Model }) {
  const { variant } = model.state;
  if (!import.meta.env.DEV) return null;
  return (
    <nav
      aria-label="Prototype variants"
      className="fixed bottom-3 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-foreground px-4 py-2 text-background shadow-xl"
    >
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => model.changeVariant(VARIANTS[(VARIANTS.indexOf(variant) + 2) % 3] ?? "A")}
        className="rounded px-2 py-1"
      >
        ←
      </button>
      <span className="min-w-52 text-center text-sm">
        {variant} · {VARIANT_NAMES[variant]}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => model.changeVariant(VARIANTS[(VARIANTS.indexOf(variant) + 1) % 3] ?? "A")}
        className="rounded px-2 py-1"
      >
        →
      </button>
    </nav>
  );
}
function RepairLayouts({ model }: { model: Model }) {
  const { variant, step } = model.state;
  if (variant === "A")
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/65 px-4 pt-16 pb-20">
        <section
          aria-labelledby="repair-title"
          className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <RepairHeader model={model} />
          <div className="min-h-0 space-y-4 overflow-auto p-5">
            <ActionRepairs model={model} />
            <ImageRepairs model={model} />
            <OptionalInputs model={model} />
            <RepairReview model={model} />
            <PrototypeControls model={model} />
          </div>
          <RepairActions model={model} />
        </section>
      </div>
    );
  if (variant === "B")
    return (
      <aside
        aria-labelledby="repair-title"
        className="absolute top-16 right-3 bottom-20 z-40 flex w-[min(30rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <RepairHeader model={model} />
        <div className="min-h-0 space-y-3 overflow-auto p-4">
          <ActionRepairs model={model} />
          <ImageRepairs model={model} />
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              1 optional input · inspect or reconnect
            </summary>
            <div className="mt-3">
              <OptionalInputs model={model} />
            </div>
          </details>
          <RepairReview model={model} />
          <PrototypeControls model={model} />
        </div>
        <RepairActions model={model} />
      </aside>
    );
  return (
    <section
      aria-labelledby="repair-title"
      className="absolute inset-x-5 top-16 bottom-20 z-40 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
    >
      <RepairHeader model={model} />
      <div className="grid min-h-0 flex-1 grid-cols-[15rem_1fr]">
        <nav aria-label="Repair steps" className="space-y-2 border-r border-border bg-muted/40 p-4">
          {STEPS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={step === item.id ? "step" : undefined}
              onClick={() => model.update({ step: item.id })}
              className={`block w-full rounded-lg px-3 py-3 text-left text-sm ${step === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {item.label}
            </button>
          ))}
          <p className="pt-3 text-xs text-muted-foreground">
            Choices persist between steps. Optional inputs do not block Paste.
          </p>
        </nav>
        <div className="min-h-0 overflow-auto p-6">
          {step === "targets" ? (
            <ActionRepairs model={model} />
          ) : step === "images" ? (
            <ImageRepairs model={model} />
          ) : step === "inputs" ? (
            <OptionalInputs model={model} />
          ) : (
            <RepairReview model={model} />
          )}
          <div className="mt-6">
            <PrototypeControls model={model} />
          </div>
        </div>
      </div>
      <RepairActions model={model} />
    </section>
  );
}
function RepairWorkspace({ fixture }: { fixture: PasteRepairFixture }) {
  const model = usePrototypeModel(fixture);
  return (
    <MockEditorChrome header={{ name: "The Tempest" }}>
      <div inert className="size-full">
        <ShowGraphEditor graph={fixture.graph} imageAssets={[]} />
      </div>
      <div className="absolute top-20 left-5 z-30 rounded-md border border-border bg-card px-3 py-2 text-xs shadow">
        <strong>PROTOTYPE</strong> · simulated paste, no clipboard or API access
      </div>
      <RepairLayouts model={model} />
      <PrototypeSwitcher model={model} />
    </MockEditorChrome>
  );
}
export function GraphPasteRepairPrototype() {
  const fixture = useContext(FixtureContext);
  if (!fixture) throw new Error("This prototype requires a deterministic fixture provider.");
  return <RepairWorkspace fixture={fixture} />;
}
