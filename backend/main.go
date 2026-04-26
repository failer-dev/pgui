package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"strings"
)

func main() {
	host := strings.TrimSpace(os.Getenv("HOST"))
	if host == "" {
		host = "127.0.0.1"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := NewServer()
	addr := net.JoinHostPort(host, port)
	log.Printf("pgui listening on %s", addr)
	if err := http.ListenAndServe(addr, server.Handler()); err != nil {
		log.Fatal(err)
	}
}
