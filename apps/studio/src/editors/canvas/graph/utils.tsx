import { ElementKind } from "@mechane/domain";
import {
  CircleIcon,
  FrameIcon,
  ImageIcon,
  LucideIcon,
  SquareDashedIcon,
  SquareIcon,
  TypeIcon,
} from "lucide-react";
import isArray from "es-toolkit/compat";

const ELEMENT_ICONS: Record<ElementKind, LucideIcon> = {
  frame: FrameIcon,
  rect: SquareIcon,
  ellipse: CircleIcon,
  text: TypeIcon,
  image: ImageIcon,
};

export const elementIconFor = (kind: ElementKind | ElementKind[] | undefined) => {
  const kinds = (isArray(kind) ? Array.from(new Set(kind)) : [kind]) as (ElementKind | undefined)[];
  if (kinds.length !== 1 || !kinds[0]) return SquareDashedIcon;
  return ELEMENT_ICONS[kinds[0]];
};
