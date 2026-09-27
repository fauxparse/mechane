import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@mechane/design-system";
import type { ReactNode } from "react";

import "./AuthForm.css";

type AuthCardProps = {
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function AuthCard({ title, description, children, footer, className }: AuthCardProps) {
  return (
    <Card
      size="lg"
      className={cn(
        "auth-form-card w-full rounded-xl bg-muted/30 p-2 shadow-xl gap-0 backdrop-blur-lg",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-5 bg-muted/30 rounded-md shadow-md inset-shadow-[0_1px_0_0_rgba(255,255,255,0.15)] pb-(--card-spacing)">
        <CardHeader className="px-0 pt-(--card-spacing)">
          <CardTitle className="auth-form-title text-xl">{title}</CardTitle>
          <CardDescription className="auth-form-description">{description}</CardDescription>
        </CardHeader>
        {children}
      </CardContent>
      {footer ? (
        <CardFooter className="auth-form-footer flex-col px-(--card-spacing) py-2 border-t-0 bg-transparent">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
