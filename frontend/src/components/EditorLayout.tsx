import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Moon,
  Save,
  Search,
  Server,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSchemas, getTableMetadata, getTableRows, saveTableChanges } from "../lib/api";
import type { ConnectionStatus, SaveChange } from "../lib/types";
import { cn, formatTableLabel, serializePrimaryKey, titleCase } from "../lib/utils";

type Props = {
  status: ConnectionStatus;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

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
  cellKey: string;
  table: string;
  column: string;
  rawValue: unknown;
} | null;

const pageSize = 5;

function orderTablesForDemo(tables: string[]) {
  return [...tables].sort((left, right) => {
    if (left === "users") return -1;
    if (right === "users") return 1;
    return left.localeCompare(right);
  });
}

function formatCellValue(value: unknown, displayType: string) {
  if (value == null) return "";
  if (displayType === "json") {
    return formatJsonPreview(value);
  }
  if (displayType === "datetime") {
    return formatDatetimeDisplay(value);
  }
  return String(value);
}

function formatDatetimeDisplay(value: unknown) {
  if (value == null) return "";
  const raw = typeof value === "string" ? value.trim() : String(value);
  return raw.replace("T", " ").replace(/\.\d+$/, "");
}

function isDateOnlyType(dataType: string) {
  return dataType === "date";
}

function parseDatetimeEditorValue(value: unknown, dataType: string) {
  const raw = formatDatetimeDisplay(value);
  if (!raw) {
    return {
      date: "",
      time: isDateOnlyType(dataType) ? "" : "00:00:00",
    };
  }

  if (!raw.includes(" ")) {
    return { date: raw, time: isDateOnlyType(dataType) ? "" : "00:00:00" };
  }

  const [datePart, ...timeParts] = raw.split(" ");
  const normalizedTime = (timeParts.join(" ") || "").replace(/([+-]\d{2}:\d{2}|Z)$/i, "").trim();

  return {
    date: datePart,
    time: isDateOnlyType(dataType) ? "" : normalizedTime || "00:00:00",
  };
}

function combineDatetimeEditorValue(editor: Pick<DatetimeEditorState, "date" | "time" | "dataType">) {
  if (!editor.date.trim()) {
    return null;
  }

  if (isDateOnlyType(editor.dataType)) {
    return editor.date.trim();
  }

  const normalizedTime = normalizeTimeValue(editor.time);
  if (!normalizedTime) {
    return editor.date.trim();
  }

  return `${editor.date.trim()} ${normalizedTime}`;
}

function normalizeTimeValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(":").map((part) => part.trim());
  if (parts.length === 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:00`;
  }
  if (parts.length >= 3) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:${parts[2].padStart(2, "0")}`;
  }
  return trimmed;
}

function formatJsonPreview(value: unknown) {
  const normalized = parseJsonValue(value);
  if (normalized == null) {
    return typeof value === "string" ? value : String(value ?? "");
  }
  return JSON.stringify(normalized);
}

function formatJsonModalValue(value: unknown) {
  const normalized = parseJsonValue(value);
  if (normalized == null) {
    return typeof value === "string" ? value : String(value ?? "");
  }
  return JSON.stringify(normalized, null, 2);
}

function parseJsonValue(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value !== null) {
    return value;
  }
  return null;
}

export function EditorLayout({ status, theme, onToggleTheme }: Props) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const [drafts, setDrafts] = useState<ChangedState>({});
  const [savingError, setSavingError] = useState("");
  const [datetimeEditor, setDatetimeEditor] = useState<DatetimeEditorState | null>(null);
  const [activeJsonCellKey, setActiveJsonCellKey] = useState<string | null>(null);
  const [jsonViewer, setJsonViewer] = useState<JsonViewerState>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [showFilterHelp, setShowFilterHelp] = useState(false);
  const filterHelpRef = useRef<HTMLDivElement>(null);

  const tab = searchParams.get("tab") ?? "data";
  const page = Number(searchParams.get("page") ?? "1");

  const schemasQuery = useQuery({
    queryKey: ["schemas"],
    queryFn: getSchemas,
    enabled: status.connected,
  });

  const selectedTable = useMemo(() => {
    const current = searchParams.get("table");
    if (current) return current;
    const firstSchema = schemasQuery.data?.[0];
    const firstTable = firstSchema ? orderTablesForDemo(firstSchema.tables)[0] : undefined;
    if (!firstSchema || !firstTable) return "";
    return `${firstSchema.name}.${firstTable}`;
  }, [schemasQuery.data, searchParams]);

  const metadataQuery = useQuery({
    queryKey: ["metadata", selectedTable],
    queryFn: () => getTableMetadata(selectedTable),
    enabled: Boolean(selectedTable),
  });

  const rowsQuery = useQuery({
    queryKey: ["rows", selectedTable, page, filter],
    queryFn: () => getTableRows(selectedTable, page, pageSize, filter),
    enabled: Boolean(selectedTable),
  });

  const saveMutation = useMutation({
    mutationFn: (changes: SaveChange[]) => saveTableChanges(selectedTable, changes),
    onSuccess: async () => {
      setDrafts({});
      setSavingError("");
      await queryClient.invalidateQueries({ queryKey: ["rows", selectedTable] });
    },
    onError: (error: Error) => {
      setSavingError(error.message);
    },
  });

  const primaryKey = metadataQuery.data?.primaryKey ?? [];

  const mergedRows = useMemo<GridRow[]>(() => {
    return (rowsQuery.data?.rows ?? []).map((row) => {
      const keyPayload = Object.fromEntries(primaryKey.map((pk) => [pk, row[pk]]));
      const rowKey = serializePrimaryKey(keyPayload, primaryKey);
      return {
        ...row,
        ...(drafts[rowKey]?.values ?? {}),
        __rowKey: rowKey,
      };
    });
  }, [drafts, primaryKey, rowsQuery.data?.rows]);

  const pendingCount = Object.keys(drafts).length;
  const editable = rowsQuery.data?.editable ?? metadataQuery.data?.editable ?? false;

  const setTable = (table: string) => {
    setDrafts({});
    setDatetimeEditor(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("table", table);
      next.set("tab", "data");
      next.set("page", "1");
      return next;
    });
  };

  const setTab = (nextTab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", nextTab);
      return next;
    });
  };

  const changeCell = (rowKey: string, row: Record<string, unknown>, columnName: string, value: string) => {
    const primary = Object.fromEntries(primaryKey.map((pk) => [pk, row[pk]]));
    setDrafts((current) => ({
      ...current,
      [rowKey]: {
        primaryKey: primary,
        values: {
          ...(current[rowKey]?.values ?? {}),
          [columnName]: value,
        },
      },
    }));
  };

  const openDatetimeEditor = (rowKey: string, columnName: string, dataType: string, value: unknown) => {
    const cellKey = `${rowKey}:${columnName}`;
    const parsed = parseDatetimeEditorValue(value, dataType);
    setDatetimeEditor({
      cellKey,
      rowKey,
      columnName,
      dataType,
      date: parsed.date,
      time: parsed.time,
    });
  };

  const updateDatetimeEditor = (field: "date" | "time", value: string) => {
    setDatetimeEditor((current) => (current ? { ...current, [field]: value } : current));
  };

  const applyDatetimeEditor = (row: Record<string, unknown>) => {
    if (!datetimeEditor) return;
    const nextValue = combineDatetimeEditorValue(datetimeEditor);
    const primary = Object.fromEntries(primaryKey.map((pk) => [pk, row[pk]]));
    setDrafts((current) => ({
      ...current,
      [datetimeEditor.rowKey]: {
        primaryKey: primary,
        values: {
          ...(current[datetimeEditor.rowKey]?.values ?? {}),
          [datetimeEditor.columnName]: nextValue,
        },
      },
    }));
    setDatetimeEditor(null);
  };

  const clearDatetimeEditor = (row: Record<string, unknown>) => {
    if (!datetimeEditor) return;
    const primary = Object.fromEntries(primaryKey.map((pk) => [pk, row[pk]]));
    setDrafts((current) => ({
      ...current,
      [datetimeEditor.rowKey]: {
        primaryKey: primary,
        values: {
          ...(current[datetimeEditor.rowKey]?.values ?? {}),
          [datetimeEditor.columnName]: null,
        },
      },
    }));
    setDatetimeEditor(null);
  };

  const discardChanges = () => {
    setDrafts({});
    setSavingError("");
    setDatetimeEditor(null);
  };

  const saveChanges = async () => {
    await saveMutation.mutateAsync(Object.values(drafts));
  };

  const currentPage = rowsQuery.data?.pagination.page ?? page;
  const totalRows = rowsQuery.data?.pagination.totalRows ?? 0;
  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = totalRows === 0 ? 0 : Math.min(currentPage * pageSize, totalRows);

  useEffect(() => {
    if (!showFilterHelp) return;
    const onClickOutside = (event: MouseEvent) => {
      if (filterHelpRef.current && !filterHelpRef.current.contains(event.target as Node)) {
        setShowFilterHelp(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showFilterHelp]);

  useEffect(() => {
    if (!jsonViewer) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setJsonViewer(null);
        setCopyFeedback("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jsonViewer]);

  useEffect(() => {
    if (!jsonViewer) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [jsonViewer]);

  const handleJsonCellClick = (cellKey: string, columnName: string, rawValue: unknown) => {
    if (activeJsonCellKey === cellKey) {
      setJsonViewer({
        cellKey,
        table: selectedTable,
        column: columnName,
        rawValue,
      });
      setCopyFeedback("");
      return;
    }

    setActiveJsonCellKey(cellKey);
  };

  const closeJsonViewer = () => {
    setJsonViewer(null);
    setCopyFeedback("");
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

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex h-[68px] items-center justify-between gap-6 border-b border-line bg-[var(--bg)] px-7">
        <div className="flex items-center gap-6">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-h)]">P<span className="text-[var(--red)]">GUI</span></h1>
          <div className="flex items-center gap-2 border border-line bg-panel px-4 py-2 text-[18px] text-[var(--text)]">
            <span className="font-medium text-ink">{status.database || "db-prod-01"}</span>
            <span>|</span>
            <span>{status.host || "localhost"}:{status.port || "5432"}</span>
            <span>|</span>
            <span>{status.user || "postgres"}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex h-11 items-center gap-2 border border-line bg-panel px-4 text-sm font-medium uppercase tracking-[0.12em] text-[var(--text-h)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[320px] flex-col border-r border-line bg-panel">
          <div className="px-7 pb-6 pt-8">
            <h2 className="text-[22px] font-semibold">Schemas</h2>
            <p className="mt-1 text-lg text-muted">{status.database || "postgresql-prod-01"}</p>
          </div>

          <div className="flex-1 overflow-auto px-5 pb-6">
            {schemasQuery.data?.map((schema) => (
              <div key={schema.name} className="mb-8">
                <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-dim)]">
                  {schema.name}
                </p>
                <div className="space-y-1">
                  {orderTablesForDemo(schema.tables).map((table) => {
                    const fqtn = `${schema.name}.${table}`;
                    const active = selectedTable === fqtn;
                    return (
                      <button
                        key={fqtn}
                        onClick={() => setTable(fqtn)}
                        className={cn(
                          "flex w-full items-center gap-3 border px-4 py-3 text-left text-[15px] transition",
                          active
                            ? "border-[var(--accent)] bg-[var(--bg)] text-[var(--accent)]"
                            : "border-transparent text-[var(--text)] hover:border-line hover:bg-[var(--bg)]",
                        )}
                      >
                        <Server size={16} />
                        <span className="capitalize">{formatTableLabel(table)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line p-5">
            <button className="h-12 w-full border border-[var(--accent)] bg-[var(--accent)] text-base font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-light)]">
              + New Table
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-line bg-[var(--bg)] px-8 py-5">
            <div className="flex gap-8">
              {["data", "structure", "sql"].map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className={cn(
                    "border-b-2 pb-3 text-[16px] capitalize text-muted transition-colors",
                    tab === item && "border-[var(--accent)] font-semibold text-[var(--accent)]",
                    tab !== item && "border-transparent",
                  )}
                >
                  {item === "sql" ? "SQL Console" : item}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <div ref={filterHelpRef} className="relative flex items-center gap-2">
                <div className="flex h-12 w-[320px] items-center gap-3 border border-line bg-[var(--bg)] px-4 text-muted">
                  <Search size={18} />
                  <input
                    value={filter}
                    onChange={(event) => {
                      setFilter(event.target.value);
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set("page", "1");
                        return next;
                      });
                    }}
                    placeholder="Filter rows..."
                    className="w-full bg-transparent outline-none placeholder:text-[var(--text-dim)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilterHelp((v) => !v)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--text-dim)] text-[11px] font-bold leading-none text-[var(--text-dim)] transition hover:border-[var(--text)] hover:text-[var(--text-h)]"
                >
                  !
                </button>
                {showFilterHelp && (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[320px] border border-line bg-[var(--surface)] p-5 shadow-panel">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">Filter 사용법</p>
                    <ul className="space-y-2 text-[13px] text-[var(--text)]">
                      <li>입력한 텍스트가 <span className="text-[var(--text-h)]">포함</span>된 행을 모두 표시합니다.</li>
                      <li><span className="text-[var(--text-h)]">모든 컬럼</span>을 대상으로 동시에 검색합니다.</li>
                      <li>대소문자를 <span className="text-[var(--text-h)]">구분하지 않습니다.</span></li>
                      <li>숫자, 날짜, JSON 등 모든 타입은 텍스트로 변환하여 검색합니다.</li>
                    </ul>
                    <div className="mt-4 border-t border-line pt-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">예시</p>
                      <div className="space-y-1.5 font-mono text-[12px]">
                        <div><span className="text-[var(--accent)]">alice</span><span className="ml-2 text-[var(--text-dim)]">— "alice" 포함 행</span></div>
                        <div><span className="text-[var(--accent)]">2024</span><span className="ml-2 text-[var(--text-dim)]">— 날짜·ID 등에 2024 포함</span></div>
                        <div><span className="text-[var(--accent)]">@gmail</span><span className="ml-2 text-[var(--text-dim)]">— 이메일 도메인 검색</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="border border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--accent-dim)]">
                {pendingCount} Unsaved Change{pendingCount === 1 ? "" : "s"}
              </div>
              <button
                onClick={discardChanges}
                className="flex h-12 items-center gap-2 border border-line bg-[var(--bg)] px-5 text-[18px] text-[var(--text-h)] transition hover:border-[var(--text)]"
              >
                <X size={16} />
                Discard
              </button>
              <button
                onClick={() => void saveChanges()}
                disabled={pendingCount === 0 || saveMutation.isPending}
                className={cn(
                  "flex h-12 items-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-6 text-[18px] font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-light)]",
                  (pendingCount === 0 || saveMutation.isPending) && "cursor-not-allowed opacity-60",
                )}
              >
                <Save size={16} />
                Save
              </button>
            </div>
          </div>

          <section className="flex-1 overflow-auto p-8">
            {tab === "data" ? (
              <div className="border border-line bg-[var(--bg)] shadow-panel">
                <div className="overflow-x-auto">
                  {rowsQuery.isLoading ? (
                    <div className="p-10 text-center text-muted">Loading table rows...</div>
                  ) : null}
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-line bg-panel">
                        {rowsQuery.data?.columns.map((column) => (
                          <th key={column.name} className="px-5 py-5 text-left text-[14px] font-semibold uppercase tracking-[0.1em] text-[var(--text-h)]">
                            <div className="flex items-center gap-2">
                              <span>{column.name}</span>
                              {column.isPrimaryKey ? (
                                <span className="border border-line bg-[var(--surface-container)] px-2 py-1 text-[11px] tracking-normal text-[var(--text)]">
                                  PK
                                </span>
                              ) : null}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mergedRows.map((row) => (
                        <tr key={String(row.__rowKey)} className="border-b border-line last:border-b-0">
                          {rowsQuery.data?.columns.map((column) => {
                            const rowKey = String(row.__rowKey);
                            const jsonCellKey = `${rowKey}:${column.name}`;
                            const isDirty = Boolean(drafts[rowKey]?.values[column.name] !== undefined);
                            const displayValue = row[column.name];
                            const formattedValue = formatCellValue(displayValue, column.displayType);
                            return (
                              <td key={column.name} className="px-5 py-5 align-middle text-[18px]">
                                {editable && column.isEditable ? (
                                  column.displayType === "datetime" ? (
                                    datetimeEditor?.cellKey === jsonCellKey ? (
                                      <div className="border border-[var(--accent)] bg-[var(--surface)] p-3">
                                        <div className="grid gap-3">
                                          <input
                                            type="date"
                                            value={datetimeEditor.date}
                                            onChange={(event) => updateDatetimeEditor("date", event.target.value)}
                                            className="h-11 border border-line bg-[var(--bg)] px-3 text-[15px] text-[var(--text-h)]"
                                          />
                                          {isDateOnlyType(datetimeEditor.dataType) ? null : (
                                            <input
                                              type="time"
                                              step={1}
                                              value={datetimeEditor.time}
                                              onChange={(event) => updateDatetimeEditor("time", event.target.value)}
                                              className="h-11 border border-line bg-[var(--bg)] px-3 text-[15px] text-[var(--text-h)]"
                                            />
                                          )}
                                        </div>
                                        <div className="mt-3 flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em]">
                                          <button
                                            type="button"
                                            onClick={() => applyDatetimeEditor(row)}
                                            className="border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-[var(--on-accent)]"
                                          >
                                            Apply
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => clearDatetimeEditor(row)}
                                            className="border border-line bg-[var(--bg)] px-3 py-2 text-[var(--text-h)]"
                                          >
                                            Clear
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setDatetimeEditor(null)}
                                            className="border border-line bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => openDatetimeEditor(rowKey, column.name, column.dataType, displayValue)}
                                        className={cn(
                                          "cell-inline-scroll w-full border px-4 py-3 text-left outline-none transition-colors",
                                          isDirty
                                            ? "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)]"
                                            : "border-transparent bg-transparent hover:border-line",
                                        )}
                                      >
                                        {formattedValue || "Set value"}
                                      </button>
                                    )
                                  ) : (
                                    <input
                                      value={formattedValue}
                                      onChange={(event) => changeCell(rowKey, row, column.name, event.target.value)}
                                      className={cn(
                                        "w-full border px-4 py-3 outline-none transition-colors",
                                        isDirty
                                          ? "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)]"
                                          : "border-transparent bg-transparent hover:border-line focus:border-[var(--accent)]",
                                      )}
                                    />
                                  )
                                ) : (
                                  <div className={cn("px-4 py-3", isDirty && "bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)]")}>
                                    {column.name === "role" && displayValue ? (
                                      <span className="border border-line bg-[var(--surface-container)] px-3 py-1 text-[14px] font-medium uppercase text-[var(--text-h)]">
                                        {String(displayValue)}
                                      </span>
                                    ) : column.displayType === "json" ? (
                                      <button
                                        type="button"
                                        onClick={() => handleJsonCellClick(jsonCellKey, column.name, displayValue)}
                                        className={cn(
                                          "json-cell-scroll max-w-[360px] overflow-x-auto whitespace-nowrap border border-line bg-[var(--code-bg)] px-3 py-2 text-left font-mono text-[13px] leading-6 text-[var(--text)] outline-none transition",
                                          activeJsonCellKey === jsonCellKey && "border-[var(--accent)] text-[var(--text-h)]",
                                        )}
                                      >
                                        {formattedValue}
                                      </button>
                                    ) : column.displayType === "datetime" ? (
                                      <span className="cell-inline-scroll">{formattedValue}</span>
                                    ) : (
                                      <span>{formattedValue}</span>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between border-t border-line px-6 py-5 text-sm uppercase tracking-[0.18em] text-[var(--text-dim)]">
                  <span>
                    Showing {startRow}-{endRow} of {totalRows} rows
                  </span>
                  <div className="flex items-center gap-4 text-ink">
                    <button
                      onClick={() =>
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.set("page", String(Math.max(1, page - 1)));
                          return next;
                        })
                      }
                      className="text-muted transition-colors hover:text-[var(--text-h)]"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="text-lg font-semibold">{rowsQuery.data?.pagination.page ?? 1}</span>
                    <button
                      onClick={() =>
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.set("page", String(Math.min(rowsQuery.data?.pagination.totalPages ?? page, page + 1)));
                          return next;
                        })
                      }
                      className="text-muted transition-colors hover:text-[var(--text-h)]"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "structure" ? (
              <div className="border border-line bg-[var(--bg)] p-6 shadow-panel">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-[var(--text-dim)]">Structure</p>
                    <h3 className="mt-2 text-2xl font-semibold">{selectedTable || "No table selected"}</h3>
                  </div>
                  <StatusPill tone={metadataQuery.data?.editable ? "success" : "warning"} label={metadataQuery.data?.editable ? "Editable" : "Read-only"} />
                </div>
                <div className="overflow-hidden border border-line">
                  <table className="min-w-full">
                    <thead className="bg-panel">
                      <tr>
                        {["Column", "Type", "Nullable", "Default", "Role"].map((header) => (
                          <th key={header} className="px-4 py-4 text-left text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-h)]">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {metadataQuery.data?.columns.map((column) => (
                        <tr key={column.name} className="border-t border-line">
                          <td className="px-4 py-4 font-medium">{column.name}</td>
                          <td className="px-4 py-4 text-muted">{column.dataType}</td>
                          <td className="px-4 py-4 text-muted">{column.nullable ? "Yes" : "No"}</td>
                          <td className="px-4 py-4 text-muted">{column.defaultValue || "-"}</td>
                          <td className="px-4 py-4">
                            {column.isPrimaryKey ? (
                              <span className="border border-line bg-[var(--surface-container)] px-3 py-1 text-sm text-[var(--accent)]">Primary Key</span>
                            ) : (
                              <span className="text-muted">{titleCase(column.displayType)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tab === "sql" ? (
              <div className="border border-line bg-[var(--bg)] p-6 shadow-panel">
                <p className="text-sm uppercase tracking-[0.18em] text-[var(--text-dim)]">SQL Console</p>
                <div className="mt-5 border border-line bg-[var(--code-bg)] p-6 text-[var(--text-h)]">
                  <pre className="text-sm leading-7">
{`-- SQL Console is planned for the next iteration
SELECT *
FROM ${selectedTable || "public.users"}
WHERE status = 'active'
ORDER BY created_at DESC;`}
                  </pre>
                </div>
              </div>
            ) : null}

            {savingError ? <p className="mt-4 text-sm text-[var(--red)]">{savingError}</p> : null}
            {!editable ? (
              <p className="mt-4 text-sm text-warningFg">
                This table is currently read-only because it has no primary key or the app is in read-only mode.
              </p>
            ) : null}
          </section>
        </main>
      </div>

      {jsonViewer ? (
        <JsonViewerModal
          table={jsonViewer.table}
          column={jsonViewer.column}
          value={jsonViewer.rawValue}
          copyFeedback={copyFeedback}
          onClose={closeJsonViewer}
          onCopy={() => void copyJsonValue()}
        />
      ) : null}

      <footer className="flex h-12 items-center justify-between border-t border-line bg-[var(--bg)] px-7 text-[13px] uppercase tracking-[0.16em] text-[var(--text)]">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2.5 w-2.5 bg-[var(--success)]" />
          <span>Connected: {status.mode} mode</span>
          <span className="text-line">|</span>
          <span>Execution time: {rowsQuery.data?.queryTimeMs ?? 0}ms</span>
        </div>
        <div className="flex items-center gap-8">
          <span className="text-[var(--accent)]">Pending Changes ({pendingCount})</span>
          <span>Query Console</span>
          <span>Docs</span>
        </div>
      </footer>
    </div>
  );
}

function JsonViewerModal({
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.55)] px-6 py-10"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden border border-line bg-[var(--bg)] shadow-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-line px-7 py-6">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-[var(--text-dim)]">{table}</p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">{column}</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center gap-2 border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] transition hover:bg-[var(--accent-light)]"
            >
              <Copy size={16} />
              {copyFeedback || "Copy JSON"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border border-line p-2 text-[var(--text)] transition hover:border-[var(--text)] hover:text-[var(--text-h)]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-auto bg-[var(--code-bg)] p-7">
          <pre className="min-w-max border-none bg-transparent p-0 text-[14px] leading-7 text-[var(--text-h)]">
            {formatJsonModalValue(value)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ tone, label }: { tone: "success" | "warning" | "brand"; label: string }) {
  const styles = {
    success: "border border-[var(--success)] bg-[color:color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]",
    warning: "border border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--accent-dim)]",
    brand: "border border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] text-[var(--accent)]",
  };

  return (
    <span className={cn("px-4 py-2 text-sm font-semibold uppercase tracking-[0.15em]", styles[tone])}>
      {label}
    </span>
  );
}
