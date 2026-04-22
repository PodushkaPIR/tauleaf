package main

import (
	"flag"
	"log"
	"net/http"
	"path/filepath"

	"tauleaf/internal/auth"
	"tauleaf/internal/compile"
	"tauleaf/internal/handlers"
	"tauleaf/internal/types"
)

func main() {
	addr := flag.String("addr", "8080", "HTTP server address")
	projectPath := flag.String("project", ".", "path to LaTeX project")
	mainTex := flag.String("main", "", "main .tex file to compile")
	engine := flag.String("engine", "lualatex", "latex engine: pdflatex, xelatex, lualatex")
	webDir := flag.String("web", "./web", "path to web static files")
	accessCode := flag.String("access-code", "", "access code for authentication (auto-generated if empty)")
	publicMode := flag.Bool("public", false, "enable public mode with limited access")
	publicCode := flag.String("public-code", "demo", "access code for public mode")
	publicLimit := flag.Int("public-limit", 10, "max files in public mode")
	publicProject := flag.String("public-project", "", "path to public project (separate folder)")
	flag.Parse()

	absProjectPath, _ := filepath.Abs(*projectPath)
	absWebPath, _ := filepath.Abs(*webDir)
	absPublicProjectPath := absProjectPath

	if *publicMode && *publicProject != "" {
		absPublicProjectPath, _ = filepath.Abs(*publicProject)
	}

	if *mainTex == "" {
		*mainTex = compile.FindMainTex(absProjectPath)
	}

	log.Printf("tauleaf starting on %s (project: %s, public: %v, web: %s, engine: %s)",
		*addr, absProjectPath, *publicMode, absWebPath, *engine)

	a := auth.New(absProjectPath, *accessCode, *publicMode, *publicCode)
	a.SaveConfig()

	if *publicMode {
		log.Printf("public mode: code=%s, limit=%d, project=%s", *publicCode, *publicLimit, absPublicProjectPath)
	}

	log.Printf("access code: %s", a.GetAccessCode())

	cfg := &types.Config{
		ProjectPath:       absProjectPath,
		PublicProjectPath: absPublicProjectPath,
		MainTex:          *mainTex,
		Engine:           *engine,
		Addr:             *addr,
		AccessCode:       a.GetAccessCode(),
		PublicMode:       *publicMode,
		PublicCode:       *publicCode,
		PublicLimit:      *publicLimit,
	}

	mux := http.NewServeMux()
	handlers.Register(mux, cfg, absWebPath, a)

	err := http.ListenAndServe("0.0.0.0:"+*addr, mux)
	if err != nil {
		log.Println("Server stopped:", err)
	}
}