import {
  AlignLeft,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  Database,
  Eye,
  Moon,
  Play,
  RotateCcw,
  Save,
  Search,
  Shield,
  Sun,
  Table2,
  X,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  type Table as ReactTable,
  useReactTable,
} from "@tanstack/react-table";
import React, { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { executeSQL, getSchemas, getSQLCatalog, getTableMetadata, getTableRows, saveTableChanges } from "../lib/api";
import type { ConnectionStatus, SaveChange, SQLExecuteResponse, TableColumn } from "../lib/types";
import { cn, formatTableLabel, serializePrimaryKey, titleCase } from "../lib/utils";

const SQLConsole = lazy(() => import("./SQLConsole"));
const DiagramPanel = lazy(() => import("./DiagramPanel").then((module) => ({ default: module.DiagramPanel })));

type Props = {
  status: ConnectionStatus;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

type TabKey = "data" | "structure" | "sql" | "diagram";
type StatusTone = "success" | "warning" | "brand" | "danger";
type ChangedState = Record<string, { primaryKey: Record<string, unknown>; values: Record<string, unknown> }>;
type GridRow = Record<string, unknown> & { __rowKey: string };
type DatetimeEditorState = {
  cellKey: string;
  rowKey: string;
  columnName: string;
  dataType: string;
  date: string;
  time: string;
};
type JsonViewerState = {
  table: string;
  column: string;
  rawValue: unknown;
} | null;
type ConfirmState =
  | { type: "save" }
  | { type: "discard" }
  | { type: "navigate"; action: () => void; title: string }
  | { type: "sql"; sql: string }
  | null;

const pageSizeOptions = [10, 25, 50, 100];

function orderTables(tables: string[]) {
  return [...tables].sort((left, right) => left.localeCompare(right));
}

function getTab(value: string | null): TabKey {
  return value === "structure" || value === "sql" || value === "diagram" ? value : "data";
}

function isDateOnlyType(dataType: string) {
  return dataType === "date";
}

function formatDatetimeDisplay(value: unknown) {
  if (value == null) return "";
  return String(value).trim().replace("T", " ").replace(/\.\d+$/, "");
}

function parseDatetimeEditorValue(value: unknown, dataType: string) {
  const raw = formatDatetimeDisplay(value);
  if (!raw) {
    return { date: "", time: isDateOnlyType(dataType) ? "" : "00:00:00" };
  }
  if (!raw.includes(" ")) {
    return { date: raw, time: isDateOnlyType(dataType) ? "" : "00:00:00" };
  }
  const [datePart, ...timeParts] = raw.split(" ");
  const normalizedTime = (timeParts.join(" ") || "").replace(/([+-]\d{2}:\d{2}|Z)$/i, "").trim();
  return { date: datePart, time: isDateOnlyType(dataType) ? "" : normalizedTime || "00:00:00" };
}

function normalizeTimeValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.length === 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:00`;
  if (parts.length >= 3) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:${parts[2].padStart(2, "0")}`;
  return trimmed;
}

function combineDatetimeEditorValue(editor: Pick<DatetimeEditorState, "date" | "time" | "dataType">) {
  if (!editor.date.trim()) return null;
  if (isDateOnlyType(editor.dataType)) return editor.date.trim();
  const normalizedTime = normalizeTimeValue(editor.time);
  return normalizedTime ? `${editor.date.trim()} ${normalizedTime}` : editor.date.trim();
}

function parseJsonValue(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value !== null) return value;
  return null;
}

function formatJsonModalValue(value: unknown) {
  const normalized = parseJsonValue(value);
  if (normalized == null) return typeof value === "string" ? value : String(value ?? "");
  return JSON.stringify(normalized, null, 2);
}

function formatJsonPreview(value: unknown) {
  const normalized = parseJsonValue(value);
  const text = normalized == null ? String(value ?? "") : JSON.stringify(normalized);
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

function cellTextValue(value: unknown, displayType: string) {
  if (value == null) return "";
  if (displayType === "json") return formatJsonModalValue(value);
  if (displayType === "datetime") return formatDatetimeDisplay(value);
  return String(value);
}

function isWriteSQL(sql: string) {
  const normalized = sql.trim().toLowerCase();
  return !["select", "with", "show", "explain", "values"].some((prefix) => normalized.startsWith(prefix));
}

function brandEnvTone(value?: string): StatusTone {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "prod" || normalized === "production") return "danger";
  if (normalized === "staging" || normalized === "stage") return "warning";
  if (normalized === "local") return "success";
  return "brand";
}

function isProductionBrandEnv(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "prod" || normalized === "production";
}

function countChangedFields(drafts: ChangedState) {
  return Object.values(drafts).reduce((total, draft) => total + Object.keys(draft.values).length, 0);
}

export function EditorLayout({ status, theme, onToggleTheme }: Props) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [drafts, setDrafts] = useState<ChangedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [savingError, setSavingError] = useState("");
  const [datetimeEditor, setDatetimeEditor] = useState<DatetimeEditorState | null>(null);
  const [jsonViewer, setJsonViewer] = useState<JsonViewerState>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [sql, setSQL] = useState("");
  const [sqlResult, setSQLResult] = useState<SQLExecuteResponse | null>(null);
  const [sqlError, setSQLError] = useState("");
  const [splitTab, setSplitTab] = useState<TabKey | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const tab = getTab(searchParams.get("tab"));
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = pageSizeOptions.includes(Number(searchParams.get("pageSize")))
    ? Number(searchParams.get("pageSize"))
    : 25;

  const schemasQuery = useQuery({
    queryKey: ["schemas"],
    queryFn: getSchemas,
    enabled: status.connected,
  });

  const catalogQuery = useQuery({
    queryKey: ["sql-catalog"],
    queryFn: getSQLCatalog,
    enabled: status.connected,
  });

  const selectedTable = useMemo(() => {
    const current = searchParams.get("table");
    if (current) return current;
    const firstSchema = schemasQuery.data?.[0];
    const firstTable = firstSchema ? orderTables(firstSchema.tables)[0] : undefined;
    if (!firstSchema || !firstTable) return "";
    return `${firstSchema.name}.${firstTable}`;
  }, [schemasQuery.data, searchParams]);

  const metadataQuery = useQuery({
    queryKey: ["metadata", selectedTable],
    queryFn: () => getTableMetadata(selectedTable),
    enabled: Boolean(selectedTable),
  });

  const rowsQuery = useQuery({
    queryKey: ["rows", selectedTable, page, pageSize, filter],
    queryFn: () => getTableRows(selectedTable, page, pageSize, filter),
    enabled: Boolean(selectedTable),
  });

  const saveMutation = useMutation({
    mutationFn: (changes: SaveChange[]) => saveTableChanges(selectedTable, changes),
    onSuccess: async () => {
      setDrafts({});
      setSavingError("");
      setConfirmState(null);
      await queryClient.invalidateQueries({ queryKey: ["rows", selectedTable] });
    },
    onError: (error: Error) => setSavingError(error.message),
  });

  const sqlMutation = useMutation({
    mutationFn: executeSQL,
    onSuccess: async (result) => {
      setSQLResult(result);
      setSQLError("");
      setConfirmState(null);
      await queryClient.invalidateQueries({ queryKey: ["schemas"] });
      if (!result.readOnly) {
        await queryClient.invalidateQueries({ queryKey: ["sql-catalog"] });
        await queryClient.invalidateQueries({ queryKey: ["rows"] });
        await queryClient.invalidateQueries({ queryKey: ["metadata"] });
      }
    },
    onError: (error: Error) => {
      setSQLError(error.message);
      setConfirmState(null);
    },
  });

  const primaryKey = metadataQuery.data?.primaryKey ?? [];
  const pendingRows = Object.keys(drafts).length;
  const pendingFields = countChangedFields(drafts);
  const hasDrafts = pendingRows > 0;
  const editable = rowsQuery.data?.editable ?? metadataQuery.data?.editable ?? false;

  const mergedRows = useMemo<GridRow[]>(() => {
    return (rowsQuery.data?.rows ?? []).map((row) => {
      const keyPayload = Object.fromEntries(primaryKey.map((pk) => [pk, row[pk]]));
      const rowKey = serializePrimaryKey(keyPayload, primaryKey);
      return { ...row, ...(drafts[rowKey]?.values ?? {}), __rowKey: rowKey };
    });
  }, [drafts, primaryKey, rowsQuery.data?.rows]);

  const visibleSchemas = useMemo(() => {
    const query = tableFilter.trim().toLowerCase();
    return (schemasQuery.data ?? [])
      .map((schema) => ({
        ...schema,
        tables: orderTables(schema.tables).filter((table) => {
          const fqtn = `${schema.name}.${table}`.toLowerCase();
          return !query || fqtn.includes(query);
        }),
      }))
      .filter((schema) => schema.tables.length > 0);
  }, [schemasQuery.data, tableFilter]);

  const changeCell = (rowKey: string, row: GridRow, columnName: string, value: unknown) => {
    const primary = Object.fromEntries(primaryKey.map((pk) => [pk, row[pk]]));
    setDrafts((current) => ({
      ...current,
      [rowKey]: {
        primaryKey: primary,
        values: { ...(current[rowKey]?.values ?? {}), [columnName]: value },
      },
    }));
  };

  const openDatetimeEditor = (rowKey: string, columnName: string, dataType: string, value: unknown) => {
    const parsed = parseDatetimeEditorValue(value, dataType);
    setDatetimeEditor({
      cellKey: `${rowKey}:${columnName}`,
      rowKey,
      columnName,
      dataType,
      date: parsed.date,
      time: parsed.time,
    });
  };

  const applyDatetimeEditor = (row: GridRow) => {
    if (!datetimeEditor) return;
    changeCell(datetimeEditor.rowKey, row, datetimeEditor.columnName, combineDatetimeEditorValue(datetimeEditor));
    setDatetimeEditor(null);
  };

  const clearDatetimeEditor = (row: GridRow) => {
    if (!datetimeEditor) return;
    changeCell(datetimeEditor.rowKey, row, datetimeEditor.columnName, null);
    setDatetimeEditor(null);
  };

  const runGuarded = (action: () => void, title: string) => {
    if (hasDrafts) {
      setConfirmState({ type: "navigate", action, title });
      return;
    }
    action();
  };

  const setTable = (table: string, nextTab: TabKey = "data") => {
    runGuarded(() => {
      setDrafts({});
      setDatetimeEditor(null);
      setSorting([]);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("table", table);
        next.set("tab", nextTab);
        next.set("page", "1");
        next.set("pageSize", String(pageSize));
        return next;
      });
    }, "Switch table?");
  };

  const setTab = (nextTab: TabKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", nextTab);
      return next;
    });
  };

  const setPage = (nextPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(nextPage));
      return next;
    });
  };

  const setNextPageSize = (nextSize: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", "1");
      next.set("pageSize", String(nextSize));
      return next;
    });
  };

  const startSave = () => {
    if (hasDrafts) setConfirmState({ type: "save" });
  };

  const discardChanges = () => {
    setDrafts({});
    setSavingError("");
    setDatetimeEditor(null);
    setConfirmState(null);
  };

  const submitSQL = () => {
    const trimmed = sql.trim();
    if (!trimmed) return;
    if (isWriteSQL(trimmed)) {
      setConfirmState({ type: "sql", sql: trimmed });
      return;
    }
    sqlMutation.mutate(trimmed);
  };

  const copyJsonValue = async () => {
    if (!jsonViewer) return;
    try {
      await navigator.clipboard.writeText(formatJsonModalValue(jsonViewer.rawValue));
      setCopyFeedback("Copied");
    } catch {
      setCopyFeedback("Copy failed");
    }
  };

  useEffect(() => {
    if (!hasDrafts) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasDrafts]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setJsonViewer(null);
        setCopyFeedback("");
        setConfirmState(null);
        setPaletteOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        startSave();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!jsonViewer && !confirmState) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [jsonViewer, confirmState]);

  const tableColumns = useMemo<ColumnDef<GridRow>[]>(() => {
    return (rowsQuery.data?.columns ?? []).map((column) => ({
      accessorKey: column.name,
      header: () => (
        <div className="flex min-w-[120px] items-center gap-2">
          <span>{column.name}</span>
          {column.isPrimaryKey ? <span className="badge-muted">PK</span> : null}
          <ChevronsUpDown size={13} className="text-[var(--text-dim)]" />
        </div>
      ),
      cell: ({ row }) => renderCell(row.original, column),
    }));
  }, [datetimeEditor, drafts, editable, rowsQuery.data?.columns]);

  const dataTable = useReactTable({
    data: mergedRows,
    columns: tableColumns,
    state: { sorting },
    columnResizeMode: "onChange",
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const currentPage = rowsQuery.data?.pagination.page ?? page;
  const totalPages = rowsQuery.data?.pagination.totalPages ?? 1;
  const totalRows = rowsQuery.data?.pagination.totalRows ?? 0;
  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = totalRows === 0 ? 0 : Math.min(currentPage * pageSize, totalRows);

  function renderCell(row: GridRow, column: TableColumn) {
    const rowKey = String(row.__rowKey);
    const cellKey = `${rowKey}:${column.name}`;
    const isDirty = drafts[rowKey]?.values[column.name] !== undefined;
    const value = row[column.name];
    const baseClass = cn("min-w-[120px]", isDirty && "dirty-cell");

    if (editable && column.isEditable) {
      if (column.displayType === "datetime") {
        if (datetimeEditor?.cellKey === cellKey) {
          return (
            <div className="min-w-[190px] border border-[var(--accent)] bg-[var(--surface)] p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  aria-label={`${column.name} date`}
                  type="date"
                  value={datetimeEditor.date}
                  onChange={(event) => setDatetimeEditor((current) => (current ? { ...current, date: event.target.value } : current))}
                  className="field-control h-9"
                />
                {isDateOnlyType(datetimeEditor.dataType) ? null : (
                  <input
                    aria-label={`${column.name} time`}
                    type="time"
                    step={1}
                    value={datetimeEditor.time}
                    onChange={(event) => setDatetimeEditor((current) => (current ? { ...current, time: event.target.value } : current))}
                    className="field-control h-9"
                  />
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" className="mini-button brand" onClick={() => applyDatetimeEditor(row)}>Apply</button>
                <button type="button" className="mini-button" onClick={() => clearDatetimeEditor(row)}>Null</button>
                <button type="button" className="mini-button" onClick={() => setDatetimeEditor(null)}>Cancel</button>
              </div>
            </div>
          );
        }
        return (
          <button
            type="button"
            onClick={() => openDatetimeEditor(rowKey, column.name, column.dataType, value)}
            className={cn("cell-button", baseClass)}
          >
            {value == null ? <NullBadge /> : <span>{formatDatetimeDisplay(value) || <EmptyBadge />}</span>}
          </button>
        );
      }

      return (
        <input
          aria-label={`${column.name} value`}
          value={cellTextValue(value, column.displayType)}
          onChange={(event) => changeCell(rowKey, row, column.name, event.target.value)}
          className={cn("cell-input", baseClass)}
        />
      );
    }

    if (column.displayType === "boolean") {
      return (
        <label className={cn("inline-flex min-w-[90px] items-center gap-2", baseClass)}>
          <input type="checkbox" checked={Boolean(value)} disabled className="h-4 w-4 accent-[var(--accent)]" />
          <span>{String(Boolean(value))}</span>
        </label>
      );
    }

    if (column.displayType === "json") {
      return (
        <button
          type="button"
          onClick={() => {
            setJsonViewer({ table: selectedTable, column: column.name, rawValue: value });
            setCopyFeedback("");
          }}
          className={cn("json-preview", baseClass)}
        >
          <Eye size={14} />
          <span>{value == null ? "NULL" : formatJsonPreview(value)}</span>
        </button>
      );
    }

    return (
      <div className={cn("cell-read", baseClass)}>
        {value == null ? <NullBadge /> : cellTextValue(value, column.displayType) === "" ? <EmptyBadge /> : cellTextValue(value, column.displayType)}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex min-h-[50px] items-center justify-between gap-3 border-b border-line bg-[var(--bg)] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <BrandSection status={status} />
          <div className="hidden min-w-0 items-center gap-2 border border-line bg-panel px-2.5 py-1.5 text-sm text-muted md:flex">
            <Database size={15} className="text-[var(--accent)]" />
            <span className="truncate text-ink">{status.database || "database"}</span>
            <span className="text-[var(--text-dim)]">{status.host || "localhost"}:{status.port || "5432"}</span>
            <span className="text-[var(--text-dim)]">{status.user || "postgres"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={status.mode === "read-only" ? "warning" : "success"} label={status.mode} />
          <button type="button" aria-label="Toggle theme" onClick={onToggleTheme} className="icon-button">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-line bg-panel lg:flex">
          <div className="border-b border-line p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">Schemas</p>
            <label className="mt-3 flex h-10 items-center gap-2 border border-line bg-[var(--bg)] px-3 text-sm text-muted">
              <Search size={15} />
              <input
                aria-label="Filter schemas and tables"
                value={tableFilter}
                onChange={(event) => setTableFilter(event.target.value)}
                placeholder="Find table..."
                className="w-full bg-transparent outline-none placeholder:text-[var(--text-dim)]"
              />
            </label>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {schemasQuery.isLoading ? <PanelMessage text="Loading schemas..." /> : null}
            {visibleSchemas.map((schema) => (
              <div key={schema.name} className="mb-4">
                <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-dim)]">{schema.name}</p>
                <div className="space-y-1">
                  {schema.tables.map((tableName) => {
                    const fqtn = `${schema.name}.${tableName}`;
                    const active = selectedTable === fqtn;
                    return (
                      <button
                        key={fqtn}
                        type="button"
                        onClick={() => setTable(fqtn)}
                        className={cn("table-nav-button", active && "active")}
                      >
                        <Table2 size={15} />
                        <span className="truncate">{formatTableLabel(tableName)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {!schemasQuery.isLoading && visibleSchemas.length === 0 ? <PanelMessage text="No tables match your search." /> : null}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-line bg-[var(--bg)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">Current table</p>
                <h2 className="mt-0.5 truncate text-lg font-semibold">{selectedTable || "No table selected"}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={editable ? "success" : "warning"} label={editable ? "Editable" : "Read-only"} />
                <StatusPill tone="brand" label={`${totalRows} rows`} />
                <StatusPill tone="brand" label={`${rowsQuery.data?.queryTimeMs ?? 0}ms`} />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 border-b border-line">
                {(["data", "structure", "sql", "diagram"] as TabKey[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTab(item)}
                    className={cn("tab-button", tab === item && "active")}
                  >
                    {item === "sql" ? "SQL Console" : titleCase(item)}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {tab === "data" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setDensity(d => d === "comfortable" ? "compact" : "comfortable")}
                      className="toolbar-button mr-2"
                      title="Toggle Density"
                    >
                      <AlignLeft size={15} />
                      {density === "comfortable" ? "Compact" : "Comfortable"}
                    </button>
                    <label className="flex h-10 w-[260px] max-w-full items-center gap-2 border border-line bg-panel px-3 text-sm text-muted">
                      <Search size={15} />
                      <input
                        aria-label="Filter table rows"
                        value={filter}
                        onChange={(event) => {
                          setFilter(event.target.value);
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev);
                            next.set("page", "1");
                            return next;
                          });
                        }}
                        placeholder="Filter all columns..."
                        className="w-full bg-transparent outline-none placeholder:text-[var(--text-dim)]"
                      />
                    </label>
                    <select
                      aria-label="Rows per page"
                      value={pageSize}
                      onChange={(event) => setNextPageSize(Number(event.target.value))}
                      className="field-control h-10 w-[110px]"
                    >
                      {pageSizeOptions.map((size) => (
                        <option key={size} value={size}>{size} rows</option>
                      ))}
                    </select>
                  </>
                ) : null}

                <div className="ml-2 flex items-center border-l border-line pl-2">
                  <button
                    type="button"
                    onClick={() => setSplitTab(splitTab ? null : (tab === "sql" ? "structure" : "sql"))}
                    className={cn("toolbar-button", splitTab && "brand")}
                    title="Split View"
                  >
                    <Check size={15} className={cn(!splitTab && "hidden")} />
                    Split View
                  </button>
                </div>

                <div className={cn("ml-2 change-chip", hasDrafts && "active")}>{pendingRows} rows / {pendingFields} fields</div>
                <button
                  type="button"
                  onClick={() => hasDrafts && setConfirmState({ type: "discard" })}
                  disabled={!hasDrafts}
                  className="toolbar-button"
                >
                  <RotateCcw size={15} />
                  Discard
                </button>
                <button
                  type="button"
                  onClick={startSave}
                  disabled={!hasDrafts || saveMutation.isPending}
                  className="toolbar-button brand"
                >
                  <Save size={15} />
                  {saveMutation.isPending ? "Saving" : "Save"}
                </button>
              </div>
            </div>
          </div>

          <section className="min-h-0 flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-auto p-3">
              {tab === "data" ? <DataGrid table={dataTable} loading={rowsQuery.isLoading} error={rowsQuery.error instanceof Error ? rowsQuery.error.message : ""} columnsCount={rowsQuery.data?.columns.length ?? 0} density={density} /> : null}
              {tab === "structure" ? <StructurePanel columns={metadataQuery.data?.columns ?? []} table={selectedTable} editable={metadataQuery.data?.editable ?? false} /> : null}
              {tab === "sql" ? (
                <Suspense fallback={<PanelMessage text="Loading SQL console..." />}>
                  <SQLConsole sql={sql} setSQL={setSQL} selectedTable={selectedTable} catalog={catalogQuery.data} catalogLoading={catalogQuery.isLoading} result={sqlResult} error={sqlError} loading={sqlMutation.isPending} onRun={submitSQL} />
                </Suspense>
              ) : null}
              {tab === "diagram" ? (
                <Suspense fallback={<PanelMessage text="Loading diagram..." />}>
                  <DiagramPanel catalog={catalogQuery.data} loading={catalogQuery.isLoading} error={catalogQuery.error instanceof Error ? catalogQuery.error.message : ""} selectedTable={selectedTable} onSelectTable={(table) => setTable(table, "diagram")} />
                </Suspense>
              ) : null}
              {savingError ? <InlineError message={savingError} /> : null}
            </div>

            {splitTab && (
              <div className="w-[45%] flex-none border-l border-line bg-panel overflow-auto p-3 flex flex-col shadow-panel z-10 animate-slide-in-right">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">Split View</span>
                  <button onClick={() => setSplitTab(null)} className="icon-button"><X size={16} /></button>
                </div>
                <div className="flex-1 min-h-0">
                  {splitTab === "data" ? <DataGrid table={dataTable} loading={rowsQuery.isLoading} error={rowsQuery.error instanceof Error ? rowsQuery.error.message : ""} columnsCount={rowsQuery.data?.columns.length ?? 0} density={density} /> : null}
                  {splitTab === "structure" ? <StructurePanel columns={metadataQuery.data?.columns ?? []} table={selectedTable} editable={metadataQuery.data?.editable ?? false} /> : null}
                  {splitTab === "sql" ? (
                    <Suspense fallback={<PanelMessage text="Loading SQL console..." />}>
                      <SQLConsole sql={sql} setSQL={setSQL} selectedTable={selectedTable} catalog={catalogQuery.data} catalogLoading={catalogQuery.isLoading} result={sqlResult} error={sqlError} loading={sqlMutation.isPending} onRun={submitSQL} />
                    </Suspense>
                  ) : null}
                  {splitTab === "diagram" ? (
                    <Suspense fallback={<PanelMessage text="Loading diagram..." />}>
                      <DiagramPanel catalog={catalogQuery.data} loading={catalogQuery.isLoading} error={catalogQuery.error instanceof Error ? catalogQuery.error.message : ""} selectedTable={selectedTable} onSelectTable={(table) => setTable(table, "diagram")} />
                    </Suspense>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      <footer className="flex min-h-10 items-center justify-between gap-3 border-t border-line bg-[var(--bg)] px-5 text-[12px] uppercase tracking-[0.14em] text-muted">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2.5 w-2.5 bg-[var(--success)]" />
          <span>Connected</span>
          <span className="text-[var(--text-dim)]">Mode: {status.mode}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[var(--text-dim)]">{totalRows} rows</span>
        </div>
      </footer>

      {hasDrafts && (
        <div className="fixed bottom-12 right-6 z-40">
          <button
            type="button"
            className="flex h-12 items-center gap-3 rounded-full bg-[var(--accent)] px-5 text-sm font-bold text-[var(--on-accent)] shadow-lg transition-transform hover:scale-105 active:scale-95"
            onClick={startSave}
          >
            <Save size={18} />
            Review {pendingRows} {pendingRows === 1 ? "Change" : "Changes"}
          </button>
        </div>
      )}

      {jsonViewer ? (
        <JsonViewerPanel
          table={jsonViewer.table}
          column={jsonViewer.column}
          value={jsonViewer.rawValue}
          copyFeedback={copyFeedback}
          onClose={() => {
            setJsonViewer(null);
            setCopyFeedback("");
          }}
          onCopy={() => void copyJsonValue()}
        />
      ) : null}

      {confirmState ? (
        <ConfirmModal
          state={confirmState}
          drafts={drafts}
          pendingRows={pendingRows}
          pendingFields={pendingFields}
          brandSectionEnv={status.brandSectionEnv}
          onClose={() => setConfirmState(null)}
          onDiscard={discardChanges}
          onSave={() => void saveMutation.mutateAsync(Object.values(drafts))}
          onNavigate={(action) => {
            discardChanges();
            action();
          }}
          onRunSQL={(sqlText) => sqlMutation.mutate(sqlText)}
        />
      ) : null}

      <CommandPaletteModal
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        schemas={visibleSchemas}
        onSelectTable={(t) => setTable(t)}
      />
    </div>
  );
}

function CommandPaletteModal({
  isOpen,
  onClose,
  schemas,
  onSelectTable
}: {
  isOpen: boolean;
  onClose: () => void;
  schemas: any[];
  onSelectTable: (table: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const results = schemas.flatMap(s =>
    s.tables
      .filter((t: string) => t.toLowerCase().includes(query.toLowerCase()))
      .map((t: string) => `${s.name}.${t}`)
  ).slice(0, 10);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[rgba(0,0,0,0.5)] pt-[15vh] backdrop-blur-sm transition-opacity" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-[var(--surface)] shadow-[rgba(0,0,0,0.8)_0_20px_60px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center border-b border-line px-5 py-4">
           <Search size={22} className="text-[var(--accent)]" />
           <input
             ref={inputRef}
             value={query}
             onChange={e => setQuery(e.target.value)}
             placeholder="Search tables... (Cmd+K)"
             className="ml-4 w-full bg-transparent text-xl text-[var(--text-h)] outline-none placeholder:text-[var(--text-dim)]"
           />
           <div className="rounded border border-line bg-[var(--bg)] px-2 py-1 text-xs font-bold text-muted">ESC</div>
        </div>
        {results.length > 0 && (
          <div className="max-h-[350px] overflow-auto py-2">
            {results.map((table: string, index: number) => (
               <button
                 key={table}
                 className={cn("flex w-full items-center px-5 py-3 text-left text-base transition-colors", index === 0 ? "bg-[color:color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--text-h)]" : "hover:bg-[color:color-mix(in_srgb,var(--surface-container)_60%,transparent)] text-[var(--text)]")}
                 onClick={() => {
                   onSelectTable(table);
                   onClose();
                 }}
               >
                 <Table2 size={18} className="mr-4 text-[var(--accent)] opacity-80" />
                 {table}
                 <span className="ml-auto text-xs text-muted">Jump to table</span>
               </button>
            ))}
          </div>
        )}
        {results.length === 0 && query && (
          <div className="px-5 py-8 text-center text-muted">
            No tables found matching "{query}"
          </div>
        )}
        {!query && (
          <div className="px-5 py-4 text-sm text-muted">
            Start typing to search across all schemas...
          </div>
        )}
      </div>
    </div>
  )
}

function DataGrid({
  table,
  loading,
  error,
  columnsCount,
  density,
}: {
  table: ReactTable<GridRow>;
  loading: boolean;
  error: string;
  columnsCount: number;
  density: "comfortable" | "compact";
}) {
  if (loading) return <PanelMessage text="Loading table rows..." />;
  if (error) return <InlineError message={error} />;
  if (columnsCount === 0) return <PanelMessage text="Select a table to inspect data." />;
  if (table.getRowModel().rows.length === 0) return <PanelMessage text="No rows match this view." />;

  return (
    <div className="data-panel">
      <div className="overflow-auto" style={{ width: table.getTotalSize() ? "fit-content" : "100%" }}>
        <table className="min-w-full border-separate border-spacing-0" style={{ width: table.getTotalSize() || "100%" }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="group relative sticky top-0 z-10 border-b border-line bg-panel px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-h)]"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-left"
                      onClick={header.column.getToggleSortingHandler()}
                      aria-label={`Sort ${header.column.id}`}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="text-[var(--accent)]">
                        {header.column.getIsSorted() === "asc" ? "Asc" : header.column.getIsSorted() === "desc" ? "Desc" : ""}
                      </span>
                    </button>
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={cn(
                          "absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[var(--accent)]",
                          header.column.getIsResizing() ? "bg-[var(--accent)]" : "bg-transparent"
                        )}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-line hover:bg-[color:color-mix(in_srgb,var(--surface)_40%,transparent)]">
                {row.getVisibleCells().map((cell) => {
                  const isNumber = typeof cell.getValue() === 'number';
                  return (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className={cn("border-b border-line px-3 align-middle text-sm", density === "compact" ? "py-1" : "py-2.5", isNumber && "tabular-nums")}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StructurePanel({ columns, table, editable }: { columns: TableColumn[]; table: string; editable: boolean }) {
  return (
    <div className="data-panel p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">Structure</p>
          <h3 className="mt-0.5 text-lg font-semibold">{table || "No table selected"}</h3>
        </div>
        <StatusPill tone={editable ? "success" : "warning"} label={editable ? "Editable" : "Read-only"} />
      </div>
      <div className="overflow-auto border border-line">
        <table className="min-w-full">
          <thead className="bg-panel">
            <tr>
              {["Column", "Type", "Nullable", "Default", "Role"].map((header) => (
                <th key={header} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-h)]">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.name} className="border-t border-line">
                <td className="px-3 py-2 font-medium text-[var(--text-h)]">{column.name}</td>
                <td className="px-3 py-2 text-muted">{column.dataType}</td>
                <td className="px-3 py-2 text-muted">{column.nullable ? "Yes" : "No"}</td>
                <td className="max-w-[300px] truncate px-3 py-2 text-muted">{column.defaultValue || "-"}</td>
                <td className="px-3 py-2">{column.isPrimaryKey ? <span className="badge-muted text-[var(--accent)]">Primary Key</span> : titleCase(column.displayType)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfirmModal({
  state,
  drafts,
  pendingRows,
  pendingFields,
  brandSectionEnv,
  onClose,
  onDiscard,
  onSave,
  onNavigate,
  onRunSQL,
}: {
  state: NonNullable<ConfirmState>;
  drafts: ChangedState;
  pendingRows: number;
  pendingFields: number;
  brandSectionEnv?: string;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onNavigate: (action: () => void) => void;
  onRunSQL: (sql: string) => void;
}) {
  const title = state.type === "save" ? "Review changes" : state.type === "discard" ? "Discard changes?" : state.type === "sql" ? "Run write statement?" : state.title;
  const productionEnv = state.type === "sql" && isProductionBrandEnv(brandSectionEnv);
  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-line p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className={cn("mt-1", productionEnv ? "text-[var(--red-light)]" : "text-[var(--accent)]")} size={20} />
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted">
              {state.type === "sql"
                ? productionEnv
                  ? "Production environment: this statement may change database data or schema."
                  : "This statement may change database data or schema."
                : `${pendingRows} row(s), ${pendingFields} field(s) are pending.`}
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-[52vh] overflow-auto p-4">
        {state.type === "sql" ? (
          <pre className="whitespace-pre-wrap border border-line bg-[var(--code-bg)] p-3 font-mono text-sm leading-6 text-[var(--text-h)]">{state.sql}</pre>
        ) : (
          <div className="space-y-3">
            {Object.entries(drafts).map(([rowKey, draft]) => (
              <div key={rowKey} className="border border-line bg-[var(--surface)] p-3">
                <p className="mb-2 font-mono text-xs text-[var(--text-dim)]">{rowKey}</p>
                <div className="grid gap-2">
                  {Object.entries(draft.values).map(([column, value]) => (
                    <div key={column} className="grid grid-cols-[160px_1fr] gap-3 text-sm">
                      <span className="text-[var(--accent)]">{column}</span>
                      <span className="truncate font-mono text-[var(--text-h)]">{value == null ? "NULL" : String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-line p-4">
        <button type="button" className="toolbar-button" onClick={onClose}>Cancel</button>
        {state.type === "save" ? <button type="button" className="toolbar-button brand" onClick={onSave}><Check size={15} /> Save changes</button> : null}
        {state.type === "discard" ? <button type="button" className="toolbar-button danger" onClick={onDiscard}>Discard changes</button> : null}
        {state.type === "navigate" ? <button type="button" className="toolbar-button danger" onClick={() => onNavigate(state.action)}>Discard and continue</button> : null}
        {state.type === "sql" ? <button type="button" className="toolbar-button brand" onClick={() => onRunSQL(state.sql)}><Play size={15} /> Run statement</button> : null}
      </div>
    </ModalShell>
  );
}

function JsonViewerPanel({
  table,
  column,
  value,
  copyFeedback,
  onClose,
  onCopy,
}: {
  table: string;
  column: string;
  value: unknown;
  copyFeedback: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(0,0,0,0.3)] transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-line bg-[var(--bg)] shadow-panel animate-slide-in-right">
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">{table}</p>
            <h3 className="mt-0.5 text-lg font-semibold">{column}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCopy} className="toolbar-button brand">
              <Copy size={15} />
              {copyFeedback || "Copy JSON"}
            </button>
            <button type="button" aria-label="Close JSON viewer" onClick={onClose} className="icon-button">
              <X size={17} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-[var(--code-bg)] p-4">
          <pre className="min-w-max text-sm leading-6 text-[var(--text-h)]">{formatJsonModalValue(value)}</pre>
        </div>
      </div>
    </>
  );
}

function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.62)] px-4 py-8" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden border border-line bg-[var(--bg)] shadow-panel" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function BrandSection({ status }: { status: ConnectionStatus }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h1 className={cn("shrink-0 text-[17px] font-semibold", status.brandSectionName && "uppercase tracking-[0.14em]")}>
        {status.brandSectionName || (
          <>
            p<span className="text-[var(--red)]">gui</span>
          </>
        )}
      </h1>
      {status.brandSectionEnv ? <StatusPill tone={brandEnvTone(status.brandSectionEnv)} label={status.brandSectionEnv} /> : null}
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

function EmptyBadge() {
  return <span className="badge-muted text-[var(--text-dim)]">EMPTY</span>;
}

function PanelMessage({ text }: { text: string }) {
  return <div className="data-panel flex min-h-[180px] items-center justify-center p-8 text-sm text-muted">{text}</div>;
}

function InlineError({ message }: { message: string }) {
  return <div className="border border-[var(--red)] bg-[color:color-mix(in_srgb,var(--red)_10%,transparent)] p-4 text-sm text-[var(--red-light)]">{message}</div>;
}
