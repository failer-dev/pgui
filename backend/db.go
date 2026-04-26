package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

var identPattern = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

const (
	sqlExecutionTimeout = 10 * time.Second
	maxSQLResultRows    = 1000
	maxSQLResultBytes   = 5 * 1024 * 1024
)

type rowCollection struct {
	Rows      []map[string]any
	Truncated bool
}

func parseTableName(table string) (string, string, error) {
	parts := strings.Split(table, ".")
	if len(parts) != 2 {
		return "", "", errors.New("table must be in schema.table format")
	}
	schema := strings.TrimSpace(parts[0])
	name := strings.TrimSpace(parts[1])
	if !identPattern.MatchString(schema) || !identPattern.MatchString(name) {
		return "", "", errors.New("invalid schema or table identifier")
	}
	return schema, name, nil
}

func quoteIdent(ident string) string {
	return `"` + strings.ReplaceAll(ident, `"`, `""`) + `"`
}

func (s *Store) ListSchemas(ctx context.Context) ([]SchemaTables, error) {
	pool, err := s.Pool()
	if err != nil {
		return nil, err
	}

	rows, err := pool.Query(ctx, `
		SELECT table_schema, table_name
		FROM information_schema.tables
		WHERE table_type = 'BASE TABLE'
		  AND table_schema NOT IN ('information_schema')
		  AND table_schema NOT LIKE 'pg_%'
		ORDER BY table_schema, table_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	grouped := []SchemaTables{}
	indexes := map[string]int{}
	for rows.Next() {
		var schema, table string
		if err := rows.Scan(&schema, &table); err != nil {
			return nil, err
		}
		idx, ok := indexes[schema]
		if !ok {
			idx = len(grouped)
			indexes[schema] = idx
			grouped = append(grouped, SchemaTables{Name: schema})
		}
		grouped[idx].Tables = append(grouped[idx].Tables, table)
	}
	return grouped, rows.Err()
}

func (s *Store) TableMetadata(ctx context.Context, table string) (TableMetadata, error) {
	pool, err := s.Pool()
	if err != nil {
		return TableMetadata{}, err
	}
	schema, name, err := parseTableName(table)
	if err != nil {
		return TableMetadata{}, err
	}

	rows, err := pool.Query(ctx, `
		SELECT
			c.column_name,
			c.data_type,
			c.is_nullable,
			COALESCE(c.column_default, ''),
			EXISTS (
				SELECT 1
				FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu
				  ON tc.constraint_name = kcu.constraint_name
				 AND tc.table_schema = kcu.table_schema
				WHERE tc.constraint_type = 'PRIMARY KEY'
				  AND tc.table_schema = c.table_schema
				  AND tc.table_name = c.table_name
				  AND kcu.column_name = c.column_name
			) AS is_primary_key
		FROM information_schema.columns c
		WHERE c.table_schema = $1 AND c.table_name = $2
		ORDER BY c.ordinal_position`, schema, name)
	if err != nil {
		return TableMetadata{}, err
	}
	defer rows.Close()

	metadata := TableMetadata{}
	for rows.Next() {
		var col TableColumn
		var nullable string
		if err := rows.Scan(&col.Name, &col.DataType, &nullable, &col.DefaultValue, &col.IsPrimaryKey); err != nil {
			return TableMetadata{}, err
		}
		col.Nullable = nullable == "YES"
		col.IsEditable = isEditableType(col.DataType) && !col.IsPrimaryKey && !s.readonly
		col.DisplayType = normalizeDisplayType(col.DataType)
		if col.IsPrimaryKey {
			metadata.PrimaryKey = append(metadata.PrimaryKey, col.Name)
		}
		metadata.Columns = append(metadata.Columns, col)
	}
	if err := rows.Err(); err != nil {
		return TableMetadata{}, err
	}
	metadata.Editable = len(metadata.PrimaryKey) > 0 && !s.readonly
	return metadata, nil
}

func (s *Store) SQLCatalog(ctx context.Context) (SQLCatalogResponse, error) {
	pool, err := s.Pool()
	if err != nil {
		return SQLCatalogResponse{}, err
	}

	rows, err := pool.Query(ctx, `
		SELECT
			c.table_schema,
			c.table_name,
			c.column_name,
			c.data_type,
			c.is_nullable,
			EXISTS (
				SELECT 1
				FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu
				  ON tc.constraint_name = kcu.constraint_name
				 AND tc.table_schema = kcu.table_schema
				 AND tc.table_name = kcu.table_name
				WHERE tc.constraint_type = 'PRIMARY KEY'
				  AND tc.table_schema = c.table_schema
				  AND tc.table_name = c.table_name
				  AND kcu.column_name = c.column_name
			) AS is_primary_key
		FROM information_schema.columns c
		JOIN information_schema.tables t
		  ON t.table_schema = c.table_schema
		 AND t.table_name = c.table_name
		WHERE t.table_type = 'BASE TABLE'
		  AND c.table_schema NOT IN ('information_schema')
		  AND c.table_schema NOT LIKE 'pg_%'
		ORDER BY c.table_schema, c.table_name, c.ordinal_position`)
	if err != nil {
		return SQLCatalogResponse{}, err
	}
	defer rows.Close()

	resp := SQLCatalogResponse{}
	schemaIndexes := map[string]int{}
	tableIndexes := map[string]int{}
	for rows.Next() {
		var schemaName, tableName, columnName, dataType, nullable string
		var isPrimaryKey bool
		if err := rows.Scan(&schemaName, &tableName, &columnName, &dataType, &nullable, &isPrimaryKey); err != nil {
			return SQLCatalogResponse{}, err
		}

		schemaIndex, ok := schemaIndexes[schemaName]
		if !ok {
			schemaIndex = len(resp.Schemas)
			schemaIndexes[schemaName] = schemaIndex
			resp.Schemas = append(resp.Schemas, SQLCatalogSchema{Name: schemaName})
		}

		tableKey := schemaName + "." + tableName
		tableIndex, ok := tableIndexes[tableKey]
		if !ok {
			tableIndex = len(resp.Schemas[schemaIndex].Tables)
			tableIndexes[tableKey] = tableIndex
			resp.Schemas[schemaIndex].Tables = append(resp.Schemas[schemaIndex].Tables, SQLCatalogTable{Name: tableName})
		}

		resp.Schemas[schemaIndex].Tables[tableIndex].Columns = append(resp.Schemas[schemaIndex].Tables[tableIndex].Columns, SQLCatalogColumn{
			Name:         columnName,
			DataType:     dataType,
			Nullable:     nullable == "YES",
			IsPrimaryKey: isPrimaryKey,
		})
	}
	if err := rows.Err(); err != nil {
		return SQLCatalogResponse{}, err
	}

	relationshipRows, err := pool.Query(ctx, `
		SELECT
			con.conname,
			source_ns.nspname AS source_schema,
			source_cls.relname AS source_table,
			ARRAY(
				SELECT source_attr.attname::text
				FROM unnest(con.conkey) WITH ORDINALITY AS source_key(attnum, ordinality)
				JOIN pg_attribute source_attr
				  ON source_attr.attrelid = con.conrelid
				 AND source_attr.attnum = source_key.attnum
				ORDER BY source_key.ordinality
			) AS source_columns,
			target_ns.nspname AS target_schema,
			target_cls.relname AS target_table,
			ARRAY(
				SELECT target_attr.attname::text
				FROM unnest(con.confkey) WITH ORDINALITY AS target_key(attnum, ordinality)
				JOIN pg_attribute target_attr
				  ON target_attr.attrelid = con.confrelid
				 AND target_attr.attnum = target_key.attnum
				ORDER BY target_key.ordinality
			) AS target_columns
		FROM pg_constraint con
		JOIN pg_class source_cls ON source_cls.oid = con.conrelid
		JOIN pg_namespace source_ns ON source_ns.oid = source_cls.relnamespace
		JOIN pg_class target_cls ON target_cls.oid = con.confrelid
		JOIN pg_namespace target_ns ON target_ns.oid = target_cls.relnamespace
		WHERE con.contype = 'f'
		  AND source_cls.relkind IN ('r', 'p')
		  AND target_cls.relkind IN ('r', 'p')
		  AND source_ns.nspname NOT IN ('information_schema')
		  AND source_ns.nspname NOT LIKE 'pg_%'
		  AND target_ns.nspname NOT IN ('information_schema')
		  AND target_ns.nspname NOT LIKE 'pg_%'
		ORDER BY source_ns.nspname, source_cls.relname, con.conname`)
	if err != nil {
		return SQLCatalogResponse{}, err
	}
	defer relationshipRows.Close()

	for relationshipRows.Next() {
		var relationship SQLCatalogRelationship
		if err := relationshipRows.Scan(
			&relationship.Name,
			&relationship.From.Schema,
			&relationship.From.Table,
			&relationship.From.Columns,
			&relationship.To.Schema,
			&relationship.To.Table,
			&relationship.To.Columns,
		); err != nil {
			return SQLCatalogResponse{}, err
		}
		resp.Relationships = append(resp.Relationships, relationship)
	}
	if err := relationshipRows.Err(); err != nil {
		return SQLCatalogResponse{}, err
	}

	return resp, nil
}

func normalizeDisplayType(dataType string) string {
	switch dataType {
	case "integer", "bigint", "smallint", "numeric", "double precision", "real":
		return "number"
	case "boolean":
		return "boolean"
	case "json", "jsonb":
		return "json"
	case "date", "timestamp without time zone", "timestamp with time zone":
		return "datetime"
	default:
		return "text"
	}
}

func isEditableType(dataType string) bool {
	switch dataType {
	case "boolean", "json", "jsonb", "bytea":
		return false
	default:
		return true
	}
}

func (s *Store) TableRows(ctx context.Context, table string, page, pageSize int, filter string) (TableRowsResponse, error) {
	start := time.Now()
	metadata, err := s.TableMetadata(ctx, table)
	if err != nil {
		return TableRowsResponse{}, err
	}

	pool, err := s.Pool()
	if err != nil {
		return TableRowsResponse{}, err
	}
	schema, name, err := parseTableName(table)
	if err != nil {
		return TableRowsResponse{}, err
	}

	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 1000 {
		pageSize = 25
	}
	offset := (page - 1) * pageSize

	whereParts := []string{}
	args := []any{}
	if strings.TrimSpace(filter) != "" {
		search := "%" + filter + "%"
		for _, col := range metadata.Columns {
			whereParts = append(whereParts, fmt.Sprintf("CAST(%s AS text) ILIKE $1", quoteIdent(col.Name)))
		}
		args = append(args, search)
	}

	whereClause := ""
	if len(whereParts) > 0 {
		whereClause = " WHERE " + strings.Join(whereParts, " OR ")
	}

	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM %s.%s%s", quoteIdent(schema), quoteIdent(name), whereClause)
	var total int
	if err := pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return TableRowsResponse{}, err
	}

	colNames := make([]string, 0, len(metadata.Columns))
	for _, col := range metadata.Columns {
		colNames = append(colNames, quoteIdent(col.Name))
	}

	queryArgs := append([]any{}, args...)
	queryArgs = append(queryArgs, pageSize, offset)
	rowsSQL := fmt.Sprintf(
		"SELECT %s FROM %s.%s%s LIMIT $%d OFFSET $%d",
		strings.Join(colNames, ", "),
		quoteIdent(schema),
		quoteIdent(name),
		whereClause,
		len(queryArgs)-1,
		len(queryArgs),
	)

	rows, err := pool.Query(ctx, rowsSQL, queryArgs...)
	if err != nil {
		return TableRowsResponse{}, err
	}
	defer rows.Close()

	resultRows, err := collectRows(rows)
	if err != nil {
		return TableRowsResponse{}, err
	}

	totalPages := int(math.Ceil(float64(total) / float64(pageSize)))
	if totalPages == 0 {
		totalPages = 1
	}

	return TableRowsResponse{
		Columns:    metadata.Columns,
		Rows:       resultRows,
		PrimaryKey: metadata.PrimaryKey,
		Editable:   metadata.Editable,
		QueryTime:  time.Since(start).Milliseconds(),
		Pagination: Pagination{
			Page:       page,
			PageSize:   pageSize,
			TotalRows:  total,
			TotalPages: totalPages,
		},
	}, nil
}

func collectRows(rows pgx.Rows) ([]map[string]any, error) {
	collection, err := collectRowsWithLimits(rows, 0, 0)
	return collection.Rows, err
}

func collectRowsWithLimits(rows pgx.Rows, maxRows, maxBytes int) (rowCollection, error) {
	fields := rows.FieldDescriptions()
	items := []map[string]any{}
	bytesUsed := 0
	for rows.Next() {
		if maxRows > 0 && len(items) >= maxRows {
			return rowCollection{Rows: items, Truncated: true}, nil
		}
		values, err := rows.Values()
		if err != nil {
			return rowCollection{}, err
		}
		item := make(map[string]any, len(fields))
		for i, field := range fields {
			item[string(field.Name)] = normalizeValue(values[i])
		}
		if maxBytes > 0 {
			payload, err := json.Marshal(item)
			if err != nil {
				return rowCollection{}, err
			}
			bytesUsed += len(payload)
			if bytesUsed > maxBytes {
				return rowCollection{}, fmt.Errorf("query result is larger than %d bytes", maxBytes)
			}
		}
		items = append(items, item)
	}
	return rowCollection{Rows: items}, rows.Err()
}

func normalizeValue(value any) any {
	switch v := value.(type) {
	case nil:
		return nil
	case time.Time:
		return v.Format("2006-01-02 15:04:05")
	case []byte:
		if utf8 := string(v); isSafeText(utf8) {
			return utf8
		}
		return hex.EncodeToString(v)
	case int64:
		return v
	case int32:
		return v
	case float64:
		return v
	case float32:
		return v
	case bool:
		return v
	case pgtype.Numeric:
		return formatNumeric(v)
	case string:
		return v
	case map[string]any, []any:
		return formatJSON(v)
	default:
		if formatted, ok := tryFormatJSON(v); ok {
			return formatted
		}
		return fmt.Sprintf("%v", v)
	}
}

func formatNumeric(value pgtype.Numeric) any {
	if !value.Valid {
		return nil
	}
	number, err := value.Float64Value()
	if err == nil && number.Valid {
		if math.Mod(number.Float64, 1) == 0 {
			return strconv.FormatFloat(number.Float64, 'f', 0, 64)
		}
		return strconv.FormatFloat(number.Float64, 'f', -1, 64)
	}

	text, err := value.MarshalJSON()
	if err == nil {
		return strings.Trim(string(text), `"`)
	}
	return fmt.Sprintf("%v", value)
}

func formatJSON(value any) string {
	payload, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("%v", value)
	}
	return string(payload)
}

func tryFormatJSON(value any) (string, bool) {
	switch value.(type) {
	case map[string]string, []map[string]any:
		return formatJSON(value), true
	default:
		return "", false
	}
}

func isSafeText(value string) bool {
	for _, r := range value {
		if r < 32 && r != 9 && r != 10 && r != 13 {
			return false
		}
	}
	return true
}

func (s *Store) SaveChanges(ctx context.Context, table string, req SaveRequest) (SaveResponse, error) {
	if s.readonly {
		return SaveResponse{}, errors.New("read-only mode is enabled")
	}
	if len(req.Changes) == 0 {
		return SaveResponse{}, nil
	}

	metadata, err := s.TableMetadata(ctx, table)
	if err != nil {
		return SaveResponse{}, err
	}
	if len(metadata.PrimaryKey) == 0 {
		return SaveResponse{}, errors.New("table has no primary key")
	}

	pool, err := s.Pool()
	if err != nil {
		return SaveResponse{}, err
	}
	schema, name, err := parseTableName(table)
	if err != nil {
		return SaveResponse{}, err
	}

	editableCols := map[string]TableColumn{}
	for _, col := range metadata.Columns {
		editableCols[col.Name] = col
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return SaveResponse{}, err
	}
	defer tx.Rollback(ctx)

	updated := 0
	for _, change := range req.Changes {
		setParts := []string{}
		args := []any{}
		for colName, value := range change.Values {
			col, ok := editableCols[colName]
			if !ok {
				return SaveResponse{}, fmt.Errorf("unknown column: %s", colName)
			}
			if col.IsPrimaryKey {
				continue
			}
			if !col.IsEditable {
				return SaveResponse{}, fmt.Errorf("column is not editable: %s", colName)
			}
			args = append(args, castInput(value, col.DisplayType))
			setParts = append(setParts, fmt.Sprintf("%s = $%d", quoteIdent(colName), len(args)))
		}
		if len(setParts) == 0 {
			continue
		}

		whereParts := []string{}
		for _, pk := range metadata.PrimaryKey {
			value, ok := change.PrimaryKey[pk]
			if !ok {
				return SaveResponse{}, fmt.Errorf("missing primary key column: %s", pk)
			}
			args = append(args, value)
			whereParts = append(whereParts, fmt.Sprintf("%s = $%d", quoteIdent(pk), len(args)))
		}

		sql := fmt.Sprintf(
			"UPDATE %s.%s SET %s WHERE %s",
			quoteIdent(schema),
			quoteIdent(name),
			strings.Join(setParts, ", "),
			strings.Join(whereParts, " AND "),
		)
		tag, err := tx.Exec(ctx, sql, args...)
		if err != nil {
			return SaveResponse{}, err
		}
		updated += int(tag.RowsAffected())
	}

	if err := tx.Commit(ctx); err != nil {
		return SaveResponse{}, err
	}
	return SaveResponse{Updated: updated}, nil
}

func (s *Store) ExecuteSQL(ctx context.Context, req SQLExecuteRequest) (SQLExecuteResponse, error) {
	sqlText := strings.TrimSpace(req.SQL)
	if sqlText == "" {
		return SQLExecuteResponse{}, errors.New("SQL is required")
	}
	ctx, cancel := context.WithTimeout(ctx, sqlExecutionTimeout)
	defer cancel()

	readQuery := isReadOnlySQL(sqlText)
	if s.readonly && !readQuery {
		return SQLExecuteResponse{}, errors.New("read-only mode blocks write and DDL statements")
	}

	pool, err := s.Pool()
	if err != nil {
		return SQLExecuteResponse{}, err
	}

	start := time.Now()
	if readQuery {
		tx, err := pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
		if err != nil {
			return SQLExecuteResponse{}, err
		}
		defer tx.Rollback(ctx)

		rows, err := tx.Query(ctx, sqlText)
		if err != nil {
			return SQLExecuteResponse{}, err
		}
		fields := rows.FieldDescriptions()

		collection, err := collectRowsWithLimits(rows, maxSQLResultRows, maxSQLResultBytes)
		if err != nil {
			rows.Close()
			return SQLExecuteResponse{}, err
		}
		rows.Close()
		if err := tx.Commit(ctx); err != nil {
			return SQLExecuteResponse{}, err
		}

		columns := make([]string, 0, len(fields))
		for _, field := range fields {
			columns = append(columns, string(field.Name))
		}

		return SQLExecuteResponse{
			Columns:   columns,
			Rows:      collection.Rows,
			QueryTime: time.Since(start).Milliseconds(),
			ReadOnly:  true,
			Message:   sqlResultMessage(len(collection.Rows), collection.Truncated),
			Truncated: collection.Truncated,
		}, nil
	}

	tag, err := pool.Exec(ctx, sqlText)
	if err != nil {
		return SQLExecuteResponse{}, err
	}

	return SQLExecuteResponse{
		AffectedRows: tag.RowsAffected(),
		QueryTime:    time.Since(start).Milliseconds(),
		ReadOnly:     false,
		Message:      tag.String(),
	}, nil
}

func sqlResultMessage(rowCount int, truncated bool) string {
	if truncated {
		return fmt.Sprintf("first %d row(s) returned", rowCount)
	}
	return fmt.Sprintf("%d row(s) returned", rowCount)
}

func isReadOnlySQL(sqlText string) bool {
	normalized := strings.ToLower(strings.TrimSpace(strings.TrimLeft(sqlText, "(\n\r\t ")))
	readPrefixes := []string{"select", "with", "show", "explain", "values"}
	for _, prefix := range readPrefixes {
		if strings.HasPrefix(normalized, prefix) {
			return true
		}
	}
	return false
}

func castInput(value any, displayType string) any {
	if value == nil {
		return nil
	}
	switch displayType {
	case "number":
		switch v := value.(type) {
		case float64:
			if math.Mod(v, 1) == 0 {
				return int64(v)
			}
			return v
		case string:
			if strings.Contains(v, ".") {
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					return f
				}
			}
			if i, err := strconv.ParseInt(v, 10, 64); err == nil {
				return i
			}
		}
	}
	return value
}
