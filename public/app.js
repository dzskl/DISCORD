// BotDash — dashboard client
const api = (path, opts = {}) =>
  fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
    .then(async r => {
      if (r.status === 401) { location.href = '/login.html'; throw new Error('auth'); }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      return r.json();
    });

function toast(msg, type = 'ok', ms = 3500) {
  const w = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  w.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 250); }, ms);
}

function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-bg').classList.add('show');
}
function closeModal() { document.getElementById('modal-bg').classList.remove('show'); }

function confirmAsync(msg) {
  return new Promise(resolve => {
    openModal(`
      <div class="modal-title">confirmar<button class="modal-close" onclick="closeModal()">×</button></div>
      <div style="font-size:13px;color:#aaa;font-family:'IBM Plex Mono',monospace;margin-bottom:18px;line-height:1.6;">${msg}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn-g" onclick="window.__cf(false)">cancelar</button>
        <button class="btn-w" onclick="window.__cf(true)">confirmar</button>
      </div>
    `);
    window.__cf = (v) => { closeModal(); resolve(v); };
  });
}

function filterTable(tbodyId, query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('#' + tbodyId + ' tr').forEach(tr => {
    tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function exportCsv(kind) {
  const url = kind === 'sales' ? '/api/sales/export.csv' : '/api/customers/_/export.csv';
  fetch(url, { credentials: 'include' }).then(r => {
    if (!r.ok) { toast('Erro no export', 'err'); return; }
    return r.blob().then(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = kind + '.csv';
      a.click();
      toast('Arquivo baixado', 'ok');
    });
  });
}

const charts = {};
let produtos = [];
let agendamentos = [];
let canalDisponivel = [];

function doLogout(e) {
  e?.preventDefault();
  fetch('/auth/logout', { method: 'POST', credentials: 'include' }).then(() => location.href = '/login.html');
}

async function bootstrap() {
  let me;
  try { me = await fetch('/auth/me', { credentials: 'include' }).then(r => r.json()); }
  catch { location.href = '/login.html'; return; }

  if (!me.authenticated || !me.admin) { location.href = '/login.html?login=denied'; return; }

  document.getElementById('me-tag').textContent = me.user.username;
  if (me.user.avatar) {
    const av = document.getElementById('bot-avatar');
    av.textContent = '';
    av.style.backgroundImage = `url(${me.user.avatar})`;
    av.style.backgroundSize = 'cover';
  }

  loadOverview();
  loadProdutos();
  loadCanais();
}

// ---------- VISAO GERAL ----------
async function loadOverview() {
  try {
    const t0 = performance.now();
    const data = await api('/api/stats/overview');
    document.getElementById('api-latency').textContent = Math.round(performance.now() - t0) + 'ms';

    setMetric('m-total', formatNum(data.members_total));
    setMetric('m-online', formatNum(data.members_online));
    setMetric('m-cmds', formatNum(data.commands_today));
    setMetric('m-mod', formatNum(data.mod_today));
    setMetric('m-revenue', 'R$' + formatNum(Math.round(data.month_revenue_cents / 100)));

    setText('m-join-week', `+${data.joins_week} esta semana`);

    renderRecentLogs('overview-logs', data.recent_logs);
    renderTopCommands(data.top_commands);
    renderModCounts(data.mod_counts);

    renderChart('cMembros', 'line', last14Labels(), [
      { data: data.member_activity_14d.map(d => d.joins), borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 2, pointRadius: 2, tension: 0.4, fill: true },
      { data: data.member_activity_14d.map(d => d.leaves), borderColor: '#555', backgroundColor: 'rgba(85,85,85,0.04)', borderWidth: 2, pointRadius: 2, tension: 0.4, fill: true }
    ]);

    renderChart('cVendasG', 'bar', last6MonthLabels(), [
      { data: data.monthly_revenue_6m, backgroundColor: 'rgba(255,255,255,0.8)', borderColor: '#fff', borderWidth: 1, borderRadius: 4 }
    ], { y: { ticks: { callback: v => 'R$' + Math.round(v / 1000) + 'k' } } });
  } catch (e) { console.warn('overview', e.message); }
}

function renderRecentLogs(id, logs) {
  const el = document.querySelector('#page-geral .brow .card .lglist');
  if (!el) return;
  el.innerHTML = logs.map(l => `
    <div class="lgi"><div class="dot ${dotClass(l.type)}"></div>
      <div><div class="ltxt">${escapeHtml(l.message)}</div>
      <div class="ltime">${timeAgo(l.created_at)}</div></div></div>
  `).join('') || '<div class="ltxt" style="color:#444">sem eventos ainda.</div>';
}

function renderTopCommands(cmds) {
  const card = document.querySelectorAll('#page-geral .card')[3];
  if (!card) return;
  const list = card.querySelector('.cmdlist');
  if (!list) return;
  const max = Math.max(1, ...cmds.map(c => c.c));
  list.innerHTML = cmds.length ? cmds.map((c, i) => {
    const pct = Math.round(c.c / max * 100);
    const shades = ['#fff', '#aaa', '#888', '#666', '#444'];
    return `<div class="cmdr"><span class="cmdn">/${escapeHtml(c.command)}</span>
      <div class="bwrap"><div class="bfill" style="width:${pct}%;background:${shades[i] || '#333'}"></div></div>
      <span class="bcnt">${c.c}</span></div>`;
  }).join('') : '<div class="ltxt" style="color:#444">sem comandos registrados.</div>';
}

function renderModCounts(c) {
  const cards = document.querySelectorAll('#page-geral .card')[4]?.querySelectorAll('.smi');
  if (!cards) return;
  const vals = [c.ban, c.kick, c.mute, c.warn];
  cards.forEach((card, i) => { const v = card.querySelector('.smival'); if (v) v.textContent = vals[i] ?? 0; });
}

// ---------- MEMBROS ----------
async function loadMembros() {
  try {
    const data = await api('/api/members/summary');
    const cards = document.querySelectorAll('#page-membros .mc');
    if (cards[0]) cards[0].querySelector('.mval').textContent = formatNum(data.total);
    if (cards[1]) cards[1].querySelector('.mval').textContent = formatNum(data.online);
    if (cards[2]) cards[2].querySelector('.mval').textContent = formatNum(data.joins_today);
    if (cards[3]) cards[3].querySelector('.mval').textContent = formatNum(data.leaves_today);

    renderChart('cGrowth', 'line', last14Labels(), [
      { data: data.growth_14d.map(d => d.joins - d.leaves), borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true }
    ]);

    const list = await api('/api/members?limit=50');
    const tbody = document.querySelector('#page-membros .vtable tbody');
    if (tbody) tbody.innerHTML = list.map(m => `
      <tr><td class="hi">${escapeHtml(m.tag)}</td>
      <td>${escapeHtml(m.roles[0] || 'membro')}</td>
      <td>${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('pt-BR') : '—'}</td>
      <td><span style="color:${m.status === 'online' ? '#5fff5f' : '#444'}">● ${m.status}</span></td></tr>
    `).join('');
  } catch (e) { console.warn('membros', e.message); }
}

// ---------- LOGS ----------
async function loadLogs() {
  try {
    const sum = await api('/api/logs/summary');
    const cards = document.querySelectorAll('#page-logs .mc');
    if (cards[0]) cards[0].querySelector('.mval').textContent = formatNum(sum.today);
    if (cards[1]) cards[1].querySelector('.mval').textContent = formatNum(sum.errors);
    if (cards[2]) cards[2].querySelector('.mval').textContent = formatNum(sum.commands);
    if (cards[3]) cards[3].querySelector('.mval').textContent = formatNum(sum.joins_leaves);

    const logs = await api('/api/logs?limit=80');
    const tbody = document.querySelector('#page-logs .vtable tbody');
    if (tbody) tbody.innerHTML = logs.map(l => `
      <tr><td>${formatTime(l.created_at)}</td>
      <td>${typeBadge(l.type)}</td>
      <td class="hi">${escapeHtml(l.message)}</td>
      <td>${escapeHtml(l.discord_tag || '—')}</td>
      <td>${escapeHtml(l.channel ? '#' + l.channel : '—')}</td></tr>
    `).join('');
  } catch (e) { console.warn('logs', e.message); }
}

// ---------- MODERACAO ----------
async function loadMod() {
  try {
    const sum = await api('/api/mod/summary');
    const cards = document.querySelectorAll('#page-mod .mc');
    const counts = [sum.counts.ban, sum.counts.kick, sum.counts.mute, sum.counts.warn, sum.counts.automod];
    cards.forEach((c, i) => { const v = c.querySelector('.mval'); if (v) v.textContent = counts[i] ?? 0; });

    renderChart('cMod', 'bar', last6MonthLabels(), [
      { label: 'bans', data: sum.monthly.map(m => m.bans), backgroundColor: '#ff5f5f', borderRadius: 3 },
      { label: 'kicks', data: sum.monthly.map(m => m.kicks), backgroundColor: '#ffdf5f', borderRadius: 3 },
      { label: 'mutes', data: sum.monthly.map(m => m.mutes), backgroundColor: '#a0a0ff', borderRadius: 3 }
    ]);
    renderChart('cModPie', 'doughnut', ['bans', 'kicks', 'mutes', 'warns'], [
      { data: [sum.counts.ban, sum.counts.kick, sum.counts.mute, sum.counts.warn], backgroundColor: ['#ff5f5f', '#ffdf5f', '#a0a0ff', '#9fff5f'], borderColor: '#0a0a0a', borderWidth: 3 }
    ], { cutout: '60%', noScales: true });

    const actions = await api('/api/mod/actions?limit=30');
    const tbody = document.querySelector('#page-mod .vtable tbody');
    if (tbody) tbody.innerHTML = actions.map(a => `
      <tr><td>${formatTime(a.created_at)}</td>
      <td class="hi">${escapeHtml(a.moderator_tag || 'bot')}</td>
      <td>${escapeHtml(a.target_tag || a.target_id)}</td>
      <td><span class="badge ${a.action === 'ban' ? 'ban' : a.action === 'kick' ? 'kick' : a.action === 'mute' ? 'mute' : 'warn'}">${a.action}</span></td>
      <td>${escapeHtml(a.reason || '—')}</td></tr>
    `).join('') || '<tr><td colspan="5" style="color:#444">sem acoes registradas.</td></tr>';
  } catch (e) { console.warn('mod', e.message); }
}

// ---------- VENDAS ----------
async function loadVendas() {
  try {
    const sum = await api('/api/sales/summary');
    const cards = document.querySelectorAll('#page-vendas .mc');
    if (cards[0]) cards[0].querySelector('.mval').textContent = 'R$' + formatNum(Math.round(sum.month_revenue_cents / 100));
    if (cards[1]) cards[1].querySelector('.mval').textContent = sum.today_count;
    if (cards[2]) cards[2].querySelector('.mval').textContent = 'R$' + (sum.avg_ticket_cents / 100).toFixed(2).replace('.', ',');
    if (cards[3]) cards[3].querySelector('.mval').textContent = sum.top_product;
    if (cards[4]) cards[4].querySelector('.mval').textContent = sum.refunds;

    renderChart('cVendasF', 'bar', last6MonthLabels(), [
      { data: sum.monthly_revenue, backgroundColor: 'rgba(255,255,255,0.85)', borderColor: '#fff', borderWidth: 1, borderRadius: 4 }
    ], { y: { ticks: { callback: v => 'R$' + Math.round(v / 1000) + 'k' } } });

    const shades = ['#fff', '#aaa', '#555', '#222'];
    renderChart('cProd', 'doughnut', sum.by_product.map(b => b.name), [
      { data: sum.by_product.map(b => b.c), backgroundColor: shades, borderColor: '#0a0a0a', borderWidth: 3 }
    ], { cutout: '60%', noScales: true });

    const txs = await api('/api/sales?limit=50');
    const tbody = document.getElementById('vendas-tbody');
    if (tbody) tbody.innerHTML = txs.length ? txs.map(t => {
      const cls = t.status === 'paid' ? 'gr' : '';
      const badge = t.status === 'paid'
        ? `<span class="badge" style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a">pago</span>`
        : t.status === 'pending'
        ? `<span class="badge kick">pendente</span>`
        : `<span class="badge ban">${t.status}</span>`;
      const action = t.status === 'paid' ? `<button class="btn-sm del" onclick="refundSale(${t.id})">reembolsar</button>` : '';
      return `<tr><td>${formatTime(t.created_at)}</td>
        <td class="hi">${escapeHtml(t.discord_tag || t.discord_id)}</td>
        <td>${escapeHtml(t.product_name || '—')}</td>
        <td class="${cls}">R$${(t.amount_cents / 100).toFixed(2).replace('.', ',')}</td>
        <td>${badge}</td>
        <td>${action}</td></tr>`;
    }).join('') : '<tr><td colspan="6" style="color:#444">sem vendas ainda.</td></tr>';
  } catch (e) { console.warn('vendas', e.message); }
}

// ---------- PRODUTOS ----------
async function loadProdutos() {
  try {
    produtos = await api('/api/products');
    document.getElementById('prod-count').textContent = produtos.filter(p => p.active).length;
    const list = document.getElementById('prod-list');
    list.innerHTML = produtos.map(p => productCard(p)).join('');
    populateProdSelect();
  } catch (e) { console.warn('produtos', e.message); }
}

function productCard(p) {
  const price = 'R$ ' + (p.price_cents / 100).toFixed(2).replace('.', ',');
  const durMap = { permanent: 'permanente', '30d': '30 dias', '7d': '7 dias', '1d': '1 dia', '1y': 'anual' };
  const dur = durMap[p.duration] || p.duration;
  const thumb = p.image_url
    ? `<div class="prod-thumb" style="background:#000 url(${escapeAttr(p.image_url)}) center/cover;"></div>`
    : `<div class="prod-thumb">sem imagem</div>`;
  return `<div class="prod-card" data-id="${p.id}">
    ${thumb}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <div class="prod-name">${escapeHtml(p.name)}</div>
      <span class="status-pill ${p.active ? 'status-ativo' : 'status-inativo'}">${p.active ? 'ativo' : 'inativo'}</span>
    </div>
    <div class="prod-price">${price} <span style="font-size:10px;color:#444;font-family:'IBM Plex Mono',monospace;">/ ${dur}</span></div>
    <div class="prod-desc">${escapeHtml(p.description || 'Sem descricao.')}</div>
    <div class="prod-footer"><span class="prod-sales">${p.sales_count || 0} vendas</span></div>
    <div class="prod-actions">
      <button class="btn-sm" onclick="editProduto(${p.id})">editar</button>
      <button class="btn-sm pub" onclick="anunciarProd(${p.id})">anunciar</button>
      <button class="btn-sm del" onclick="removerProd(${p.id})">${p.active ? 'desativar' : 'reativar'}</button>
    </div>
  </div>`;
}

async function addProduto() {
  const name = document.getElementById('pnome').value.trim();
  const price = document.getElementById('ppreco').value.trim();
  const description = document.getElementById('pdesc').value.trim();
  const duration = document.getElementById('pdur').value;
  const role_id = document.getElementById('pcargo').value.trim();
  const image_url = document.getElementById('pimg').value.trim();
  if (!name || !price) return toast('Preencha nome e preco.', 'warn');
  try {
    await api('/api/products', { method: 'POST', body: JSON.stringify({ name, price, description, duration, role_id, image_url }) });
    ['pnome', 'ppreco', 'pdesc', 'pcargo', 'pimg'].forEach(id => document.getElementById(id).value = '');
    toggleForm('prod-form');
    loadProdutos();
    toast('Produto criado.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function editProduto(id) {
  const p = produtos.find(x => x.id === id);
  if (!p) return;
  openModal(`
    <div class="modal-title">editar produto<button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="fgroup"><div class="flabel">nome</div><input class="inp" id="ep-name" value="${escapeAttr(p.name)}"></div>
    <div class="fgroup"><div class="flabel">preço (R$)</div><input class="inp" id="ep-price" type="number" step="0.01" value="${(p.price_cents / 100).toFixed(2)}"></div>
    <div class="fgroup"><div class="flabel">descrição</div><textarea class="inp" id="ep-desc">${escapeHtml(p.description || '')}</textarea></div>
    <div class="fgroup"><div class="flabel">cargo</div><input class="inp" id="ep-role" value="${escapeAttr(p.role_id || '')}"></div>
    <div class="fgroup"><div class="flabel">duração</div>
      <select class="inp" id="ep-dur">
        ${['permanent', '1d', '7d', '30d', '1y'].map(d => `<option value="${d}" ${p.duration === d ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
    </div>
    <div class="fgroup"><div class="flabel">URL da imagem</div><input class="inp" id="ep-img" value="${escapeAttr(p.image_url || '')}"></div>
    <div class="fgroup"><div class="flabel">status</div>
      <select class="inp" id="ep-active">
        <option value="1" ${p.active ? 'selected' : ''}>ativo</option>
        <option value="0" ${!p.active ? 'selected' : ''}>inativo</option>
      </select>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
      <button class="btn-g" onclick="closeModal()">cancelar</button>
      <button class="btn-w" onclick="saveProduto(${id})">salvar</button>
    </div>
  `);
}

async function saveProduto(id) {
  const payload = {
    name: document.getElementById('ep-name').value.trim(),
    price: document.getElementById('ep-price').value,
    description: document.getElementById('ep-desc').value.trim(),
    role_id: document.getElementById('ep-role').value.trim() || null,
    duration: document.getElementById('ep-dur').value,
    image_url: document.getElementById('ep-img').value.trim() || null,
    active: document.getElementById('ep-active').value === '1'
  };
  try {
    await api('/api/products/' + id, { method: 'PUT', body: JSON.stringify(payload) });
    closeModal();
    loadProdutos();
    toast('Produto atualizado.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function removerProd(id) {
  if (!await confirmAsync('Desativar este produto? Ele some da loja mas o histórico fica.')) return;
  try { await api('/api/products/' + id, { method: 'DELETE' }); loadProdutos(); toast('Produto desativado.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- ANUNCIOS ----------
async function loadCanais() {
  try {
    canalDisponivel = await api('/api/config/channels');
    const chips = document.getElementById('canal-chips');
    if (!chips) return;
    chips.innerHTML = canalDisponivel.slice(0, 8).map((c, i) => `
      <div class="canal-chip ${i === 0 ? 'sel' : ''}" onclick="toggleCanal(this)">#${escapeHtml(c.name)}</div>
    `).join('');
  } catch (e) { /* sem bot conectado */ }
}

function populateProdSelect() {
  const sel = document.getElementById('prod-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">selecione um produto...</option>' +
    produtos.filter(p => p.active).map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

async function enviarAnuncio() {
  const body = document.getElementById('anuncio-texto').value.trim();
  const channels = [...document.querySelectorAll('.canal-chip.sel')].map(c => c.textContent);
  const kind = document.getElementById('anuncio-tipo').value;
  if (!body) return toast('Digite uma mensagem.', 'warn');
  if (!channels.length) return toast('Selecione pelo menos um canal.', 'warn');

  const payload = { channels, body, kind };
  if (kind === 'embed') {
    payload.embed_title = document.getElementById('embed-titulo').value;
    payload.embed_color = document.getElementById('embed-cor').value;
  } else if (kind === 'produto') {
    payload.product_id = parseInt(document.getElementById('prod-select').value) || null;
  }
  try {
    await api('/api/announcements', { method: 'POST', body: JSON.stringify(payload) });
    document.getElementById('anuncio-texto').value = '';
    loadAnuncios();
    toast('Anuncio enviado.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function agendarAnuncio() {
  const body = document.getElementById('anuncio-texto').value.trim();
  const channels = [...document.querySelectorAll('.canal-chip.sel')].map(c => c.textContent);
  if (!body) return toast('Digite uma mensagem.', 'warn');
  if (!channels.length) return toast('Selecione pelo menos um canal.', 'warn');
  const when = prompt('Quando enviar? (formato AAAA-MM-DD HH:MM)');
  if (!when) return;
  const ts = Math.floor(new Date(when.replace(' ', 'T')).getTime() / 1000);
  if (!ts) return toast('Data invalida.', 'warn');
  try {
    await api('/api/announcements', {
      method: 'POST',
      body: JSON.stringify({
        channels, body,
        kind: document.getElementById('anuncio-tipo').value,
        embed_title: document.getElementById('embed-titulo')?.value,
        embed_color: document.getElementById('embed-cor')?.value,
        scheduled_for: ts
      })
    });
    loadAnuncios();
  } catch (e) { toast(e.message, 'err'); }
}

async function loadAnuncios() {
  try {
    const [sent, sched] = await Promise.all([
      api('/api/announcements'),
      api('/api/announcements/scheduled')
    ]);
    const hist = document.getElementById('anuncio-hist');
    const real = sent.filter(a => a.status === 'sent').slice(0, 10);
    hist.innerHTML = real.map(a => `
      <div class="anuncio-card">
        <div class="anuncio-header"><span class="anuncio-canal">${escapeHtml(a.channels)}</span>
        <span class="anuncio-hora">${formatDate(a.sent_at)}</span></div>
        <div class="anuncio-body">${escapeHtml(a.body)}</div>
        <div class="anuncio-footer"><span class="anuncio-status up">● enviado</span></div>
      </div>
    `).join('') || '<div style="color:#444;font-size:11px;font-family:IBM Plex Mono,monospace">nenhum anuncio enviado ainda.</div>';
    document.getElementById('hist-count').textContent = real.length + ' registros';

    const list = document.getElementById('sched-list');
    if (sched.length === 0) {
      list.innerHTML = 'nenhum agendamento ativo.';
    } else {
      list.innerHTML = sched.map(a => `
        <div style="padding:8px 10px;background:#0a0a0a;border-radius:5px;border:1px solid #1a1a1a;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
          <div><span style="color:#fff">${formatDate(a.scheduled_for)}</span>
          <span style="color:#444"> → </span><span style="color:#aaa">${escapeHtml(a.channels)}</span>
          <div style="color:#555;font-size:10px;margin-top:2px;">${escapeHtml(a.body.substring(0, 60))}${a.body.length > 60 ? '...' : ''}</div></div>
          <button class="btn-sm del" onclick="cancelarAgendamento(${a.id})">cancelar</button>
        </div>
      `).join('');
    }
    document.getElementById('sched-count').textContent = sched.length + ' pendentes';
  } catch (e) { console.warn('anuncios', e.message); }
}

async function cancelarAgendamento(id) {
  if (!await confirmAsync('Cancelar este agendamento?')) return;
  await api('/api/announcements/' + id, { method: 'DELETE' });
  loadAnuncios();
  toast('Agendamento cancelado.', 'ok');
}

// ---------- CONFIG ----------
async function loadConfig() {
  try {
    const cfg = await api('/api/config');
    document.querySelectorAll('#page-config input').forEach(inp => {
      const labelEl = inp.closest('.cfgitem')?.querySelector('.cfgtxt');
      if (!labelEl) return;
      const k = configKeyFromLabel(labelEl.textContent);
      if (k && cfg[k] != null) inp.value = cfg[k];
    });
    document.querySelectorAll('#page-config .toggle').forEach(t => {
      const labelEl = t.closest('.cfgitem')?.querySelector('.cfgtxt');
      const k = configKeyFromLabel(labelEl?.textContent || '');
      if (k && cfg[k] != null) t.classList.toggle('on', cfg[k] === '1');
    });
    const wm = document.getElementById('welcome-msg');
    if (wm && cfg.welcome_message != null) wm.value = cfg.welcome_message;
  } catch (e) { console.warn('config', e.message); }
}

async function saveConfig() {
  const payload = {};
  document.querySelectorAll('#page-config input').forEach(inp => {
    const k = configKeyFromLabel(inp.closest('.cfgitem')?.querySelector('.cfgtxt')?.textContent || '');
    if (k) payload[k] = inp.value;
  });
  document.querySelectorAll('#page-config .toggle').forEach(t => {
    const k = configKeyFromLabel(t.closest('.cfgitem')?.querySelector('.cfgtxt')?.textContent || '');
    if (k) payload[k] = t.classList.contains('on') ? '1' : '0';
  });
  const wm = document.getElementById('welcome-msg');
  if (wm) payload.welcome_message = wm.value;
  try { await api('/api/config', { method: 'PUT', body: JSON.stringify(payload) }); toast('Configuracao salva.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

function configKeyFromLabel(label) {
  const m = {
    'prefixo de comandos': 'prefix',
    'nome do bot': 'bot_name',
    'log de eventos ativo': 'log_events',
    'auto-moderação': 'auto_mod',
    'modo manutenção': 'maintenance',
    'canal de logs': 'logs_channel',
    'canal de boas-vindas': 'welcome_channel',
    'canal de vendas': 'sales_channel',
    'canal de moderação': 'mod_channel',
    'anti-spam': 'anti_spam',
    'anti-flood': 'anti_flood',
    'filtro de links': 'filter_links',
    'filtro de palavrões': 'filter_words',
    'alertas de ban': 'alert_bans',
    'alertas de venda': 'alert_sales',
    'relatório diário': 'daily_report',
    'webhook URL': 'webhook_url'
  };
  return m[label.trim()] || null;
}

// ---------- NAVEGACAO + UTILS ----------
const PAGE_META = {
  geral: ['Visão geral', 'resumo em tempo real do seu servidor'],
  membros: ['Membros', 'crescimento, lista e detalhes'],
  logs: ['Logs', 'todos os eventos do bot e do servidor'],
  mod: ['Moderação', 'bans, kicks, mutes e auto-mod'],
  vendas: ['Vendas', 'transações, receita e relatórios'],
  produtos: ['Produtos', 'gerencie seu catálogo'],
  clientes: ['Clientes', 'compradores agregados e LTV'],
  cupons: ['Cupons', 'descontos para a loja'],
  anuncios: ['Anúncios', 'envie e agende mensagens'],
  autoreply: ['Auto-respostas', 'gatilhos automáticos do bot'],
  config: ['Configurações', 'preferências do bot e canais']
};

function sp(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('show');
  el.classList.add('active');
  const meta = PAGE_META[id];
  if (meta) {
    document.getElementById('page-title').textContent = meta[0];
    document.getElementById('page-sub').textContent = meta[1];
  }
  document.getElementById('sidebar')?.classList.remove('open');
  if (id === 'geral') loadOverview();
  if (id === 'membros') loadMembros();
  if (id === 'logs') loadLogs();
  if (id === 'mod') loadMod();
  if (id === 'vendas') loadVendas();
  if (id === 'produtos') loadProdutos();
  if (id === 'clientes') loadClientes();
  if (id === 'cupons') loadCupons();
  if (id === 'autoreply') loadAutoReplies();
  if (id === 'anuncios') { populateProdSelect(); loadAnuncios(); }
  if (id === 'config') loadConfig();
}

function toggleForm(id) {
  const el = document.getElementById(id);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function anunciarProd(id) {
  const p = produtos.find(x => x.id === id);
  if (!p) return;
  sp('anuncios', document.querySelector('.nav .ni:nth-child(7)'));
  document.getElementById('anuncio-tipo').value = 'produto';
  setTimeout(() => {
    populateProdSelect();
    document.getElementById('prod-select').value = String(p.id);
    const price = 'R$ ' + (p.price_cents / 100).toFixed(2).replace('.', ',');
    document.getElementById('anuncio-texto').value = `Produto disponivel: ${p.name} por ${price}!\nAcesse a loja em ${location.origin}/loja.html`;
    updatePreview();
  }, 80);
}

function toggleCanal(el) { el.classList.toggle('sel'); updatePreview(); }

function addCanalCustom(e) {
  if (e.key !== 'Enter') return;
  let val = e.target.value.trim(); if (!val) return;
  if (!val.startsWith('#')) val = '#' + val;
  const chip = document.createElement('div');
  chip.className = 'canal-chip sel'; chip.textContent = val;
  chip.onclick = () => toggleCanal(chip);
  document.getElementById('canal-chips').appendChild(chip);
  e.target.value = ''; updatePreview();
}

function updatePreview() {
  const tipo = document.getElementById('anuncio-tipo').value;
  const texto = document.getElementById('anuncio-texto').value || 'sua mensagem vai aparecer aqui...';
  const canais = [...document.querySelectorAll('.canal-chip.sel')].map(c => c.textContent).join(', ') || '#geral';
  document.querySelector('.preview-label').textContent = 'discord — ' + canais;
  document.getElementById('preview-msg').textContent = texto;
  const emb = document.getElementById('preview-embed');
  document.getElementById('embed-fields').style.display = tipo === 'embed' ? 'block' : 'none';
  document.getElementById('produto-field').style.display = tipo === 'produto' ? 'block' : 'none';
  if (tipo === 'embed') {
    const titulo = document.getElementById('embed-titulo').value || 'Título do Embed';
    const cor = document.getElementById('embed-cor').value;
    emb.innerHTML = `<div class="embed-box" style="border-left-color:${cor}"><div class="embed-title">${escapeHtml(titulo)}</div><div class="embed-desc">${escapeHtml(texto)}</div></div>`;
    document.getElementById('preview-msg').textContent = '';
  } else if (tipo === 'produto') {
    const idx = document.getElementById('prod-select').value;
    const p = produtos.find(x => String(x.id) === idx);
    if (p) {
      const price = 'R$ ' + (p.price_cents / 100).toFixed(2).replace('.', ',');
      emb.innerHTML = `<div class="embed-box"><div class="embed-title">${escapeHtml(p.name)}</div><div class="embed-desc">${escapeHtml(p.description || '')}</div><div class="embed-price">${price}</div></div>`;
    } else { emb.innerHTML = ''; }
  } else { emb.innerHTML = ''; }
}

// ---------- CHART HELPERS ----------
const gc = () => ({
  x: { ticks: { color: '#333', font: { family: "'IBM Plex Mono'", size: 10 }, maxRotation: 0 }, grid: { color: '#161616' }, border: { color: '#1a1a1a' } },
  y: { ticks: { color: '#333', font: { family: "'IBM Plex Mono'", size: 10 } }, grid: { color: '#161616' }, border: { color: '#1a1a1a' } }
});

function renderChart(id, type, labels, datasets, opts = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) charts[id].destroy();
  const scales = opts.noScales ? {} : { ...gc(), ...(opts.y ? { y: { ...gc().y, ...opts.y } } : {}) };
  charts[id] = new Chart(el, {
    type, data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: opts.noScales ? {} : scales,
      cutout: opts.cutout
    }
  });
}

// ---------- UTILS ----------
function setMetric(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function formatNum(n) { return new Intl.NumberFormat('pt-BR').format(n || 0); }
function formatTime(ts) { return new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function formatDate(ts) { return new Date(ts * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`;
  return `há ${Math.floor(s / 86400)}d`;
}
function dotClass(type) {
  return ({ entrada: 'ok', cmd: 'inf', ban: 'err', kick: 'err', mute: 'wrn', warn: 'wrn', venda: 'ok', erro: 'err', anuncio: 'inf' })[type] || 'inf';
}
function typeBadge(type) {
  const styles = {
    entrada: 'background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a',
    saida: 'background:#1f0a0a;color:#ff5f5f;border:1px solid #3a1010',
    cmd: 'background:#1a1a1a;color:#fff;border:1px solid #333',
    ban: 'background:#1f0a0a;color:#ff5f5f;border:1px solid #3a1010',
    kick: 'background:#1f1600;color:#ffdf5f;border:1px solid #3a2800',
    mute: 'background:#0a0a1f;color:#a0a0ff;border:1px solid #1a1a3a',
    warn: 'background:#0a1500;color:#9fff5f;border:1px solid #1a3000',
    venda: 'background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a',
    anuncio: 'background:#1a1900;color:#ffdf5f;border:1px solid #3a3000',
    erro: 'background:#1f0a0a;color:#ff5f5f;border:1px solid #3a1010'
  };
  return `<span class="badge" style="${styles[type] || styles.cmd}">${type}</span>`;
}
function last14Labels() {
  const out = []; const now = new Date();
  for (let i = 13; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); out.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })); }
  return out;
}
function last6MonthLabels() {
  const out = []; const now = new Date();
  for (let i = 5; i >= 0; i--) { const d = new Date(now); d.setMonth(d.getMonth() - i); out.push(d.toLocaleDateString('pt-BR', { month: 'short' })); }
  return out;
}

// ---------- CLIENTES ----------
async function loadClientes() {
  try {
    const [sum, list] = await Promise.all([
      api('/api/customers/_/summary'),
      api('/api/customers?limit=200')
    ]);
    setText('cli-total', formatNum(sum.total_customers));
    setText('cli-new', formatNum(sum.new_today));
    setText('cli-ltv', 'R$' + (sum.avg_ltv_cents / 100).toFixed(2).replace('.', ','));
    setText('cli-top', list[0]?.discord_tag || list[0]?.discord_id || '—');
    setText('cli-count', list.length + ' registros');

    const tbody = document.getElementById('cli-tbody');
    tbody.innerHTML = list.length ? list.map(c => `
      <tr>
        <td class="hi">${escapeHtml(c.discord_tag || c.discord_id)}</td>
        <td>${c.paid_count} pagas</td>
        <td class="gr">R$${(c.total_cents / 100).toFixed(2).replace('.', ',')}</td>
        <td>${c.last_purchase_at ? formatDate(c.last_purchase_at) : '—'}</td>
        <td>${c.refunded_count > 0 ? `<span class="badge ban">${c.refunded_count}</span>` : '—'}</td>
        <td><button class="btn-sm" onclick="verCliente('${escapeAttr(c.discord_id)}')">detalhes</button></td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="color:#444">nenhum cliente ainda.</td></tr>';
  } catch (e) { console.warn('clientes', e.message); }
}

async function verCliente(id) {
  try {
    const list = await api('/api/customers/' + encodeURIComponent(id));
    const rows = list.length ? list.map(s => `
      <tr>
        <td style="font-size:10px;color:#666;">${new Date(s.created_at * 1000).toLocaleString('pt-BR')}</td>
        <td>${escapeHtml(s.product_name || '—')}</td>
        <td class="gr">R$${(s.amount_cents / 100).toFixed(2).replace('.', ',')}</td>
        <td>${s.status}</td>
      </tr>`).join('') : '<tr><td colspan="4" style="color:#444">sem compras.</td></tr>';
    openModal(`
      <div class="modal-title">cliente ${escapeHtml(id)}<button class="modal-close" onclick="closeModal()">×</button></div>
      <table class="vtable"><thead><tr><th>data</th><th>produto</th><th>valor</th><th>status</th></tr></thead>
      <tbody>${rows}</tbody></table>
    `);
  } catch (e) { toast(e.message, 'err'); }
}

async function refundSale(id) {
  if (!await confirmAsync('Reembolsar esta venda? Isso vai cancelar no Stripe e remover o cargo do comprador.')) return;
  try {
    await api('/api/sales/' + id + '/refund', { method: 'POST' });
    toast('Reembolso processado.', 'ok');
    loadVendas();
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- CUPONS ----------
async function loadCupons() {
  try {
    const list = await api('/api/coupons');
    document.getElementById('cup-count').textContent = list.filter(c => c.active).length;
    const tbody = document.getElementById('cup-tbody');
    tbody.innerHTML = list.length ? list.map(c => `
      <tr>
        <td class="hi" style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(c.code)}</td>
        <td class="gr">-${c.discount_percent}%</td>
        <td>${c.uses}</td>
        <td>${c.max_uses ?? '∞'}</td>
        <td>${c.expires_at ? formatDate(c.expires_at) : 'sem expiração'}</td>
        <td>${c.active ? '<span class="badge" style="background:#0a1f0a;color:#5fff5f;border:1px solid #1a4a1a">ativo</span>' : '<span class="badge" style="background:#1a1a1a;color:#666;border:1px solid #2a2a2a">inativo</span>'}</td>
        <td>${c.active ? `<button class="btn-sm del" onclick="removerCupom(${c.id})">desativar</button>` : ''}</td>
      </tr>
    `).join('') : '<tr><td colspan="7" style="color:#444">nenhum cupom cadastrado.</td></tr>';
  } catch (e) { console.warn('cupons', e.message); }
}

async function addCupom() {
  const code = document.getElementById('cup-code').value.trim();
  const discount_percent = document.getElementById('cup-pct').value.trim();
  const max_uses = document.getElementById('cup-max').value.trim() || null;
  const expVal = document.getElementById('cup-exp').value;
  const expires_at = expVal ? Math.floor(new Date(expVal).getTime() / 1000) : null;
  if (!code || !discount_percent) return toast('Preencha código e desconto.', 'warn');
  try {
    await api('/api/coupons', { method: 'POST', body: JSON.stringify({ code, discount_percent, max_uses, expires_at }) });
    document.getElementById('cup-code').value = '';
    document.getElementById('cup-pct').value = '';
    document.getElementById('cup-max').value = '';
    document.getElementById('cup-exp').value = '';
    toggleForm('cup-form');
    loadCupons();
  } catch (e) { toast(e.message, 'err'); }
}

async function removerCupom(id) {
  if (!await confirmAsync('Desativar este cupom?')) return;
  try { await api('/api/coupons/' + id, { method: 'DELETE' }); loadCupons(); toast('Cupom desativado.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- AUTO-RESPOSTAS ----------
async function loadAutoReplies() {
  try {
    const list = await api('/api/auto-replies');
    document.getElementById('ar-count').textContent = list.filter(a => a.active).length;
    const tbody = document.getElementById('ar-tbody');
    const matchLabel = { contains: 'contém', equals: 'exata', starts_with: 'começa' };
    tbody.innerHTML = list.length ? list.map(a => `
      <tr>
        <td class="hi" style="font-family:'IBM Plex Mono',monospace;">${escapeHtml(a.trigger)}</td>
        <td>${matchLabel[a.match_type] || a.match_type}</td>
        <td style="white-space:pre-wrap;color:#888;">${escapeHtml(a.response.substring(0, 120))}${a.response.length > 120 ? '...' : ''}</td>
        <td>${a.uses}</td>
        <td><div class="toggle ${a.active ? 'on' : ''}" onclick="toggleAutoReply(${a.id}, this)" style="display:inline-block;"></div></td>
        <td><button class="btn-sm del" onclick="removerAutoReply(${a.id})">remover</button></td>
      </tr>
    `).join('') : '<tr><td colspan="6" style="color:#444">nenhuma auto-resposta cadastrada. crie uma para o bot responder automaticamente.</td></tr>';
  } catch (e) { console.warn('autoreply', e.message); }
}

async function addAutoReply() {
  const trigger = document.getElementById('ar-trigger').value.trim();
  const match_type = document.getElementById('ar-match').value;
  const response = document.getElementById('ar-response').value.trim();
  if (!trigger || !response) return toast('Preencha gatilho e resposta.', 'warn');
  try {
    await api('/api/auto-replies', { method: 'POST', body: JSON.stringify({ trigger, match_type, response }) });
    document.getElementById('ar-trigger').value = '';
    document.getElementById('ar-response').value = '';
    toggleForm('ar-form');
    loadAutoReplies();
  } catch (e) { toast(e.message, 'err'); }
}

async function toggleAutoReply(id, el) {
  const active = !el.classList.contains('on');
  try {
    await api('/api/auto-replies/' + id, { method: 'PUT', body: JSON.stringify({ active }) });
    el.classList.toggle('on', active);
    loadAutoReplies();
  } catch (e) { toast(e.message, 'err'); }
}

async function removerAutoReply(id) {
  if (!await confirmAsync('Remover esta auto-resposta?')) return;
  try { await api('/api/auto-replies/' + id, { method: 'DELETE' }); loadAutoReplies(); toast('Auto-resposta removida.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

bootstrap();
setInterval(() => { if (document.getElementById('page-geral').classList.contains('show')) loadOverview(); }, 30000);
