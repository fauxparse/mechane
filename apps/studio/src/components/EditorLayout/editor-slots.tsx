// Slots let an editor contribute content to the Editor Chrome that wraps it.
//
// The Chrome owns where the sidebars and toolbar go; the editor owns what is in
// them, because that content needs the editor's own state (selection, tool,
// camera). The editor renders as a router `Outlet` *inside* the layout, so it
// cannot pass that content up as props — it portals it instead.
//
// An editor rendered with no Chrome around it contributes nothing and renders
// only its surface, which is what keeps it reviewable in isolation.
import type { PropsWithChildren, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type EditorSlotName = "left" | "right" | "toolbar";

type SlotTargets = Partial<Record<EditorSlotName, HTMLElement | null>>;

interface EditorSlotsContextValue {
  targets: SlotTargets;
  register(name: EditorSlotName, element: HTMLElement | null): void;
  /** Which slots an editor has actually filled, so the Chrome can hide empties. */
  filled: ReadonlySet<EditorSlotName>;
  setFilled(name: EditorSlotName, filled: boolean): void;
}

const EditorSlotsContext = createContext<EditorSlotsContextValue | null>(null);

export function EditorSlotsProvider({ children }: PropsWithChildren) {
  const [targets, setTargets] = useState<SlotTargets>({});
  const [filled, setFilledSet] = useState<ReadonlySet<EditorSlotName>>(() => new Set());

  // Both setters must keep a stable identity for the life of the provider.
  // `register` is used as a ref callback: React re-invokes a ref whose function
  // identity changed, once with null and once with the element. If that identity
  // depended on the state the ref sets, every registration would schedule a
  // render that produced a new ref that registered again — an infinite loop.
  const register = useCallback((name: EditorSlotName, element: HTMLElement | null) => {
    setTargets((current) =>
      current[name] === element ? current : { ...current, [name]: element },
    );
  }, []);

  const setFilled = useCallback((name: EditorSlotName, isFilled: boolean) => {
    setFilledSet((current) => {
      if (current.has(name) === isFilled) return current;
      const next = new Set(current);
      if (isFilled) next.add(name);
      else next.delete(name);
      return next;
    });
  }, []);

  const value = useMemo<EditorSlotsContextValue>(
    () => ({ targets, filled, register, setFilled }),
    [filled, register, setFilled, targets],
  );

  return <EditorSlotsContext.Provider value={value}>{children}</EditorSlotsContext.Provider>;
}

/**
 * Which slots the current editor has filled. The Chrome uses this to decide
 * whether a sidebar exists at all — the Show Editor fills no left slot, so its
 * left sidebar and the trigger for it are never rendered.
 */
export function useFilledEditorSlots(): ReadonlySet<EditorSlotName> {
  return useContext(EditorSlotsContext)?.filled ?? new Set<EditorSlotName>();
}

const NO_REGISTER = () => {};

/**
 * A ref callback that hands a named slot its container element.
 *
 * Returned memoised per slot, because React re-invokes a ref whose identity
 * changed — first with null, then with the element. A fresh arrow each render
 * would therefore unregister and re-register forever.
 */
export function useEditorSlotRef(name: EditorSlotName): (element: HTMLElement | null) => void {
  const register = useContext(EditorSlotsContext)?.register ?? NO_REGISTER;
  return useCallback((element: HTMLElement | null) => register(name, element), [name, register]);
}

export interface EditorSlotProps {
  name: EditorSlotName;
  children?: ReactNode;
}

/** Renders `children` into the Chrome's slot, or nowhere if there is no Chrome. */
export function EditorSlot({ name, children }: EditorSlotProps) {
  const context = useContext(EditorSlotsContext);
  const hasContent = children !== null && children !== undefined && children !== false;
  const setFilled = context?.setFilled;

  useEffect(() => {
    if (!setFilled) return;
    setFilled(name, hasContent);
    return () => setFilled(name, false);
  }, [hasContent, name, setFilled]);

  const target = context?.targets[name];
  if (!target || !hasContent) return null;
  return createPortal(children, target);
}
