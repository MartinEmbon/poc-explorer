const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Config
const PORT = process.env.PORT || 3001;
const TARGET = process.env.MCP_ENDPOINT || 'https://test.godigibee.io/pipeline/digibee/v1/poc-capes-v2/mcp';

let sessionId = null;
let requestId = 1;

// --- MCP Functions ---

function initSession(callback) {
  const initPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: requestId++,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'capes-explorer', version: '1.0.0' }
    }
  });

  const url = new URL(TARGET);
  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(initPayload),
      'Accept': 'application/json, text/event-stream'
    }
  };

  console.log('>> Initializing MCP session...');

  const req = https.request(options, (res) => {
    let data = '';
    const sid = res.headers['mcp-session-id'];
    if (sid) sessionId = sid;

    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('<< Init response:', res.statusCode);
      console.log('<< Session ID:', sessionId);
      callback(null, sessionId);
    });
  });

  req.on('error', (err) => {
    console.error('!! Init error:', err.message);
    callback(err);
  });

  req.write(initPayload);
  req.end();
}

function callTool(toolName, args, callback) {
  const mcpPayload = JSON.stringify({
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  });

  const url = new URL(TARGET);
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(mcpPayload),
    'Accept': 'application/json, text/event-stream'
  };

  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: headers
  };

  console.log('>> MCP tools/call:', toolName);

  const req = https.request(options, (res) => {
    let data = '';
    const sid = res.headers['mcp-session-id'];
    if (sid) sessionId = sid;

    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('<< MCP response:', res.statusCode, data.substring(0, 300));

      try {
        let result;

        if (data.includes('data: ')) {
          const lines = data.split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line.replace('data: ', ''));
              if (parsed.result || parsed.error) {
                result = parsed;
              }
            } catch (e) { /* skip */ }
          }
        } else {
          result = JSON.parse(data);
        }

        if (result && result.result && result.result.content) {
          const textParts = result.result.content
            .filter(c => c.type === 'text')
            .map(c => c.text);

          const combined = textParts.join('\n');

          try {
            const parsed = JSON.parse(combined);
            callback(null, parsed);
          } catch (e) {
            callback(null, { response: combined });
          }
        } else if (result && result.error) {
          callback(null, { error: result.error.message || 'MCP error' });
        } else {
          callback(null, { raw: data });
        }
      } catch (e) {
        console.error('!! Parse error:', e.message);
        callback(null, { raw: data });
      }
    });
  });

  req.on('error', (err) => {
    console.error('!! Request error:', err.message);
    callback(err);
  });

  req.write(mcpPayload);
  req.end();
}

// --- Static file serving ---

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// --- HTTP Server ---

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API route: POST /api/query
  if (req.method === 'POST' && req.url === '/api/query') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      console.log('\n== Incoming:', body.substring(0, 200));

      let input;
      try {
        input = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const toolName = input.tool || 'capes_query';
      const args = input.arguments || input.args || {};

      const doCall = () => {
        callTool(toolName, args, (err, result) => {
          if (err) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        });
      };

      if (!sessionId) {
        initSession((err) => {
          if (err) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to init MCP session: ' + err.message }));
            return;
          }
          doCall();
        });
      } else {
        doCall();
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', session: sessionId ? 'active' : 'none', target: TARGET }));
    return;
  }

  // Everything else: serve static files
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`CAPES Explorer running on http://localhost:${PORT}`);
  console.log(`MCP Target: ${TARGET}`);
  console.log('');
});
