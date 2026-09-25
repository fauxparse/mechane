import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { MechaneIcon } from "@mechane/design-system";

type GuestAuthLayoutProps = {
  children: ReactNode;
};

type GuestAuthStyle = CSSProperties & {
  "--light-texture": string;
  "--dark-texture": string;
};

const backgroundTexture = (color: string): string =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='64' height='64'%3E%3Cpath fill='${encodeURIComponent(color)}' fill-opacity='0.05' d='M0 0h2v2H0zm16 0h2v2h-2zm16 0h2v2h-2zm16 0h2v2h-2zM8 8h2v2H8zm16 0h2v2h-2zm16 0h2v2h-2zm16 0h2v2h-2zM0 16h2v2H0zm16 16h2v2h-2zm16 0h2v2h-2zm16 0h2v2h-2zM8 40h2v2H8zm16 0h2v2h-2zm16 0h2v2h-2zm16 0h2v2h-2zM0 56h2v2H0zm16 0h2v2h-2zm16 0h2v2h-2zm16 0h2v2h-2z'%3E%3C/path%3E%3C/svg%3E")`;

const backgroundStyle: GuestAuthStyle = {
  "--light-texture": backgroundTexture("#332D29"),
  "--dark-texture": backgroundTexture("white"),
};

export function GuestAuthLayout({ children }: GuestAuthLayoutProps) {
  return (
    <main
      className="grid min-h-screen lg:grid-cols-2 bg-(image:--light-texture) dark:bg-(image:--dark-texture)"
      style={backgroundStyle}
    >
      <section className="hidden flex-col justify-between bg-muted p-12 lg:flex shadow-2xl">
        <Link to="/sign-in" className="flex items-center gap-2">
          <MechaneIcon className="size-10" />
          <span className="text-xl font-semibold tracking-tight">Mechanē</span>
        </Link>
        <div className="max-w-md">
          <p className="text-4xl leading-tight font-semibold text-balance">
            Interactive tech for live theatre, built for the room it’s in.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground text-balance">
            Design scenes, wire up devices, and run the show, from the director’s laptop to every
            phone in the audience.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Mechanē</p>
      </section>

      <section className="flex flex-col items-center justify-center gap-8 p-6 py-16">
        <Link to="/sign-in" className="flex items-center gap-2 lg:hidden">
          <MechaneIcon className="size-8" />
          <span className="text-xl font-semibold tracking-tight">Mechanē</span>
        </Link>
        {children}
      </section>
    </main>
  );
}
