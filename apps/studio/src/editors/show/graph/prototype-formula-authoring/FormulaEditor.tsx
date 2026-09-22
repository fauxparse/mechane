// PROTOTYPE (issue #675) — the Formula editor itself, shared by all three
// variants because the variants disagree about *where* it goes, not what it is.
//
// This is the stack #666 chose, minus the parts that are a day's work each:
// CodeMirror 6 with a stream tokenizer standing in for the hand-written Lezer
// grammar, a `@codemirror/lint` source running the throwaway evaluator's
// checker (so an underline can never disagree with the preview), and a
// `CompletionSource` serving the node's named input ports and the Shape fields
// beneath them — including each port's *current value*, which is the thing the
// ticket suspects matters more than any static check.
import { cn } from "@mechane/design-system";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { forceLinting, linter, type Diagnostic } from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as placeholderExtension,
  tooltips,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

import {
  CATALOGUE,
  analyse,
  previewText,
  typeName,
  type FormulaScope,
  type FormulaType,
} from "./formula-language";

// ---------------------------------------------------------------------------
// Highlighting
// ---------------------------------------------------------------------------

/**
 * A stream tokenizer, not #666's Lezer grammar: the grammar is a day's work and
 * a conformance corpus, and this prototype only needs the colours to land in
 * the right places to judge how the surface reads.
 */
const formulaLanguage = StreamLanguage.define<{ afterDot: boolean }>({
  name: "formula",
  startState: () => ({ afterDot: false }),
  token(stream, state) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) {
      state.afterDot = false;
      return "string";
    }
    if (stream.match(/^\d+(\.\d+)?/)) {
      state.afterDot = false;
      return "number";
    }
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current();
      const wasAfterDot = state.afterDot;
      state.afterDot = false;
      if (word === "true" || word === "false") return "bool";
      if (wasAfterDot) return "field";
      if (stream.match(/^\s*\(/, false)) return "fn";
      return "port";
    }
    if (stream.match(/^[.]/)) {
      state.afterDot = true;
      return "punctuation";
    }
    if (stream.match(/^(==|!=|<=|>=|&&|\|\||[&+\-*/%<>!?:])/)) {
      state.afterDot = false;
      return "operator";
    }
    stream.next();
    state.afterDot = false;
    return "punctuation";
  },
  tokenTable: {
    string: tags.string,
    number: tags.number,
    bool: tags.bool,
    fn: tags.function(tags.variableName),
    port: tags.variableName,
    field: tags.propertyName,
    operator: tags.operator,
    punctuation: tags.punctuation,
  },
});

const highlighting = HighlightStyle.define([
  { tag: tags.variableName, color: "var(--color-palette-blue-text)" },
  { tag: tags.propertyName, color: "var(--color-palette-aqua-text)" },
  { tag: tags.function(tags.variableName), color: "var(--color-palette-purple-text)" },
  { tag: tags.string, color: "var(--color-palette-green-text)" },
  { tag: tags.number, color: "var(--color-palette-orange-text)" },
  { tag: tags.bool, color: "var(--color-palette-yellow-text)" },
  { tag: tags.operator, color: "var(--color-muted-foreground)" },
  { tag: tags.punctuation, color: "var(--color-muted-foreground)" },
]);

const editorTheme = EditorView.theme({
  "&": { fontSize: "12px", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    padding: "6px 8px",
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
  ".cm-completionDetail": {
    fontStyle: "normal",
    marginLeft: "1rem",
    color: "var(--color-muted-foreground)",
  },
  ".cm-completionInfo": { maxWidth: "18rem", lineHeight: "1.35" },
  ".cm-diagnostic": { fontFamily: "var(--font-sans)", fontSize: "12px", padding: "4px 8px" },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--color-destructive)" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--color-palette-orange-text)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    borderBottom: "2px wavy var(--color-destructive)",
    textDecoration: "underline wavy var(--color-destructive) 1px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--color-palette-orange-text) 1px",
  },
  ".cm-placeholder": { color: "var(--color-muted-foreground)" },
});

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

function fieldsOf(type: FormulaType, scope: FormulaScope): Record<string, FormulaType> | null {
  if (typeof type !== "object") return null;
  // One-level auto-mapping means the fields of `candidates` are a Candidate's.
  if ("array" in type) return fieldsOf(type.array, scope);
  return scope.shapes[type.record] ?? null;
}

function resolveChain(names: string[], scope: FormulaScope): FormulaType | null {
  const [head, ...rest] = names;
  if (!head) return null;
  const root =
    scope.itemBinding && head === scope.itemBinding.name
      ? scope.itemBinding.type
      : scope.ports.find((port) => port.name === head)?.type;
  if (!root) return null;
  let current: FormulaType = root;
  for (const name of rest) {
    const fields = fieldsOf(current, scope);
    const next = fields?.[name];
    if (!next) return null;
    current = typeof current === "object" && "array" in current ? { array: next } : next;
  }
  return current;
}

function completions(scope: FormulaScope) {
  return (context: CompletionContext): CompletionResult | null => {
    const dotted = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]*)+/);
    if (dotted) {
      const segments = dotted.text.split(".");
      const partial = segments.pop() ?? "";
      const type = resolveChain(segments, scope);
      const fields = type ? fieldsOf(type, scope) : null;
      if (!fields) return null;
      const mapped = typeof type === "object" && type !== null && "array" in type;
      return {
        from: dotted.to - partial.length,
        options: Object.entries(fields).map(([name, fieldType]): Completion => ({
          label: name,
          type: "property",
          detail: mapped ? `${typeName({ array: fieldType })} (one per item)` : typeName(fieldType),
        })),
      };
    }

    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    if (!word && !context.explicit) return null;
    const bindings: Completion[] = [
      ...(scope.itemBinding
        ? [
            {
              label: scope.itemBinding.name,
              type: "variable",
              detail: typeName(scope.itemBinding.type),
              info: "The item being tested, one at a time.",
            } satisfies Completion,
          ]
        : []),
      ...scope.ports.map((port): Completion => ({
        label: port.name,
        type: "variable",
        detail: typeName(port.type),
        // The live value, because that is what tells a director they have the
        // right input — more than the Type does.
        info: `Now: ${previewText(port.value)}`,
      })),
    ];
    const functions = CATALOGUE.map((entry): Completion => ({
      label: entry.name,
      type: "function",
      detail: entry.shipped ? entry.signature : `${entry.signature} · later`,
      info: entry.summary,
      apply: (view, _completion, from, to) => {
        view.dispatch({
          changes: { from, to, insert: `${entry.name}()` },
          selection: { anchor: from + entry.name.length + 1 },
        });
      },
    }));
    return {
      from: word?.from ?? context.pos,
      options: [...bindings, ...functions],
      validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
    };
  };
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export interface FormulaEditorProps {
  value: string;
  scope: FormulaScope;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** Variant C edits on the canvas, where React Flow owns the keyboard. */
  stopKeys?: boolean;
}

export function FormulaEditor({
  value,
  scope,
  onChange,
  placeholder = "Write a Formula…",
  className,
  autoFocus = false,
  stopKeys = true,
}: FormulaEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const scopeRef = useRef(scope);
  const changeRef = useRef(onChange);
  scopeRef.current = scope;
  changeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return undefined;
    const extensions: Extension[] = [
      history(),
      closeBrackets(),
      keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap]),
      formulaLanguage,
      syntaxHighlighting(highlighting),
      editorTheme,
      EditorView.lineWrapping,
      placeholderExtension(placeholder),
      // Completion and diagnostic tooltips are measured against the document,
      // not the editor's box: the sidebar clips, the workbench is a fixed
      // overlay, and the canvas is CSS-transformed by React Flow.
      tooltips({ parent: document.body, position: "fixed" }),
      autocompletion({
        override: [(context) => completions(scopeRef.current)(context)],
        icons: false,
        activateOnTyping: true,
      }),
      linter(
        (target) => {
          const analysis = analyse(target.state.doc.toString(), scopeRef.current);
          return analysis.diagnostics.map((diagnostic): Diagnostic => ({
            from: Math.min(diagnostic.from, target.state.doc.length),
            to: Math.min(Math.max(diagnostic.to, diagnostic.from + 1), target.state.doc.length),
            // #672: blocking validation stops publication; runtime failures
            // are true, useful and harmless, so they read as warnings.
            severity: diagnostic.severity === "blocking" ? "error" : "warning",
            message: diagnostic.message,
          }));
        },
        { delay: 120 },
      ),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) changeRef.current(update.state.doc.toString());
      }),
    ];

    const editor = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host.current,
    });
    view.current = editor;
    if (autoFocus) editor.focus();
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is created once; `value` and `scope` flow in through the
    // effects below, as CodeMirror expects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current !== value) {
      editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    // A port rename or a newly wired input changes what is valid, with no edit
    // to the document, so the lint pass has to be asked again.
    if (view.current) forceLinting(view.current);
  }, [scope]);

  return (
    <div
      ref={host}
      className={cn(
        "nodrag nowheel overflow-hidden rounded-sm border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
      onKeyDown={stopKeys ? (event) => event.stopPropagation() : undefined}
      onPointerDownCapture={(event) => event.stopPropagation()}
    />
  );
}
