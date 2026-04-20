var project = null;
var currentFile = null;
var ws = null;

var editor = document.getElementById('editor');
var fileList = document.getElementById('file-list');
var currentFileEl = document.getElementById('current-file');
var pdfViewer = document.getElementById('pdf-viewer');
var recompileBtn = document.getElementById('recompile-btn');

async function init() {
    await loadProject();
    connectWebSocket();
    await loadFiles();
}

async function loadProject() {
    try {
        var resp = await fetch('/api/project');
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
        var resp = await fetch('/api/files');
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
        var resp = await fetch('/api/file?name=' + encodeURIComponent(file));
        if (resp.ok) {
            editor.textContent = await resp.text();
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
        method: 'POST'
    }).then(function(resp) {
        return resp.json();
    }).then(function(data) {
        console.log('Compile response:', data);
        // Enable button after response (compilation runs async)
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

init();
