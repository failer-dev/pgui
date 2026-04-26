package main

import (
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type fakeRows struct {
	fields []pgconn.FieldDescription
	values [][]any
	index  int
	err    error
}

func (r *fakeRows) Close() {}

func (r *fakeRows) Err() error {
	return r.err
}

func (r *fakeRows) CommandTag() pgconn.CommandTag {
	return pgconn.NewCommandTag("SELECT")
}

func (r *fakeRows) FieldDescriptions() []pgconn.FieldDescription {
	return r.fields
}

func (r *fakeRows) Next() bool {
	if r.index >= len(r.values) {
		return false
	}
	r.index++
	return true
}

func (r *fakeRows) Scan(dest ...any) error {
	values, err := r.Values()
	if err != nil {
		return err
	}
	if len(dest) != len(values) {
		return errors.New("destination count does not match values")
	}
	for i := range dest {
		switch target := dest[i].(type) {
		case *string:
			value, ok := values[i].(string)
			if !ok {
				return errors.New("value is not a string")
			}
			*target = value
		default:
			return errors.New("unsupported destination")
		}
	}
	return nil
}

func (r *fakeRows) Values() ([]any, error) {
	if r.index == 0 || r.index > len(r.values) {
		return nil, errors.New("no current row")
	}
	return r.values[r.index-1], nil
}

func (r *fakeRows) RawValues() [][]byte {
	return nil
}

func (r *fakeRows) Conn() *pgx.Conn {
	return nil
}

func TestCollectRowsWithLimitsTruncatesAfterMaxRows(t *testing.T) {
	rows := &fakeRows{
		fields: []pgconn.FieldDescription{{Name: "id"}},
		values: make([][]any, maxSQLResultRows+1),
	}
	for i := range rows.values {
		rows.values[i] = []any{i}
	}

	collection, err := collectRowsWithLimits(rows, maxSQLResultRows, maxSQLResultBytes)
	if err != nil {
		t.Fatal(err)
	}
	if !collection.Truncated {
		t.Fatal("expected collection to be truncated")
	}
	if len(collection.Rows) != maxSQLResultRows {
		t.Fatalf("rows = %d, want %d", len(collection.Rows), maxSQLResultRows)
	}
}

func TestCollectRowsWithLimitsRejectsLargeResult(t *testing.T) {
	rows := &fakeRows{
		fields: []pgconn.FieldDescription{{Name: "payload"}},
		values: [][]any{{strings.Repeat("x", 64)}},
	}

	_, err := collectRowsWithLimits(rows, maxSQLResultRows, 16)
	if err == nil {
		t.Fatal("expected byte limit error")
	}
}
