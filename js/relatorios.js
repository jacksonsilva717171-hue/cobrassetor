/* ═══════════════════════════════════════════════════════════════
   CobraSetor v1 — relatorios.js
   Relatório Financeiro · Despesas · Cobradores · Proprietários
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// RELATÓRIO FINANCEIRO
// ─────────────────────────────────────────────
function setRelTab(t, el) {
  relTab = t;
  document.querySelectorAll('.rel-tabs .ftab').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  renderRel();
}

function renderRel() {
  if (!USER || USER.role === 'cobrador') return;
  // só renderiza se a seção estiver visível (evita trabalho desnecessário)
  const secRel = document.getElementById('sec-relatorio');
  if (!secRel) return;
  const ativa = secRel.classList.contains('active');
  if (!ativa) return;

  const agora     = new Date();
  const inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicioSem = new Date(inicioDia); inicioSem.setDate(inicioDia.getDate() - 6);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  let inicio;
  if (relTab === 'dia') inicio = inicioDia;
  else if (relTab === 'sem') inicio = inicioSem;
  else inicio = inicioMes;

  // Filtra pagamentos do período e dos setores do usuário
  const meusSetores = getMeusSetores();
  const pagsAll = PAG.filter(p => {
    if (USER.role === 'proprietario' && !meusSetores.includes(p.setor)) return false;
    return new Date(p.data) >= inicio;
  });

  // Filtra despesas do período
  const despAll = DESP.filter(d => {
    if (USER.role === 'proprietario' && !meusSetores.includes(d.setor)) return false;
    const dData = new Date(d.data + 'T00:00:00');
    return dData >= inicio;
  });

  const totalRec  = pagsAll.reduce((a,p) => a + parseFloat(p.valor||0), 0);
  const totalDesp = despAll.reduce((a,d) => a + parseFloat(d.valor||0), 0);
  const saldo     = totalRec - totalDesp;

  // Clientes ativos (em aberto + inadimplentes)
  const cliAtivos = getClisFiltrados().filter(c => c.status !== 'inativo');
  const emAberto  = cliAtivos.filter(c => ['hoje','atrasado'].includes(st(c)));
  const inad30    = cliAtivos.filter(c => calcMesesAtraso(c) >= 2);
  const totalAberto = emAberto.reduce((a,c) => a + parseFloat(c.valor||0), 0);
  const totalInad   = inad30.reduce((a,c) => a + parseFloat(c.valor||0), 0);

  // Por forma
  const pDin  = pagsAll.filter(p => p.forma === 'dinheiro');
  const pCart = pagsAll.filter(p => p.forma === 'cartao');
  const pPixP = pagsAll.filter(p => p.forma === 'pix_presencial' || p.forma === 'pix');
  const pPixA = pagsAll.filter(p => p.forma === 'pix_auto');

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Cards resumo
  set('r-recebido',    fR(totalRec));
  set('rc-recebido',   pagsAll.length + ' pagamento(s)');
  set('r-despesas',    fR(totalDesp));
  set('rc-despesas',   despAll.length + ' lançamento(s)');
  set('r-saldo',       fR(saldo));
  set('rc-saldo',      saldo >= 0 ? '✅ positivo' : '🔴 negativo');
  set('r-aberto',      fR(totalAberto));
  set('rc-aberto',     emAberto.length + ' cliente(s)');
  set('r-inadimplente', fR(totalInad));
  set('rc-inadimplente', inad30.length + ' cliente(s) 30+ dias');

  // Cor do saldo financeiro
  const elSaldo = document.getElementById('r-saldo');
  if (elSaldo) elSaldo.style.color = saldo >= 0 ? 'var(--success)' : 'var(--danger)';

  // ── Variação de clientes (sempre calcula no mês atual, independente da aba) ──
  const inicioMesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fimMesAtual    = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);
  const todosClisProp  = getClisFiltrados(); // inclui inativos

  const novosDoMes = todosClisProp.filter(c => {
    if (!c.criadoEm) return false;
    const dt = new Date(c.criadoEm);
    return dt >= inicioMesAtual && dt <= fimMesAtual;
  });

  const desistiuDoMes = todosClisProp.filter(c => {
    if (c.status !== 'inativo' || !c.inativadoEm) return false;
    const dt = new Date(c.inativadoEm + 'T00:00:00');
    return dt >= inicioMesAtual && dt <= fimMesAtual;
  });

  const totalAtivos   = todosClisProp.filter(c => c.status !== 'inativo').length;
  const saldoVar      = novosDoMes.length - desistiuDoMes.length;

  set('r-novos',       novosDoMes.length);
  set('rc-novos',      novosDoMes.length === 1 ? '1 novo cadastro' : `${novosDoMes.length} novos cadastros`);
  set('r-desist',      desistiuDoMes.length);
  set('rc-desist',     desistiuDoMes.length === 1 ? '1 desistência' : `${desistiuDoMes.length} desistências`);
  set('r-saldo-var',   (saldoVar > 0 ? '+' : '') + saldoVar);
  set('rc-saldo-var',  saldoVar > 0 ? '▲ crescimento' : saldoVar < 0 ? '▼ redução' : '= estável');
  set('r-total-ativos', totalAtivos);
  set('rc-total-ativos', `${todosClisProp.filter(c=>c.status==='inativo').length} inativos`);

  const elSaldoVar = document.getElementById('r-saldo-var');
  if (elSaldoVar) elSaldoVar.style.color = saldoVar > 0 ? 'var(--success)' : saldoVar < 0 ? 'var(--danger)' : 'var(--text2)';
  const cardVar = document.getElementById('card-saldo-var');
  if (cardVar) cardVar.style.borderLeftColor = saldoVar > 0 ? 'var(--success)' : saldoVar < 0 ? 'var(--danger)' : 'var(--text2)';

  // Por forma
  const soma = arr => arr.reduce((a,p) => a + parseFloat(p.valor||0), 0);
  set('r-din',  fR(soma(pDin)));  set('rc-din',  pDin.length  + ' pag.');
  set('r-cart', fR(soma(pCart))); set('rc-cart', pCart.length + ' pag.');
  set('r-pixp', fR(soma(pPixP))); set('rc-pixp', pPixP.length + ' pag.');
  set('r-pixa', fR(soma(pPixA))); set('rc-pixa', pPixA.length + ' pag.');

  // ── Tabela: Resultado por setor (cobrado − despesas = saldo) ──
  const tbRS = document.getElementById('tb-rel-resultado-setor');
  if (tbRS) {
    // une setores que aparecem em pagamentos OU em despesas
    const todosSetores = [...new Set([
      ...pagsAll.map(p => p.setor || 'Sem Setor'),
      ...despAll.map(d => d.setor || 'Sem Setor'),
    ])].sort();

    if (!todosSetores.length) {
      tbRS.innerHTML = '<tr><td colspan="4"><div class="empty">Nenhum dado neste período.</div></td></tr>';
    } else {
      let totCob = 0, totDesp = 0;
      const rows = todosSetores.map(s => {
        const cobrado = pagsAll.filter(p => (p.setor || 'Sem Setor') === s)
                               .reduce((a, p) => a + parseFloat(p.valor || 0), 0);
        const despesas = despAll.filter(d => (d.setor || 'Sem Setor') === s)
                                .reduce((a, d) => a + parseFloat(d.valor || 0), 0);
        const sal = cobrado - despesas;
        totCob += cobrado; totDesp += despesas;
        const salColor = sal >= 0 ? 'var(--success)' : 'var(--danger)';
        return `<tr>
          <td><span class="sb">${s}</span></td>
          <td style="color:var(--success);font-weight:700;">${fR(cobrado)}</td>
          <td style="color:var(--danger);font-weight:600;">${despesas > 0 ? fR(despesas) : '<span style="color:var(--text3)">-</span>'}</td>
          <td style="color:${salColor};font-weight:700;">${fR(sal)}</td>
        </tr>`;
      });
      const totSal = totCob - totDesp;
      const totSalColor = totSal >= 0 ? 'var(--success)' : 'var(--danger)';
      rows.push(`<tr style="border-top:2px solid var(--border);background:rgba(255,107,0,.05);">
        <td style="font-weight:700;color:var(--accent);">TOTAL</td>
        <td style="color:var(--success);font-weight:700;">${fR(totCob)}</td>
        <td style="color:var(--danger);font-weight:700;">${totDesp > 0 ? fR(totDesp) : '-'}</td>
        <td style="color:${totSalColor};font-weight:700;">${fR(totSal)}</td>
      </tr>`);
      tbRS.innerHTML = rows.join('');
    }
  }

  // ── Tabela: Cobrado por setor ──
  const tbCS = document.getElementById('tb-rel-cobrado-setor');
  if (tbCS) {
    const mapaS = {};
    pagsAll.forEach(p => {
      const s = p.setor || 'Sem Setor';
      if (!mapaS[s]) mapaS[s] = [];
      mapaS[s].push(p);
    });
    const ks = Object.keys(mapaS).sort();
    if (!ks.length) {
      tbCS.innerHTML = '<tr><td colspan="7"><div class="empty">Nenhum pagamento neste período.</div></td></tr>';
    } else {
      let totPag = 0, totRec = 0, totDin = 0, totPix = 0, totCart = 0, totPixA = 0;
      const rows = ks.map(s => {
        const ps   = mapaS[s];
        const rec  = ps.reduce((a,p) => a + parseFloat(p.valor||0), 0);
        const din  = ps.filter(p => p.forma === 'dinheiro')
                       .reduce((a,p) => a + parseFloat(p.valor||0), 0);
        const pix  = ps.filter(p => p.forma === 'pix_presencial' || p.forma === 'pix')
                       .reduce((a,p) => a + parseFloat(p.valor||0), 0);
        const cart = ps.filter(p => p.forma === 'cartao')
                       .reduce((a,p) => a + parseFloat(p.valor||0), 0);
        const pixA = ps.filter(p => p.forma === 'pix_auto')
                       .reduce((a,p) => a + parseFloat(p.valor||0), 0);
        totPag += ps.length; totRec += rec;
        totDin += din; totPix += pix; totCart += cart; totPixA += pixA;
        return `<tr>
          <td><span class="sb">${s}</span></td>
          <td style="text-align:center;color:var(--text2);">${ps.length}</td>
          <td style="color:var(--success);font-weight:700;">${fR(rec)}</td>
          <td style="color:var(--warn);">${din  > 0 ? fR(din)  : '<span style="color:var(--text3)">-</span>'}</td>
          <td style="color:var(--success);">${pix  > 0 ? fR(pix)  : '<span style="color:var(--text3)">-</span>'}</td>
          <td style="color:var(--info);">${cart > 0 ? fR(cart) : '<span style="color:var(--text3)">-</span>'}</td>
          <td style="color:var(--purple);">${pixA > 0 ? fR(pixA) : '<span style="color:var(--text3)">-</span>'}</td>
        </tr>`;
      });
      // Linha de total
      rows.push(`<tr style="border-top:2px solid var(--border);background:rgba(255,107,0,.05);">
        <td style="font-weight:700;color:var(--accent);">TOTAL</td>
        <td style="text-align:center;font-weight:700;color:var(--accent);">${totPag}</td>
        <td style="color:var(--success);font-weight:700;">${fR(totRec)}</td>
        <td style="color:var(--warn);font-weight:700;">${totDin  > 0 ? fR(totDin)  : '-'}</td>
        <td style="color:var(--success);font-weight:700;">${totPix  > 0 ? fR(totPix)  : '-'}</td>
        <td style="color:var(--info);font-weight:700;">${totCart > 0 ? fR(totCart) : '-'}</td>
        <td style="color:var(--purple);font-weight:700;">${totPixA > 0 ? fR(totPixA) : '-'}</td>
      </tr>`);
      tbCS.innerHTML = rows.join('');
    }
  }

  // Tabela pagamentos
  const tb = document.getElementById('tb-rel');
  if (tb) {
    if (!pagsAll.length) {
      tb.innerHTML = '<tr><td colspan="8"><div class="empty">Nenhum pagamento neste período.</div></td></tr>';
    } else {
      tb.innerHTML = [...pagsAll].reverse().map(p => {
        return `<tr>
          <td style="font-size:12px;color:var(--text2);white-space:nowrap;">${fData(p.data)}</td>
          <td><strong>${p.nome}</strong></td>
          <td><span class="cb">${p.cid}</span></td>
          <td><span class="sb">${p.setor||'-'}</span></td>
          <td style="color:var(--accent3);font-weight:600;">${fR(p.valor)}</td>
          <td>${fpLbl(p.forma)}</td>
          <td><span class="nvb">${lbM(p.mesPago)}</span></td>
          <td style="font-size:12px;color:var(--text2);">${p.vigia||'-'}</td>
        </tr>`;
      }).join('');
    }
  }

  // Tabela por setor
  const tbSetor = document.getElementById('tb-rel-setor');
  if (tbSetor) {
    const mapa = {};
    cliAtivos.forEach(c => {
      const s = c.setor || 'Sem Setor';
      if (!mapa[s]) mapa[s] = [];
      mapa[s].push(c);
    });
    const keys = Object.keys(mapa).sort();
    if (!keys.length) {
      tbSetor.innerHTML = '<tr><td colspan="6"><div class="empty">Sem dados.</div></td></tr>';
    } else {
      tbSetor.innerHTML = keys.map(s => {
        const clis    = mapa[s];
        const ativos  = clis.filter(c => c.status !== 'inativo').length;
        const inad    = clis.filter(c => calcMesesAtraso(c) >= 1).length;
        const inad30s = clis.filter(c => calcMesesAtraso(c) >= 2).length;
        const rec     = clis.reduce((a,c) => a + parseFloat(c.valor||0), 0);
        return `<tr>
          <td><span class="sb">${s}</span></td>
          <td style="text-align:center;">${clis.length}</td>
          <td style="text-align:center;color:var(--success);">${ativos}</td>
          <td style="text-align:center;color:var(--warn);">${inad}</td>
          <td style="text-align:center;color:var(--danger);font-weight:${inad30s?'700':'400'};">${inad30s}</td>
          <td style="color:var(--accent3);font-weight:600;">${fR(rec)}</td>
        </tr>`;
      }).join('');
    }
  }
}

// ─────────────────────────────────────────────
// DESPESAS
// ─────────────────────────────────────────────
function renderDesp() {
  if (!USER || USER.role === 'cobrador') return;
  const tb = document.getElementById('tb-desp');
  if (!tb) return;

  const filSet = document.getElementById('desp-setor')?.value || '';
  const filMes = document.getElementById('desp-mes')?.value   || '';

  // Popula select de meses (últimos 6)
  const selMes = document.getElementById('desp-mes');
  if (selMes && selMes.children.length <= 1) {
    const yh = YM(new Date());
    let opts = '<option value="">Todos os meses</option>';
    for (let i = 0; i <= 5; i++) {
      const m = addM(yh, -i);
      opts += `<option value="${m}">${lbM(m)}</option>`;
    }
    selMes.innerHTML = opts;
  }

  const meusSetores = getMeusSetores();
  let list = DESP.filter(d => {
    if (USER.role === 'proprietario' && !meusSetores.includes(d.setor)) return false;
    if (filSet && d.setor !== filSet) return false;
    if (filMes) {
      const dData = new Date((d.data||'') + 'T00:00:00');
      const dYM   = YM(dData);
      if (dYM !== parseInt(filMes)) return false;
    }
    return true;
  });

  list.sort((a,b) => (b.data||'').localeCompare(a.data||''));

  const total = list.reduce((s,d) => s + parseFloat(d.valor||0), 0);
  const totEl = document.getElementById('desp-total-txt');
  if (totEl) totEl.textContent = list.length ? `Total: ${fR(total)}` : '';

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="eico">📦</div>Nenhuma despesa encontrada.</div></td></tr>';
    return;
  }

  const isProp  = USER.role === 'proprietario';
  const isAdmin = USER.role === 'admin';

  tb.innerHTML = list.map(d => {
    const dt = d.data ? new Date(d.data+'T00:00:00').toLocaleDateString('pt-BR') : '-';
    return `<tr>
      <td style="white-space:nowrap;">${dt}</td>
      <td><strong>${d.nome||'-'}</strong></td>
      <td><span class="sb">${d.setor||'-'}</span></td>
      <td style="color:var(--danger);font-weight:600;">${fR(d.valor)}</td>
      <td style="font-size:12px;color:var(--text2);max-width:120px;">${d.obs||'-'}</td>
      <td><div style="display:flex;gap:4px;">
        ${isProp||isAdmin ? `<button class="btn bw bsm" onclick="openDesp('${d.id}')">✏️</button>
        <button class="btn bd bsm" onclick="confirmarDelDesp('${d.id}')">🗑️</button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

function openDesp(id = null) {
  editDespId = id;
  const setores = getMeusSetores();
  const deS = document.getElementById('de-setor');
  if (deS) {
    deS.innerHTML = '<option value="">Selecione o setor...</option>'
      + setores.map(s => `<option value="${s}">${s}</option>`).join('');
  }

  if (id) {
    const d = DESP.find(x => x.id === id);
    document.getElementById('de-title').textContent = '✏️ EDITAR DESPESA';
    document.getElementById('de-nome').value  = d.nome  || '';
    document.getElementById('de-valor').value = d.valor || '';
    document.getElementById('de-data').value  = d.data  || hojeISO();
    document.getElementById('de-setor').value = d.setor || '';
    document.getElementById('de-obs').value   = d.obs   || '';
  } else {
    document.getElementById('de-title').textContent = '📦 NOVA DESPESA';
    document.getElementById('de-nome').value  = '';
    document.getElementById('de-valor').value = '';
    document.getElementById('de-data').value  = hojeISO();
    document.getElementById('de-setor').value = setores.length === 1 ? setores[0] : '';
    document.getElementById('de-obs').value   = '';
  }
  document.getElementById('desbg').classList.add('open');
}

function closeDesp() {
  document.getElementById('desbg').classList.remove('open');
  editDespId = null;
}

async function salvarDesp() {
  const nome  = (document.getElementById('de-nome')?.value  || '').trim();
  const valor = parseFloat(document.getElementById('de-valor')?.value);
  const data  = document.getElementById('de-data')?.value || '';
  const setor = document.getElementById('de-setor')?.value || '';
  const obs   = (document.getElementById('de-obs')?.value || '').trim();

  if (!nome)  { toast('⚠️ Nome da despesa obrigatório.', 'err'); return; }
  if (!valor || valor <= 0) { toast('⚠️ Valor inválido.', 'err'); return; }
  if (!data)  { toast('⚠️ Data obrigatória.', 'err'); return; }
  if (!setor) { toast('⚠️ Setor obrigatório.', 'err'); return; }

  const dados = {
    id:        editDespId || ('D' + Date.now()),
    setor, nome, valor, data, obs,
    criadoPor: USER.usuario,
    criadoEm:  editDespId ? (DESP.find(d => d.id === editDespId)?.criadoEm || new Date().toISOString()) : new Date().toISOString(),
  };

  const acao = editDespId ? 'editDespesa' : 'addDespesa';
  const r    = await sheetPost(acao, dados);

  const idx = DESP.findIndex(d => d.id === dados.id);
  if (idx >= 0) DESP[idx] = dados; else DESP.push(dados);
  localStorage.setItem('cobr_desp', JSON.stringify(DESP));

  closeDesp();
  renderDesp();
  toast(editDespId ? '✅ Despesa atualizada!' : `✅ Despesa "${nome}" cadastrada!`);
}

function confirmarDelDesp(id) {
  if (!confirm('Excluir esta despesa?')) return;
  delDesp(id);
}

async function delDesp(id) {
  await sheetPost('delDespesa', { id });
  DESP = DESP.filter(d => d.id !== id);
  localStorage.setItem('cobr_desp', JSON.stringify(DESP));
  renderDesp();
  toast('🗑️ Despesa removida.');
}

// ─────────────────────────────────────────────
// COBRADORES (gerenciado pelo proprietário)
// ─────────────────────────────────────────────
function renderCobradores() {
  const tb = document.getElementById('tb-cobradores');
  if (!tb || USER?.role === 'admin') return;

  const meusSetores = USER.setores || [];
  const cobradores = USUARIOS.filter(u => {
    if (u.role !== 'cobrador' && u.role !== 'vigia') return false;
    if (u.proprietario === USER.usuario) return true;
    // Inclui cobradores do EPS legado (sem campo proprietario) que têm setor do proprietário
    if (!u.proprietario) {
      const uSets = Array.isArray(u.setores) ? u.setores : [u.setor].filter(Boolean);
      return uSets.some(s => meusSetores.includes(s));
    }
    return false;
  });

  if (!cobradores.length) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty"><div class="eico">👮</div>Nenhum cobrador cadastrado.</div></td></tr>';
    return;
  }

  tb.innerHTML = cobradores.map(v => {
    const setores  = Array.isArray(v.setores) ? v.setores : [v.setor].filter(Boolean);
    const bloq     = v.bloqueado;
    const statusHtml = bloq
      ? '<span style="color:var(--danger);font-weight:700;">🚫 Bloqueado</span>'
      : '<span style="color:var(--success);font-weight:700;">✅ Ativo</span>';
    return `<tr>
      <td><strong>${v.nome}</strong></td>
      <td><span class="cb">${v.usuario}</span></td>
      <td>${setores.map(s => `<span class="sb">${s}</span>`).join(' ')}</td>
      <td>${statusHtml}</td>
      <td><div style="display:flex;gap:5px;flex-wrap:wrap;">
        <button class="btn bw bsm" onclick="openCobrador('${v.usuario}')">✏️</button>
        <button class="btn ${bloq?'bs':'bd'} bsm" onclick="toggleBloqCobrador('${v.usuario}')">
          ${bloq ? '🔓 Reativar' : '🔒 Bloquear'}
        </button>
        <button class="btn bd bsm" onclick="confirmarDelCobrador('${v.usuario}','${(v.nome||'').replace(/'/g,"\\'")}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openCobrador(usuario = null) {
  editCobrId = usuario;
  const setores = USER.role === 'proprietario' ? (USER.setores || []) : getMeusSetores();

  // Monta checkboxes de setores
  const wrap = document.getElementById('cv-setores-wrap');
  if (wrap) {
    let atual = [];
    if (usuario) {
      const v = USUARIOS.find(u => u.usuario === usuario);
      atual = Array.isArray(v?.setores) ? v.setores : [v?.setor].filter(Boolean);
    }
    wrap.innerHTML = setores.length
      ? setores.map(s => `
          <label class="setor-check-item">
            <input type="checkbox" value="${s}" ${atual.includes(s)?'checked':''}>
            ${s}
          </label>`).join('')
      : '<div style="color:var(--text3);font-size:12px;">Nenhum setor disponível</div>';
  }

  if (usuario) {
    const v = USUARIOS.find(u => u.usuario === usuario);
    document.getElementById('cobr-title').textContent  = '✏️ EDITAR COBRADOR';
    document.getElementById('cv-nome').value    = v.nome    || '';
    document.getElementById('cv-usuario').value = v.usuario || '';
    document.getElementById('cv-senha').value   = v.senha   || '';
  } else {
    document.getElementById('cobr-title').textContent  = '👮 NOVO COBRADOR';
    document.getElementById('cv-nome').value    = '';
    document.getElementById('cv-usuario').value = '';
    document.getElementById('cv-senha').value   = '';
  }
  document.getElementById('cobrbg').classList.add('open');
}

function closeCobrador() {
  document.getElementById('cobrbg').classList.remove('open');
  editCobrId = null;
}

function salvarCobrador() {
  const nome    = (document.getElementById('cv-nome')?.value    || '').trim();
  const usuario = (document.getElementById('cv-usuario')?.value || '').trim().toLowerCase();
  const senha   = (document.getElementById('cv-senha')?.value   || '').trim().toLowerCase();

  const checks  = document.querySelectorAll('#cv-setores-wrap input[type=checkbox]:checked');
  const setores = [...checks].map(cb => cb.value);

  if (!nome)    { toast('⚠️ Nome obrigatório.', 'err'); return; }
  if (!usuario) { toast('⚠️ Usuário obrigatório.', 'err'); return; }
  if (!senha || senha.length < 6) { toast('⚠️ Senha precisa ter pelo menos 6 caracteres.', 'err'); return; }
  if (!setores.length) { toast('⚠️ Selecione pelo menos um setor.', 'err'); return; }

  // Bloqueia duplicata APENAS se já existe em cobr_usuarios (dados do CobraSetor)
  // Ignora entradas que vieram só do eps_usuarios legado — permite sobrescrever
  const cobrSalvos = JSON.parse(localStorage.getItem('cobr_usuarios') || '[]');
  if (!editCobrId && cobrSalvos.find(u => u.usuario === usuario)) {
    toast('⚠️ Usuário já existe!', 'err'); return;
  }

  // Dados do cobrador (sempre atualiza se já existir em USUARIOS, seja de onde vier)
  const dadosCobrador = {
    usuario, senha, role: 'cobrador',
    nome, setores, setor: setores[0] || '',
    proprietario: USER.usuario,  // sempre preenche o proprietario
    bloqueado: false,
  };

  const idxExist = USUARIOS.findIndex(u => u.usuario === (editCobrId || usuario));
  if (idxExist >= 0) {
    // Atualiza existente — inclui cobradores vindos do EPS legado (sem proprietario)
    USUARIOS[idxExist] = { ...USUARIOS[idxExist], ...dadosCobrador };
  } else {
    USUARIOS.push(dadosCobrador);
  }

  salvarUsuarios();
  closeCobrador();
  renderCobradores();
  toast(editCobrId ? '✅ Cobrador atualizado!' : `✅ Cobrador ${nome} cadastrado!`);
}

function toggleBloqCobrador(usuario) {
  const u = USUARIOS.find(x => x.usuario === usuario);
  if (!u) return;
  const acao = u.bloqueado ? 'reativar' : 'bloquear';
  if (!confirm(`Deseja ${acao} o acesso de ${u.nome}?`)) return;
  u.bloqueado = !u.bloqueado;
  salvarUsuarios();
  renderCobradores();
  toast(u.bloqueado ? `🚫 ${u.nome} bloqueado!` : `✅ ${u.nome} reativado!`);
}

function confirmarDelCobrador(usuario, nome) {
  if (!confirm(`Excluir o cobrador "${nome}"?`)) return;
  const idx = USUARIOS.findIndex(u => u.usuario === usuario);
  if (idx >= 0) { USUARIOS.splice(idx, 1); salvarUsuarios(); renderCobradores(); toast('🗑️ Cobrador removido.'); }
}

// ─────────────────────────────────────────────
// PROPRIETÁRIOS (gerenciado pelo admin)
// ─────────────────────────────────────────────
function renderProprietarios() {
  const tb = document.getElementById('tb-proprietarios');
  if (!tb || USER?.role !== 'admin') return;

  const props = USUARIOS.filter(u => u.role === 'proprietario' || u.role === 'dono');

  if (!props.length) {
    tb.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="eico">👔</div>Nenhum proprietário cadastrado.</div></td></tr>';
    return;
  }

  tb.innerHTML = props.map(d => {
    const setores   = Array.isArray(d.setores) ? d.setores : [d.setor].filter(Boolean);
    const cobradores = USUARIOS.filter(u =>
      (u.role === 'cobrador' || u.role === 'vigia') && u.proprietario === d.usuario
    );
    const bloq      = d.bloqueado;
    const statusHtml = bloq
      ? '<span style="color:var(--danger);font-weight:700;">🚫 Bloqueado</span>'
      : '<span style="color:var(--success);font-weight:700;">✅ Ativo</span>';

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          ${d.logoUrl ? `<img src="${d.logoUrl}" style="width:28px;height:28px;object-fit:contain;border-radius:4px;">` : ''}
          <strong>${d.nome}</strong>
        </div>
      </td>
      <td><span class="cb">${d.usuario}</span></td>
      <td>${setores.map(s => `<span class="sb">${s}</span>`).join(' ')}</td>
      <td style="font-size:12px;color:var(--text2);">${cobradores.length} cobrador(es)</td>
      <td style="color:var(--accent3);font-weight:600;">${fR(d.valorMensal||0)}/mês
        ${d.chavePix ? `<br><span style="font-size:11px;color:var(--text2);">🔑 ${d.chavePix}</span>` : ''}
      </td>
      <td>${statusHtml}</td>
      <td><div style="display:flex;gap:5px;flex-wrap:wrap;">
        <button class="btn bw bsm" onclick="openProp('${d.usuario}')">✏️</button>
        <button class="btn ${bloq?'bs':'bd'} bsm" onclick="toggleBloqProp('${d.usuario}')">
          ${bloq ? '🔓 Reativar' : '🔒 Bloquear'}
        </button>
        <button class="btn bd bsm" onclick="confirmarDelProp('${d.usuario}','${(d.nome||'').replace(/'/g,"\\'")}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openProp(usuario = null) {
  editPropId = usuario;

  if (usuario) {
    const u = USUARIOS.find(x => x.usuario === usuario);
    document.getElementById('prop-title').textContent   = '✏️ EDITAR PROPRIETÁRIO';
    document.getElementById('pr-nome').value    = u.nome       || '';
    document.getElementById('pr-usuario').value = u.usuario    || '';
    document.getElementById('pr-senha').value   = u.senha      || '';
    document.getElementById('pr-tel').value     = u.tel        || '';
    document.getElementById('pr-pix').value     = u.chavePix   || '';
    document.getElementById('pr-valor').value   = u.valorMensal|| '';
    document.getElementById('pr-setores').value = Array.isArray(u.setores) ? u.setores.join(', ') : '';
    document.getElementById('pr-logo').value    = u.logoUrl    || '';
  } else {
    document.getElementById('prop-title').textContent = '👔 NOVO PROPRIETÁRIO';
    ['pr-nome','pr-usuario','pr-senha','pr-tel','pr-pix','pr-valor','pr-setores','pr-logo']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  }
  document.getElementById('propbg').classList.add('open');
}

function closeProp() {
  document.getElementById('propbg').classList.remove('open');
  editPropId = null;
}

function salvarProp() {
  const nome    = (document.getElementById('pr-nome')?.value    || '').trim();
  const usuario = (document.getElementById('pr-usuario')?.value || '').trim().toLowerCase();
  const senha   = (document.getElementById('pr-senha')?.value   || '').trim().toLowerCase();
  const tel     = (document.getElementById('pr-tel')?.value     || '').trim();
  const chavePix= (document.getElementById('pr-pix')?.value     || '').trim();
  const valor   = parseFloat(document.getElementById('pr-valor')?.value || '0') || 0;
  const logoUrl = (document.getElementById('pr-logo')?.value    || '').trim();
  const setores = (document.getElementById('pr-setores')?.value || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!nome)    { toast('⚠️ Nome obrigatório.', 'err'); return; }
  if (!usuario) { toast('⚠️ Usuário obrigatório.', 'err'); return; }
  if (!senha || senha.length < 6) { toast('⚠️ Senha precisa ter pelo menos 6 caracteres.', 'err'); return; }
  if (!setores.length) { toast('⚠️ Informe pelo menos um setor.', 'err'); return; }

  if (!editPropId && USUARIOS.find(u => u.usuario === usuario)) {
    toast('⚠️ Usuário já existe!', 'err'); return;
  }

  const valorTotal = valor * setores.length;

  if (editPropId) {
    const idx = USUARIOS.findIndex(u => u.usuario === editPropId);
    if (idx >= 0) {
      USUARIOS[idx] = { ...USUARIOS[idx], nome, usuario, senha, tel, chavePix, setores, logoUrl, valorMensal: valorTotal };
    }
  } else {
    USUARIOS.push({
      usuario, senha, role: 'proprietario',
      nome, tel, chavePix, setores, logoUrl,
      valorMensal: valorTotal,
      bloqueado: false,
    });
  }

  salvarUsuarios();
  closeProp();
  renderProprietarios();
  toast(editPropId ? '✅ Proprietário atualizado!' : `✅ Proprietário ${nome} cadastrado!`);
}

function toggleBloqProp(usuario) {
  const u = USUARIOS.find(x => x.usuario === usuario);
  if (!u) return;
  const acao = u.bloqueado ? 'reativar' : 'bloquear';
  if (!confirm(`Deseja ${acao} o acesso de ${u.nome}?`)) return;
  u.bloqueado = !u.bloqueado;
  salvarUsuarios();
  renderProprietarios();
  toast(u.bloqueado ? `🚫 ${u.nome} bloqueado!` : `✅ ${u.nome} reativado!`);
}

function confirmarDelProp(usuario, nome) {
  if (!confirm(`Excluir o proprietário "${nome}" e todos os seus cobradores?\n\nAtenção: os clientes NÃO serão excluídos da planilha.`)) return;
  // Remove proprietário e seus cobradores
  USUARIOS = USUARIOS.filter(u => u.usuario !== usuario && u.proprietario !== usuario);
  salvarUsuarios();
  renderProprietarios();
  toast('🗑️ Proprietário removido.');
}

// ─────────────────────────────────────────────
// FECHAR MODAIS CLICANDO FORA
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('desbg')?.addEventListener('click',  function(e){ if(e.target===this) closeDesp(); });
  document.getElementById('cobrbg')?.addEventListener('click', function(e){ if(e.target===this) closeCobrador(); });
  document.getElementById('propbg')?.addEventListener('click', function(e){ if(e.target===this) closeProp(); });
});
