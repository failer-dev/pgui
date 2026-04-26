package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	csrfAllowedOriginsEnv = "CSRF_ALLOWED_ORIGINS"
	csrfCookieName        = "pgui_csrf"
	csrfHeaderName        = "X-CSRF-Token"
	csrfTokenSize         = 32
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
	return loggingMiddleware(apiProtectionMiddleware(s.mux))
}

func (s *Server) routes() {
	s.mux.HandleFunc("/api/connection/status", s.handleConnectionStatus)
	s.mux.HandleFunc("/api/connection/connect", s.handleConnect)
	s.mux.HandleFunc("/api/schemas", s.handleSchemas)
	s.mux.HandleFunc("/api/sql/catalog", s.handleSQLCatalog)
	s.mux.HandleFunc("/api/sql/execute", s.handleSQLExecute)
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

func (s *Server) handleSQLCatalog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	resp, err := s.store.SQLCatalog(r.Context())
	if err != nil {
		writeMaybeConnectionError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleSQLExecute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20) // 2MB
	var payload SQLExecuteRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON payload")
		return
	}
	resp, err := s.store.ExecuteSQL(r.Context(), payload)
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

func apiProtectionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if shouldIssueCSRFCookie(r) {
			if err := ensureCSRFCookie(w, r); err != nil && strings.HasPrefix(r.URL.Path, "/api/") {
				writeError(w, http.StatusInternalServerError, "could not issue CSRF token")
				return
			}
		}
		if strings.HasPrefix(r.URL.Path, "/api/") && r.Method == http.MethodPost {
			if isCrossSiteFetch(r.Header.Get("Sec-Fetch-Site")) {
				writeError(w, http.StatusForbidden, "cross-site requests are not allowed")
				return
			}
			if !hasJSONContentType(r.Header.Get("Content-Type")) {
				writeError(w, http.StatusUnsupportedMediaType, "content type must be application/json")
				return
			}
			if !isAllowedAPIOrigin(r.Header.Get("Origin")) {
				writeError(w, http.StatusForbidden, "origin is not allowed")
				return
			}
			if requiresCSRFToken(r) && !hasValidCSRFToken(r) {
				writeError(w, http.StatusForbidden, "invalid CSRF token")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func hasJSONContentType(value string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(value, ";")[0]))
	return mediaType == "application/json"
}

func isAllowedAPIOrigin(origin string) bool {
	if strings.TrimSpace(origin) == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	switch strings.ToLower(parsed.Hostname()) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return isAllowedConfiguredOrigin(parsed)
	}
}

func isAllowedConfiguredOrigin(origin *url.URL) bool {
	normalized := normalizeOrigin(origin)
	if normalized == "" {
		return false
	}
	for _, allowed := range strings.Split(os.Getenv(csrfAllowedOriginsEnv), ",") {
		parsed, err := url.Parse(strings.TrimSpace(allowed))
		if err != nil {
			continue
		}
		if normalizeOrigin(parsed) == normalized {
			return true
		}
	}
	return false
}

func normalizeOrigin(origin *url.URL) string {
	if origin == nil || origin.Scheme == "" || origin.Host == "" {
		return ""
	}
	if (origin.Path != "" && origin.Path != "/") || origin.RawQuery != "" || origin.Fragment != "" {
		return ""
	}
	switch strings.ToLower(origin.Scheme) {
	case "http", "https":
	default:
		return ""
	}
	return strings.ToLower(origin.Scheme) + "://" + strings.ToLower(origin.Host)
}

func shouldIssueCSRFCookie(r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodPost:
		return true
	default:
		return false
	}
}

func ensureCSRFCookie(w http.ResponseWriter, r *http.Request) error {
	if cookie, err := r.Cookie(csrfCookieName); err == nil && isValidCSRFTokenValue(cookie.Value) {
		return nil
	}
	token, err := generateCSRFToken()
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     csrfCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int((12 * time.Hour).Seconds()),
		SameSite: http.SameSiteStrictMode,
		Secure:   isSecureRequest(r),
	})
	return nil
}

func generateCSRFToken() (string, error) {
	token := make([]byte, csrfTokenSize)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(token), nil
}

func isSecureRequest(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func isCrossSiteFetch(value string) bool {
	return strings.EqualFold(strings.TrimSpace(value), "cross-site")
}

func requiresCSRFToken(r *http.Request) bool {
	return strings.TrimSpace(r.Header.Get("Origin")) != "" || strings.TrimSpace(r.Header.Get("Sec-Fetch-Site")) != ""
}

func hasValidCSRFToken(r *http.Request) bool {
	cookie, err := r.Cookie(csrfCookieName)
	if err != nil || !isValidCSRFTokenValue(cookie.Value) {
		return false
	}
	header := r.Header.Get(csrfHeaderName)
	if !isValidCSRFTokenValue(header) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) == 1
}

func isValidCSRFTokenValue(value string) bool {
	if len(value) < 32 || len(value) > 128 {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil
}

func spaHandler() http.Handler {
	distDir := findFrontendDist()
	indexPath := filepath.Join(distDir, "index.html")
	fileServer := http.FileServer(http.Dir(distDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		setNoStoreHeaders(w)
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

func findFrontendDist() string {
	candidates := []string{
		filepath.Join("frontend", "dist"),
		filepath.Join("..", "frontend", "dist"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil {
			return candidate
		}
	}
	return candidates[0]
}

func setNoStoreHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
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
