const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Config
const PORT = process.env.PORT || 3001;
const AGENT_ENDPOINT =
  process.env.AGENT_ENDPOINT ||
  'https://test.godigibee.io/pipeline/digibee/v1/api-capes-agent-for-tool';

const API_KEY =
  process.env.AGENT_API_KEY ||
  'wme98P7cgRzMT2Fso1Jzzepq9ftb8Rmg';

// --- Agent call ---

function callAgent(question, callback) {
  const payload = JSON.stringify({
    question
  });

  const url = new URL(AGENT_ENDPOINT);

  const options = {
    hostname: url.hostname,
    path: url.pathname + (url.search || ''),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'apikey': API_KEY
    }
  };

  console.log('>> Calling agent endpoint...');
  console.log('>> Question:', question);

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('<< Agent response status:', res.statusCode);
      console.log('<< Agent raw response:', data.substring(0, 1000));

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        return callback(new Error('Invalid JSON returned by agent: ' + e.message));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return callback(
          new Error(
            parsed?.message ||
            parsed?.error ||
            `Agent request failed with status ${res.statusCode}`
          )
        );
      }

      callback(null, normalizeAgentResponse(parsed));
    });
  });

  req.on('error', (err) => {
    console.error('!! Agent request error:', err.message);
    callback(err);
  });

  req.write(payload);
  req.end();
}

function normalizeAgentResponse(agentResponse) {
  // Try to preserve the original response while making frontend consumption easier
  let text =
    agentResponse.response ||
    agentResponse.text ||
    agentResponse.answer ||
    agentResponse.message ||
    agentResponse.output ||
    agentResponse.body?.text ||
    agentResponse.body?.response ||
    '';

  // Some agents return structured body as stringified JSON
  if (!text && typeof agentResponse.body === 'string') {
    text = agentResponse.body;
  }

  return {
    ...agentResponse,
    text
  };
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

    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      console.log('\n== Incoming:', body.substring(0, 500));

      let input;
      try {
        input = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const question =
        input.question ||
        input.args?.question ||
        input.arguments?.question ||
        '';

      if (!question) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "question"' }));
        return;
      }

      callAgent(question, (err, result) => {
        if (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });
    });

    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      target: AGENT_ENDPOINT
    }));
    return;
  }

  // Everything else: serve static files
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`CAPES Explorer running on http://localhost:${PORT}`);
  console.log(`Agent Target: ${AGENT_ENDPOINT}`);
  console.log('');
});