package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func testCSRFToken(t *testing.T) string {
	t.Helper()
	token, err := generateCSRFToken()
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func addCSRFToken(req *http.Request, token string) {
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: token})
	req.Header.Set(csrfHeaderName, token)
}

func TestAPIProtectionMiddlewareRejectsInvalidContentType(t *testing.T) {
	handler := apiProtectionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/sql/execute", nil)
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Origin", "http://localhost:8080")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnsupportedMediaType)
	}
}

func TestAPIProtectionMiddlewareRejectsExternalOrigin(t *testing.T) {
	handler := apiProtectionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/sql/execute", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://example.com")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAPIProtectionMiddlewareAllowsLocalOriginsAndCLIPosts(t *testing.T) {
	tests := []struct {
		name      string
		origin    string
		withToken bool
	}{
		{name: "localhost", origin: "http://localhost:8080", withToken: true},
		{name: "ipv4", origin: "http://127.0.0.1:8080", withToken: true},
		{name: "ipv6", origin: "http://[::1]:8080", withToken: true},
		{name: "no origin", origin: "", withToken: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := apiProtectionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			req := httptest.NewRequest(http.MethodPost, "/api/sql/execute", nil)
			req.Header.Set("Content-Type", "application/json; charset=utf-8")
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if tt.withToken {
				addCSRFToken(req, testCSRFToken(t))
			}
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
			}
		})
	}
}

func TestAPIProtectionMiddlewareRejectsMissingCSRFTokenForBrowserPost(t *testing.T) {
	handler := apiProtectionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/sql/execute", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://localhost:8080")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAPIProtectionMiddlewareRejectsMismatchedCSRFToken(t *testing.T) {
	handler := apiProtectionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/sql/execute", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://localhost:8080")
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: testCSRFToken(t)})
	req.Header.Set(csrfHeaderName, testCSRFToken(t))
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAPIProtectionMiddlewareRejectsCrossSiteFetchMetadata(t *testing.T) {
	handler := apiProtectionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/sql/execute", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAPIProtectionMiddlewareAllowsConfiguredOrigin(t *testing.T) {
	t.Setenv(csrfAllowedOriginsEnv, "https://pgui.example.internal")
	handler := apiProtectionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPost, "/api/sql/execute", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://pgui.example.internal")
	addCSRFToken(req, testCSRFToken(t))
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestAPIProtectionMiddlewareIssuesCSRFCookie(t *testing.T) {
	handler := apiProtectionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/connection/status", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == csrfCookieName && isValidCSRFTokenValue(cookie.Value) {
			return
		}
	}
	t.Fatalf("missing valid %s cookie", csrfCookieName)
}
