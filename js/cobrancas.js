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
    const pSetor = (p.setor || '').trim().toLowerCase();
    if (USER.role === 'proprietario') {
      const meusNorm = (USER.setores || []).map(s => s.trim().toLowerCase());
      if (!meusNorm.includes(pSetor)) return false;
    }
    if (USER.role === 'cobrador') {
      const meus = Array.isArray(USER.setores) ? USER.setores : [USER.setor].filter(Boolean);
      if (!meus.map(s => s.trim().toLowerCase()).includes(pSetor)) return false;
    }
    if (setor && pSetor !== setor.trim().toLowerCase()) return false;
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
  const pv  = parseInt(c.proxVenc) || YM(new Date());
  const yh  = YM(new Date());
  const dh  = new Date().getDate();
  const vd  = parseInt(c.vencDia) || 1;
  // Avança o mês padrão até que pagar esse mês tire o cliente da lista de atraso
  let defaultMes = pv;
  for (let m = pv; m <= addM(yh, 2); m = addM(m, 1)) {
    const testPv = addM(m, 1);
    if (testPv > yh || (testPv === yh && vd >= dh)) { defaultMes = m; break; }
  }
  pagMes = defaultMes;
  let opts = [pv, addM(pv,1), addM(pv,2), addM(pv,3)];
  if (!opts.includes(defaultMes)) opts.push(defaultMes);
  document.getElementById('p-mes').innerHTML = opts.map((m) => {
    const isSel = m === defaultMes;
    const lbl = m < yh ? ' (passado)' : m === yh && vd < dh ? ' (passado)' : m === pv && m !== defaultMes ? ' (1º)' : '';
    return `<button class="pbtn${isSel?' sel':''}" onclick="selMes(this,${m})">${lbM(m)}${lbl}</button>`;
  }).join('');

  // Formas de pagamento: cobrador não vê pix_auto
  const btnPixA = document.getElementById('btn-pf-pixa');
  if (btnPixA) btnPixA.style.display = USER.role === 'cobrador' ? 'none' : '';

  // Observação
  document.getElementById('p-obs').value = '';

  // Seleciona forma
  setForma(pagForma);

  // Desfazer: aparece se proxVenc está adiantado
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

let _pagando = false; // guard contra toque duplo no mobile

async function confirmarPag() {
  if (_pagando) return;          // bloqueia 2ª chamada antes da 1ª terminar
  _pagando = true;

  const c = CLI.find(x => x.id === pagId);
  if (!c || !pagMes) { _pagando = false; return; }

  const btn = document.getElementById('btn-confirmar-pag');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const novoPv = parseInt(addM(pagMes, 1));
  const obs    = document.getElementById('p-obs')?.value || '';

  // Avisa se já existe pagamento para o mesmo mês
  const pagDuplicado = PAG.some(p => p.cid === c.id && parseInt(p.mesPago) === parseInt(pagMes));
  if (pagDuplicado) {
    const ok = confirm(`⚠️ ${c.nome} já tem pagamento registrado para ${lbM(pagMes)}.\n\nConfirmar mesmo assim?`);
    if (!ok) {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pagamento'; }
      _pagando = false;
      return;
    }
  }

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

  // Bloqueia sync por 5min para não sobrescrever dados recém-salvos
  // Persiste no sessionStorage para sobreviver a page reload (iOS retorna do WhatsApp recarregando a página)
  bloqSync = true;
  const _bloqExp = Date.now() + 300000; // 5 minutos
  sessionStorage.setItem('bloqSync_exp', _bloqExp.toString());
  setTimeout(() => { bloqSync = false; sessionStorage.removeItem('bloqSync_exp'); }, 300000);

  // Fecha modal e atualiza lista na hora
  if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pagamento'; }
  _pagando = false;  // libera guard
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
  if (r && r.ok === false) {
    toast(`⚠️ Remarcação de ${c.nome} salva localmente, mas o Sheets recusou — será reenviada no próximo sync.`, 'err');
  } else {
    toast(`🔵 ${c.nome} remarcado para ${retorno}`);
  }
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

// Recibo: ver js/recibo.js
// _getEmpresa, openRecibo, closeRecibo, etc. definidos em recibo.js
