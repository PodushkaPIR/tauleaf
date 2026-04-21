package types

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

func GenerateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

type Config struct {
	ProjectPath string
	MainTex     string
	Engine      string
	Addr        string
	AccessCode  string
}

type Project struct {
	Files    []string `json:"files"`
	MainTex  string   `json:"mainTex"`
	Engine  string   `json:"engine"`
	PDFPath string   `json:"pdfPath"`
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type Comment struct {
	ID        string    `json:"id"`
	File    string    `json:"file"`
	Start   int       `json:"start"`
	End     int       `json:"end"`
	Text    string    `json:"text"`
	Author  string    `json:"author"`
	Content string    `json:"content"`
}

type AccessConfig struct {
	AccessCode string    `json:"access_code"`
	Created    time.Time `json:"created"`
}

type AuthRequest struct {
	AccessCode string `json:"access_code"`
}

type AuthResponse struct {
	Token string `json:"token"`
}

type Session struct {
	Token   string    `json:"token"`
	Created time.Time `json:"created"`
}

type SessionStore struct {
	sessions map[string]*Session
}
