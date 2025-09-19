const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
};

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'text/plain';
}

function serveFile(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found: ' + filePath);
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Server error: ' + err.message);
            }
            return;
        }

        const mimeType = getMimeType(filePath);
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let filePath = parsedUrl.pathname;

    // Handle root - serve the main index.html
    if (filePath === '/') {
        filePath = '/index.html';
    }

    // Security: prevent directory traversal
    if (filePath.includes('..')) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad request');
        return;
    }

    // Serve from project root
    const fullPath = path.join(__dirname, filePath);
    serveFile(fullPath, res);
});

server.listen(PORT, () => {
    console.log(`🚀 LineMaker server running at http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${__dirname}`);
    console.log(`🎯 Available tools:`);
    console.log(`   • Main page: http://localhost:${PORT}`);
    console.log(`   • Pipe Maze: http://localhost:${PORT}/pipemaze/`);
    console.log(`   • Kaleidoscope: http://localhost:${PORT}/kaleidoscope/`);
    console.log(`   • Field Lines: http://localhost:${PORT}/fieldlines/`);
    console.log(`🔄 Use Ctrl+C to stop the server`);
});