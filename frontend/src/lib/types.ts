export type ThemePreference = "light" | "dark" | "system";

export type ConnectionStatus = {
  connected: boolean;
  mode: string;
  database?: string;
  host?: string;
  port?: string;
  user?: string;
  brandSectionName?: string;
  brandSectionEnv?: string;
  theme: ThemePreference;
  autoConnectAttempted: boolean;
  error?: string;
};

export type SchemaTables = {
  name: string;
  tables: string[];
};

export type SQLCatalogColumn = {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
};

export type SQLCatalogTable = {
  name: string;
  columns: SQLCatalogColumn[];
};

export type SQLCatalogSchema = {
  name: string;
  tables: SQLCatalogTable[];
};

export type SQLCatalogRelationshipEndpoint = {
  schema: string;
  table: string;
  columns: string[];
};

export type SQLCatalogRelationship = {
  name: string;
  from: SQLCatalogRelationshipEndpoint;
  to: SQLCatalogRelationshipEndpoint;
};

export type SQLCatalogResponse = {
  schemas: SQLCatalogSchema[];
  relationships: SQLCatalogRelationship[];
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

export type SQLExecuteResponse = {
  columns?: string[];
  rows?: Record<string, unknown>[];
  affectedRows?: number;
  queryTimeMs: number;
  readOnly: boolean;
  message: string;
  truncated?: boolean;
};
