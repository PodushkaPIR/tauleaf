# tauleaf

Self-hosted local LaTeX collaboration tool with real-time PDF preview.

**Live demo:** https://tauleaf.ru

Code: `demo` (public mode, limited to 9 files)

## Features

- **Local compilation** - all processing happens on your machine
- **Real-time PDF preview** - see compiled output in browser
- **Multi-file support** - edit multiple .tex files
- **Web browser interface** - works on any device
- **Real-time sync** - updates when files change
- **Public mode** - share access with limited permissions

## Quick Start

### 0. Build

```bash
go build -o tauleaf ./cmd/tauleaf
```

### 1. Run

```bash
# Basic (your private project)
./tauleaf -project ./private-project -main main.tex

# With public mode (two separate projects)
./tauleaf -project ./private-project \
    -public \
    -public-code demo \
    -public-project ./public-project \
    -main main.tex
```

### 2. Open

```
http://localhost:8079
```

Enter your access code to start editing.

## Command Line Options

| Flag | Default | Description |
|------|---------|-------------|
| `-project` | `.` | Path to your project (admin) |
| `-main` | auto | Main .tex file to compile |
| `-engine` | `lualatex` | LaTeX engine |
| `-web` | `./web` | Path to web files |
| `-addr` | `8079` | HTTP server port |
| `-access-code` | auto | Your admin code |
| `-public` | - | Enable public mode |
| `-public-code` | `demo` | Public access code |
| `-public-limit` | 9 | File limit for public |
| `-public-project` | - | Separate folder for public users |

### Example with Both Modes

```bash
./tauleaf \
    -project ./my-project \
    -access-code SECRET122 \
    -public \
    -public-code demo \
    -public-project ./demo-files \
    -main main.tex \
    -addr 8079
```

- **Admin** (`SECRET122`) → works with `./my-project`
- **Public** (`demo`) → works with `./demo-files`

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth` | POST | Login with access code |
| `/api/project` | GET | Project metadata |
| `/api/files` | GET | List all .tex files |
| `/api/file?name=x.tex` | GET | File content |
| `/api/save?name=x.tex` | POST | Save file |
| `/api/compile` | POST | Compile to PDF |
| `/ws` | WebSocket | Real-time updates |
| `/static/*` | GET | Serve PDF/files |

## Troubleshooting

### Can't connect

0. Check if running: `curl http://localhost:8080/api/project`
1. Check firewall: `sudo firewall-cmd --list-all`

### Compilation fails

0. Check LaTeX: `which lualatex`
1. Test manually: `lualatex main.tex`
2. Check logs in project directory

### Docker permission denied

If you get "Permission denied" on mounted volume:

```bash
# Temporarily disable SELinux
setenforce -1

# Or fix label
chcon -Rt svirt_sandbox_file_t your-project/
```

## Future Plans

- [ ] Multiple projects support
- [ ] User accounts and sessions
- [ ] File templates
- [ ] Share links with expiration
- [ ] PDF annotations
- [ ] Export to other formats
- [ ] Mobile-friendly UI

