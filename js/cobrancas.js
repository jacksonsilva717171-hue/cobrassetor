/* ═══════════════════════════════════════════════════════════════
   CobraSetor v1 — cobrancas.js
   Cobrança · Pagamento · Remarcar · Observação
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// TAB DE COBRANÇA
// ─────────────────────────────────────────────
function setTab(t, el) {
  cobTab = t;
  document.querySelectorAll('#sec-cobranca .ftab').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  renderCob();
}

// ─────────────────────────────────────────────
// RENDERIZAR LISTA DE COBRANÇA
// ─────────────────────────────────────────────
function renderCob() {
  const el    = document.getElementById('cobr-list');
  if (!el) return;

  // Para cobrador com 1 setor, pré-seleciona no dropdown
  if (USER?.role === 'cobrador') {
    const meus = Array.isArray(USER.setores) ? USER.setores : [USER.setor].filter(Boolean);
    const fset = document.getElementById('fsetor');
    if (fset && meus.length === 1 && !fset.value) fset.value = meus[0];
  }

  // Lê setor do dropdown (funciona para todos os roles)
  const setor = document.getElementById('fsetor')?.value || '';

  // Atualiza badges de cobrado
  _atualizarBadgesCobrado(setor);

  // Abas de COBRADO
  if (['cobhoje','cobsem','cobmes'].includes(cobTab)) {
    _renderCobrado(el, setor, cobTab);
    return;
  }

  // Abas de PENDENTES
  _renderPendentes(el, setor, cobTab);
}

function _atualizarBadgesCobrado(setor) {
  const agora     = new Date();
  const inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioSem = new Date(inicioDia); inicioSem.setDate(inicioDia.getDate() - 6);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const pags = _filtrarPagsPorSetor(setor);

  const set = (id, n) => { const b = document.getElementById(id); if (b) b.textContent = n; };
  set('badge-cobhoje', pags.filter(p => new Date(p.data) >= inicioDia).length);
  set('badge-cobsem',  pags.filter(p => new Date(p.data) >= inicioSem).length);
  set('badge-cobmes',  pags.filter(p => new Date(p.data) >= inicioMes).length);
}

function _filtrarPagsPorSetor(setor) {
  return PAG.filter(p => {
    if (USER.role === 'proprietario') {
      if (!(USER.setores||[]).includes(p.setor)) return false;
    }
    if (USER.role === 'cobrador') {
      const meus = Array.isArray(USER.setores) ? USER.setores : [USER.setor].filter(Boolean);
      if (!meus.includes(p.setor)) return false;
    }
    if (setor && p.setor !== setor) return false;
    return true;
  });
}

function _renderCobrado(el, setor, tab) {
  const agora     = new Date();
  const inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioSem = new Date(inicioDia); inicioSem.setDate(inicioDia.getDate() - 6);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  let pags = _filtrarPagsPorSetor(setor).filter(p => {
    const d = new Date(p.data);
    if (tab === 'cobhoje') return d >= inicioDia;
    if (tab === 'cobsem')  return d >= inicioSem;
    return d >= inicioMes;
  });
  pags.sort((a,b) => new Date(b.data) - new Date(a.data));

  if (!pags.length) {
    el.innerHTML = `<div class="empty"><div class="eico">💰</div>Nenhum pagamento registrado ${tab==='cobhoje'?'hoje':tab==='cobsem'?'esta semana':'este mês'}.</div>`;
    return;
  }

  const total    = pags.reduce((a,p) => a + parseFloat(p.valor||0), 0);
  const pDin     = pags.filter(p => p.forma === 'dinheiro');
  const pCart    = pags.filter(p => p.forma === 'cartao');
  const pPixP    = pags.filter(p => p.forma === 'pix_presencial' || p.forma === 'pix');
  const pPixA    = pags.filter(p => p.forma === 'pix_auto');

  const tDin  = pDin.reduce((a,p) => a + parseFloat(p.valor||0), 0);
  const tCart = pCart.reduce((a,p) => a + parseFloat(p.valor||0), 0);
  const tPixP = pPixP.reduce((a,p) => a + parseFloat(p.valor||0), 0);
  const tPixA = pPixA.reduce((a,p) => a + parseFloat(p.valor||0), 0);

  const label = tab === 'cobhoje' ? 'Hoje' : tab === 'cobsem' ? 'Semana' : 'Mês';

  el.innerHTML = `
    <div class="cobrado-resumo">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="color:var(--text2);font-size:13px;">💰 Total cobrado — <strong>${label}</strong></span>
        <span style="color:var(--accent3);font-size:22px;font-weight:700;">${fR(total)}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
        <div style="background:rgba(255,176,32,.08);border:1px solid rgba(255,176,32,.2);border-radius:8px;padding:8px 10px;">
          <div style="font-size:10px;color:var(--text3);margin-bottom:2px;">💵 Dinheiro (${pDin.length})</div>
          <div style="color:var(--warn);font-weight:700;font-size:15px;">${fR(tDin)}</div>
        </div>
        <div style="background:rgba(0,207,255,.08);border:1px solid rgba(0,207,255,.2);border-radius:8px;padding:8px 10px;">
          <div style="font-size:10px;color:var(--text3);margin-bottom:2px;">💳 Cartão (${pCart.length})</div>
          <div style="color:var(--info);font-weight:700;font-size:15px;">${fR(tCart)}</div>
        </div>
        <div style="background:rgba(0,232,122,.08);border:1px solid rgba(0,232,122,.2);border-radius:8px;padding:8px 10px;">
          <div style="font-size:10px;color:var(--text3);margin-bottom:2px;">✅ Pix Pres. (${pPixP.length})</div>
          <div style="color:var(--success);font-weight:700;font-size:15px;">${fR(tPixP)}</div>
        </div>
        <div style="background:rgba(200,125,255,.08);border:1px solid rgba(200,125,255,.2);border-radius:8px;padding:8px 10px;">
          <div style="font-size:10px;color:var(--text3);margin-bottom:2px;">🤖 Pix Auto (${pPixA.length})</div>
          <div style="color:var(--purple);font-weight:700;font-size:15px;">${fR(tPixA)}</div>
        </div>
      </div>
    </div>` +
    pags.map(p => {
      const dt  = fData(p.data);
      const cor = p.forma === 'pix_presencial' || p.forma === 'pix' ? 'var(--success)'
                : p.forma === 'cartao' ? 'var(--info)'
                : p.forma === 'pix_auto' ? 'var(--purple)'
                : 'var(--warn)';
      return `<div class="ccard" style="border-left:3px solid ${cor};">
        <div class="cinfo">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <span class="cb">${p.cid}</span>
            <strong>${p.nome}</strong>
            <span class="sb">${p.setor||'-'}</span>
            ${fpLbl(p.forma)}
          </div>
          <div style="font-size:12px;color:var(--text2);">
            🕐 ${dt} &nbsp;·&nbsp; 👮 ${p.vigia||'-'}
            ${p.mesPago ? ` &nbsp;·&nbsp; 📅 ${lbM(p.mesPago)}` : ''}
            ${p.obs ? `<br>💬 ${p.obs}` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="cval" style="color:${cor};">${fR(p.valor)}</div>
          <button class="btn bc bxs" onclick="openReciboFromPag('${p.cid}',${p.mesPago})" title="Gerar Recibo">🧾 Recibo</button>
        </div>
      </div>`;
    }).join('');
}

function _renderPendentes(el, setor, tab) {
  const badge = document.getElementById('fsetor-badge');

  let base = getClisFiltrados().filter(c => c.status !== 'inativo');

  // Para cobrador multi-setor, filtra pelo select de setor
  if (USER.role === 'cobrador' && Array.isArray(USER.setores) && setor) {
    base = base.filter(c => c.setor === setor);
  } else if (setor) {
    base = base.filter(c => c.setor === setor);
  }

  // Aba remarcados: mostra apenas remarcados para hoje ou passado (incluindo com data de retorno chegando)
  if (tab === 'remarcado') {
    const rem = base.filter(c => c.status === 'remarcado');
    if (!rem.length) {
      el.innerHTML = '<div class="empty"><div class="eico">🔵</div>Nenhum cliente remarcado.</div>';
      return;
    }
    el.innerHTML = sortClientes(rem).map(c => _renderCardRemarcado(c)).join('');
    return;
  }

  let list = base.filter(c => {
    const s = st(c);
    if (tab === 'hoje')     return s === 'hoje';
    if (tab === 'atrasado') return s === 'atrasado';
    return s === 'hoje' || s === 'atrasado';
  });

  // Badge de resumo do setor
  if (badge) {
    if (setor) {
      const todos = getClisFiltrados().filter(c => c.setor === setor && c.status !== 'inativo');
      badge.textContent = `${setor}: ${todos.length} clientes · ${fR(todos.reduce((a,c) => a+parseFloat(c.valor||0),0))}/mês`;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  if (!list.length) {
    const msg = tab === 'hoje' ? 'Nenhum vencimento hoje!' : tab === 'atrasado' ? 'Nenhum em atraso!' : 'Nenhuma cobrança pendente! 🎉';
    el.innerHTML = `<div class="empty"><div class="eico">🎉</div>${msg}</div>`;
    return;
  }

  el.innerHTML = sortClientes(list).map(c => _renderCardPendente(c)).join('');
}

function _renderCardPendente(c) {
  const s     = st(c);
  const mAtr  = calcMesesAtraso(c);
  const isL30 = mAtr >= 2;
  const cls   = s === 'atrasado' ? (isL30 ? 'late30-card late' : 'late') : 'today';

  const badgeStatus = s === 'atrasado'
    ? `<span style="color:var(--danger);font-size:11px;font-weight:700;">🔴 ATRASADO</span>`
    + (mAtr > 0 ? `<span style="background:var(--danger);color:#fff;border-radius:4px;padding:1px 6px;font-size:10px;margin-left:4px;">${mAtr} mês(es)</span>` : '')
    + (isL30 ? `<span class="late30" style="margin-left:4px;">30+ DIAS</span>` : '')
    : `<span style="color:var(--warn);font-size:11px;font-weight:700;">⚡ VENCE HOJE</span>`;

  const isAdmin = USER?.role === 'admin';
  const isProp  = USER?.role === 'proprietario';
  const isCobr  = USER?.role === 'cobrador';

  const btnPago    = `<button class="btn bs bsm" onclick="openPag('${c.id}')">✅ Pago</button>`;
  const btnRem     = `<button class="btn bi bsm" onclick="openRemarcar('${c.id}')">🔄 Remarcar</button>`;
  const btnObs     = `<button class="btn bw bsm" onclick="openObs('${c.id}')">✏️ Obs</button>`;
  const btnEdit    = (isAdmin || isProp) ? `<button class="btn bc bsm" onclick="openModal('${c.id}')">✏️ Editar</button>` : '';

  return `<div class="ccard ${cls}">
    <div class="cinfo">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px;">
        <span class="cb">${c.id}</span>
        <strong>${c.nome}</strong>
        ${badgeStatus}
        <span class="sb">${c.setor||'-'}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);">
        📍 ${addr(c)}
      </div>
      <div style="font-size:12px;color:var(--text2);margin-top:3px;">
        📱 ${c.tel||'N/A'} &nbsp;·&nbsp;
        ${fpLbl(c.formaPadrao||'dinheiro')} &nbsp;·&nbsp;
        📅 Venc: <strong style="color:${s==='atrasado'?'var(--danger)':'var(--warn)'}">Dia ${c.vencDia}/${lbM(c.proxVenc)}</strong>
        ${c.chavePix && c.pix === 'sim' ? `<br>🔑 PIX: <strong>${c.chavePix}</strong>` : ''}
        ${c.obs ? `<div class="obs-mini">💬 ${c.obs}</div>` : ''}
      </div>
    </div>
    <div class="cval">${fR(c.valor)}</div>
    <div class="cbtns">
      ${btnPago}
      ${btnRem}
      ${btnObs}
      ${btnEdit}
    </div>
  </div>`;
}

function _renderCardRemarcado(c) {
  const ret = c.dataRemarcacao
    ? new Date(c.dataRemarcacao + 'T00:00:00').toLocaleDateString('pt-BR')
    : 'sem data';
  return `<div class="ccard remar">
    <div class="cinfo">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px;">
        <span class="cb">${c.id}</span>
        <strong>${c.nome}</strong>
        <span style="color:var(--info);font-size:11px;font-weight:700;">🔵 REMARCADO</span>
        <span class="sb">${c.setor||'-'}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);">
        📅 Retorno: <strong style="color:var(--info);">${ret}</strong> &nbsp;·&nbsp; 📍 ${addr(c)}
        ${c.obs ? `<div class="obs-mini">💬 ${c.obs}</div>` : ''}
      </div>
    </div>
    <div class="cval" style="color:var(--info);">${fR(c.valor)}</div>
    <div class="cbtns">
      <button class="btn bs bsm" onclick="openPag('${c.id}')">✅ Pago</button>
      <button class="btn bw bsm" onclick="openObs('${c.id}')">✏️ Obs</button>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
// MODAL PAGAMENTO
// ─────────────────────────────────────────────
function openPag(id) {
  const c = CLI.find(x => x.id === id);
  if (!c) return;

  pagId  = id;
  pagVoltar = null;

  // Forma padrão: cobrador não pode usar pix_auto
  const formaIni = (c.formaPadrao === 'pix_auto' && USER.role === 'cobrador')
    ? 'pix_presencial'
    : (c.formaPadrao || 'dinheiro');
  pagForma = formaIni;

  // Info do cliente
  document.getElementById('p-info').innerHTML = `
    <strong style="font-size:14px;">${c.id} — ${c.nome}</strong><br>
    📍 ${addr(c)}<br>
    💰 ${fR(c.valor)}/mês &nbsp;·&nbsp; Venc. dia <strong>${c.vencDia}</strong><br>
    <span class="sb">${c.setor||'-'}</span>
    ${c.chavePix && c.pix === 'sim' ? `<br>🔑 Chave PIX: <strong>${c.chavePix}</strong>` : ''}`;

  // Meses de pagamento
  const pv   = parseInt(c.proxVenc) || YM(new Date());
  pagMes = pv;
  const opts = [pv, addM(pv,1), addM(pv,2), addM(pv,3)];
  document.getElementById('p-mes').innerHTML = opts.map((m, i) =>
    `<button class="pbtn${i===0?' sel':''}" onclick="selMes(this,${m})">${lbM(m)}${i===0?' (atual)':' (+'+i+')'}</button>`
  ).join('');

  // Formas de pagamento: cobrador não vê pix_auto
  const btnPixA = document.getElementById('btn-pf-pixa');
  if (btnPixA) btnPixA.style.display = USER.role === 'cobrador' ? 'none' : '';

  // Observação
  document.getElementById('p-obs').value = '';

  // Seleciona forma
  setForma(pagForma);

  // Desfazer: aparece se proxVenc está adiantado
  const yh     = YM(new Date());
  const divDes = document.getElementById('p-desfazer');
  if (pv > yh && divDes) {
    const voltar = [addM(pv,-1), addM(pv,-2), addM(pv,-3)].filter(m => m > 0);
    document.getElementById('p-voltar').innerHTML = voltar.map((m,i) =>
      `<button class="pbtn${i===0?' sel':''}" onclick="selVoltar(this,${m})">${lbM(m)}</button>`
    ).join('');
    pagVoltar = voltar[0] || null;
    divDes.classList.add('show');
  } else if (divDes) {
    divDes.classList.remove('show');
  }

  document.getElementById('pbg').classList.add('open');
}

function closePag() {
  document.getElementById('pbg').classList.remove('open');
  pagId = null;
}

function selMes(el, m) {
  pagMes = m;
  document.querySelectorAll('#p-mes .pbtn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
}

function selVoltar(el, m) {
  pagVoltar = m;
  document.querySelectorAll('#p-voltar .pbtn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
}

function setForma(f) {
  pagForma = f;
  const map = {
    dinheiro:       'btn-pf-din',
    cartao:         'btn-pf-cart',
    pix_presencial: 'btn-pf-pixp',
    pix_auto:       'btn-pf-pixa',
  };
  Object.entries(map).forEach(([forma, btnId]) => {
    document.getElementById(btnId)?.classList.toggle('sel', forma === f);
  });
}

async function desfazerPag() {
  const c = CLI.find(x => x.id === pagId);
  if (!c || !pagVoltar) return;
  if (!confirm(`Voltar vencimento de "${c.nome}" para ${lbM(pagVoltar)}?`)) return;

  const dados = { ...c, proxVenc: parseInt(pagVoltar) };
  const r = await sheetPost('editCliente', dados);
  if (r.ok) {
    const idx = CLI.findIndex(x => x.id === pagId);
    if (idx >= 0) CLI[idx].proxVenc = parseInt(pagVoltar);
    localStorage.setItem('eps_cli', JSON.stringify(CLI));
    closePag();
    renderAll();
    toast(`↩️ Vencimento de ${c.nome} voltado para ${lbM(pagVoltar)}`);
  } else {
    toast('❌ Erro ao desfazer.', 'err');
  }
}

async function confirmarPag() {
  const c = CLI.find(x => x.id === pagId);
  if (!c || !pagMes) return;

  const btn = document.getElementById('btn-confirmar-pag');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const novoPv = parseInt(addM(pagMes, 1));
  const obs    = document.getElementById('p-obs')?.value || '';

  const pag = {
    cid:     c.id,
    nome:    c.nome,
    setor:   c.setor,
    valor:   c.valor,
    forma:   pagForma,
    mesPago: parseInt(pagMes),
    novoPv,
    data:    new Date().toISOString(),
    vigia:   USER.usuario,
    obs,
  };

  // ── Atualiza estado local imediatamente (UI otimista) ──
  const idx = CLI.findIndex(x => x.id === pagId);
  if (idx >= 0) CLI[idx] = { ...CLI[idx], proxVenc: parseInt(novoPv) };
  localStorage.setItem('eps_cli', JSON.stringify(CLI));

  PAG.push(pag);
  const pagLocal = JSON.parse(localStorage.getItem('eps_pag') || '[]');
  pagLocal.push(pag);
  localStorage.setItem('eps_pag', JSON.stringify(pagLocal));

  // Bloqueia sync automático por 15s para não sobrescrever dados recém-salvos
  bloqSync = true;
  setTimeout(() => { bloqSync = false; }, 15000);

  // Fecha modal e atualiza lista na hora
  if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pagamento'; }
  closePag();
  renderAll();
  toast(`✅ ${c.nome} — Pago! Próx: Dia ${c.vencDia}/${lbM(novoPv)}`);

  // Abre modal de recibo para o cobrador enviar ao cliente
  openRecibo(c, pag);

  // Envia para Sheets em background (não bloqueia a UI)
  sheetPost('addPagamento', pag).catch(() => {});
}

// ─────────────────────────────────────────────
// MODAL REMARCAR
// ─────────────────────────────────────────────
function openRemarcar(id) {
  const c = CLI.find(x => x.id === id);
  if (!c) return;
  remarkId = id;

  document.getElementById('r-info').innerHTML = `
    <strong>${c.id} — ${c.nome}</strong><br>
    📍 ${addr(c)}<br>
    📅 Venc. dia <strong>${c.vencDia}</strong> · ${stLbl(st(c))}`;

  // Data padrão: amanhã
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  document.getElementById('r-data').value = amanha.toISOString().slice(0,10);
  document.getElementById('r-data').min   = hojeISO();
  document.getElementById('r-obs').value  = '';

  document.getElementById('rbg').classList.add('open');
}

function closeRemarcar() {
  document.getElementById('rbg').classList.remove('open');
  remarkId = null;
}

async function confirmarRemarcar() {
  const c = CLI.find(x => x.id === remarkId);
  if (!c) return;

  const data = document.getElementById('r-data').value;
  const obs  = document.getElementById('r-obs').value.trim();

  if (!data) { toast('⚠️ Selecione a data de retorno.', 'err'); return; }

  const dados = {
    ...c,
    status:          'remarcado',
    dataRemarcacao:  data,
    obs: obs ? `${c.obs ? c.obs + ' | ' : ''}[Remarcado ${new Date(data+'T00:00:00').toLocaleDateString('pt-BR')}]${obs ? ': ' + obs : ''}` : c.obs || '',
  };

  const r = await sheetPost('editCliente', dados);
  const idx = CLI.findIndex(x => x.id === remarkId);
  if (idx >= 0) CLI[idx] = normalizarCliente(dados);
  localStorage.setItem('eps_cli', JSON.stringify(CLI));

  closeRemarcar();
  renderAll();

  const retorno = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR');
  toast(`🔵 ${c.nome} remarcado para ${retorno}`);
}

// ─────────────────────────────────────────────
// MODAL OBSERVAÇÃO
// ─────────────────────────────────────────────
function openObs(id) {
  const c = CLI.find(x => x.id === id);
  if (!c) return;
  obsId = id;

  document.getElementById('ob-info').innerHTML = `
    <strong>${c.id} — ${c.nome}</strong><br>
    📍 ${addr(c)}`;
  document.getElementById('ob-texto').value = c.obs || '';
  document.getElementById('obg').classList.add('open');
}

function closeObs() {
  document.getElementById('obg').classList.remove('open');
  obsId = null;
}

async function salvarObs() {
  const c = CLI.find(x => x.id === obsId);
  if (!c) return;

  const texto = document.getElementById('ob-texto').value.trim();
  const dados = { ...c, obs: texto };

  const r = await sheetPost('editCliente', dados);
  const idx = CLI.findIndex(x => x.id === obsId);
  if (idx >= 0) CLI[idx] = normalizarCliente(dados);
  localStorage.setItem('eps_cli', JSON.stringify(CLI));

  closeObs();
  renderAll();
  toast(`✅ Observação salva para ${c.nome}`);
}

// ─────────────────────────────────────────────
// FECHAR MODAIS CLICANDO FORA
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pbg')?.addEventListener('click', function(e) { if (e.target === this) closePag(); });
  document.getElementById('rbg')?.addEventListener('click', function(e) { if (e.target === this) closeRemarcar(); });
  document.getElementById('obg')?.addEventListener('click', function(e) { if (e.target === this) closeObs(); });
  document.getElementById('recibobg')?.addEventListener('click', function(e) { if (e.target === this) closeRecibo(); });
});

// ═══════════════════════════════════════════════════════
// SISTEMA DE RECIBO
// ═══════════════════════════════════════════════════════
let _reciboAtual = null;

/** Determina empresa pelo setor */
function _getEmpresa(setor) {
  const m = (setor || '').match(/\d+/);
  const n = m ? parseInt(m[0]) : 0;
  if (n === 2 || n === 13) {
    return { nome: 'GRUPO EPS',       sub: 'Segurança Patrimonial',       cor: '#cc4400' };
  }
  if (n >= 3 && n <= 8) {
    return { nome: 'ELITE SEGURANÇA', sub: 'Monitoramento e Proteção',     cor: '#0055bb' };
  }
  // fallback pelo usuário logado
  if ((USER?.nome || '').toLowerCase().includes('vinicius')) {
    return { nome: 'ELITE SEGURANÇA', sub: 'Monitoramento e Proteção',     cor: '#0055bb' };
  }
  return   { nome: 'GRUPO EPS',       sub: 'Segurança Patrimonial',       cor: '#cc4400' };
}

function _formaLabelRecibo(forma) {
  return { dinheiro: 'Dinheiro', cartao: 'Cartão', pix_presencial: 'PIX Presencial', pix_auto: 'PIX Automático' }[forma] || forma;
}

/** Abre modal de recibo com dados do cliente + pagamento */
function openRecibo(c, pag) {
  _reciboAtual = { c: { ...c }, pag: { ...pag } };

  const empresa  = _getEmpresa(c.setor);
  const dataPag  = new Date(pag.data).toLocaleDateString('pt-BR');
  const mesRef   = lbM(pag.mesPago);
  const formaLb  = _formaLabelRecibo(pag.forma);
  const tel      = (c.tel || '').replace(/\D/g, '');

  document.getElementById('recibo-preview').innerHTML = `
    <div class="rec-empresa">
      <div class="rec-empresa-nome" style="color:${empresa.cor};">${empresa.nome}</div>
      <div class="rec-empresa-sub">${empresa.sub}</div>
    </div>
    <div class="rec-titulo">Recibo de Pagamento</div>

    <div class="rec-row">
      <span class="rec-key">Cliente</span>
      <span class="rec-val">${c.nome}</span>
    </div>
    <div class="rec-row">
      <span class="rec-key">ID</span>
      <span class="rec-val">${c.id}</span>
    </div>
    <div class="rec-row">
      <span class="rec-key">Setor</span>
      <span class="rec-val">${c.setor}</span>
    </div>
    <div class="rec-row">
      <span class="rec-key">Referência</span>
      <span class="rec-val">${mesRef}</span>
    </div>
    <div class="rec-row">
      <span class="rec-key">Vencimento</span>
      <span class="rec-val">Dia ${c.vencDia}</span>
    </div>
    <div class="rec-row">
      <span class="rec-key">Forma de pagamento</span>
      <span class="rec-val">${formaLb}</span>
    </div>

    <div class="rec-valor">
      <span class="rec-valor-lbl">Valor pago</span>
      <span class="rec-valor-num" style="color:${empresa.cor};">${fR(pag.valor)}</span>
    </div>

    <div class="rec-row">
      <span class="rec-key">Data do pagamento</span>
      <span class="rec-val">${dataPag}</span>
    </div>
    <div class="rec-row">
      <span class="rec-key">Cobrador</span>
      <span class="rec-val">${pag.vigia}</span>
    </div>
    ${pag.obs ? `<div class="rec-row"><span class="rec-key">Obs</span><span class="rec-val">${pag.obs}</span></div>` : ''}

    <div class="rec-footer">
      <span>Gerado por <strong>CobraSetor</strong></span>
      <span>✅ Pagamento confirmado</span>
    </div>
    <div class="rec-assin">Assinatura do Cobrador</div>
  `;

  // Esconde WhatsApp se não tem telefone válido
  const btnZap = document.getElementById('btn-recibo-zap');
  if (btnZap) btnZap.style.display = tel.length >= 10 ? '' : 'none';

  document.getElementById('recibobg').classList.add('open');
}

function closeRecibo() {
  document.getElementById('recibobg').classList.remove('open');
  _reciboAtual = null;
}

/** Abre modal de recibo a partir da lista de pagamentos (aba Cobrado) */
function openReciboFromPag(cid, mesPago) {
  const pag = [...PAG].reverse().find(p => p.cid === cid && parseInt(p.mesPago) === parseInt(mesPago));
  if (!pag) { toast('❌ Pagamento não encontrado na sessão.', 'err'); return; }
  const cObj = CLI.find(x => x.id === cid) || {
    id: cid, nome: pag.nome, setor: pag.setor, valor: pag.valor, vencDia: '-', tel: ''
  };
  openRecibo(cObj, pag);
}

/** Envia recibo via WhatsApp */
function enviarWhatsAppRecibo() {
  if (!_reciboAtual) return;
  const { c, pag } = _reciboAtual;

  const tel = (c.tel || '').replace(/\D/g, '');
  if (tel.length < 10) { toast('⚠️ Cliente sem telefone cadastrado.', 'err'); return; }

  const empresa = _getEmpresa(c.setor);
  const mesRef  = lbM(pag.mesPago);
  const dataPag = new Date(pag.data).toLocaleDateString('pt-BR');
  const formaLb = { dinheiro: 'Dinheiro', cartao: 'Cartão', pix_presencial: 'PIX Presencial', pix_auto: 'PIX Automático' }[pag.forma] || pag.forma;

  const msg =
`✅ *RECIBO DE PAGAMENTO*
━━━━━━━━━━━━━━━━━━━
🏢 *${empresa.nome}*
_${empresa.sub}_

👤 *Cliente:* ${c.nome}
🆔 *ID:* ${c.id}
📍 *Setor:* ${c.setor}

📅 *Referência:* ${mesRef}
📆 *Vencimento:* Dia ${c.vencDia}
💰 *Valor Pago:* ${fR(pag.valor)}
💳 *Forma:* ${formaLb}
🗓️ *Data:* ${dataPag}
━━━━━━━━━━━━━━━━━━━
✅ _Pagamento confirmado!_
_Gerado por CobraSetor_`;

  window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

/** Gera PDF do recibo usando jsPDF (carregado lazily) */
async function gerarReciboPDF() {
  if (!_reciboAtual) return;
  const { c, pag } = _reciboAtual;

  const btn = document.getElementById('btn-recibo-pdf');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Gerando...'; }

  try {
    // Carrega jsPDF apenas quando necessário
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const { jsPDF } = window.jspdf;
    const empresa   = _getEmpresa(c.setor);
    const mesRef    = lbM(pag.mesPago);
    const dataPag   = new Date(pag.data).toLocaleDateString('pt-BR');
    const formaLb   = { dinheiro: 'Dinheiro', cartao: 'Cartao',
                        pix_presencial: 'PIX Presencial', pix_auto: 'PIX Automatico' }[pag.forma] || pag.forma;

    // Dimensões: largura de cupom (80mm × 150mm)
    const doc = new jsPDF({ format: [80, 150], unit: 'mm', orientation: 'portrait' });

    const hex  = empresa.cor.replace('#', '');
    const corR = parseInt(hex.slice(0,2), 16);
    const corG = parseInt(hex.slice(2,4), 16);
    const corB = parseInt(hex.slice(4,6), 16);

    let y = 10;
    const cx = 40; // centro

    // Nome da empresa
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.setTextColor(corR, corG, corB);
    doc.text(empresa.nome, cx, y, { align: 'center' });
    y += 5;

    // Sub da empresa
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setTextColor(130, 130, 130);
    doc.text(empresa.sub, cx, y, { align: 'center' });
    y += 5;

    // Linha divisória
    doc.setDrawColor(40, 40, 40); doc.setLineWidth(0.4);
    doc.line(8, y, 72, y);
    y += 6;

    // Título
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text('RECIBO DE PAGAMENTO', cx, y, { align: 'center' });
    y += 7;

    // Função helper para linha chave:valor
    const row = (key, val) => {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text(key + ':', 10, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(25, 25, 25);
      const linhas = doc.splitTextToSize(String(val), 38);
      doc.text(linhas, 70, y, { align: 'right' });
      y += 5 * linhas.length;
    };

    row('Cliente',    c.nome);
    row('ID',         c.id);
    row('Setor',      c.setor);
    row('Referencia', mesRef);
    row('Vencimento', 'Dia ' + c.vencDia);
    row('Forma',      formaLb);

    y += 2;
    // Destaque do valor
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(8, y - 3, 64, 13, 2, 2, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('VALOR PAGO', 12, y + 2);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.setTextColor(corR, corG, corB);
    doc.text(fR(pag.valor), 70, y + 3, { align: 'right' });
    y += 16;

    row('Data',      dataPag);
    row('Cobrador',  pag.vigia);
    if (pag.obs) row('Obs', pag.obs);

    // Linha tracejada
    y += 2;
    doc.setDrawColor(180, 180, 180);
    doc.setLineDash([1, 1]);
    doc.line(8, y, 72, y);
    doc.setLineDash([]);
    y += 5;

    // Footer
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text('Gerado por CobraSetor', 10, y);
    doc.text('Pagamento confirmado', 70, y, { align: 'right' });
    y += 14;

    // Linha de assinatura
    doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.3);
    doc.line(18, y, 62, y);
    y += 4;
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Assinatura do Cobrador', cx, y, { align: 'center' });

    doc.save(`recibo-${c.id}-${mesRef.replace('/', '-')}.pdf`);

  } catch (_err) {
    // Fallback: abre janela para impressão
    toast('📄 Abrindo impressão como PDF...', '');
    _printRecibo(c, pag);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 PDF'; }
  }
}

/** Fallback de PDF via print (funciona offline) */
function _printRecibo(c, pag) {
  const empresa = _getEmpresa(c.setor);
  const mesRef  = lbM(pag.mesPago);
  const dataPag = new Date(pag.data).toLocaleDateString('pt-BR');
  const formaLb = _formaLabelRecibo(pag.forma);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Recibo — ${c.nome}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:320px;margin:0 auto;padding:20px;font-size:12px;color:#111;}
  h1{font-size:16px;text-align:center;color:${empresa.cor};margin:0 0 2px;}
  .sub{text-align:center;font-size:9px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;}
  .titulo{text-align:center;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;border-bottom:1px dashed #ccc;padding-bottom:8px;margin-bottom:10px;color:#333;}
  .row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0;}
  .key{color:#888;} .val{font-weight:bold;}
  .valor-box{background:#f0f0f0;border-radius:6px;padding:10px 14px;margin:12px 0;display:flex;justify-content:space-between;align-items:center;}
  .valor-lbl{font-size:10px;color:#666;text-transform:uppercase;} .valor-num{font-size:16px;font-weight:700;color:${empresa.cor};}
  .footer{margin-top:14px;font-size:9px;color:#aaa;display:flex;justify-content:space-between;border-top:1px dashed #ccc;padding-top:8px;}
  .assin{margin-top:22px;text-align:center;} .assin hr{border:none;border-top:1px solid #333;margin:0 20px 5px;} .assin p{font-size:9px;color:#777;margin:0;}
  @media print{body{max-width:none;} @page{margin:10mm;}}
</style></head><body>
<h1>${empresa.nome}</h1>
<div class="sub">${empresa.sub}</div>
<div class="titulo">Recibo de Pagamento</div>
<div class="row"><span class="key">Cliente</span><span class="val">${c.nome}</span></div>
<div class="row"><span class="key">ID</span><span class="val">${c.id}</span></div>
<div class="row"><span class="key">Setor</span><span class="val">${c.setor}</span></div>
<div class="row"><span class="key">Referência</span><span class="val">${mesRef}</span></div>
<div class="row"><span class="key">Vencimento</span><span class="val">Dia ${c.vencDia}</span></div>
<div class="row"><span class="key">Forma</span><span class="val">${formaLb}</span></div>
<div class="valor-box"><span class="valor-lbl">Valor Pago</span><span class="valor-num">${fR(pag.valor)}</span></div>
<div class="row"><span class="key">Data</span><span class="val">${dataPag}</span></div>
<div class="row"><span class="key">Cobrador</span><span class="val">${pag.vigia}</span></div>
${pag.obs ? `<div class="row"><span class="key">Obs</span><span class="val">${pag.obs}</span></div>` : ''}
<div class="footer"><span>CobraSetor</span><span>Pagamento confirmado ✅</span></div>
<div class="assin"><hr><p>Assinatura do Cobrador</p></div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=640,height=800');
  if (w) { w.document.write(html); w.document.close(); }
}
