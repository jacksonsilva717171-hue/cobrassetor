/* ═══════════════════════════════════════════════════════════════
   CobraSetor v1 — clientes.js
   CRUD Clientes · Ordenação · Filtros · CEP · Datalist
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// RENDERIZAR LISTA DE CLIENTES
// ─────────────────────────────────────────────
function renderCli() {
  const tb = document.getElementById('tb-cli');
  if (!tb) return;

  const q       = (document.getElementById('srch')?.value || '').toLowerCase();
  const filSet  = fCliSetor;
  const filStat = fCliStatus;
  const filForm = fCliForma;

  let list = getClisFiltrados();


  // Filtro texto
  if (q) {
    list = list.filter(c =>
      (c.nome  || '').toLowerCase().includes(q) ||
      (c.id    || '').toLowerCase().includes(q) ||
      (c.rua   || '').toLowerCase().includes(q) ||
      (c.setor || '').toLowerCase().includes(q)
    );
  }
  // Filtro setor
  if (filSet)  list = list.filter(c => c.setor === filSet);
  // Filtro status
  if (filStat) list = list.filter(c => st(c) === filStat);
  // Filtro forma
  if (filForm) list = list.filter(c => (c.formaPadrao || '') === filForm);

  // Ordena por rota
  list = sortClientes(list);

  const isAdmin = USER?.role === 'admin';
  const isProp  = USER?.role === 'proprietario';
  const isCobr  = USER?.role === 'cobrador';
  const temAcoes = isAdmin || isProp || isCobr;

  // Cabeçalho de ações dinâmico
  const thAc = document.getElementById('th-acoes');
  if (thAc) thAc.textContent = 'Ações';

  if (!list.length) {
    const cols = temAcoes ? 10 : 9;
    tb.innerHTML = `<tr><td colspan="${cols}"><div class="empty"><div class="eico">👥</div>Nenhum cliente encontrado.</div></td></tr>`;
    return;
  }

  tb.innerHTML = list.map(c => {
    const status = st(c);
    const mAtr   = calcMesesAtraso(c);
    const late30 = mAtr >= 2 ? '<span class="late30 ml4">30+ dias</span>' : '';

    // Botões conforme role
    let acoes = '';
    if (isProp || isAdmin) {
      acoes = `<div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button class="btn bw bsm" onclick="openModal('${c.id}')">✏️</button>
        <button class="btn bs bsm" onclick="openPag('${c.id}')">💰</button>
        ${isAdmin || isProp ? `<button class="btn bd bsm" onclick="confirmarExcluir('${c.id}','${(c.nome||'').replace(/'/g,"\\'")}')">🗑️</button>` : ''}
      </div>`;
    } else if (isCobr) {
      acoes = `<div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button class="btn bs bsm" onclick="openPag('${c.id}')">✅ Pago</button>
        <button class="btn bi bsm" onclick="openRemarcar('${c.id}')">🔄</button>
        <button class="btn bw bsm" onclick="openObs('${c.id}')">✏️</button>
      </div>`;
    }

    return `<tr>
      <td><span class="cb">${c.id}</span></td>
      <td>
        <strong>${c.nome}</strong>
        ${c.obs ? `<div class="obs-mini" style="margin-top:4px;display:flex;align-items:flex-start;gap:6px;">
          <span style="flex:1;">💬 ${String(c.obs)}</span>
          ${(USER.role === 'proprietario' || USER.role === 'admin') ? `<button class="btn bd bsm" style="padding:1px 6px;font-size:10px;flex-shrink:0;" onclick="limparObs('${c.id}')">✕</button>` : ''}
        </div>` : ''}
      </td>
      <td style="font-size:12px;color:var(--text2);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${addr(c)}">${addr(c)}</td>
      <td><span class="sb">${c.setor||'-'}</span></td>
      <td style="font-size:12px;white-space:nowrap;">${c.tel||'-'}</td>
      <td><span class="nvb">Dia ${c.vencDia}/${lbM(c.proxVenc||YM(new Date()))}</span>${mAtr > 0 ? `<br><span style="font-size:10px;color:var(--danger);">${mAtr} mês(es) atrasado</span>` : ''}</td>
      <td style="white-space:nowrap;">${fR(c.valor)}</td>
      <td>${c.pix === 'sim' ? '<span class="pb-y">✅ PIX</span>' : '<span class="pb-n">💵</span>'}</td>
      <td>${stLbl(status)}${late30}</td>
      <td>${acoes}</td>
    </tr>`;
  }).join('');
}

// ─────────────────────────────────────────────
// MODAL CADASTRO / EDIÇÃO
// ─────────────────────────────────────────────
function openModal(id = null) {
  if (USER?.role === 'cobrador') {
    toast('⚠️ Cobrador não pode cadastrar clientes.', 'err');
    return;
  }

  // Popula select de mês referência
  const selPv = document.getElementById('f-proxvenc');
  if (selPv) {
    const yh = YM(new Date());
    let opts = '';
    for (let i = -3; i <= 6; i++) {
      const m = addM(yh, i);
      opts += `<option value="${m}">${lbM(m)}${i === 0 ? ' (atual)' : ''}</option>`;
    }
    selPv.innerHTML = opts;
    selPv.value = yh;
  }

  // Popula datalist de ruas
  filtrarRuas('');

  editId = id;

  if (id) {
    // Edição
    const c = CLI.find(x => x.id === id);
    if (!c) { toast('Cliente não encontrado.', 'err'); return; }
    document.getElementById('mtitle').textContent = '✏️ EDITAR CLIENTE';
    _preencherFormCliente(c);
    _popularSetorRestrito(c.setor);
  } else {
    // Novo
    document.getElementById('mtitle').textContent = '✚ NOVO CLIENTE';
    _limparFormCliente();
    _popularSetorRestrito('');
  }

  document.getElementById('mbg').classList.add('open');
}

// Usuários não-admin (proprietário) só podem cadastrar/editar clientes nos
// próprios setores — troca o campo livre por um <select> restrito à lista de
// getMeusSetores(), eliminando divergências de digitação (ex: "Setor 2" vs
// "Setor 02") que travavam o cadastro na checagem de permissão de salvar().
function _popularSetorRestrito(valorAtual) {
  const sel = document.getElementById('f-setor-restrito');
  const inp = document.getElementById('f-setor');
  if (!sel || !inp) return;

  const restrito = USER.role !== 'admin';
  sel.style.display = restrito ? '' : 'none';
  inp.style.display = restrito ? 'none' : '';

  if (!restrito) return;

  const setores = getMeusSetores();
  sel.innerHTML = '<option value="">Selecione...</option>' + setores.map(s => `<option value="${s}">${s}</option>`).join('');
  // Compara ignorando maiúsculas/espaços — o valor salvo do cliente pode
  // divergir levemente do texto exato em USER.setores
  const idxAtual = setores.findIndex(s => s.trim().toLowerCase() === String(valorAtual || '').trim().toLowerCase());
  sel.value = idxAtual >= 0 ? setores[idxAtual]
            : (setores.length === 1 ? setores[0] : '');
  inp.value = sel.value; // f-setor continua sendo o campo que salvar() lê
  if (inp.value) onSetorChange();
}

function onSetorRestritoChange() {
  const sel = document.getElementById('f-setor-restrito');
  const inp = document.getElementById('f-setor');
  if (!sel || !inp) return;
  inp.value = sel.value;
  onSetorChange();
}

function closeModal() {
  document.getElementById('mbg').classList.remove('open');
  editId = null;
}

function _preencherFormCliente(c) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  set('f-nome',         c.nome);
  set('f-tel',          c.tel);
  set('f-cep',          c.cep);
  set('f-rua',          c.rua);
  set('f-num',          c.num);
  set('f-comp',         c.complemento);
  set('f-bairro',       c.bairro);
  set('f-cidade',       c.cidade);
  set('f-setor',        c.setor);
  set('f-ordem-rua',    c.ordemRua !== 9999 ? c.ordemRua : '');
  set('f-venc',         c.vencDia);
  set('f-valor',        c.valor);
  set('f-chave-pix',    c.chavePix);
  set('f-lat',          c.lat || '');
  set('f-lng',          c.lng || '');
  set('f-obs',          c.obs);

  const pv = document.getElementById('f-proxvenc');
  if (pv) pv.value = c.proxVenc || YM(new Date());

  const fp = document.getElementById('f-forma-padrao');
  if (fp) fp.value = c.formaPadrao || 'dinheiro';

  const px = document.getElementById('f-pix');
  if (px) px.value = c.pix || 'sim';

  document.getElementById('cep-h').innerHTML = '';
  setTimeout(() => { if (c.setor) onSetorChange(); }, 50);
}

function _limparFormCliente() {
  ['f-nome','f-tel','f-cep','f-rua','f-num','f-comp','f-bairro','f-cidade',
   'f-setor','f-ordem-rua','f-venc','f-valor','f-chave-pix','f-lat','f-lng','f-obs']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const fp = document.getElementById('f-forma-padrao');
  if (fp) fp.value = 'dinheiro';
  const px = document.getElementById('f-pix');
  if (px) px.value = 'sim';
  document.getElementById('cep-h').innerHTML = '';
}

// ─────────────────────────────────────────────
// SALVAR CLIENTE
// ─────────────────────────────────────────────
async function salvar() {
  const nome     = (document.getElementById('f-nome')?.value  || '').trim();
  const rua      = (document.getElementById('f-rua')?.value   || '').trim();
  const setor    = (document.getElementById('f-setor')?.value || '').trim();
  const vencDia  = parseInt(document.getElementById('f-venc')?.value);
  const valor    = parseFloat(document.getElementById('f-valor')?.value);
  const proxVenc = parseInt(document.getElementById('f-proxvenc')?.value) || YM(new Date());

  if (!nome)    { toast('⚠️ Nome é obrigatório.', 'err'); return; }
  if (!rua)     { toast('⚠️ Logradouro é obrigatório.', 'err'); return; }
  if (!setor)   { toast('⚠️ Setor é obrigatório.', 'err'); return; }
  if (!vencDia || vencDia < 1 || vencDia > 31) { toast('⚠️ Dia de vencimento inválido (1–31).', 'err'); return; }
  if (!valor || valor <= 0) { toast('⚠️ Valor mensal inválido.', 'err'); return; }

  // Verifica se proprietário pode criar neste setor — comparação tolerante a
  // maiúsculas/espaços, igual ao filtro usado em getClisFiltrados()
  if (USER.role === 'proprietario') {
    const setoresNorm = (USER.setores || []).map(s => s.trim().toLowerCase());
    if (!setoresNorm.includes(setor.trim().toLowerCase())) {
      toast('⚠️ Você não tem permissão para este setor.', 'err');
      return;
    }
  }

  const ordemRua = parseInt(document.getElementById('f-ordem-rua')?.value) || null;

  const dados = {
    id:           editId || gerarId(),
    nome,
    tel:          document.getElementById('f-tel')?.value   || '',
    cep:          document.getElementById('f-cep')?.value   || '',
    rua,
    num:          document.getElementById('f-num')?.value   || '',
    complemento:  document.getElementById('f-comp')?.value  || '',
    bairro:       document.getElementById('f-bairro')?.value || '',
    cidade:       document.getElementById('f-cidade')?.value || '',
    setor,
    ordemRua:     ordemRua || '',
    vencDia,
    proxVenc,
    valor,
    formaPadrao:  document.getElementById('f-forma-padrao')?.value || 'dinheiro',
    pix:          document.getElementById('f-pix')?.value   || 'sim',
    chavePix:     document.getElementById('f-chave-pix')?.value || '',
    lat:          parseFloat(document.getElementById('f-lat')?.value) || '',
    lng:          parseFloat(document.getElementById('f-lng')?.value) || '',
    obs:          document.getElementById('f-obs')?.value   || '',
    status:       editId ? (CLI.find(c => c.id === editId)?.status || 'ativo') : 'ativo',
    criadoPor:    USER.usuario,
    criadoEm:     editId ? (CLI.find(c => c.id === editId)?.criadoEm || new Date().toISOString()) : new Date().toISOString(),
  };

  // ── Rastreia data de inativação para relatório de variação ──
  if (dados.status === 'inativo') {
    // Preserva data original se já tinha, ou registra hoje
    const anterior = CLI.find(c => c.id === dados.id);
    if (!anterior?.inativadoEm) {
      dados.inativadoEm = hojeISO();
    } else {
      dados.inativadoEm = anterior.inativadoEm;
    }
  } else {
    dados.inativadoEm = ''; // limpa se foi reativado
  }

  const acao = editId ? 'editCliente' : 'addCliente';
  const btn  = document.querySelector('#mbg .btn.bp');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  // Atualiza local imediatamente (otimista)
  const idx = CLI.findIndex(c => c.id === dados.id);
  if (idx >= 0) CLI[idx] = normalizarCliente(dados);
  else CLI.push(normalizarCliente(dados));
  localStorage.setItem('eps_cli', JSON.stringify(CLI));

  if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar Cliente'; }
  toast(editId ? `✅ ${dados.nome} atualizado!` : `✅ Cliente ${dados.id} cadastrado!`);
  closeModal();
  renderAll();

  // Envia para Sheets em background — avisa se o Apps Script recusar
  // (resposta {ok:false} não é erro de rede, então não cai no catch)
  sheetPost(acao, dados)
    .then(r => {
      if (r && r.ok === false) {
        console.error('addCliente/editCliente recusado pelo Apps Script:', r.erro);
        toast(`⚠️ ${dados.nome} salvo localmente, mas o Sheets recusou: ${r.erro || 'erro desconhecido'}`, 'err');
      }
    })
    .catch(() => {});
}

// ─────────────────────────────────────────────
// EXCLUIR CLIENTE
// ─────────────────────────────────────────────
function confirmarExcluir(id, nome) {
  if (!confirm(`Excluir permanentemente "${nome}"?\n\nEsta ação não pode ser desfeita.`)) return;
  delCli(id);
}

async function delCli(id) {
  const r = await sheetPost('delCliente', { id });
  CLI = CLI.filter(c => c.id !== id);
  localStorage.setItem('eps_cli', JSON.stringify(CLI));
  renderAll();
  toast('🗑️ Cliente removido.');
}

async function limparObs(id) {
  const c = CLI.find(x => x.id === id);
  if (!c) return;
  const dados = { ...c, obs: '' };
  await sheetPost('editCliente', dados);
  const idx = CLI.findIndex(x => x.id === id);
  if (idx >= 0) CLI[idx] = normalizarCliente(dados);
  localStorage.setItem('eps_cli', JSON.stringify(CLI));
  renderCli();
  toast(`✅ Observação de ${c.nome} removida.`);
}

// ─────────────────────────────────────────────
// CEP — AUTO-PREENCHIMENTO
// ─────────────────────────────────────────────
function mCep(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
  el.value = v;
  if (v.replace('-', '').length === 8) buscarCep(v.replace('-', ''));
}

async function fjson(url, ms = 6000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!r.ok) throw new Error('status ' + r.status);
    return await r.json();
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

async function buscarCep(cep) {
  const h = document.getElementById('cep-h');
  if (h) h.innerHTML = '<span style="color:var(--warn)">🔄 Buscando...</span>';

  const apis = [
    async () => {
      const d = await fjson(`https://viacep.com.br/ws/${cep}/json/`);
      if (d.erro) throw new Error('nao encontrado');
      return { logradouro: d.logradouro, bairro: d.bairro, localidade: d.localidade, uf: d.uf };
    },
    async () => {
      const d = await fjson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
      if (d.message) throw new Error('nao encontrado');
      return { logradouro: d.street, bairro: d.neighborhood, localidade: d.city, uf: d.state };
    },
  ];

  for (const api of apis) {
    try {
      const d = await api();
      const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
      if (d.logradouro) set('f-rua',    d.logradouro);
      if (d.bairro)     set('f-bairro', d.bairro);
      if (d.localidade) set('f-cidade', d.localidade + (d.uf ? ' - ' + d.uf : ''));
      if (h) h.innerHTML = '<span style="color:var(--success)">✅ Endereço preenchido!</span>';
      filtrarRuas(document.getElementById('f-rua')?.value || '');
      return;
    } catch (e) { /* tenta próxima */ }
  }

  if (h) h.innerHTML = '<span style="color:var(--warn)">⚠️ CEP não encontrado — preencha manualmente.</span>';
}

// ─────────────────────────────────────────────
// DATALIST RUAS + SETOR
// ─────────────────────────────────────────────
function filtrarRuas(val) {
  const setor = document.getElementById('f-setor')?.value || '';
  const dl    = document.getElementById('dl-ruas');
  if (!dl) return;

  let ruas = [...new Set(CLI
    .filter(c => !setor || c.setor === setor)
    .map(c => c.rua)
    .filter(Boolean)
  )].sort();

  if (val && val.length >= 2) {
    const v = val.toLowerCase();
    ruas = ruas.filter(r => r.toLowerCase().includes(v));
  }

  dl.innerHTML = ruas.map(r => `<option value="${r}">`).join('');
}

function onSetorChange() {
  filtrarRuas(document.getElementById('f-rua')?.value || '');

  // Preenche chave PIX do proprietário responsável pelo setor
  const setor = document.getElementById('f-setor')?.value || '';
  const prop = USUARIOS.find(u =>
    u.role === 'proprietario' && (u.setores || []).includes(setor)
  );
  const fPix = document.getElementById('f-chave-pix');
  if (fPix && prop && prop.chavePix && !fPix.value) {
    fPix.value = prop.chavePix;
    fPix.style.background = 'rgba(0,232,122,0.06)';
    fPix.title = `Chave PIX de ${prop.nome}`;
  }
}

// ─────────────────────────────────────────────
// Fechar modal clicando fora
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mbg')?.addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
});
