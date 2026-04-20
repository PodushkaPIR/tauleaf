package types

type Config struct {
	ProjectPath string
	MainTex     string
	Engine     string
	Addr       string
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
