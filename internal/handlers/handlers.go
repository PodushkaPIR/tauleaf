package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gorilla/websocket"

	"tauleaf/internal/auth"
	"tauleaf/internal/compile"
	"tauleaf/internal/types"
)

var webRoot string

type Handler struct {
	cfg      *types.Config
	upgrader websocket.Upgrader
	clients  map[*websocket.Conn]bool
	auth     *auth.Auth
}

func New(cfg *types.Config, webDir string, auth *auth.Auth) *Handler {
	webRoot = webDir
	return &Handler{
		cfg:      cfg,
		upgrader: websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
		clients:  make(map[*websocket.Conn]bool),
		auth:     auth,
	}
}

func Register(mux *http.ServeMux, cfg *types.Config, webDir string, auth *auth.Auth) {
	h := New(cfg, webDir, auth)

	fs := http.FileServer(http.Dir(webDir))
	mux.Handle("/", fs)

	// Auth endpoints (public)
	mux.HandleFunc("/api/auth", h.handleAuth)
	mux.HandleFunc("/api/auth/validate", h.handleValidate)

	// Admin endpoints (protected)
	mux.HandleFunc("/api/admin/config", h.requireAuth(h.handleAdminConfig))
	mux.HandleFunc("/api/admin/regenerate", h.requireAuth(h.handleAdminRegenerate))

	// Protected endpoints
	mux.HandleFunc("/api/project", h.requireAuth(h.handleProject))
	mux.HandleFunc("/api/files", h.requireAuth(h.handleFiles))
	mux.HandleFunc("/api/file", h.requireAuth(h.handleFile))
	mux.HandleFunc("/api/compile", h.requireAuth(h.handleCompile))
	mux.HandleFunc("/api/upload", h.requireAuth(h.handleUpload))

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

func (h *Handler) requireAuth(fn func(http.ResponseWriter, *http.Request)) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("Authorization")
		if token == "" {
			token = r.URL.Query().Get("token")
		}
		if token == "" || !h.auth.Validate(token) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		fn(w, r)
	}
}

func (h *Handler) handleAuth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodPost {
		var req types.AuthRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		token, err := h.auth.Login(req.AccessCode)
		if err != nil {
			http.Error(w, "invalid access code", http.StatusUnauthorized)
			return
		}

		jsonEncode(w, types.AuthResponse{Token: token})
		return
	}

	if r.Method == http.MethodDelete {
		token := r.Header.Get("Authorization")
		h.auth.Logout(token)
		jsonEncode(w, map[string]string{"status": "logged out"})
		return
	}

	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func (h *Handler) handleValidate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	token := r.Header.Get("Authorization")
	if token == "" {
		token = r.URL.Query().Get("token")
	}

	valid := h.auth.Validate(token)
	jsonEncode(w, map[string]bool{"valid": valid})
}

func (h *Handler) handleAdminConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodGet {
		jsonEncode(w, map[string]interface{}{
			"access_code": h.auth.GetAccessCode(),
			"created":     h.auth.GetCreated(),
		})
		return
	}

	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func (h *Handler) handleAdminRegenerate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodPost {
		newCode := h.auth.Regenerate()
		jsonEncode(w, map[string]string{
			"access_code": newCode,
		})
		return
	}

	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func (h *Handler) handleUpload(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "failed to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "no file provided", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".tex") {
		http.Error(w, "only .tex files allowed", http.StatusBadRequest)
		return
	}

	dstPath := filepath.Join(h.cfg.ProjectPath, header.Filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		http.Error(w, "failed to create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(dstPath)
		http.Error(w, "failed to save file", http.StatusInternalServerError)
		return
	}

	jsonEncode(w, map[string]string{
		"name": header.Filename,
		"status": "uploaded",
	})
}
