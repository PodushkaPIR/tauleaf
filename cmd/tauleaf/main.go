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
	flag.Parse()

	absProjectPath, _ := filepath.Abs(*projectPath)
	absWebPath, _ := filepath.Abs(*webDir)

	if *mainTex == "" {
		*mainTex = compile.FindMainTex(absProjectPath)
	}

	log.Printf("tauleaf starting on %s (project: %s, web: %s, engine: %s)",
		*addr, absProjectPath, absWebPath, *engine)

	a := auth.New(absProjectPath, *accessCode)
	a.SaveConfig()
	log.Printf("access code: %s", a.GetAccessCode())

	cfg := &types.Config{
		ProjectPath: absProjectPath,
		MainTex:     *mainTex,
		Engine:     *engine,
		Addr:       *addr,
		AccessCode: a.GetAccessCode(),
	}

	mux := http.NewServeMux()
	handlers.Register(mux, cfg, absWebPath, a)

	err := http.ListenAndServe("0.0.0.0:"+*addr, mux)
	if err != nil {
		log.Println("Server stopped:", err)
	}
}
