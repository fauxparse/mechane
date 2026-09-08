import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { type VariantProps } from "class-variance-authority";
import { AnimatePresence, domAnimation, LazyMotion, m, type Transition } from "motion/react";
import * as React from "react";

import { cn } from "../../lib/utils";
import { useVibe, VibeProvider, type Vibe } from "../inspector-vibe";
import { toggleVariants } from "./toggle";

type HighlightBounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type ToggleGroupContextValue = VariantProps<typeof toggleVariants> & {
  spacing?: number;
  orientation?: "horizontal" | "vertical";
  vibe: Vibe;
  value: readonly string[];
  multiple: boolean;
  groupRef: React.RefObject<HTMLDivElement | null>;
  getItem: (value: string) => HTMLElement | null;
  registerItem: (value: string | undefined, element: HTMLElement | null) => void;
  itemVersion: number;
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null);

function useToggleGroupContext() {
  const context = React.useContext(ToggleGroupContext);
  if (!context) {
    throw new Error("ToggleGroupItem must be used within ToggleGroup");
  }
  return context;
}

const toggleGroupHighlightTransition: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 25,
};

function ToggleGroupHighlight() {
  const { getItem, groupRef, itemVersion, value } = useToggleGroupContext();
  const [bounds, setBounds] = React.useState<HighlightBounds | null>(null);

  const measure = React.useCallback(() => {
    const group = groupRef.current;
    const activeValue = value[0];
    const item = activeValue === undefined ? null : getItem(activeValue);

    if (!group || !item) {
      setBounds(null);
      return;
    }

    const itemRect = item.getBoundingClientRect();
    const groupRect = group.getBoundingClientRect();
    const nextBounds = {
      top: itemRect.top - groupRect.top,
      left: itemRect.left - groupRect.left,
      width: itemRect.width,
      height: itemRect.height,
    };

    setBounds((current) =>
      current?.top === nextBounds.top &&
      current.left === nextBounds.left &&
      current.width === nextBounds.width &&
      current.height === nextBounds.height
        ? current
        : nextBounds,
    );
  }, [getItem, groupRef, value]);

  React.useEffect(() => {
    measure();

    const group = groupRef.current;
    const item = value[0] === undefined ? null : getItem(value[0]);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);

    if (group) {
      resizeObserver?.observe(group);
    }
    if (item) {
      resizeObserver?.observe(item);
    }
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [getItem, groupRef, itemVersion, measure, value]);

  if (!bounds) {
    return null;
  }

  return (
    <m.span
      aria-hidden="true"
      data-slot="toggle-group-highlight"
      initial={false}
      animate={bounds}
      transition={toggleGroupHighlightTransition}
      className="pointer-events-none absolute z-0 rounded-[calc(var(--toggle-group-radius)-var(--toggle-group-padding))] bg-accent"
    />
  );
}

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  vibe: vibeProp,
  children,
  multiple = false,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
    orientation?: "horizontal" | "vertical";
    vibe?: Vibe;
    children?: React.ReactNode;
  }) {
  const vibe = useVibe(vibeProp);
  const resolvedSize = size ?? (vibe === "inspector" ? "sm" : undefined);
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef(new Map<string, HTMLElement>());
  const [itemVersion, setItemVersion] = React.useState(0);
  const [uncontrolledValue, setUncontrolledValue] = React.useState<readonly string[]>(
    props.defaultValue ?? [],
  );
  const value = props.value ?? uncontrolledValue;

  const registerItem = React.useCallback(
    (itemValue: string | undefined, element: HTMLElement | null) => {
      if (itemValue === undefined) {
        return;
      }

      if (element) {
        itemRefs.current.set(itemValue, element);
      } else {
        itemRefs.current.delete(itemValue);
      }
      setItemVersion((version) => version + 1);
    },
    [],
  );

  const getItem = React.useCallback(
    (itemValue: string) => itemRefs.current.get(itemValue) ?? null,
    [],
  );

  const handleValueChange: NonNullable<ToggleGroupPrimitive.Props["onValueChange"]> =
    React.useCallback(
      (nextValue, eventDetails) => {
        if (props.value === undefined) {
          setUncontrolledValue(nextValue);
        }
        props.onValueChange?.(nextValue, eventDetails);
      },
      [props.onValueChange, props.value],
    );

  const contextValue = React.useMemo(
    () => ({
      variant,
      size: resolvedSize,
      spacing,
      orientation,
      vibe,
      value,
      multiple,
      groupRef,
      getItem,
      registerItem,
      itemVersion,
    }),
    [
      getItem,
      itemVersion,
      multiple,
      orientation,
      registerItem,
      resolvedSize,
      spacing,
      value,
      variant,
      vibe,
    ],
  );

  return (
    <LazyMotion features={domAnimation}>
      <VibeProvider vibe={vibe}>
        <ToggleGroupPrimitive
          ref={groupRef}
          data-slot="toggle-group"
          data-variant={variant}
          data-size={resolvedSize}
          data-spacing={spacing}
          data-orientation={orientation}
          style={
            {
              "--gap": spacing,
              "--toggle-group-padding": "0.125rem",
              "--toggle-group-radius":
                resolvedSize === "sm" ? "var(--radius-sm)" : "var(--radius-md)",
            } as React.CSSProperties
          }
          className={cn(
            "group/toggle-group relative flex w-fit p-(--toggle-group-padding) flex-row items-center bg-muted/50 gap-[--spacing(var(--gap))] rounded-md data-[size=sm]:rounded-sm data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
            vibe === "inspector" ? "rounded-sm h-7" : "h-8",
            className,
          )}
          {...props}
          multiple={multiple}
          onValueChange={handleValueChange}
        >
          <ToggleGroupContext.Provider value={contextValue}>
            {children}
            {!multiple && <ToggleGroupHighlight />}
          </ToggleGroupContext.Provider>
        </ToggleGroupPrimitive>
      </VibeProvider>
    </LazyMotion>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  vibe: vibeProp,
  ...props
}: Omit<TogglePrimitive.Props, "render"> &
  VariantProps<typeof toggleVariants> & {
    vibe?: Vibe;
  }) {
  const context = useToggleGroupContext();
  const vibe = useVibe(vibeProp);
  const resolvedVariant = context.variant || variant || "default";
  const resolvedSize = context.size || size || (vibe === "inspector" ? "sm" : "default");
  const itemValue = props.value;
  const setItemRef = React.useCallback(
    (element: HTMLElement | null) => context.registerItem(itemValue, element),
    [context.registerItem, itemValue],
  );
  const isActive = itemValue !== undefined && context.value.includes(itemValue);

  return (
    <span
      ref={setItemRef}
      className="group-data-[orientation=vertical]/toggle-group:w-full h-full relative flex items-center justify-center shrink-0 rounded-[calc(var(--toggle-group-radius)-var(--toggle-group-padding))]"
    >
      <AnimatePresence initial={false}>
        {context.multiple && isActive && (
          <m.span
            aria-hidden="true"
            data-slot="toggle-group-highlight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] bg-accent"
          />
        )}
      </AnimatePresence>
      <TogglePrimitive
        data-slot="toggle-group-item"
        render={<m.button data-slot="toggle-group-item" />}
        className={cn(
          toggleVariants({ variant: resolvedVariant, size: resolvedSize }),
          "group-data-[orientation=vertical]/toggle-group:w-full relative z-10 shrink-0 rounded-[inherit] border-0 bg-transparent shadow-none hover:bg-transparent aria-pressed:bg-transparent data-[state=on]:bg-transparent focus:z-10 focus-visible:z-10 h-full",
          resolvedSize === "sm" && "h-6 min-w-6 rounded-xs",
          className,
        )}
        {...props}
      >
        {children}
      </TogglePrimitive>
    </span>
  );
}

export { ToggleGroup, ToggleGroupItem };
