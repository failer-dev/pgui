FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/ .
RUN npm ci
RUN npm run build

FROM golang:1.26-alpine AS backend-build
WORKDIR /app
COPY backend/ .
RUN go mod download
RUN go build -o /pgui .

FROM alpine:3.21
WORKDIR /app
ENV PORT=8080
COPY --from=backend-build /pgui /usr/local/bin/pgui
COPY --from=frontend-build /app/dist ./frontend/dist
RUN adduser -D -H appuser
USER appuser
EXPOSE 8080
CMD ["pgui"]
