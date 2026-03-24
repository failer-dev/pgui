package main

import (
	"context"
	"errors"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
)

var errNotConnected = errors.New("database is not connected")

type Store struct {
	mu      sync.RWMutex
	pool    *pgxpool.Pool
	status  ConnectionStatus
	readonly bool
}

func NewStore() *Store {
	return &Store{
		status: ConnectionStatus{
			Mode: "read-write",
		},
		readonly: strings.EqualFold(os.Getenv("READ_ONLY"), "true"),
	}
}

func (s *Store) AutoConnect(ctx context.Context) {
	s.mu.Lock()
	s.status.AutoConnectAttempted = true
	s.status.Mode = s.mode()
	s.mu.Unlock()

	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		return
	}

	if err := s.Connect(ctx, dsn); err != nil {
		s.mu.Lock()
		s.status.Error = err.Error()
		s.status.Mode = s.mode()
		s.mu.Unlock()
	}
}

func (s *Store) mode() string {
	if s.readonly {
		return "read-only"
	}
	return "read-write"
}

func (s *Store) Connect(ctx context.Context, dsn string) error {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		s.setError(err)
		return err
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		s.setError(err)
		return err
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		s.setError(err)
		return err
	}

	nextStatus := statusFromDSN(dsn, s.mode())
	nextStatus.Connected = true
	nextStatus.AutoConnectAttempted = true

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pool != nil {
		s.pool.Close()
	}
	s.pool = pool
	s.status = nextStatus
	return nil
}

func (s *Store) setError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.status.Error = err.Error()
	s.status.Mode = s.mode()
	s.status.AutoConnectAttempted = true
}

func (s *Store) Pool() (*pgxpool.Pool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.pool == nil {
		return nil, errNotConnected
	}
	return s.pool, nil
}

func (s *Store) Status() ConnectionStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.status
}

func (s *Store) ReadOnly() bool {
	return s.readonly
}

func statusFromDSN(dsn, mode string) ConnectionStatus {
	status := ConnectionStatus{Mode: mode}
	u, err := url.Parse(dsn)
	if err != nil {
		return status
	}

	status.Database = strings.TrimPrefix(u.Path, "/")
	status.Host = u.Hostname()
	status.Port = u.Port()
	if u.User != nil {
		status.User = u.User.Username()
	}
	return status
}
