import { autocompletion, snippetCompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { PostgreSQL, sql as sqlLanguage } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { AlignLeft, Play, TerminalSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { format as formatSQL } from "sql-formatter";
import type { SQLCatalogResponse, SQLCatalogTable, SQLExecuteResponse } from "../lib/types";
import { cn } from "../lib/utils";

type Props = {
  sql: string;
  setSQL: (value: string) => void;
  selectedTable: string;
  catalog?: SQLCatalogResponse;
  catalogLoading: boolean;
  result: SQLExecuteResponse | null;
  error: string;
  loading: boolean;
  onRun: () => void;
};

type StatusTone = "success" | "warning" | "brand" | "danger";

const identifierPattern = /^[a-z_][a-z0-9_]*$/;
const sqlKeywords = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "FULL JOIN",
  "GROUP BY",
  "ORDER BY",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "INSERT",
  "INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE",
  "CREATE",
  "ALTER",
  "DROP",
  "TABLE",
  "VIEW",
  "INDEX",
  "WITH",
  "AS",
  "DISTINCT",
  "RETURNING",
  "EXPLAIN",
  "ANALYZE",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "NULL",
  "TRUE",
  "FALSE",
  "AND",
  "OR",
  "NOT",
  "IN",
  "IS",
  "LIKE",
  "ILIKE",
  "BETWEEN",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
];

const sqlSnippetCompletions = [
  snippetCompletion("SELECT ${columns}\nFROM ${table}\nLIMIT ${limit};", {
    label: "SELECT",
    detail: "snippet",
    type: "keyword",
  }),
  snippetCompletion("SELECT ${columns}\nFROM ${table}\nWHERE ${condition}\nORDER BY ${column} ${direction}\nLIMIT ${limit};", {
    label: "SELECT WHERE",
    detail: "snippet",
    type: "keyword",
  }),
  snippetCompletion("WITH ${cte} AS (\n  SELECT ${columns}\n  FROM ${table}\n)\nSELECT *\nFROM ${cte};", {
    label: "WITH",
    detail: "snippet",
    type: "keyword",
  }),
  snippetCompletion("INSERT INTO ${table} (${columns})\nVALUES (${values})\nRETURNING *;", {
    label: "INSERT",
    detail: "snippet",
    type: "keyword",
  }),
  snippetCompletion("UPDATE ${table}\nSET ${column} = ${value}\nWHERE ${condition}\nRETURNING *;", {
    label: "UPDATE",
    detail: "snippet",
    type: "keyword",
  }),
];

function quoteSQLIdentifier(value: string) {
  return identifierPattern.test(value) ? value : `"${value.split('"').join('""')}"`;
}

function normalizeSQLPart(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).split('""').join('"');
  }
  return trimmed.toLowerCase();
}

function tableMatches(table: SQLCatalogTable, name: string) {
  const normalized = normalizeSQLPart(name);
  return table.name === normalized || table.name.toLowerCase() === normalized;
}

function schemaMatches(schemaName: string, name: string) {
  const normalized = normalizeSQLPart(name);
  return schemaName === normalized || schemaName.toLowerCase() === normalized;
}

function buildSQLCompletionOptions(catalog?: SQLCatalogResponse): Completion[] {
  const keywordOptions = sqlKeywords.map<Completion>((label) => ({
    label,
    type: "keyword",
    detail: "keyword",
    boost: 2,
  }));
  if (!catalog) return [...sqlSnippetCompletions, ...keywordOptions];

  const options = [...sqlSnippetCompletions, ...keywordOptions];
  const seenColumns = new Set<string>();
  for (const schema of catalog.schemas) {
    options.push({
      label: schema.name,
      apply: quoteSQLIdentifier(schema.name),
      type: "namespace",
      detail: "schema",
      boost: 1,
    });

    for (const table of schema.tables) {
      options.push({
        label: table.name,
        apply: quoteSQLIdentifier(table.name),
        type: "class",
        detail: `${schema.name} table`,
        boost: 1,
      });
      options.push({
        label: `${schema.name}.${table.name}`,
        apply: `${quoteSQLIdentifier(schema.name)}.${quoteSQLIdentifier(table.name)}`,
        type: "class",
        detail: "table",
      });

      for (const column of table.columns) {
        const columnKey = column.name.toLowerCase();
        if (seenColumns.has(columnKey)) continue;
        seenColumns.add(columnKey);
        options.push({
          label: column.name,
          apply: quoteSQLIdentifier(column.name),
          type: "property",
          detail: `column: ${column.dataType}${column.isPrimaryKey ? " PK" : ""}`,
        });
      }
    }
  }
  return options;
}

function columnCompletions(table: SQLCatalogTable): Completion[] {
  return table.columns.map((column) => ({
    label: column.name,
    apply: quoteSQLIdentifier(column.name),
    type: "property",
    detail: `column: ${column.dataType}${column.isPrimaryKey ? " PK" : ""}`,
    boost: column.isPrimaryKey ? 2 : 0,
  }));
}

function buildSQLCompletionSource(catalog?: SQLCatalogResponse) {
  const fallbackOptions = buildSQLCompletionOptions(catalog);
  return (context: CompletionContext) => {
    const word = context.matchBefore(/[\w".]*/);
    if (!context.explicit && (!word || word.from === word.to)) return null;

    const token = word?.text ?? "";
    const parts = token.split(".");
    const lastPart = parts[parts.length - 1] ?? "";
    const from = word ? word.to - lastPart.length : context.pos;
    if (catalog && parts.length === 2) {
      const [firstPart] = parts;
      const schema = catalog.schemas.find((item) => schemaMatches(item.name, firstPart));
      if (schema) {
        return {
          from,
          options: schema.tables.map((table) => ({
            label: table.name,
            apply: quoteSQLIdentifier(table.name),
            type: "class",
            detail: `${schema.name} table`,
          })),
          validFor: /^[\w"]*$/,
        };
      }

      const matchingTables = catalog.schemas.flatMap((schemaItem) => schemaItem.tables.filter((table) => tableMatches(table, firstPart)));
      if (matchingTables.length > 0) {
        return {
          from,
          options: matchingTables.flatMap(columnCompletions),
          validFor: /^[\w"]*$/,
        };
      }
    }

    if (catalog && parts.length >= 3) {
      const [schemaPart, tablePart] = parts;
      const schema = catalog.schemas.find((item) => schemaMatches(item.name, schemaPart));
      const table = schema?.tables.find((item) => tableMatches(item, tablePart));
      if (table) {
        return {
          from,
          options: columnCompletions(table),
          validFor: /^[\w"]*$/,
        };
      }
    }

    return {
      from: word?.from ?? context.pos,
      options: fallbackOptions,
      validFor: /^[\w". ]*$/,
    };
  };
}

const sqlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--accent-light)", fontWeight: "700" },
  { tag: [tags.name, tags.variableName], color: "var(--text-h)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--success)" },
  { tag: tags.number, color: "var(--info)" },
  { tag: tags.bool, color: "var(--accent-light)" },
  { tag: tags.comment, color: "var(--text-dim)", fontStyle: "italic" },
  { tag: tags.operator, color: "var(--accent)" },
  { tag: tags.punctuation, color: "var(--text)" },
]);

const sqlEditorTheme = EditorView.theme({
  "&": {
    minHeight: "220px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--code-bg)",
    color: "var(--text-h)",
    fontFamily: "var(--mono)",
    fontSize: "14px",
  },
  "&.cm-focused": {
    borderColor: "var(--accent)",
    outline: "2px solid color-mix(in srgb, var(--accent) 30%, transparent)",
    outlineOffset: "0",
  },
  ".cm-scroller": {
    minHeight: "220px",
    fontFamily: "var(--mono)",
    lineHeight: "1.6",
  },
  ".cm-content": {
    padding: "12px 0",
    caretColor: "var(--accent-light)",
  },
  ".cm-line": {
    padding: "0 12px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--code-bg)",
    borderRight: "1px solid var(--border)",
    color: "var(--text-dim)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
  ".cm-tooltip": {
    border: "1px solid var(--border)",
    backgroundColor: "var(--surface)",
    color: "var(--text-h)",
    boxShadow: "var(--shadow)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--on-accent)",
  },
  ".cm-completionDetail": {
    color: "var(--text-dim)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail": {
    color: "var(--on-accent)",
  },
  ".cm-placeholder": {
    color: "var(--text-dim)",
  },
});

export default function SQLConsole({
  sql,
  setSQL,
  selectedTable,
  catalog,
  catalogLoading,
  result,
  error,
  loading,
  onRun,
}: Props) {
  const [formatError, setFormatError] = useState("");
  const placeholder = `SELECT *\nFROM ${selectedTable || "public.users"}\nLIMIT 50;`;
  const formatStatement = () => {
    if (!sql.trim()) return;
    try {
      setSQL(formatSQL(sql, { language: "postgresql", keywordCase: "upper", linesBetweenQueries: 1 }));
      setFormatError("");
    } catch (formattingError) {
      setFormatError(formattingError instanceof Error ? formattingError.message : "Could not format this SQL.");
    }
  };

  const extensions = useMemo<Extension[]>(
    () => [
      sqlLanguage({ dialect: PostgreSQL, upperCaseKeywords: true }),
      syntaxHighlighting(sqlHighlightStyle),
      autocompletion({
        activateOnTyping: true,
        closeOnBlur: false,
        defaultKeymap: true,
        override: [buildSQLCompletionSource(catalog)],
      }),
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onRun();
              return true;
            },
          },
          {
            key: "Shift-Alt-f",
            run: () => {
              formatStatement();
              return true;
            },
          },
        ]),
      ),
      sqlEditorTheme,
    ],
    [catalog, onRun, sql],
  );

  return (
    <div className="grid gap-3">
      <div className="data-panel p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TerminalSquare size={18} className="text-[var(--accent)]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">SQL Console</p>
              <h3 className="text-base font-semibold">Run PostgreSQL statements</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="toolbar-button" onClick={formatStatement} disabled={!sql.trim()} title="Format SQL (Shift+Alt+F)">
              <AlignLeft size={15} />
              Format
            </button>
            <button type="button" className="toolbar-button brand" onClick={onRun} disabled={loading || !sql.trim()} title="Run SQL (Cmd/Ctrl+Enter)">
              <Play size={15} />
              {loading ? "Running" : "Run"}
            </button>
          </div>
        </div>
        <CodeMirror
          aria-label="SQL editor"
          value={sql}
          onChange={(value) => {
            setSQL(value);
            if (formatError) setFormatError("");
          }}
          placeholder={placeholder}
          basicSetup={{
            autocompletion: false,
            bracketMatching: true,
            closeBrackets: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            highlightSelectionMatches: true,
            lineNumbers: true,
          }}
          extensions={extensions}
          theme="none"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <p>SELECT runs immediately. Write and DDL statements ask for confirmation first.</p>
          <p>{catalogLoading ? "Loading schema completions..." : `${catalog?.schemas.length ?? 0} schema(s) indexed for autocomplete.`}</p>
        </div>
      </div>

      {formatError ? <InlineError message={formatError} /> : null}
      {error ? <InlineError message={error} /> : null}
      {result ? <SQLResult result={result} /> : null}
    </div>
  );
}

function SQLResult({ result }: { result: SQLExecuteResponse }) {
  const rows = result.rows ?? [];
  const columns = result.columns ?? [];
  return (
    <div className="data-panel p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">Result</p>
          <h3 className="text-base font-semibold">{result.message}</h3>
        </div>
        <div className="flex gap-2">
          <StatusPill tone="brand" label={`${result.queryTimeMs}ms`} />
          {result.truncated ? <StatusPill tone="warning" label="truncated" /> : null}
          <StatusPill tone={result.readOnly ? "success" : "warning"} label={result.readOnly ? "Read" : `${result.affectedRows ?? 0} affected`} />
        </div>
      </div>
      {columns.length > 0 ? (
        <div className="overflow-auto border border-line">
          <table className="min-w-full">
            <thead className="bg-panel">
              <tr>{columns.map((column) => <th key={column} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-h)]">{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-line">
                  {columns.map((column) => (
                    <td key={column} className="max-w-[300px] truncate px-3 py-2 text-sm">{row[column] == null ? <NullBadge /> : String(row[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <PanelMessage text="Statement completed without a row result." />
      )}
    </div>
  );
}

function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  const styles = {
    success: "border-[var(--success)] bg-[color:color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]",
    warning: "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_9%,transparent)] text-[var(--accent)]",
    brand: "border-line bg-[var(--surface)] text-[var(--text-h)]",
    danger: "border-[var(--red)] bg-[color:color-mix(in_srgb,var(--red)_10%,transparent)] text-[var(--red-light)]",
  };
  return <span className={cn("border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]", styles[tone])}>{label}</span>;
}

function NullBadge() {
  return <span className="badge-muted text-[var(--text-dim)]">NULL</span>;
}

function PanelMessage({ text }: { text: string }) {
  return <div className="data-panel flex min-h-[180px] items-center justify-center p-8 text-sm text-muted">{text}</div>;
}

function InlineError({ message }: { message: string }) {
  return <div className="border border-[var(--red)] bg-[color:color-mix(in_srgb,var(--red)_10%,transparent)] p-4 text-sm text-[var(--red-light)]">{message}</div>;
}
