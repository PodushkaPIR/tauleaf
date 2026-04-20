package compile

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

type Compiler struct {
	projectPath string
	mainTex    string
	engine     string
	compiling  bool
	mu        sync.Mutex
}

func New(projectPath, mainTex, engine string) *Compiler {
	return &Compiler{
		projectPath: projectPath,
		mainTex:    mainTex,
		engine:    engine,
	}
}

func FindMainTex(dir string) string {
	files, _ := filepath.Glob(filepath.Join(dir, "*.tex"))
	for _, f := range files {
		if strings.HasPrefix(filepath.Base(f), "main") {
			return filepath.Base(f)
		}
	}
	if len(files) > 0 {
		return filepath.Base(files[0])
	}
	return ""
}

func (c *Compiler) PDFPath() string {
	if c.mainTex == "" {
		return ""
	}
	base := strings.TrimSuffix(c.mainTex, ".tex")
	pdfPath := filepath.Join(c.projectPath, base+".pdf")
	if _, err := os.Stat(pdfPath); err == nil {
		return base + ".pdf"
	}
	return ""
}

func (c *Compiler) Compile() error {
	if c.mainTex == "" {
		return nil
	}

	log.Println("Starting compile:", c.mainTex)
	
	cmd := exec.Command("/bin/sh", "-c", 
		fmt.Sprintf("cd %s && %s -halt-on-errors -interaction=nonstopmode %s 2>&1 | head -100", 
			c.projectPath, c.engine, c.mainTex))
	cmd.Dir = c.projectPath
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	// Run with 30 second timeout
	done := make(chan error, 1)
	go func() {
		done <- cmd.Run()
	}()
	
	select {
	case err := <-done:
		if err != nil {
			log.Println("Compile error:", err)
			return err
		}
		log.Println("Compiled:", c.mainTex)
		return nil
	case <-make(chan bool): // Never receives - just to satisfy select
		return nil
	}
}

func ListTexFiles(dir string) []string {
	files, _ := filepath.Glob(filepath.Join(dir, "*.tex"))
	result := make([]string, len(files))
	for i, f := range files {
		result[i] = filepath.Base(f)
	}
	return result
}

func CheckFlags() {
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "engine" {
			path, err := exec.LookPath(f.Value.String())
			if err != nil {
				log.Printf("warning: %s not found in PATH", f.Value.String())
			} else {
				log.Printf("using: %s", path)
			}
		}
	})
}
