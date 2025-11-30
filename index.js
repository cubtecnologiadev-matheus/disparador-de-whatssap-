// index.js — WhatsApp Campaign Panel (Express + Socket.IO + whatsapp-web.js) — v2 (batch sending)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir estáticos de /public (client.js, etc)
app.use(express.static(path.join(__dirname, 'public')));

// Servir o index.html que está na raiz do projeto
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ---------- WhatsApp Client ----------
let waReady = false;

const CHROME = process.env.CHROME_PATH || undefined;
const waClient = new Client({
  authStrategy: new LocalAuth({ clientId: "wa-campaign-panel" }),
  puppeteer: {
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  },
  webVersionCache: { type: 'none' }
});

waClient.on('qr', async (qr) => {
  try {
    const dataUrl = await QRCode.toDataURL(qr);
    io.emit('qr', { dataUrl });
  } catch (e) {
    console.error('QR generation error:', e);
  }
});
waClient.on('ready', () => { waReady = true;  console.log('🤖 WhatsApp client ready.'); io.emit('ready', true); });
waClient.on('disconnected', () => { waReady = false; console.log('⚠️ WhatsApp disconnected.'); io.emit('disconnected', true); });
waClient.on('auth_failure', (m) => { waReady = false; console.log('❌ Auth failure:', m); io.emit('auth_failure', String(m||'')); });

waClient.initialize();

// ---------- Helpers ----------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function toWaDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (!digits.startsWith('55') && digits.length === 11) return '55' + digits; // BR helper
  return digits;
}
function sanitizeNumbers(blockText) {
  const lines = String(blockText || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  const set = new Set();
  const result = [];
  for (const l of lines) {
    const d = toWaDigits(l);
    if (!d || set.has(d)) continue;
    set.add(d);
    result.push({ digits: d });
  }
  return result;
}

// ---------- Campaign State ----------
const LOG_DIR = path.join(__dirname, 'runs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const state = {
  running: false,
  paused: false,
  stopRequested: false,
  startTime: null,
  endTime: null,
  // intervalMs agora não é usado (mantido por compatibilidade)
  intervalMs: 0,
  durationMs: 60 * 60 * 1000, // 60 min
  batchSize: 1,               // <<< NOVO: envios por vez
  msgText: '',
  queue: [],                  // [{digits}]
  sent: 0,
  failed: 0,
  total: 0,
  current: null,
  successes: [],
  failures: [],
};

function snapshot() {
  return {
    running: state.running,
    paused: state.paused,
    stopRequested: state.stopRequested,
    startTime: state.startTime,
    endTime: state.endTime,
    durationMs: state.durationMs,
    batchSize: state.batchSize,
    msgText: state.msgText,
    sent: state.sent,
    failed: state.failed,
    total: state.total,
    current: state.current,
  };
}

// ---------- Runner (batch sending) ----------
async function runCampaign() {
  state.running = true;
  state.stopRequested = false;
  state.paused = false;
  state.startTime = Date.now();
  state.endTime = state.startTime + state.durationMs;

  io.emit('status', snapshot());
  console.log(`🚀 Campaign started: ${state.total} numbers | batch ${state.batchSize} | duration ${Math.round(state.durationMs/60000)}m`);

  for (let i = 0; i < state.queue.length; i += state.batchSize) {
    if (state.stopRequested) break;
    if (Date.now() > state.endTime) break;

    // respeita pausado
    while (state.paused && !state.stopRequested) await sleep(300);
    if (state.stopRequested) break;

    const batch = state.queue.slice(i, i + state.batchSize);

    await Promise.all(batch.map(async (item) => {
      state.current = item.digits;
      io.emit('status', snapshot());

      try {
        const numId = await waClient.getNumberId(item.digits);
        if (!numId) throw new Error('Número sem WhatsApp ou inválido');
        await waClient.sendMessage(numId._serialized, state.msgText);

        state.sent++;
        state.successes.push(item.digits);
        io.emit('progress', { type: 'sent', item });
      } catch (err) {
        state.failed++;
        const reason = String((err && err.message) || err);
        state.failures.push({ digits: item.digits, reason });
        io.emit('progress', { type: 'fail', item, reason });
      }
    }));

    // pequeno yield para UI e para não “travar” o loop
    await sleep(200);

    if (state.stopRequested || Date.now() > state.endTime) break;
  }

  // wrap up
  const runFile = path.join(LOG_DIR, `run-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  const logPayload = {
    ...snapshot(),
    finishedAt: Date.now(),
    successes: state.successes,
    failures: state.failures,
    queueSize: state.queue.length,
  };
  fs.writeFileSync(runFile, JSON.stringify(logPayload, null, 2));

  state.running = false;
  state.current = null;
  io.emit('status', snapshot());
  io.emit('done', { log: path.basename(runFile) });
  console.log('✅ Campaign finished.');
}

// ---------- REST API ----------
app.get('/status', (req, res) => res.json({ ...snapshot(), waReady }));

app.post('/validate', (req, res) => {
  const items = sanitizeNumbers(req.body.numbers || '');
  res.json({ total: items.length, valid: items.length, items });
});

app.post('/start', async (req, res) => {
  if (!waReady) return res.status(400).json({ error: 'WhatsApp não conectado. Escaneie o QR primeiro.' });
  if (state.running) return res.status(400).json({ error: 'Campanha já está rodando' });

  const { message, numbers, batchSize, durationMinutes } = req.body || {};
  const msg = String(message || '').trim();
  if (!msg) return res.status(400).json({ error: 'Informe uma mensagem para iniciar a campanha.' });

  const items = Array.isArray(numbers) ? numbers : sanitizeNumbers(numbers || '').map(x => x.digits);
  const seen = new Set(), queue = [];
  for (const raw of items) {
    const d = toWaDigits(raw);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    queue.push({ digits: d });
  }
  if (!queue.length) return res.status(400).json({ error: 'Cole ao menos um número válido (um por linha).' });

  state.msgText = msg;
  state.queue = queue;
  state.total = queue.length;
  state.sent = 0;
  state.failed = 0;
  state.successes = [];
  state.failures = [];
  state.batchSize = Math.max(1, Math.min(100, parseInt(batchSize, 10) || 1)); // limite de bom senso
  state.intervalMs = 0; // legado, não utilizado
  state.durationMs = Math.max(60_000, (parseInt(durationMinutes, 10) || 60) * 60_000);

  setImmediate(runCampaign);
  res.json({ ok: true, total: state.total, batchSize: state.batchSize });
});

app.post('/pause',  (req, res) => { if (!state.running) return res.status(400).json({ error: 'Not running' }); state.paused = true;  io.emit('status', snapshot()); res.json({ ok: true }); });
app.post('/resume', (req, res) => { if (!state.running) return res.status(400).json({ error: 'Not running' }); state.paused = false; io.emit('status', snapshot()); res.json({ ok: true }); });
app.post('/stop',   (req, res) => { if (!state.running) return res.status(400).json({ error: 'Not running' }); state.stopRequested = true; state.paused = false; io.emit('status', snapshot()); res.json({ ok: true }); });

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌐 Panel available on http://localhost:${PORT}`));
