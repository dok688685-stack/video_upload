'use strict';

require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;
const FOLDER = process.env.GOOGLE_DRIVE_FOLDER_ID || '1Kp78N86XdJx2A0WdGdedahrTlkPppLU8';
const TOKEN_PATH = path.join(__dirname, 'token.json');

// ── OAuth2 client ─────────────────────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `http://localhost:${PORT}/auth/callback`,
);

// Load saved token if it exists
if (fs.existsSync(TOKEN_PATH)) {
  const saved = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oauth2Client.setCredentials(saved);
}

// Auto-save refreshed tokens
oauth2Client.on('tokens', (tokens) => {
  const current = fs.existsSync(TOKEN_PATH)
    ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
    : {};
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...tokens }));
});

function isAuthorized() {
  return fs.existsSync(TOKEN_PATH);
}

// ── Temp upload directory ─────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Multer (disk storage, 2 GB limit, video only) ────────────────────────────
const ALLOWED_MIME_PREFIX = 'video/';
const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.3gp', '.3gpp', '.m4v', '.wmv', '.flv', '.ts',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, safe + (ALLOWED_EXTENSIONS.has(ext) ? ext : '.video'));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith(ALLOWED_MIME_PREFIX)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only video files are accepted.'), { code: 'INVALID_TYPE' }));
    }
  },
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Generous timeouts for large uploads
app.use((req, res, next) => {
  req.setTimeout(900_000);
  res.setTimeout(900_000);
  next();
});

// ── GET /auth  — start OAuth2 flow ───────────────────────────────────────────
app.get('/auth', (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent',
  });
  res.redirect(url);
});

// ── GET /auth/callback  — handle Google redirect ─────────────────────────────
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing authorization code.');
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#F5F3FF;margin:0}
      .box{background:#fff;border-radius:16px;padding:32px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.12);max-width:380px}
      h2{color:#10B981;margin:0 0 8px}p{color:#6B7280;margin:0 0 20px}
      a{display:inline-block;background:linear-gradient(135deg,#7C3AED,#C026D3);color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700}</style>
      </head><body><div class="box">
      <h2>✅ Authorization Successful!</h2>
      <p>Jill Clips is now connected to your Google Drive.</p>
      <a href="/">Start Uploading</a>
      </div></body></html>`);
  } catch (err) {
    console.error('[Auth Error]', err.message);
    res.status(500).send('Authorization failed: ' + err.message);
  }
});

// ── GET /auth/status  — used by frontend to check if authorized ───────────────
app.get('/auth/status', (_req, res) => {
  res.json({ authorized: isAuthorized() });
});

// ── POST /upload ──────────────────────────────────────────────────────────────
app.post('/upload', (req, res) => {
  if (!isAuthorized()) {
    return res.status(401).json({ error: 'Not authorized. Visit /auth to connect Google Drive.' });
  }

  upload.single('video')(req, res, async (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const msg    = err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum allowed size is 2 GB.'
        : err.message || 'Upload error.';
      return res.status(status).json({ error: msg });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No video file received.' });
    }

    const tmpPath = req.file.path;

    try {
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      const safeName = path.basename(req.file.originalname).replace(/[^\w.\-\s()]/g, '_');

      const driveRes = await drive.files.create({
        requestBody: { name: safeName, parents: [FOLDER] },
        media: { mimeType: req.file.mimetype, body: fs.createReadStream(tmpPath) },
        fields: 'id,name',
      });

      fs.unlink(tmpPath, () => {});

      return res.status(200).json({
        success: true,
        message: `"${driveRes.data.name}" uploaded successfully!`,
        fileId: driveRes.data.id,
      });
    } catch (driveErr) {
      fs.unlink(tmpPath, () => {});
      console.error('[Drive Error]', driveErr.message);
      return res.status(500).json({
        error: 'Could not save to Google Drive. Check the server configuration.',
      });
    }
  });
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', authorized: isAuthorized() }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🎬  Jill Clips is running at http://localhost:${PORT}`);
  if (!isAuthorized()) {
    console.log(`⚠️   Not authorized yet! Visit http://localhost:${PORT}/auth to connect Google Drive.`);
  } else {
    console.log(`✅  Google Drive authorized and ready.`);
  }
});
