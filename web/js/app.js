var project = null;
var currentFile = null;
var ws = null;
var token = localStorage.getItem('tauleaf_token');

var loginScreen = document.getElementById('login-screen');
var app = document.getElementById('app');
var accessCodeInput = document.getElementById('access-code');
var loginBtn = document.getElementById('login-btn');
var loginError = document.getElementById('login-error');

var editor = document.getElementById('editor');
var fileList = document.getElementById('file-list');
var currentFileEl = document.getElementById('current-file');
var pdfViewer = document.getElementById('pdf-viewer');
var recompileBtn = document.getElementById('recompile-btn');
var saveBtn = document.getElementById('save-btn');
var logoutBtn = document.getElementById('logout-btn');
var adminBtn = document.getElementById('admin-btn');
var adminModal = document.getElementById('admin-modal');
var closeAdminBtn = document.getElementById('close-admin');
var adminCodeEl = document.getElementById('admin-code');
var adminCreatedEl = document.getElementById('admin-created');
var regenerateBtn = document.getElementById('regenerate-btn');
var adminMessageEl = document.getElementById('admin-message');

function showLogin() {
    loginScreen.classList.remove('hidden');
    app.classList.add('hidden');
}

function showApp() {
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
}

function getAuthHeaders() {
    return { 'Authorization': token };
}

async function login() {
    var code = accessCodeInput.value.trim();
    if (!code) {
        loginError.textContent = 'Please enter access code';
        loginError.classList.remove('hidden');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Loading...';

    try {
        var resp = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_code: code })
        });

        if (!resp.ok) {
            throw new Error('Invalid access code');
        }

        var data = await resp.json();
        token = data.token;
        localStorage.setItem('tauleaf_token', token);

        showApp();
        await init();
    } catch (e) {
        loginError.textContent = 'Invalid access code';
        loginError.classList.remove('hidden');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
}

loginBtn.onclick = login;
accessCodeInput.onkeydown = function(e) {
    if (e.key === 'Enter') login();
};

logoutBtn.onclick = async function() {
    await fetch('/api/auth', {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    localStorage.removeItem('tauleaf_token');
    token = null;
    showLogin();
};

adminBtn.onclick = async function() {
    var resp = await fetch('/api/admin/config', { headers: getAuthHeaders() });
    var data = await resp.json();
    adminCodeEl.textContent = data.access_code;
    adminCreatedEl.textContent = new Date(data.created).toLocaleString();
    adminMessageEl.classList.add('hidden');
    adminModal.classList.remove('hidden');
};

closeAdminBtn.onclick = function() {
    adminModal.classList.add('hidden');
};

regenerateBtn.onclick = async function() {
    if (!confirm('Generate new access code? All current sessions will be invalidated.')) {
        return;
    }
    var resp = await fetch('/api/admin/regenerate', {
        method: 'POST',
        headers: getAuthHeaders()
    });
    var data = await resp.json();
    adminCodeEl.textContent = data.access_code;
    adminCreatedEl.textContent = new Date().toLocaleString();
    adminMessageEl.textContent = 'New code generated!';
    adminMessageEl.classList.remove('hidden');
};

var uploadBtn = document.getElementById('upload-btn');
var fileInput = document.getElementById('file-input');

uploadBtn.onclick = function() {
    fileInput.click();
};

fileInput.onchange = async function() {
    if (this.files.length === 0) return;

    var file = this.files[0];
    var formData = new FormData();
    formData.append('file', file);

    try {
        var resp = await fetch('/api/upload', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
        });

        if (!resp.ok) {
            var err = await resp.text();
            alert('Upload failed: ' + err);
            return;
        }

        var data = await resp.json();
        console.log('Uploaded:', data);
        await loadFiles();
    } catch (e) {
        alert('Upload failed: ' + e.message);
    }

    this.value = '';
};

async function checkAuth() {
    if (!token) {
        showLogin();
        return;
    }

    try {
        var resp = await fetch('/api/auth/validate', {
            headers: getAuthHeaders()
        });
        var data = await resp.json();

        if (data.valid) {
            showApp();
            await init();
        } else {
            localStorage.removeItem('tauleaf_token');
            token = null;
            showLogin();
        }
    } catch (e) {
        showLogin();
    }
}

async function init() {
    await loadProject();
    connectWebSocket();
    await loadFiles();
}

async function loadProject() {
    try {
        var resp = await fetch('/api/project', { headers: getAuthHeaders() });
        if (resp.status === 401) {
            localStorage.removeItem('tauleaf_token');
            showLogin();
            return;
        }
        project = await resp.json();
        
        if (project.files && project.files.length > 0) {
            var mainFile = project.mainTex || project.files[0];
            selectFile(mainFile);
        }
        
        refreshPDF();
    } catch (e) {
        console.error('Failed to load project:', e);
    }
}

function connectWebSocket() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + location.host + '/ws');
    
    ws.onmessage = function(e) {
        try {
            var msg = JSON.parse(e.data);
            handleWSMessage(msg);
        } catch (err) {
            console.error('WS message error:', err);
        }
    };
    
    ws.onclose = function() {
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = function(e) {
        console.error('WebSocket error:', e);
    };
}

function handleWSMessage(msg) {
    switch (msg.type) {
        case 'file-changed':
            if (msg.payload === currentFile) {
                loadFileContent(currentFile);
                var editorEl = document.getElementById('editor');
                editorEl.title = 'File changed by another user';
            }
            loadFiles();
            break;
            
        case 'compiling':
            recompileBtn.disabled = true;
            recompileBtn.textContent = msg.payload ? 'Compiling...' : 'Recompile';
            break;
            
        case 'pdf-ready':
            refreshPDF();
            recompileBtn.disabled = false;
            recompileBtn.textContent = 'Recompile';
            break;
            
        case 'error':
            console.error('Server error:', msg.payload);
            recompileBtn.disabled = false;
            recompileBtn.textContent = 'Recompile';
            break;
    }
}

async function loadFiles() {
    try {
        var resp = await fetch('/api/files', { headers: getAuthHeaders() });
        if (resp.status === 401) {
            showLogin();
            return;
        }
        var files = await resp.json();
        
        fileList.innerHTML = '';
        
        files.forEach(function(f) {
            var li = document.createElement('li');
            li.textContent = f;
            if (f === currentFile) {
                li.classList.add('active');
            }
            li.onclick = function() {
                selectFile(f);
            };
            fileList.appendChild(li);
        });
    } catch (e) {
        console.error('Failed to load files:', e);
    }
}

async function selectFile(file) {
    currentFile = file;
    currentFileEl.textContent = file;
    
    await loadFileContent(file);
    loadFiles();
}

async function loadFileContent(file) {
    try {
        var resp = await fetch('/api/file?name=' + encodeURIComponent(file), { headers: getAuthHeaders() });
        if (resp.status === 401) {
            showLogin();
            return;
        }
        if (resp.ok) {
            editor.value = await resp.text();
        }
    } catch (e) {
        console.error('Failed to load file:', e);
    }
}

function refreshPDF() {
    if (project && project.pdfPath) {
        pdfViewer.src = '/static/' + project.pdfPath + '?t=' + Date.now();
    }
}

recompileBtn.onclick = function() {
    recompileBtn.disabled = true;
    recompileBtn.textContent = 'Compiling...';

    fetch('/api/compile', {
        method: 'POST',
        headers: getAuthHeaders()
    }).then(function(resp) {
        return resp.json();
    }).then(function(data) {
        console.log('Compile response:', data);
        setTimeout(function() {
            recompileBtn.disabled = false;
            recompileBtn.textContent = 'Recompile';
            refreshPDF();
        }, 1000);
    }).catch(function(e) {
        console.error('Compile request failed:', e);
        recompileBtn.disabled = false;
        recompileBtn.textContent = 'Recompile';
    });
};

saveBtn.onclick = async function() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        var resp = await fetch('/api/save?name=' + encodeURIComponent(currentFile), {
            method: 'POST',
            headers: getAuthHeaders(),
            body: editor.value
        });

        if (!resp.ok) {
            throw new Error('Failed to save');
        }

        saveBtn.textContent = 'Saved!';
        setTimeout(function() {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }, 1000);
    } catch (e) {
        alert('Save failed: ' + e.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
    }
};

checkAuth();