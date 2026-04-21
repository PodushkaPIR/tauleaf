package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"tauleaf/internal/types"
)

type Auth struct {
	mu           sync.RWMutex
	sessions     map[string]*types.Session
	accessCode  string
	created     time.Time
	configPath  string
}

func New(projectPath, accessCode string) *Auth {
	if accessCode == "" {
		accessCode = generateAccessCode()
	}

	dir := filepath.Join(projectPath, ".tauleaf")
	os.MkdirAll(dir, 0755)

	created := time.Now()

	return &Auth{
		sessions:    make(map[string]*types.Session),
		accessCode: accessCode,
		created:     created,
		configPath: filepath.Join(dir, "config.json"),
	}
}

func generateAccessCode() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (a *Auth) SaveConfig() error {
	cfg := types.AccessConfig{
		AccessCode: a.accessCode,
		Created:    time.Now(),
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath, data, 0644)
}

func (a *Auth) GetAccessCode() string {
	return a.accessCode
}

func (a *Auth) Login(code string) (string, error) {
	if code != a.accessCode {
		return "", fmt.Errorf("invalid access code")
	}

	token := types.GenerateToken()
	a.mu.Lock()
	a.sessions[token] = &types.Session{
		Token:   token,
		Created: time.Now(),
	}
	a.mu.Unlock()

	return token, nil
}

func (a *Auth) Validate(token string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if sess, ok := a.sessions[token]; ok {
		return time.Since(sess.Created) < 24*time.Hour
	}
	return false
}

func (a *Auth) Logout(token string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.sessions, token)
}

func (a *Auth) GetCreated() time.Time {
	return a.created
}

func (a *Auth) Regenerate() string {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.accessCode = generateAccessCode()
	a.created = time.Now()

	cfg := types.AccessConfig{
		AccessCode: a.accessCode,
		Created:    a.created,
	}
	data, _ := json.MarshalIndent(cfg, "", "  ")
	os.WriteFile(a.configPath, data, 0644)

	a.sessions = make(map[string]*types.Session)

	return a.accessCode
}