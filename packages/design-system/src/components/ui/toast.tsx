import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";

function ToastProvider(props: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider data-slot="toast-provider" {...props} />;
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-lg border border-border bg-background p-4 text-foreground shadow-lg outline-none transition-[transform,opacity] data-ending-style:translate-y-2 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0 data-type=error:border-destructive data-type=error:text-destructive-foreground",
        className,
      )}
      {...props}
    />
  );
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  );
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("mt-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function ToastClose({ className, children, ...props }: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      {children ?? <X className="size-4" aria-hidden="true" />}
    </ToastPrimitive.Close>
  );
}

function ToastAction({ className, ...props }: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  const { toasts } = ToastPrimitive.useToastManager();

  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toast-viewport"
        className={cn(
          "fixed right-4 bottom-4 z-100 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-none",
          className,
        )}
        {...props}
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast}>
            <ToastContent>
              <ToastTitle />
              <ToastDescription />
            </ToastContent>
            {toast.actionProps ? <ToastAction {...toast.actionProps} /> : null}
            <ToastClose />
          </Toast>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  );
}

const useToastManager = ToastPrimitive.useToastManager;
const createToastManager = ToastPrimitive.createToastManager;

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  useToastManager,
};
