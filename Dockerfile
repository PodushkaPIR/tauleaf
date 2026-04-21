FROM golang:1.24-bookworm AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/*

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /tauleaf ./cmd/tauleaf

RUN npm install && node build-editor.js

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-luatex \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -s /bin/bash appuser

WORKDIR /app

COPY --from=builder /tauleaf /usr/local/bin/
COPY --from=builder /app/web ./web/

RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

CMD ["tauleaf", "-web", "/app/web", "-addr", "8080"]
