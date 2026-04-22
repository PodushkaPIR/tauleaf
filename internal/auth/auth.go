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
	mu          sync.RWMutex
	sessions    map[string]*types.Session
	adminCode   string
	created    time.Time
	configPath string
	public    bool
	publicCode string
}

func New(projectPath, adminCode string, public bool, publicCode string) *Auth {
	dir := filepath.Join(projectPath, ".tauleaf")
	os.MkdirAll(dir, 0755)

	created := time.Now()

	if adminCode == "" {
		adminCode = generateAccessCode()
	}

	return &Auth{
		sessions:   make(map[string]*types.Session),
		adminCode:  adminCode,
		created:   created,
		configPath: filepath.Join(dir, "config.json"),
		public:    public,
		publicCode: publicCode,
	}
}

func generateAccessCode() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (a *Auth) SaveConfig() error {
	cfg := types.AccessConfig{
		AccessCode: a.adminCode,
		Created:    time.Now(),
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath, data, 0644)
}

func (a *Auth) GetAccessCode() string {
	return a.adminCode
}

func (a *Auth) IsPublicMode() bool {
	return a.public
}

func (a *Auth) GetPublicCode() string {
	return a.publicCode
}

func (a *Auth) GetPublicLimit() int {
	if a.public {
		return 10
	}
	return 0
}

func (a *Auth) Login(code string) (string, error) {
	if code != a.adminCode && code != a.publicCode {
		return "", fmt.Errorf("invalid access code")
	}

	isPublic := code == a.publicCode

	token := types.GenerateToken()
	a.mu.Lock()
	a.sessions[token] = &types.Session{
		Token:    token,
		Created:  time.Now(),
		IsPublic: isPublic,
		IsAdmin:  !isPublic,
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

func (a *Auth) GetSession(token string) *types.Session {
	a.mu.RLock()
	defer a.mu.RUnlock()

	if sess, ok := a.sessions[token]; ok {
		if time.Since(sess.Created) < 24*time.Hour {
			return sess
		}
	}
	return nil
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

	a.adminCode = generateAccessCode()
	a.created = time.Now()

	cfg := types.AccessConfig{
		AccessCode: a.adminCode,
		Created:    a.created,
	}
	data, _ := json.MarshalIndent(cfg, "", "  ")
	os.WriteFile(a.configPath, data, 0644)

	a.sessions = make(map[string]*types.Session)

	return a.adminCode
}
