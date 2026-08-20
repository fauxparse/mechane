import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./button";

type CopyButtonProps = {
  value: string;
  className?: string;
};

export const CopyButton = ({ value, className }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(() => setCopied(true));
  }, [value]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={copy}
      aria-label={`Copy ${value}`}
      className={className}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
};
