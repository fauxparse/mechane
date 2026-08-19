// A modal dialog: a backdrop, a centred panel, and a title. Wraps Base UI's
// Dialog (which owns focus trapping, scroll locking, and Escape) with this
// design system's tokens, the same way ./dropdown-menu.tsx wraps its Menu.
//
// `DialogContent` collapses Base UI's Portal → Backdrop → Popup trio into one
// component for the same reason `DropdownMenuContent` does: every consumer
// wants all three, and the parts are still there to reach for if that stops
// being true.
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "../../lib/utils";

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger({ className, ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" className={className} {...props} />;
}

function DialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Centred with a translate rather than flexbox, so the popup can be
          // a portal sibling of the backdrop instead of nested inside it.
          "@container/dialog fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogClose({ className, ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" className={className} {...props} />;
}

/** The row of actions at the foot of a dialog, trailing-aligned. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-footer" className={cn("flex justify-end gap-2", className)} {...props} />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
};
