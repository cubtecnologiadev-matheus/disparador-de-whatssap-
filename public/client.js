// public/client.js — Front-end controller for the panel (v2 batch)
const $ = (sel) => document.querySelector(sel);
const ioClient = io();

const controls = ['#btn-start','#btn-pause','#btn-resume','#btn-stop'];
function setDisabled(disabled) {
  controls.forEach(id => { const b = $(id); if (!b) return; b.disabled = disabled; b.classList.toggle('opacity-50', disabled); });
}
setDisabled(true);

// QR / Ready status
ioClient.on('qr', ({ dataUrl }) => {
  const img = $('#qr');
  img.src = dataUrl;
  img.classList.remove('hidden');
  $('#waStatus').textContent = 'Escaneie o QR Code acima para conectar.';
  setDisabled(true);
});
ioClient.on('ready', () => {
  $('#waStatus').textContent = 'WhatsApp conectado ✅';
  $('#qr').classList.add('hidden');
  setDisabled(false);
});
ioClient.on('disconnected', () => {
  $('#waStatus').textContent = 'WhatsApp desconectado — escaneie novamente.';
  $('#qr').classList.remove('hidden');
  setDisabled(true);
});
ioClient.on('auth_failure', () => {
  $('#waStatus').textContent = 'Falha na autenticação — recarregue e escaneie o QR.';
  setDisabled(true);
});

// Status / progress
ioClient.on('status', (s) => {
  $('#total').textContent = s.total ?? 0;
  $('#enviados').textContent = s.sent ?? 0;
  $('#falhas').textContent = s.failed ?? 0;
  $('#atual').textContent = s.current ? `+${s.current}` : '—';
  $('#rodando').textContent = s.running ? 'SIM' : 'NÃO';
});

// Progress logs
ioClient.on('progress', (p) => {
  const list = p.type === 'sent' ? $('#log-ok') : $('#log-fail');
  const item = document.createElement('div');
  item.className = 'px-3 py-2 text-sm border-b border-white/10';
  item.textContent = p.type === 'sent'
    ? `+${p.item.digits} — OK`
    : `+${p.item.digits} — Falhou: ${p.reason}`;
  list.prepend(item);
});
ioClient.on('done', ({ log }) => toast('Campanha finalizada. Log salvo: ' + log));

// Helpers
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'fixed bottom-4 right-4 bg-emerald-600 text-white px-4 py-2 rounded-xl shadow';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
function hasMessage() { return ($('#message').value || '').trim().length > 0; }
$('#message').addEventListener('input', () => {
  const btn = $('#btn-start');
  const disabled = !hasMessage();
  btn.disabled = disabled;
  btn.classList.toggle('opacity-50', disabled);
});

// Buttons
$('#btn-validar').addEventListener('click', async () => {
  const resp = await fetch('/validate', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ numbers: $('#numbers').value })
  });
  const data = await resp.json();
  $('#validos').textContent = data.valid;
  toast(`Validados: ${data.valid}/${data.total}`);
});

$('#btn-start').addEventListener('click', async () => {
  if (!hasMessage()) {
    toast('Informe uma mensagem para iniciar a campanha.');
    return;
  }
  const body = {
    message: $('#message').value,
    numbers: $('#numbers').value,
    batchSize: parseInt($('#batch').value, 10) || 1,
    durationMinutes: $('#duration').value
  };
  const resp = await fetch('/start', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  if (resp.ok) toast('Campanha iniciada!');
  else {
    const e = await resp.json().catch(()=>({}));
    toast('Erro: ' + ((e && e.error) || 'Falha ao iniciar'));
  }
});

$('#btn-pause').addEventListener('click', async () => { const r = await fetch('/pause', { method:'POST' }); if (r.ok) toast('Campanha pausada.');});
$('#btn-resume').addEventListener('click', async () => { const r = await fetch('/resume', { method:'POST' }); if (r.ok) toast('Campanha retomada.');});
$('#btn-stop').addEventListener('click', async () => { const r = await fetch('/stop', { method:'POST' }); if (r.ok) toast('Campanha interrompida.');});
