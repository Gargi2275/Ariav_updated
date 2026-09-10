import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

const app = express();
const PORT = 3000;
const PYTHON_PORT = 5001;

let pythonProcess: ChildProcess | null = null;

// Start Python Auth Backend subprocess
function startPythonBackend() {
  const pythonScript = path.join(process.cwd(), 'backend', 'auth_api.py');
  console.log(`[Python Auth] Launching backend service on port ${PYTHON_PORT}...`);

  pythonProcess = spawn('python3', [pythonScript], {
    env: {
      ...process.env,
      PYTHON_AUTH_PORT: String(PYTHON_PORT),
    },
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  pythonProcess.on('error', (err) => {
    console.error('[Python Auth] Failed to start Python backend:', err.message);
  });

  pythonProcess.on('exit', (code, signal) => {
    console.warn(`[Python Auth] Process exited with code: ${code}, signal: ${signal}`);
  });
}

// Ensure cleanup on shutdown
function cleanup() {
  if (pythonProcess && !pythonProcess.killed) {
    console.log('[Python Auth] Terminating child process...');
    pythonProcess.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit();
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit();
});

// Proxy helper for Python Auth service
function proxyToPython(req: express.Request, res: express.Response) {
  const targetPath = req.originalUrl;
  
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value && key !== 'host') {
      headers[key] = value;
    }
  }
  headers['host'] = `127.0.0.1:${PYTHON_PORT}`;

  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: PYTHON_PORT,
    path: targetPath,
    method: req.method,
    headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] Unable to connect to Python backend on port ${PYTHON_PORT}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: 'Python Authentication API is starting up or temporarily unavailable',
        details: err.message,
      });
    }
  });

  req.pipe(proxyReq);
}

async function startServer() {
  // Start Python Auth Backend
  startPythonBackend();

  // Basic diagnostic endpoint
  app.get('/api/health', async (req, res) => {
    let pythonHealthy = false;
    let pythonDetails = null;

    try {
      const pyRes = await fetch(`http://127.0.0.1:${PYTHON_PORT}/api/auth/health`);
      if (pyRes.ok) {
        pythonHealthy = true;
        pythonDetails = await pyRes.json();
      }
    } catch {
      pythonHealthy = false;
    }

    res.json({
      status: 'ok',
      nodeServer: 'online',
      port: PORT,
      pythonAuthBackend: {
        status: pythonHealthy ? 'online' : 'initializing',
        port: PYTHON_PORT,
        details: pythonDetails,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Forward auth endpoints to Python backend
  app.use('/api/auth', proxyToPython);
  app.use('/api/check-credentials', proxyToPython);
  app.use('/api/admin-login', proxyToPython);
  app.use('/api/admin', proxyToPython);
  app.use('/api/login', proxyToPython);
  app.use('/api/check-request-status', proxyToPython);

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ariav ERP] Unified server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
