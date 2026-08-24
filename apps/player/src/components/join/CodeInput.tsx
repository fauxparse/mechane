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
    const nextCharacter = character.slice(-1).toUpperCase();
    if (nextCharacter && !/^[A-HJ-KM-NP-Z1-9]$/.test(nextCharacter)) return;
    const newCode = value.slice(0, index) + nextCharacter;
    onChange(newCode);
    if (nextCharacter && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (pastedValue: string) => {
    const newCode = pastedValue
      .toUpperCase()
      .replace(/[^A-HJ-KM-NP-Z1-9]/g, "")
      .slice(0, length);
    if (newCode.length > 0) {
      onChange(newCode);
      inputs.current[Math.min(newCode.length, length) - 1]?.focus();
    }
  };

  return (
    <div className="flex gap-2" role="group" aria-label="Pairing code">
      {Array.from({ length }).map((_, index) => (
        <input
          ref={(el) => {
            if (el) {
              inputs.current[index] = el;
            }
          }}
          key={index}
          type="text"
          inputMode="text"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Pairing code character ${index + 1} of ${length}`}
          maxLength={1}
          size={1}
          className="w-[1em] rounded-md border-0 bg-white/50 p-2 text-center text-[3rem] leading-[0.75] text-neutral-900 outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/10"
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
