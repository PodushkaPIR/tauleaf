package main

import (
	"flag"
	"log"
	"net/http"
	"path/filepath"

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
	flag.Parse()

	absProjectPath, _ := filepath.Abs(*projectPath)
	absWebPath, _ := filepath.Abs(*webDir)

	if *mainTex == "" {
		*mainTex = compile.FindMainTex(absProjectPath)
	}

	log.Printf("tauleaf starting on %s (project: %s, web: %s, engine: %s)", 
		*addr, absProjectPath, absWebPath, *engine)

	cfg := &types.Config{
		ProjectPath: absProjectPath,
		MainTex:     *mainTex,
		Engine:     *engine,
		Addr:       *addr,
	}

	mux := http.NewServeMux()
	handlers.Register(mux, cfg, absWebPath)

	err := http.ListenAndServe("0.0.0.0:"+*addr, mux)
	if err != nil {
		log.Println("Server stopped:", err)
	}
}
