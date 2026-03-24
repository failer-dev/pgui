package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Server struct {
	store *Store
	mux   *http.ServeMux
}

func NewServer() *Server {
	store := NewStore()
	server := &Server{
		store: store,
		mux:   http.NewServeMux(),
	}
	server.routes()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	store.AutoConnect(ctx)
	return server
}

func (s *Server) Handler() http.Handler {
	return loggingMiddleware(s.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("/api/connection/status", s.handleConnectionStatus)
	s.mux.HandleFunc("/api/connection/connect", s.handleConnect)
	s.mux.HandleFunc("/api/schemas", s.handleSchemas)
	s.mux.HandleFunc("/api/tables/", s.handleTables)
	s.mux.Handle("/", spaHandler())
}

func (s *Server) handleConnectionStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.store.Status())
}

func (s *Server) handleConnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB
	var payload struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	if err := s.store.Connect(ctx, payload.URL); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s.store.Status())
}

func (s *Server) handleSchemas(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	resp, err := s.store.ListSchemas(r.Context())
	if err != nil {
		writeMaybeConnectionError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleTables(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/tables/")
	if trimmed == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	switch {
	case strings.HasSuffix(trimmed, "/metadata"):
		s.handleMetadata(w, r, strings.TrimSuffix(trimmed, "/metadata"))
	case strings.HasSuffix(trimmed, "/rows"):
		s.handleRows(w, r, strings.TrimSuffix(trimmed, "/rows"))
	case strings.HasSuffix(trimmed, "/save"):
		s.handleSave(w, r, strings.TrimSuffix(trimmed, "/save"))
	default:
		writeError(w, http.StatusNotFound, "not found")
	}
}

func (s *Server) handleMetadata(w http.ResponseWriter, r *http.Request, table string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	resp, err := s.store.TableMetadata(r.Context(), table)
	if err != nil {
		writeMaybeConnectionError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleRows(w http.ResponseWriter, r *http.Request, table string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	filter := r.URL.Query().Get("filter")
	resp, err := s.store.TableRows(r.Context(), table, page, pageSize, filter)
	if err != nil {
		writeMaybeConnectionError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleSave(w http.ResponseWriter, r *http.Request, table string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB
	var payload SaveRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	resp, err := s.store.SaveChanges(r.Context(), table, payload)
	if err != nil {
		writeMaybeConnectionError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
	})
}

func spaHandler() http.Handler {
	distDir := filepath.Join("frontend", "dist")
	indexPath := filepath.Join(distDir, "index.html")
	fileServer := http.FileServer(http.Dir(distDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat(indexPath); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{
				"message": "frontend build not found",
			})
			return
		}

		path := filepath.Join(distDir, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, indexPath)
	})
}

func writeMaybeConnectionError(w http.ResponseWriter, err error) {
	if errors.Is(err, errNotConnected) || strings.Contains(err.Error(), "not connected") {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeError(w, http.StatusBadRequest, err.Error())
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
