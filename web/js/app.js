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

var cmEditor = null;

function initEditor() {
    if (cmEditor) return;
    var fallback = document.getElementById('editor-fallback');

    if (typeof CodeMirror6 !== 'undefined') {
        var container = document.getElementById('editor-container');
        container.innerHTML = '';
        cmEditor = CodeMirror6.createEditor(container, {
            initialContent: '',
            onChange: function() {
                saveBtn.textContent = 'Save*';
            }
        });
    } else {
        editor = fallback;
        fallback.classList.remove('hidden');
    }
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    app.classList.add('hidden');
}

function showApp() {
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    initEditor();
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
    if (project.publicMode) return;

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
var folderBtn = document.getElementById('folder-btn');
var fileBtn = document.getElementById('file-btn');
var fileInput = document.getElementById('file-input');

uploadBtn.onclick = function() {
    fileInput.click();
};

folderBtn.onclick = function() {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'folder-input';
    input.placeholder = 'folder name...';
    input.onkeydown = function(e) {
        if (e.key === 'Enter' && input.value.trim()) {
            createFolder(input.value.trim());
            input.remove();
        }
        if (e.key === 'Escape') {
            input.remove();
        }
    };
    input.onblur = function() { input.remove(); };
    fileList.appendChild(input);
    input.focus();
};

fileBtn.onclick = function() {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'folder-input';
    input.placeholder = 'file.tex...';
    input.onkeydown = function(e) {
        if (e.key === 'Enter' && input.value.trim()) {
            var name = input.value.trim();
            if (!name.endsWith('.tex')) name += '.tex';
            createFile(name);
            input.remove();
        }
        if (e.key === 'Escape') {
            input.remove();
        }
    };
    input.onblur = function() { input.remove(); };
    fileList.appendChild(input);
    input.focus();
};

async function createFile(name) {
    var content = '';
    var resp = await fetch('/api/save?name=' + encodeURIComponent(name), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: content
    });

    if (resp.ok) {
        loadFiles();
    }
}

async function createFolder(name) {
    var resp = await fetch('/api/mkdir?name=' + encodeURIComponent(name), {
        method: 'POST',
        headers: getAuthHeaders()
    });

    if (resp.ok) {
        loadFiles();
    }
}

fileInput.onchange = async function() {
    if (this.files.length === 0) return;

    var formData = new FormData();
    for (var i = 0; i < this.files.length; i++) {
        formData.append('files', this.files[i]);
    }

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
        console.log('Uploaded:', data.count, 'files');
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

    if (project.publicMode) {
        adminBtn.classList.add('hidden');
    }
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

        var foldersResp = await fetch('/api/folders', { headers: getAuthHeaders() });
        var folders = foldersResp.ok ? await foldersResp.json() : [];

        fileList.innerHTML = '';

        var expandedFolders = {};

        var grouped = {};
        files.forEach(function(f) {
            var parts = f.split('/');
            var folder = parts.length > 1 ? parts[0] : '';
            if (!grouped[folder]) grouped[folder] = [];
            grouped[folder].push(f);
        });

        folders.sort().forEach(function(folder) {
            var folderLi = document.createElement('li');
            folderLi.className = 'folder expanded';
            folderLi.setAttribute('data-folder', folder);
            folderLi.innerHTML = '<span class="folder-icon fa fa-folder-open"></span><span class="folder-name">' + folder + '</span><button class="del-btn fa fa-trash"></button>';
            folderLi.onclick = function() {
                this.classList.toggle('expanded');
                this.classList.toggle('collapsed');
                var icon = this.querySelector('.folder-icon');
                if (icon) {
                    icon.classList.toggle('fa-folder-open');
                    icon.classList.toggle('fa-folder');
                }
                var filesUl = this.nextSibling;
                if (filesUl && filesUl.classList && filesUl.classList.contains('folder-files')) {
                    filesUl.style.display = this.classList.contains('expanded') ? 'block' : 'none';
                }
            };
            folderLi.ondragover = function(e) { e.preventDefault(); this.classList.add('drag-over'); };
            folderLi.ondragleave = function(e) { this.classList.remove('drag-over'); };
            folderLi.ondrop = function(e) {
                e.preventDefault();
                this.classList.remove('drag-over');
                var fileName = e.dataTransfer.getData('text/plain');
                if (fileName) {
                    moveFile(fileName, folder + '/' + fileName.split('/').pop());
                }
            };
            folderLi.onmouseover = function() { this.querySelector('.del-btn').style.opacity = '1'; };
            folderLi.onmouseout = function() { this.querySelector('.del-btn').style.opacity = ''; };
            folderLi.querySelector('.del-btn').onclick = function(e) {
                e.stopPropagation();
                if (!confirm('Delete folder "' + folder + '" and all its files?')) return;
                deleteFolder(folder);
            };
            fileList.appendChild(folderLi);

            var filesUl = document.createElement('ul');
            filesUl.className = 'folder-files';

            if (grouped[folder]) {
                grouped[folder].forEach(function(f) {
                    var li = createFileElement(f);
                    filesUl.appendChild(li);
                });
            }

            fileList.appendChild(filesUl);
        });

        if (grouped[''] && grouped[''].length > 0) {
            grouped[''].forEach(function(f) {
                var li = createFileElement(f);
                fileList.appendChild(li);
            });
        }
    } catch (e) {
        console.error('Failed to load files:', e);
    }
}

function createFileElement(f) {
    var li = document.createElement('li');
    li.setAttribute('draggable', 'true');
    li.setAttribute('data-file', f);
    li.ondragstart = function(e) { e.dataTransfer.setData('text/plain', f); };
    var ext = f.split('.').pop().toLowerCase();
    var isTex = ext === 'tex';

    var icon = isTex ? 'fa fa-file-code' : 'fa fa-file';

    var nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.innerHTML = '<span class="' + icon + '"></span><span class="file-name-text">' + f + '</span>';
    nameSpan.style.flex = '1';
    if (!isTex) {
        nameSpan.style.color = '#888';
        nameSpan.title = 'View only (.' + ext + ')';
    }
    nameSpan.onclick = function() {
        selectFile(f);
    };

    var delBtn = document.createElement('button');
    delBtn.innerHTML = '<span class="fa fa-trash"></span>';
    delBtn.className = 'del-btn';
    delBtn.onclick = function(e) {
        e.stopPropagation();
        if (!confirm('Delete ' + f + '?')) return;
        fetch('/api/delete?name=' + encodeURIComponent(f), {
            method: 'POST',
            headers: getAuthHeaders()
        }).then(function() {
            loadFiles();
        });
    };

    li.appendChild(nameSpan);
    li.appendChild(delBtn);

    if (f === currentFile) {
        li.classList.add('active');
    }

    return li;
}

async function deleteFolder(name) {
    var resp = await fetch('/api/rmdir?name=' + encodeURIComponent(name), {
        method: 'POST',
        headers: getAuthHeaders()
    });

    if (resp.ok) {
        loadFiles();
    }
}

async function moveFile(oldPath, newPath) {
    try {
        var contentResp = await fetch('/api/file?name=' + encodeURIComponent(oldPath), { headers: getAuthHeaders() });
        var content = await contentResp.text();

        var saveResp = await fetch('/api/save?name=' + encodeURIComponent(newPath), {
            method: 'POST',
            headers: getAuthHeaders(),
            body: content
        });

        if (!saveResp.ok) throw new Error('Failed to save');

        var delResp = await fetch('/api/delete?name=' + encodeURIComponent(oldPath), {
            method: 'POST',
            headers: getAuthHeaders()
        });

        loadFiles();
    } catch (e) {
        alert('Failed to move file: ' + e.message);
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
            var content = await resp.text();
            if (cmEditor) {
                CodeMirror6.setValue(cmEditor, content);
            } else {
                editor.value = content;
            }
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

    var content = cmEditor ? CodeMirror6.getValue(cmEditor) : editor.value;

    try {
        var resp = await fetch('/api/save?name=' + encodeURIComponent(currentFile), {
            method: 'POST',
            headers: getAuthHeaders(),
            body: content
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