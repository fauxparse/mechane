import { useRef } from "react";

type CodeInputProps = {
  value: string;
  length?: number;
  onChange: (value: string) => void;
};

export const CodeInput = ({ value, length = 5, onChange }: CodeInputProps) => {
  const inputs = useRef<HTMLInputElement[]>([]);

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "Backspace":
      case "Delete":
        event.preventDefault();
        const newCode = index ? value.slice(0, index) : "";
        onChange(newCode);
        if (index > 0) {
          inputs.current[index - 1]?.focus();
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (index > 0) {
          inputs.current[index - 1]?.focus();
        }
        break;
      case "ArrowRight":
        event.preventDefault();
        if (index < length - 1) {
          inputs.current[index + 1]?.focus();
        }
        break;
      case "Home":
        event.preventDefault();
        inputs.current[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        inputs.current[length - 1]?.focus();
        break;
    }
  };

  const handleChange = (index: number, character: string) => {
    const newCode = value.slice(0, index) + character.slice(0, 1).toUpperCase();
    onChange(newCode);
    if (index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (value: string) => {
    const newCode = value.slice(0, length).toUpperCase();
    if (newCode.match(new RegExp(`^[A-Z0-9]{${length}}$`))) {
      onChange(newCode);
      inputs.current[inputs.current.length - 1]?.focus();
    }
  };

  return (
    <div className="flex gap-2">
      {Array.from({ length }).map((_, index) => (
        <input
          ref={(el) => {
            if (el) {
              inputs.current[index] = el;
            }
          }}
          key={index}
          type="text"
          size={1}
          className="text-[3rem] w-[1em] bg-white/50 border-0 rounded-md text-center text-neutral-900 outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/10 leading-[0.75] p-2"
          value={value[index] ?? ""}
          autoFocus={index === 0 || undefined}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onChange={(e) => handleChange(index, e.target.value)}
          onFocus={(e) => e.target.select()}
          onPaste={(e) => {
            e.preventDefault();
            handlePaste(e.clipboardData.getData("text"));
          }}
        />
      ))}
    </div>
  );
};
