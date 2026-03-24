import type {
  ConnectionStatus,
  SaveChange,
  SchemaTables,
  TableMetadata,
  TableRowsResponse,
} from "./types";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
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
