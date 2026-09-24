import {
  CATALOGUE,
  analyse,
  previewText,
  typeName,
  type FormulaScope,
  type FormulaType,
} from "@mechane/domain/formula";
import { cn } from "@mechane/design-system";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completionStatus,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { LRLanguage, syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { Annotation, EditorState } from "@codemirror/state";
import { forceLinting, linter, type Diagnostic } from "@codemirror/lint";
import {
  EditorView,
  keymap,
  placeholder as placeholderExtension,
  tooltips,
} from "@codemirror/view";
import { styleTags, tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { parser } from "./formula-parser";

const formulaLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      styleTags({
        Identifier: tags.variableName,
        Property: tags.propertyName,
        Number: tags.number,
        String: tags.string,
        Boolean: tags.bool,
        Null: tags.null,
        BinaryOperator: tags.operator,
        UnaryOperator: tags.operator,
      }),
    ],
  }),
  languageData: { closeBrackets: { brackets: ["(", "[", "{", "'", '"'] } },
});

const programmaticValueChange = Annotation.define<boolean>();
const editorTheme = EditorView.theme({
  "&": { fontSize: "12px", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    minHeight: "4.5rem",
    padding: "8px",
    caretColor: "var(--color-foreground)",
  },
  ".cm-line": { padding: "0" },
  ".cm-tooltip": {
    backgroundColor: "var(--color-popover, var(--color-card))",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.18)",
  },
  ".cm-tooltip-autocomplete ul li": { padding: "3px 8px" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--color-accent)",
    color: "var(--color-accent-foreground)",
  },
  ".cm-completionLabel": { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
  ".cm-completionDetail": { marginLeft: "1rem", color: "var(--color-muted-foreground)" },
  ".cm-diagnostic": { fontFamily: "var(--font-sans)", fontSize: "12px", padding: "4px 8px" },
  ".cm-lintRange-error": { textDecoration: "underline wavy var(--color-destructive) 1px" },
  ".cm-lintRange-warning": {
    textDecoration: "underline wavy var(--color-palette-orange-text) 1px",
  },
  ".cm-placeholder": { color: "var(--color-muted-foreground)" },
});

function fieldsOf(type: FormulaType, scope: FormulaScope): Record<string, FormulaType> | null {
  if (typeof type !== "object") return null;
  if ("array" in type) return fieldsOf(type.array, scope);
  return scope.shapes[type.record] ?? null;
}

function resolveChain(names: readonly string[], scope: FormulaScope): FormulaType | null {
  const [head, ...rest] = names;
  if (!head) return null;
  const root =
    scope.itemBinding?.name === head
      ? scope.itemBinding.type
      : scope.ports.find((port) => port.name === head)?.type;
  if (!root) return null;
  let current = root;
  for (const name of rest) {
    const next = fieldsOf(current, scope)?.[name];
    if (!next) return null;
    current = typeof current === "object" && "array" in current ? { array: next } : next;
  }
  return current;
}

function completionSource(scope: FormulaScope) {
  return (context: CompletionContext) => {
    const dotted = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]*)+/);
    if (dotted) {
      const segments = dotted.text.split(".");
      const partial = segments.pop() ?? "";
      const resolved = resolveChain(segments, scope);
      const fields = resolved ? fieldsOf(resolved, scope) : null;
      if (!fields) return null;
      return {
        from: dotted.to - partial.length,
        options: Object.entries(fields).map(([label, type]) => ({
          label,
          type: "property",
          detail: typeName(type),
        })),
      };
    }
    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    if (!word && !context.explicit) return null;
    const inputs: Completion[] = [
      ...(scope.index !== undefined
        ? [{ label: "index", type: "variable", detail: "number" }]
        : []),
      ...(scope.itemBinding
        ? [
            {
              label: scope.itemBinding.name,
              type: "variable",
              detail: typeName(scope.itemBinding.type),
            },
          ]
        : []),
      ...scope.ports.map((port) => ({
        label: port.name,
        type: "variable",
        detail: typeName(port.type),
        info: `Now: ${previewText(port.value)}`,
      })),
    ];
    const functions: Completion[] = CATALOGUE.map((entry) => ({
      label: entry.name,
      type: "function",
      detail: entry.signature,
      info: entry.summary,
      apply(view, _completion, from, to) {
        view.dispatch({
          changes: { from, to, insert: `${entry.name}()` },
          selection: { anchor: from + entry.name.length + 1 },
        });
      },
    }));
    return { from: word?.from ?? context.pos, options: [...inputs, ...functions] };
  };
}

export interface FormulaCodeEditorProps {
  value: string;
  scope: FormulaScope;
  onChange(value: string): void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export default function FormulaCodeEditor({
  value,
  scope,
  onChange,
  placeholder = "Write a Formula…",
  className,
  autoFocus = false,
}: FormulaCodeEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const scopeRef = useRef(scope);
  const changeRef = useRef(onChange);
  const initialValue = useRef(value);
  const completionOpen = useRef(false);

  // The CodeMirror extensions below are built once and read these through the
  // refs, so they must track the latest props without tearing the editor down.
  useEffect(() => {
    scopeRef.current = scope;
    changeRef.current = onChange;
  });

  useEffect(() => {
    if (!host.current) return undefined;
    const editor = new EditorView({
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          history(),
          closeBrackets(),
          keymap.of([
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          formulaLanguage,
          syntaxHighlighting(defaultHighlightStyle),
          editorTheme,
          EditorView.lineWrapping,
          placeholderExtension(placeholder),
          tooltips({ parent: document.body, position: "fixed" }),
          autocompletion({ override: [(context) => completionSource(scopeRef.current)(context)] }),
          linter(
            (target) =>
              analyse(target.state.doc.toString(), scopeRef.current).diagnostics.map(
                (diagnostic): Diagnostic => ({
                  from: Math.min(diagnostic.from, target.state.doc.length),
                  to: Math.min(
                    Math.max(diagnostic.to, diagnostic.from + 1),
                    target.state.doc.length,
                  ),
                  severity: diagnostic.severity === "blocking" ? "error" : "warning",
                  message: diagnostic.message,
                }),
              ),
            { delay: 120 },
          ),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((transaction) =>
                transaction.annotation(programmaticValueChange),
              )
            ) {
              changeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: host.current,
    });
    view.current = editor;
    if (autoFocus) {
      editor.focus();
      editor.dispatch({ selection: { anchor: editor.state.doc.length } });
    }
    return () => {
      editor.destroy();
      view.current = null;
    };
    // `autoFocus` is read once, at mount: refocusing a live editor would
    // steal the caret from wherever the director actually is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholder]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current !== value) {
      editor.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: programmaticValueChange.of(true),
      });
    }
  }, [value]);

  useEffect(() => {
    if (view.current) forceLinting(view.current);
  }, [scope]);

  return (
    <div
      ref={host}
      className={cn(
        "nodrag nowheel overflow-hidden rounded-sm border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
      // Escape is decided in the capture phase because CodeMirror's own
      // native handler closes completion before a bubbling handler could ask
      // whether it had been open.
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape") return;
        const state = view.current?.state;
        completionOpen.current = state ? completionStatus(state) !== null : false;
      }}
      onKeyDown={(event) => {
        // React Flow reads Backspace and the arrows as canvas commands, so the
        // editor keeps its own keys. Escape is the exception: it belongs to
        // whatever host wants to close, unless completion owned it first.
        if (event.key === "Escape" && !completionOpen.current) return;
        event.stopPropagation();
      }}
      onPointerDownCapture={(event) => event.stopPropagation()}
    />
  );
}
