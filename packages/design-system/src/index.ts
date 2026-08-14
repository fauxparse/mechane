// Generated theme tokens (light/dark palette modes — see styles/globals.css)
// and shared component primitives (Tailwind + Base UI + shadcn/ui). Every new
// visual component added here needs a Storybook story in the same change —
// see PRD.md §9 "Component convention".
export { cn } from "./lib/utils";

export { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/ui/alert";
export {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/ui/alert-dialog";
export {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "./components/ui/avatar";
export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "./components/ui/combobox";
export { Badge, badgeVariants } from "./components/ui/badge";
export { Button, buttonVariants } from "./components/ui/button";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
export {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  ContextMenuSubmenuContent,
  ContextMenuSubmenuTrigger,
  ContextMenuTrigger,
} from "./components/ui/context-menu";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  dropdownMenuItemVariants,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
  InsideSidebar,
  SIDEBAR_BREAKPOINT,
  SIDEBAR_TRANSITION_MS,
} from "./components/ui/sidebar";
export {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
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
} from "./components/ui/toast";
export { Separator } from "./components/ui/separator";
export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants } from "./components/ui/tabs";
export { Toggle, toggleVariants } from "./components/ui/toggle";
export { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
export type {
  SidebarMenuButtonProps,
  SidebarProps,
  SidebarProviderProps,
} from "./components/ui/sidebar";
export { Input } from "./components/ui/input";
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./components/ui/input-group";
export { Textarea } from "./components/ui/textarea";
export { Label } from "./components/ui/label";
export { QrCode } from "./components/ui/qr-code";
export { ThemeSwitcher } from "./components/theme-switcher";
export type { ThemeSwitcherProps } from "./components/theme-switcher";
export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  createPopoverHandle,
} from "./components/ui/popover";
export {
  PropertyInput,
  type PropertyInputConstraint,
  type PropertyInputProps,
  type PropertyInputSizing,
  type PropertyInputType,
  type PropertyInputUnit,
  type PropertyInputValue,
  type VariableReference,
} from "./components/ui/property-input/property-input";
export { ThemeProvider, useTheme } from "./theme/theme-provider";
export type { ThemeContextValue, ThemeProviderProps } from "./theme/theme-provider";
export { Switch } from "./components/ui/switch";

export { THEME_COLOR_METADATA } from "./themes/generated";
export type { ThemeColorKey } from "./themes/generated";

export { MechaneIcon } from "./icons/MechaneIcon";
export { LayoutNoneIcon } from "./icons/LayoutNoneIcon";
export { LayoutHorizontalIcon } from "./icons/LayoutHorizontalIcon";
export { LayoutVerticalIcon } from "./icons/LayoutVerticalIcon";
export { GapHorizontalIcon } from "./icons/GapHorizontalIcon";
export { GapVerticalIcon } from "./icons/GapVerticalIcon";
export { OpacityIcon } from "./icons/OpacityIcon";
export { PaddingAllIcon } from "./icons/PaddingAllIcon";
export { PaddingHorizontalIcon } from "./icons/PaddingHorizontalIcon";
export { PaddingLeftIcon } from "./icons/PaddingLeftIcon";
export { PaddingRightIcon } from "./icons/PaddingRightIcon";
export { PaddingVerticalIcon } from "./icons/PaddingVerticalIcon";
export { PaddingTopIcon } from "./icons/PaddingTopIcon";
export { PaddingBottomIcon } from "./icons/PaddingBottomIcon";
export { RadiusIcon } from "./icons/RadiusIcon";
export { RadiusBottomLeftIcon } from "./icons/RadiusBottomLeftIcon";
export { RadiusBottomRightIcon } from "./icons/RadiusBottomRightIcon";
export { RadiusTopLeftIcon } from "./icons/RadiusTopLeftIcon";
export { RadiusTopRightIcon } from "./icons/RadiusTopRightIcon";
export * from "lucide-react";
