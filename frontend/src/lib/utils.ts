export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function formatTableLabel(table: string) {
  return table.replace(/_/g, " ");
}

export function serializePrimaryKey(primaryKey: Record<string, unknown>, columns: string[]) {
  return columns.map((column) => `${column}:${String(primaryKey[column] ?? "null")}`).join("|");
}

export function titleCase(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
