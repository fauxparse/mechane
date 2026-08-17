import { ElementKind } from "@mechane/domain";
import {
  CircleIcon,
  FrameIcon,
  ImageIcon,
  LucideIcon,
  SquareDashedIcon,
  SquareIcon,
  TypeIcon,
} from "@mechane/design-system";

const ELEMENT_ICONS: Record<ElementKind, LucideIcon> = {
  frame: FrameIcon,
  rect: SquareIcon,
  ellipse: CircleIcon,
  text: TypeIcon,
  image: ImageIcon,
};

export const elementIconFor = (kind: ElementKind | ElementKind[] | undefined) => {
  const kinds =
    typeof kind === "string" ? [kind] : (Array.from(new Set(kind)) as (ElementKind | undefined)[]);

  if (kinds.length !== 1 || !kinds[0]) return SquareDashedIcon;
  return ELEMENT_ICONS[kinds[0]];
};
