package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := NewServer()
	log.Printf("pgui listening on :%s", port)
	if err := http.ListenAndServe(":"+port, server.Handler()); err != nil {
		log.Fatal(err)
	}
}
