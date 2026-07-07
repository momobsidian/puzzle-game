const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;
const CHUNK_SIZE = 64 * 1024; // 64KB chunks
const PROGRESS_FILE = path.join(__dirname, 'progress.json');

const mimeTypes = {
  '.html': 'text/html',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json'
};

// Premium ANSI colors for terminal
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m"
};

// Store game stats in memory (you can add database later)
const gameStats = [];

// Store active game sessions for admin monitoring
const activeSessions = new Map();

function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }
  return ip || 'unknown';
}



// Initialize progress file if it doesn't exist
function initProgressFile() {
  if (!fs.existsSync(PROGRESS_FILE)) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ levels: {} }, null, 2));
  }
}

// Read progress from file
function readProgress() {
  try {
    const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { levels: {} };
  }
}

// Save progress to file
function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (err) {
    console.error('Error saving progress:', err);
  }
}

// Get list of images in the images folder
function getImageLevels() {
  const imagesDir = path.join(__dirname, 'images');
  
  // Create images directory if it doesn't exist
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
    return [];
  }

  try {
    const files = fs.readdirSync(imagesDir);
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );
    
    // Sort numerically (1.jpg, 2.jpg, etc.)
    imageFiles.sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });

    return imageFiles.map((file, index) => ({
      level: index + 1,
      image: 'images/' + file,
      thumbnail: 'images/' + file
    }));
  } catch (err) {
    console.error('Error reading images directory:', err);
    return [];
  }
}

const server = http.createServer((req, res) => {
  // Only log static requests dimly to avoid noise
  if (!req.url.startsWith('/api/') && !req.url.startsWith('/stats')) {
    // console.log(`${colors.dim}${req.method} ${req.url}${colors.reset}`);
  }



  // Handle levels endpoint
  if (req.url === '/api/levels' && req.method === 'GET') {
    try {
      const levels = getImageLevels();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(JSON.stringify({ levels }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to list levels' }));
      return;
    }
  }

  // Handle progress GET endpoint
  if (req.url === '/api/progress' && req.method === 'GET') {
    try {
      const progress = readProgress();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(JSON.stringify(progress));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read progress' }));
      return;
    }
  }

  // Handle progress POST endpoint
  if (req.url === '/api/progress' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const progress = readProgress();
        
        const levelNum = data.level;
        if (!progress.levels[levelNum]) {
          progress.levels[levelNum] = {
            completed: false,
            bestTime: null,
            bestMoves: null,
            attempts: 0,
            totalTimePlayed: 0,
            skipped: false
          };
        }
        
        const levelProgress = progress.levels[levelNum];
        
        if (data.completed) {
          // Level completed
          levelProgress.attempts++;
          levelProgress.completed = true;
          
          // Mark if skipped
          if (data.skipped) {
            levelProgress.skipped = true;
          } else {
            // If not skipped, clear any previous skip flag
            levelProgress.skipped = false;
            
            // Update best time (only for non-skipped completions)
            if (!levelProgress.bestTime || data.time < levelProgress.bestTime) {
              levelProgress.bestTime = data.time;
            }
            
            // Update best moves (only for non-skipped completions)
            if (!levelProgress.bestMoves || data.moves < levelProgress.bestMoves) {
              levelProgress.bestMoves = data.moves;
            }
          }
          
          // Add to total time played
          levelProgress.totalTimePlayed = (levelProgress.totalTimePlayed || 0) + data.time;
          
          // Clear in-progress data
          delete levelProgress.inProgress;
          
          if (data.skipped) {
            console.log(`\n${colors.yellow}⏭️  LEVEL ${levelNum} SKIPPED${colors.reset}`);
            console.log(`${colors.yellow}├─ Time : ${data.time}s${colors.reset}`);
            console.log(`${colors.yellow}╰─ Moves: ${data.moves}${colors.reset}\n`);
          } else {
            console.log(`\n${colors.green}🏆 LEVEL ${levelNum} COMPLETED!${colors.reset}`);
            console.log(`${colors.green}├─ Time : ${data.time}s${colors.reset}`);
            console.log(`${colors.green}╰─ Moves: ${data.moves}${colors.reset}\n`);
          }
        } else if (data.inProgress) {
          // In-progress save (auto-save or page close)
          if (!levelProgress.completed) {
            levelProgress.inProgress = data.inProgress;
            levelProgress.totalTimePlayed = (levelProgress.totalTimePlayed || 0) + 10; // Add 10s for each auto-save interval
            // Only log auto-saves dimly to keep console clean
            console.log(`${colors.dim}💾 [Autosave] Lvl ${levelNum} | ${data.moves} moves, ${data.time}s${colors.reset}`);
          } else {
            console.log(`${colors.yellow}⚠️ [Ignored] Late autosave for completed level ${levelNum}${colors.reset}`);
          }
        }
        
        saveProgress(progress);
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Error saving progress:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Handle clear progress endpoint
  if (req.url === '/api/clear-progress' && req.method === 'POST') {
    try {
      const freshProgress = { levels: {} };
      saveProgress(freshProgress);
      
      console.log(`\n${colors.red}🗑️  ALL PROGRESS CLEARED${colors.reset}\n`);
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ success: true, message: 'Progress cleared' }));
      return;
    } catch (err) {
      console.error('Error clearing progress:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to clear progress' }));
      return;
    }
  }

  // Handle image list endpoint
  if (req.url === '/api/images' && req.method === 'GET') {
    try {
      const files = fs.readdirSync(__dirname);
      const imageFiles = files.filter(file => 
        /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
      );
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ images: imageFiles }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to list images' }));
      return;
    }
  }

  // Handle active sessions endpoint (for HTTP polling fallback)
  if (req.url === '/api/active-sessions' && req.method === 'GET') {
    try {
      const sessions = Array.from(activeSessions.values());
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify({ sessions }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get active sessions' }));
      return;
    }
  }

  // Handle stats endpoint
  if (req.url === '/stats' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const stats = JSON.parse(body);
        gameStats.push(stats);
        
        // Update active sessions (using IP as identifier for admin dashboard)
        const ip = getClientIp(req);
        activeSessions.set(ip, {
          ...stats,
          ip: ip,
          lastUpdate: Date.now()
        });
        
        // Broadcast to all admin clients
        broadcastToAdmins({
          type: 'gameUpdate',
          data: {
            sessionId: ip,
            ...stats,
            lastUpdate: Date.now()
          }
        });
        
        const event = stats.event || 'update';
        const device = stats.device ? stats.device.substring(0, 15) : 'Unknown';
        const paddedDevice = device.padEnd(15);
        
        if (event === 'game_started') {
          console.log(`${colors.cyan}▶️  [${paddedDevice}] Started Level ${stats.level}${colors.reset}`);
        } else if (event === 'game_resumed') {
          console.log(`${colors.yellow}⏸️  [${paddedDevice}] Resumed Level ${stats.level} at ${stats.progress}%${colors.reset}`);
        } else if (event === 'solved') {
          // Solved is handled in /api/progress for completion, but we can log the stats here too
        } else {
          // Normal moves or intervals
          const p = stats.progress.toString().padStart(3);
          const m = stats.moves.toString().padStart(3);
          const t = stats.elapsedTime.toString().padStart(4);
          console.log(`${colors.gray}   [${paddedDevice}] Lvl ${stats.level} │ Prog: ${p}% │ Moves: ${m} │ Time: ${t}s${colors.reset}`);
        }
        
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Error parsing stats:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Handle OPTIONS for CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Default to index
  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // Remove query string for file lookup
  filePath = filePath.split('?')[0];
  filePath = path.join(__dirname, filePath);

  const extname = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 - File Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 - Internal Server Error');
      }
      return;
    }

    // Check if it's an image file - stream in chunks
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extname);
    
    if (isImage && stats.size > CHUNK_SIZE) {
      // Stream large images in chunks
      const fileStream = fs.createReadStream(filePath, {
        highWaterMark: CHUNK_SIZE
      });

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      fileStream.pipe(res);

      fileStream.on('error', (err) => {
        console.error('Stream error:', err);
        res.end();
      });

        console.log(`${colors.dim}  Streaming ${path.basename(filePath)} (${(stats.size / 1024).toFixed(0)} KB)...${colors.reset}`);
      } else {
      // Read smaller files entirely
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 - Internal Server Error');
          return;
        }
        
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': content.length,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(content);
      });
    }
  });
});

// Initialize progress file on startup
initProgressFile();

// WebSocket server for admin connections
const wss = new WebSocket.Server({ noServer: true });
const adminClients = new Set();

wss.on('connection', (ws) => {
  console.log(`${colors.magenta}👤 Admin client connected${colors.reset}`);
  adminClients.add(ws);
  
  // Send current active sessions to new admin
  const sessions = Array.from(activeSessions.values());
  ws.send(JSON.stringify({
    type: 'init',
    data: sessions
  }));
  
  ws.on('close', () => {
    console.log(`${colors.magenta}👤 Admin client disconnected${colors.reset}`);
    adminClients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    adminClients.delete(ws);
  });
});

function broadcastToAdmins(message) {
  const messageStr = JSON.stringify(message);
  adminClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Clean up stale sessions every 30 seconds
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 60000; // 1 minute
  
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastUpdate > staleThreshold) {
      activeSessions.delete(sessionId);
      broadcastToAdmins({
        type: 'sessionEnded',
        data: { sessionId }
      });
    }
  }
}, 30000);

server.listen(PORT, () => {
  const border = '═'.repeat(56);
  console.log(`\n${colors.cyan}╔${border}╗${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.bright}PUZZLE NUDES ENGINE${colors.reset}${' '.repeat(34)}${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╠${border}╣${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.dim}PORT${colors.reset}        : ${PORT.toString().padEnd(38)} ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.dim}DIRECTORY${colors.reset}   : ${(__dirname.length > 38 ? __dirname.substring(0, 35) + '...' : __dirname).padEnd(38)} ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.dim}STREAMING${colors.reset}   : ${(CHUNK_SIZE / 1024).toFixed(0)}KB CHUNKS${' '.repeat(26)} ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}║${colors.reset}  ${colors.dim}TELEMETRY${colors.reset}   : ACTIVE (Tracking device metrics)      ${colors.cyan}║${colors.reset}`);
  console.log(`${colors.cyan}╚${border}╝${colors.reset}`);
  console.log(`${colors.gray}Waiting for connections... (Press Ctrl+C to stop)${colors.reset}\n`);
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/admin-ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});
