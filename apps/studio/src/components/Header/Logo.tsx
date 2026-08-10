import { cn } from "@mechane/design-system";

export const Logo = ({ className }: { className?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={cn("fill-foreground size-6", className)}
      fillRule="evenodd"
      clipRule="evenodd"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path
        d="M14.047 4.169a2.966 2.966 0 0 1 3.83-.237A9.92 9.92 0 0 1 22 12c0 5.519-4.481 10-10 10S2 17.519 2 12a9.99 9.99 0 0 1 4.088-8.064 2.985 2.985 0 0 1 3.853.227 2.9 2.9 0 0 0 2.044.829c.798 0 1.524-.313 2.062-.823M12 6.5a1.5 1.5 0 0 1 0 3a1.5 1.5 0 0 1 0-3zM14 15.668a1 1 0 0 1 1.886.664 4.01 4.01 0 0 1-3.773 2.672c-2.194 0-4-1.805-4-4V15c0-1.109.617-2.023 1.416-2.688 1.008-.84 2.268-1.261 2.268-1.261a1.001 1.001 0 0 1 .632 1.898s-.9.299-1.62.899c-.354.295-.696.661-.696 1.152v.004c0 1.098.903 2 2 2 .847 0 1.606-.537 1.887-1.336"
        fill="currentColor"
      />
    </svg>
  );
};
