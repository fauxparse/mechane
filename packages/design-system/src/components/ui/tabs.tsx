import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { LazyMotion, domAnimation, m, type Transition } from "motion/react";
import * as React from "react";

import { cn } from "../../lib/utils";

type TabsValue = unknown;

type HighlightBounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type TabsContextValue = {
  value: TabsValue;
  orientation: TabsPrimitive.Root.Orientation;
  getTab: (value: TabsValue) => HTMLElement | null;
  registerTab: (value: TabsValue, element: HTMLElement | null) => void;
  tabVersion: number;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within Tabs");
  }
  return context;
}

function Tabs(props: TabsPrimitive.Root.Props) {
  const { orientation = "horizontal" } = props;
  const [value, setValue] = React.useState<TabsValue>(
    props.value !== undefined ? props.value : props.defaultValue,
  );
  const tabRefs = React.useRef(new Map<TabsValue, HTMLElement>());
  const [tabVersion, setTabVersion] = React.useState(0);

  React.useEffect(() => {
    if (props.value !== undefined) {
      setValue(props.value);
    }
  }, [props.value]);

  const registerTab = React.useCallback((tabValue: TabsValue, element: HTMLElement | null) => {
    if (element) {
      tabRefs.current.set(tabValue, element);
    } else {
      tabRefs.current.delete(tabValue);
    }
    setTabVersion((version) => version + 1);
  }, []);

  const getTab = React.useCallback(
    (tabValue: TabsValue) => tabRefs.current.get(tabValue) ?? null,
    [],
  );

  const handleValueChange: NonNullable<TabsPrimitive.Root.Props["onValueChange"]> =
    React.useCallback(
      (nextValue, eventDetails) => {
        setValue(nextValue);
        props.onValueChange?.(nextValue, eventDetails);
      },
      [props.onValueChange],
    );

  const contextValue = React.useMemo(
    () => ({ value, orientation, getTab, registerTab, tabVersion }),
    [getTab, orientation, registerTab, tabVersion, value],
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <TabsPrimitive.Root {...props} orientation={orientation} onValueChange={handleValueChange} />
    </TabsContext.Provider>
  );
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center rounded-full p-1 text-muted-foreground group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent p-0 h-8",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const tabsHighlightTransition: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 25,
};

function TabsHighlight({
  listRef,
  variant,
}: {
  listRef: React.RefObject<HTMLDivElement | null>;
  variant: "default" | "line";
}) {
  const { getTab, orientation, tabVersion, value } = useTabsContext();
  const [bounds, setBounds] = React.useState<HighlightBounds | null>(null);

  const measure = React.useCallback(() => {
    const list = listRef.current;
    const tab = value == null ? null : getTab(value);

    if (!list || !tab) {
      setBounds(null);
      return;
    }

    const tabRect = tab.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const nextBounds = {
      top: tabRect.top - listRect.top,
      left: tabRect.left - listRect.left,
      width: tabRect.width,
      height: tabRect.height,
    };

    setBounds((current) =>
      current?.top === nextBounds.top &&
      current.left === nextBounds.left &&
      current.width === nextBounds.width &&
      current.height === nextBounds.height
        ? current
        : nextBounds,
    );
  }, [getTab, listRef, value]);

  React.useEffect(() => {
    measure();

    const list = listRef.current;
    const tab = value == null ? null : getTab(value);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);

    if (list) {
      resizeObserver?.observe(list);
    }
    if (tab) {
      resizeObserver?.observe(tab);
    }
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [getTab, listRef, measure, tabVersion, value]);

  if (!bounds) {
    return null;
  }

  const isHorizontal = orientation === "horizontal";
  const lineBounds =
    variant === "line"
      ? isHorizontal
        ? {
            top: bounds.top + bounds.height - 2,
            left: bounds.left,
            width: bounds.width,
            height: 2,
          }
        : {
            top: bounds.top,
            left: bounds.left + bounds.width - 2,
            width: 2,
            height: bounds.height,
          }
      : bounds;

  return (
    <LazyMotion features={domAnimation}>
      <m.span
        aria-hidden="true"
        data-slot="tabs-highlight"
        initial={false}
        animate={lineBounds}
        transition={tabsHighlightTransition}
        className={cn(
          "pointer-events-none absolute z-0",
          variant === "default" ? "rounded-full bg-background shadow-sm" : "bg-foreground",
        )}
      />
    </LazyMotion>
  );
}

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props &
  VariantProps<typeof tabsListVariants> & { children?: React.ReactNode }) {
  const listRef = React.useRef<HTMLDivElement | null>(null);

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      <TabsHighlight listRef={listRef} variant={variant ?? "default"} />
    </TabsPrimitive.List>
  );
}

const TabsTrigger = React.forwardRef<HTMLElement, TabsPrimitive.Tab.Props>(function TabsTrigger(
  { className, ...props },
  ref,
) {
  const { registerTab } = useTabsContext();
  const setTabRef = React.useCallback(
    (element: HTMLElement | null) => {
      registerTab(props.value, element);
      if (typeof ref === "function") {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    },
    [props.value, ref, registerTab],
  );

  return (
    <TabsPrimitive.Tab
      ref={setTabRef}
      data-slot="tabs-trigger"
      className={cn(
        "relative z-1 inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-active:bg-transparent",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:text-foreground dark:data-active:border-input dark:data-active:text-foreground",
        className,
      )}
      {...props}
    />
  );
});

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
