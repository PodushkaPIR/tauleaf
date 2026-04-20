package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gorilla/websocket"

	"tauleaf/internal/compile"
	"tauleaf/internal/types"
)

var webRoot string

type Handler struct {
	cfg      *types.Config
	upgrader websocket.Upgrader
	clients  map[*websocket.Conn]bool
}

func New(cfg *types.Config, webDir string) *Handler {
	webRoot = webDir
	return &Handler{
		cfg:      cfg,
		upgrader: websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		clients:  make(map[*websocket.Conn]bool),
	}
}

func Register(mux *http.ServeMux, cfg *types.Config, webDir string) {
	h := New(cfg, webDir)

	fs := http.FileServer(http.Dir(webDir))
	mux.Handle("/", fs)

	// API endpoints
	mux.HandleFunc("/api/project", h.handleProject)
	mux.HandleFunc("/api/files", h.handleFiles)
	mux.HandleFunc("/api/file", h.handleFile)
	mux.HandleFunc("/api/compile", h.handleCompile)

	// WebSocket
	mux.HandleFunc("/ws", h.handleWS)

	mux.HandleFunc("/static/", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/static/")
		path := filepath.Join(h.cfg.ProjectPath, name)

		fi, err := os.Stat(path)
		if err != nil || fi.IsDir() {
			http.NotFound(w, r)
			return
		}

		switch {
		case strings.HasSuffix(name, ".pdf"):
			w.Header().Set("Content-Type", "application/pdf")
		case strings.HasSuffix(name, ".tex"):
			w.Header().Set("Content-Type", "text/plain")
		default:
			w.Header().Set("Content-Type", "application/octet-stream")
		}

		http.ServeFile(w, r, path)
	})
}

// handleProject returns project metadata as JSON
func (h *Handler) handleProject(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// Note: We're ignoring errors from ListTexFiles
	files := compile.ListTexFiles(h.cfg.ProjectPath)
	if files == nil {
		files = []string{}
	}
	jsonEncode(w, types.Project{
		Files:    files,
		MainTex:  h.cfg.MainTex,
		Engine:   h.cfg.Engine,
		PDFPath:  compile.New(h.cfg.ProjectPath, h.cfg.MainTex, h.cfg.Engine).PDFPath(),
	})
}

func (h *Handler) handleFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	files := compile.ListTexFiles(h.cfg.ProjectPath)
	if files == nil {
		files = []string{}
	}
	jsonEncode(w, files)
}

func (h *Handler) handleFile(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "missing file name", http.StatusBadRequest)
		return
	}

	path := filepath.Join(h.cfg.ProjectPath, name)
	content, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Write(content)
}

func (h *Handler) handleCompile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	jsonEncode(w, map[string]string{"status": "started"})

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				log.Println("compile goroutine recovered:", rec)
			}
		}()
		
		c := compile.New(h.cfg.ProjectPath, h.cfg.MainTex, h.cfg.Engine)
		err := c.Compile()
		if err != nil {
			log.Println("compile error:", err)
		}
		log.Println("compile done")
	}()
}

func (h *Handler) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("websocket upgrade error:", err)
		return
	}
	h.clients[conn] = true
	defer delete(h.clients, conn)

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func jsonEncode(w http.ResponseWriter, v any) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Println("json encode error:", err)
	}
}
