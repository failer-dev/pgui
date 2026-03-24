export type ConnectionStatus = {
  connected: boolean;
  mode: string;
  database?: string;
  host?: string;
  port?: string;
  user?: string;
  autoConnectAttempted: boolean;
  error?: string;
};

export type SchemaTables = {
  name: string;
  tables: string[];
};

export type TableColumn = {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isEditable: boolean;
  displayType: string;
};

export type TableMetadata = {
  columns: TableColumn[];
  primaryKey: string[];
  editable: boolean;
};

export type Pagination = {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
};

export type TableRowsResponse = {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  pagination: Pagination;
  primaryKey: string[];
  editable: boolean;
  queryTimeMs: number;
};

export type SaveChange = {
  primaryKey: Record<string, unknown>;
  values: Record<string, unknown>;
};
