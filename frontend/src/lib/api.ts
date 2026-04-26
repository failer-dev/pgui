import type {
  ConnectionStatus,
  SaveChange,
  SQLCatalogResponse,
  SchemaTables,
  SQLExecuteResponse,
  TableMetadata,
  TableRowsResponse,
} from "./types";

const csrfCookieName = "pgui_csrf";
const csrfHeaderName = "X-CSRF-Token";

function readCookie(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split("; ")
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function isMutatingRequest(method?: string) {
  const normalized = (method ?? "GET").toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD";
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (isMutatingRequest(options?.method)) {
    const csrfToken = readCookie(csrfCookieName);
    if (csrfToken) {
      headers.set(csrfHeaderName, csrfToken);
    }
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json() as Promise<T>;
}

export function getConnectionStatus() {
  return api<ConnectionStatus>("/api/connection/status");
}

export function connectDatabase(url: string) {
  return api<ConnectionStatus>("/api/connection/connect", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function getSchemas() {
  return api<SchemaTables[]>("/api/schemas");
}

export function getSQLCatalog() {
  return api<SQLCatalogResponse>("/api/sql/catalog");
}

export function getTableMetadata(table: string) {
  return api<TableMetadata>(`/api/tables/${table}/metadata`);
}

export function getTableRows(table: string, page: number, pageSize: number, filter: string) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    filter,
  });
  return api<TableRowsResponse>(`/api/tables/${table}/rows?${params.toString()}`);
}

export function saveTableChanges(table: string, changes: SaveChange[]) {
  return api<{ updated: number }>(`/api/tables/${table}/save`, {
    method: "POST",
    body: JSON.stringify({ changes }),
  });
}

export function executeSQL(sql: string) {
  return api<SQLExecuteResponse>("/api/sql/execute", {
    method: "POST",
    body: JSON.stringify({ sql }),
  });
}
