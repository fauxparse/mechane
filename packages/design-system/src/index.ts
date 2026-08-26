// Generated theme tokens (light/dark palette modes — see styles/globals.css)
// and shared component primitives (Tailwind + Base UI + shadcn/ui). Every new
// visual component added here needs a Storybook story in the same change —
// see PRD.md §9 "Component convention".

export { cn } from "./lib/utils";

export { THEME_COLOR_METADATA } from "./themes/generated";
export type { ThemeColorKey } from "./themes/generated";

export {
  Section,
  SectionHelperText,
  SectionRow,
  type SectionProps,
} from "./components/inspector-section";
export { EditableName, type EditableNameProps } from "./components/editable-name";
export { InspectorProvider, useVibe, type Vibe } from "./components/inspector-vibe";
export { ThemeSwitcher, type ThemeSwitcherProps } from "./components/theme-switcher";
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
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";
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
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
} from "./components/ui/combobox";
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
export { CopyButton } from "./components/ui/copy-button";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuContent,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
  dropdownMenuItemVariants,
} from "./components/ui/dropdown-menu";
export { ImageCropper } from "./components/ui/image-input/ImageCropper";
export type { ImageCropperProps } from "./components/ui/image-input/ImageCropper";
export {
  ImageInput,
  type ImageInputCrop,
  type ImageInputError,
  type ImageInputErrorCode,
  type ImageInputOnUploadProps,
  type ImageInputProps,
  type ImageInputValidation,
  type ImageInputValue,
} from "./components/ui/image-input/ImageInput";
export { Input } from "./components/ui/input";
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./components/ui/input-group";
export { Label } from "./components/ui/label";
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
  type PropertyInputConstraints,
  type PropertyInputPreset,
  type PropertyInputProps,
  type PropertyInputSizing,
  type PropertyInputType,
  type PropertyInputUnit,
  type PropertyInputValue,
  type VariableReference,
} from "./components/ui/property-input/property-input";
export {
  parsePropertyInputValue,
  propertyInputValidationMessage,
} from "./components/ui/property-input/use-property-input";
export {
  VARIABLE_TYPE_ICONS,
  variableTypeIcon,
  variableTypeKind,
  variableTypeLabel,
  type VariableTypeIconKind,
} from "./components/ui/property-input/variable-type-icons";
export { QrCode } from "./components/ui/qr-code";
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
export {
  TypeSelect,
  type TypeSelectOption,
  type TypeSelectProps,
  type TypeSelectTriggerProps,
} from "./components/ui/type-select";
export { Separator } from "./components/ui/separator";
export {
  InsideSidebar,
  SIDEBAR_BREAKPOINT,
  SIDEBAR_TRANSITION_MS,
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
} from "./components/ui/sidebar";
export type {
  SidebarMenuButtonProps,
  SidebarProps,
  SidebarProviderProps,
} from "./components/ui/sidebar";
export { Slider } from "./components/ui/slider";
export { Swatch } from "./components/ui/swatch";
export { Switch } from "./components/ui/switch";
export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants } from "./components/ui/tabs";
export { Textarea } from "./components/ui/textarea";
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
export { Toggle, toggleVariants } from "./components/ui/toggle";
export { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
export {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
export { ThemeProvider, useTheme } from "./theme/theme-provider";
export type { ThemeContextValue, ThemeProviderProps } from "./theme/theme-provider";

export { FontSizeIcon } from "./icons/FontSizeIcon";
export { GapHorizontalIcon } from "./icons/GapHorizontalIcon";
export { GapVerticalIcon } from "./icons/GapVerticalIcon";
export { GradientLinearIcon } from "./icons/GradientLinearIcon";
export { GradientRadialIcon } from "./icons/GradientRadialIcon";
export { LayoutHorizontalIcon } from "./icons/LayoutHorizontalIcon";
export { LayoutNoneIcon } from "./icons/LayoutNoneIcon";
export { LayoutVerticalIcon } from "./icons/LayoutVerticalIcon";
export { LetterSpacingIcon } from "./icons/LetterSpacingIcon";
export { LineHeightIcon } from "./icons/LineHeightIcon";
export { MechaneIcon } from "./icons/MechaneIcon";
export { OpacityIcon } from "./icons/OpacityIcon";
export { PaddingAllIcon } from "./icons/PaddingAllIcon";
export { PaddingBottomIcon } from "./icons/PaddingBottomIcon";
export { PaddingHorizontalIcon } from "./icons/PaddingHorizontalIcon";
export { PaddingLeftIcon } from "./icons/PaddingLeftIcon";
export { PaddingRightIcon } from "./icons/PaddingRightIcon";
export { PaddingTopIcon } from "./icons/PaddingTopIcon";
export { PaddingVerticalIcon } from "./icons/PaddingVerticalIcon";
export { RadiusBottomLeftIcon } from "./icons/RadiusBottomLeftIcon";
export { RadiusBottomRightIcon } from "./icons/RadiusBottomRightIcon";
export { RadiusIcon } from "./icons/RadiusIcon";
export { RadiusTopLeftIcon } from "./icons/RadiusTopLeftIcon";
export { RadiusTopRightIcon } from "./icons/RadiusTopRightIcon";
export { TextAlignVerticalBottomIcon } from "./icons/TextAlignVerticalBottomIcon";
export { TextAlignVerticalCenterIcon } from "./icons/TextAlignVerticalCenterIcon";
export { TextAlignVerticalTopIcon } from "./icons/TextAlignVerticalTopIcon";
export * from "lucide-react";
