/* ═══════════════════════════════════════════════════════════════
   CobraSetor — folha.js
   Folha de cobrança impressa · Baixa pela foto · Recibos de papel
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Data local → "AAAA-MM-DD" (hojeISO() do config.js usa UTC e vira o dia às 21h) */
function isoLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _dataDeISO(iso) {
  const [y, m, d] = String(iso || '').split('-').map(n => parseInt(n));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function _fmtData(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

/** Data de vencimento do mês AAAAMM (dia 31 em mês curto vira o último dia) */
function _dataVencimento(ym, vencDia) {
  const y = Math.floor(ym / 100), m = ym % 100;
  const ultimo = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(parseInt(vencDia) || 1, ultimo));
}

/** Meses em aberto do cliente com vencimento até a data limite: [{ym, data}] */
function mesesEmAberto(c, dataLim) {
  const out = [];
  let ym = parseInt(c.proxVenc) || YM(new Date());
  for (let i = 0; i < 36; i++) {
    const data = _dataVencimento(ym, c.vencDia);
    if (data > dataLim) break;
    out.push({ ym, data });
    ym = addM(ym, 1);
  }
  return out;
}

const _normSetor = s => String(s || '').trim().toLowerCase();

/** O usuário logado pode ver este setor? */
function podeVerSetor(setor) {
  return getMeusSetores().some(s => _normSetor(s) === _normSetor(setor));
}

// ─────────────────────────────────────────────
// BUSCA ÚNICA DA FOLHA
// A folha impressa (Função 1), a baixa pela foto (Função 2) e os recibos
// de papel (Função 3) usam SEMPRE esta função — assim a lista, a ordem e
// os valores nunca ficam diferentes entre elas.
// ─────────────────────────────────────────────
/**
 * Clientes ativos do setor com vencimento até dataLimISO (atrasados + os que
 * vencem até o dia), na ordem de rua/rota do app (sortClientes / ordemRua).
 * Retorna [{ ordem, c, meses:[{ym,data}], mesesAtraso, valorTotal }].
 */
function listaFolhaCobranca(setor, dataLimISO) {
  if (!setor || !podeVerSetor(setor)) return [];
  const lim = _dataDeISO(dataLimISO);
  if (!lim) return [];
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const base = getClisFiltrados().filter(c =>
    c.status !== 'inativo' && _normSetor(c.setor) === _normSetor(setor));

  const itens = [];
  sortClientes(base).forEach(c => {
    // Remarcado para depois da data limite: fica fora da folha
    if (c.dataRemarcacao) {
      const ret = _dataDeISO(c.dataRemarcacao);
      if (ret && ret > lim) return;
    }
    const meses = mesesEmAberto(c, lim);
    if (!meses.length) return;
    itens.push({
      c,
      meses,
      mesesAtraso: meses.filter(m => m.data < hoje).length,
      valorTotal:  (parseFloat(c.valor) || 0) * meses.length,
    });
  });
  itens.forEach((it, i) => { it.ordem = i + 1; });
  return itens;
}

// ─────────────────────────────────────────────
// TELA DE IMPRESSÃO (A4, sem menus do app)
// ─────────────────────────────────────────────
function abrirImpressao(titulo, html, margemPagina) {
  const pv = document.getElementById('print-view');
  document.getElementById('pv-titulo').textContent = titulo;
  document.getElementById('pv-content').innerHTML = html;
  let st = document.getElementById('pv-page-style');
  if (!st) { st = document.createElement('style'); st.id = 'pv-page-style'; document.head.appendChild(st); }
  st.textContent = '@page { size: A4 portrait; margin: ' + (margemPagina || '10mm') + '; }';
  document.body.classList.add('imprimindo');
  pv.classList.add('open');
  pv.scrollTop = 0;
}

function fecharImpressao() {
  document.getElementById('print-view').classList.remove('open');
  document.body.classList.remove('imprimindo');
  document.getElementById('pv-content').innerHTML = '';
}

// ─────────────────────────────────────────────
// MODAL: escolher setor + data limite
// ─────────────────────────────────────────────
let _folhaModo = 'folha';

function abrirFolhaModal(modo, setor, dataISO) {
  _folhaModo = modo || 'folha';
  const sel = document.getElementById('fo-setor');
  const setores = getMeusSetores().filter(s => _folhaModo !== 'recibos' || modeloReciboPapel(s));
  if (!setores.length) { toast('⚠️ Nenhum setor disponível.', 'warn'); return; }
  sel.innerHTML = setores.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const atual = setor || document.getElementById('fsetor')?.value || '';
  if (setores.some(s => _normSetor(s) === _normSetor(atual))) sel.value = setores.find(s => _normSetor(s) === _normSetor(atual));
  document.getElementById('fo-data').value = dataISO || isoLocal(new Date());
  document.getElementById('folha-mtitle').textContent = _folhaModo === 'recibos' ? '🧾 IMPRIMIR RECIBOS' : '🖨️ FOLHA DE COBRANÇA';
  document.getElementById('fo-btn-ok').textContent   = _folhaModo === 'recibos' ? '🧾 Gerar recibos' : '🖨️ Gerar folha';
  _folhaAtualizaPrevia();
  document.getElementById('folhabg').classList.add('open');
}

function fecharFolhaModal() {
  document.getElementById('folhabg').classList.remove('open');
}

function _folhaAtualizaPrevia() {
  const setor = document.getElementById('fo-setor').value;
  const data  = document.getElementById('fo-data').value;
  const itens = listaFolhaCobranca(setor, data);
  const total = itens.reduce((a, it) => a + it.valorTotal, 0);
  const nRec  = itens.reduce((a, it) => a + it.meses.length, 0);
  document.getElementById('fo-previa').innerHTML = itens.length
    ? `📋 <strong>${itens.length}</strong> cliente(s) · total <strong>${fR(total)}</strong>`
      + (_folhaModo === 'recibos' ? `<br>🧾 <strong>${nRec}</strong> recibo(s) · ${Math.ceil(nRec / 6)} folha(s) A4` : '')
    : '🎉 Nenhum cliente com vencimento até esta data neste setor.';
}

function confirmarFolhaModal() {
  const setor = document.getElementById('fo-setor').value;
  const data  = document.getElementById('fo-data').value;
  if (!setor || !data) { toast('⚠️ Escolha o setor e a data.', 'err'); return; }
  fecharFolhaModal();
  if (_folhaModo === 'recibos') imprimirRecibos(setor, data);
  else imprimirFolha(setor, data);
}

// ─────────────────────────────────────────────
// FUNÇÃO 1 — FOLHA DE COBRANÇA
// ─────────────────────────────────────────────
function _ruaNum(c) {
  return [c.rua, c.num].filter(Boolean).join(', ');
}

function htmlFolhaCobranca(setor, dataISO) {
  const itens = listaFolhaCobranca(setor, dataISO);
  const total = itens.reduce((a, it) => a + it.valorTotal, 0);
  const agora = new Date();
  const impresso = _fmtData(agora) + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const linhas = itens.map(it => {
    const c = it.c;
    const valor = it.meses.length > 1
      ? `${fR(it.valorTotal)}<small>${it.meses.length}× ${fR(c.valor)}</small>`
      : fR(it.valorTotal);
    return `<tr>
      <td class="fl-x"><span class="fl-box"></span></td>
      <td class="fl-cod"><small>${it.ordem}</small>${esc(c.id)}</td>
      <td class="fl-rua">${esc(_ruaNum(c))}</td>
      <td class="fl-nome">${esc(c.nome)}</td>
      <td class="fl-tel">${esc(c.tel || '—')}</td>
      <td class="fl-data">${_fmtData(it.meses[0].data)}</td>
      <td class="fl-atr">${it.mesesAtraso || '—'}</td>
      <td class="fl-val">${valor}</td>
    </tr>`;
  }).join('');

  return `<div class="fl-page">
    <div class="fl-head">
      <div>
        <div class="fl-tit">FOLHA DE COBRANÇA</div>
        <div class="fl-setor">${esc(setor)}</div>
      </div>
      <div class="fl-meta">
        Vencimento até: <strong>${_fmtData(_dataDeISO(dataISO))}</strong><br>
        Impresso em: <strong>${impresso}</strong><br>
        Total de clientes: <strong>${itens.length}</strong>
      </div>
    </div>
    <div class="fl-instr">Marque com <strong>X</strong> a caixinha de cada cliente que pagou.</div>
    ${itens.length ? `<table class="fl-tab">
      <thead><tr>
        <th class="fl-x">Pago</th><th>Código</th><th>Rua e número</th><th>Nome</th>
        <th>Telefone</th><th>Data de cobrança</th><th>Meses em atraso</th><th>Valor</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>` : '<div class="fl-vazio">Nenhum cliente com vencimento até esta data.</div>'}
    <div class="fl-total">
      <span>${itens.length} cliente(s)</span>
      <span>VALOR TOTAL: <strong>${fR(total)}</strong></span>
    </div>
  </div>`;
}

function imprimirFolha(setor, dataISO) {
  if (!podeVerSetor(setor)) { toast('🚫 Setor fora das suas permissões.', 'err'); return; }
  abrirImpressao(`Folha de cobrança — ${setor}`, htmlFolhaCobranca(setor, dataISO), '10mm');
}

// ─────────────────────────────────────────────
// FUNÇÃO 2 — BAIXA PELA FOTO DA FOLHA
// ─────────────────────────────────────────────
// Endereço completo: o app também roda no GitHub Pages, que não tem /api
const LER_FOLHA_URL = 'https://cobrassetor.vercel.app/api/ler-folha';
const FOTO_MAX_LADO = 1600;
const FOTO_MAX_QTD  = 6;

let _fotoArquivos = [];   // [{ nome, dataUrl }] já reduzidas
let _fotoItens    = [];   // lista da folha (listaFolhaCobranca) em revisão
let _fotoLeitura  = null; // resposta da API
let _fotoSetor = '', _fotoData = '';
let _baixando = false;

function abrirFotoModal(setor, dataISO) {
  const sel = document.getElementById('ft-setor');
  const setores = getMeusSetores();
  if (!setores.length) { toast('⚠️ Nenhum setor disponível.', 'warn'); return; }
  sel.innerHTML = setores.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  const atual = setor || document.getElementById('fsetor')?.value || '';
  const achado = setores.find(s => _normSetor(s) === _normSetor(atual));
  if (achado) sel.value = achado;
  document.getElementById('ft-data').value = dataISO || isoLocal(new Date());
  _fotoArquivos = []; _fotoItens = []; _fotoLeitura = null;
  _fotoPasso(1);
  _fotoRenderMiniaturas();
  document.getElementById('fotobg').classList.add('open');
}

function fecharFotoModal() {
  if (_baixando) { toast('⏳ Aguarde terminar a baixa.', 'warn'); return; }
  document.getElementById('fotobg').classList.remove('open');
  _fotoArquivos = [];
}

function _fotoPasso(n) {
  [1, 2, 3, 4].forEach(i => {
    const el = document.getElementById('ft-passo' + i);
    if (el) el.style.display = i === n ? '' : 'none';
  });
}

/** Reduz a foto no aparelho: lado maior ~1600px, JPEG (a Vercel aceita até 4,5 MB por envio) */
async function reduzirFoto(file) {
  let fonte;
  try {
    fonte = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (_) {
    fonte = await new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => erro(new Error('imagem inválida'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = fonte.width, h0 = fonte.height;
  const esc_ = Math.min(1, FOTO_MAX_LADO / Math.max(w0, h0));
  const w = Math.round(w0 * esc_), h = Math.round(h0 * esc_);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(fonte, 0, 0, w, h);
  let q = 0.82, url = cv.toDataURL('image/jpeg', q);
  while (url.length > 1100 * 1024 && q > 0.45) { q -= 0.12; url = cv.toDataURL('image/jpeg', q); }
  return url;
}

async function fotoAdicionar(input) {
  const arqs = [...(input.files || [])];
  input.value = '';
  if (!arqs.length) return;
  const vagas = FOTO_MAX_QTD - _fotoArquivos.length;
  if (vagas <= 0) { toast(`⚠️ Máximo de ${FOTO_MAX_QTD} fotos por envio.`, 'warn'); return; }
  if (arqs.length > vagas) toast(`⚠️ Só cabem mais ${vagas} foto(s) — o resto foi ignorado.`, 'warn');
  const info = document.getElementById('ft-fotos-info');
  for (const f of arqs.slice(0, vagas)) {
    if (info) info.textContent = '⏳ Preparando foto...';
    try {
      _fotoArquivos.push({ nome: f.name || 'foto', dataUrl: await reduzirFoto(f) });
    } catch (e) {
      toast('❌ Não consegui abrir a imagem ' + (f.name || ''), 'err');
    }
  }
  _fotoRenderMiniaturas();
}

function fotoRemover(i) {
  _fotoArquivos.splice(i, 1);
  _fotoRenderMiniaturas();
}

function _fotoRenderMiniaturas() {
  const el = document.getElementById('ft-miniaturas');
  if (el) el.innerHTML = _fotoArquivos.map((f, i) =>
    `<div class="ft-mini"><img src="${f.dataUrl}" alt="foto ${i + 1}"><button class="btn bc bxs" onclick="fotoRemover(${i})">✕</button></div>`).join('');
  const kb = Math.round(_fotoArquivos.reduce((a, f) => a + f.dataUrl.length * 0.75, 0) / 1024);
  const info = document.getElementById('ft-fotos-info');
  if (info) info.textContent = _fotoArquivos.length
    ? `${_fotoArquivos.length}/${FOTO_MAX_QTD} foto(s) · ${kb} KB no total`
    : `Nenhuma foto ainda (máximo ${FOTO_MAX_QTD}).`;
  const btn = document.getElementById('ft-btn-ler');
  if (btn) btn.disabled = !_fotoArquivos.length;
}

async function fotoLer() {
  _fotoSetor = document.getElementById('ft-setor').value;
  _fotoData  = document.getElementById('ft-data').value;
  if (!podeVerSetor(_fotoSetor)) { toast('🚫 Setor fora das suas permissões.', 'err'); return; }
  _fotoItens = listaFolhaCobranca(_fotoSetor, _fotoData);
  if (!_fotoItens.length) { toast('🎉 Nenhum cliente em aberto neste setor até esta data.', 'warn'); return; }
  if (!_fotoArquivos.length) { toast('⚠️ Adicione pelo menos 1 foto.', 'err'); return; }

  _fotoPasso(2);
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 90000);
    const r = await fetch(LER_FOLHA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigos: _fotoItens.map(it => it.c.id),
        fotos:   _fotoArquivos.map(f => f.dataUrl),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const json = await r.json().catch(() => ({ ok: false, erro: 'resposta inválida (' + r.status + ')' }));
    if (!r.ok || !json.ok) throw new Error(json.erro || ('erro ' + r.status));
    _fotoLeitura = json;
  } catch (e) {
    _fotoPasso(1);
    toast('❌ ' + (e.name === 'AbortError' ? 'A leitura demorou demais. Tente de novo.' : e.message), 'err');
    return;
  }
  _fotoRenderRevisao();
  _fotoPasso(3);
}

function _fotoRenderRevisao() {
  const lidos = new Map((_fotoLeitura.marcados || []).map(m => [String(m.codigo).toUpperCase(), m]));
  const naLista = new Set(_fotoItens.map(it => String(it.c.id).toUpperCase()));

  const fora = [...lidos.values()].filter(m => !naLista.has(String(m.codigo).toUpperCase()));
  const avisoFora = fora.length
    ? `<div class="ft-aviso">⚠️ Lido na foto mas <strong>não está na lista</strong> deste setor/data: ${fora.map(m => esc(m.codigo)).join(', ')} — confira na folha.</div>`
    : '';

  const linhas = _fotoItens.map((it, i) => {
    const c = it.c;
    const m = lidos.get(String(c.id).toUpperCase());
    const duvida = m && m.confianca !== 'alta';
    const marcado = m && !duvida;
    const jaPago = it.meses.filter(ms => PAG.some(p => p.cid === c.id && parseInt(p.mesPago) === ms.ym));
    const meses = it.meses.length > 1 ? ` · ${it.meses.length} meses (${it.meses.map(ms => lbM(ms.ym)).join(', ')})` : ` · ${lbM(it.meses[0].ym)}`;
    return `<label class="ft-item${duvida ? ' duvida' : ''}${marcado ? ' ok' : ''}">
      <input type="checkbox" data-i="${i}" ${marcado ? 'checked' : ''} onchange="_fotoAtualizaResumo()">
      <span class="ft-ord">${it.ordem}</span>
      <span class="ft-txt"><strong>${esc(c.id)}</strong> — ${esc(c.nome)}
        <small>${esc(_ruaNum(c))}${meses} · ${fR(it.valorTotal)}</small>
        ${duvida ? `<small class="ft-warn">⚠️ Leitura duvidosa (confiança ${esc(m.confianca)}) — confira na folha antes de marcar</small>` : ''}
        ${jaPago.length ? `<small class="ft-warn">⚠️ Já existe pagamento de ${jaPago.map(ms => lbM(ms.ym)).join(', ')}</small>` : ''}
      </span>
    </label>`;
  }).join('');

  const usados = (_fotoLeitura.fotos || []).map(f => `Foto ${f.foto}: ${f.usado === 'sonnet' ? 'revisada pelo Sonnet' : 'Haiku'}`).join(' · ');
  document.getElementById('ft-revisao').innerHTML =
    `<div class="ft-meta">${esc(_fotoSetor)} · vencimento até ${_fmtData(_dataDeISO(_fotoData))} · ${esc(usados)}</div>`
    + avisoFora + linhas;
  _fotoAtualizaResumo();
}

function _fotoSelecionados() {
  return [...document.querySelectorAll('#ft-revisao input[type=checkbox]:checked')]
    .map(cb => _fotoItens[parseInt(cb.dataset.i)]).filter(Boolean);
}

function _fotoAtualizaResumo() {
  const sel = _fotoSelecionados();
  const total = sel.reduce((a, it) => a + it.valorTotal, 0);
  const nMeses = sel.reduce((a, it) => a + it.meses.length, 0);
  document.querySelectorAll('#ft-revisao .ft-item').forEach(el => {
    el.classList.toggle('sel', el.querySelector('input').checked);
  });
  document.getElementById('ft-resumo').innerHTML = sel.length
    ? `<strong>${sel.length} cliente(s), total ${fR(total)}</strong>${nMeses > sel.length ? ` (${nMeses} mensalidades)` : ''}<br><small>${sel.map(it => esc(it.c.nome)).join(', ')}</small>`
    : 'Nenhum cliente marcado.';
  document.getElementById('ft-btn-confirmar').disabled = !sel.length;
}

/**
 * Grava a baixa com o MESMO núcleo de pagamento do app (registrarPagamento,
 * cobrancas.js): uma mensalidade por mês em aberto que aparece na folha,
 * cada uma com o valor do cliente e avançando o vencimento 1 mês.
 */
async function fotoConfirmarBaixa() {
  if (_baixando) return;
  const sel = _fotoSelecionados();
  if (!sel.length) return;
  const total = sel.reduce((a, it) => a + it.valorTotal, 0);
  if (!confirm(`Confirmar baixa de ${sel.length} cliente(s), total ${fR(total)}?`)) return;

  _baixando = true;
  _fotoPasso(4);
  const prog = document.getElementById('ft-progresso');
  const falhas = [];
  let n = 0;
  for (const it of sel) {
    n++;
    prog.textContent = `⏳ Gravando ${n}/${sel.length}: ${it.c.nome}...`;
    for (const ms of it.meses) {
      const c = CLI.find(x => x.id === it.c.id && x.setor === it.c.setor) || it.c;
      const { envio } = registrarPagamento(c, ms.ym, formaPadraoPagamento(c), 'Baixa pela folha (foto)');
      const r = await envio;
      if (!r || r.ok === false) falhas.push(`${it.c.nome} (${lbM(ms.ym)})`);
    }
  }
  renderAll();

  // Confere direto no servidor se o vencimento avançou
  prog.textContent = '🔎 Conferindo no servidor...';
  let confirmados = 0, conferiu = false;
  try {
    const r = await _tentarSheetReq(SCRIPT_URL, 'getClientes', { setor: _fotoSetor });
    const arr = extArr(r, 'data', 'clientes', 'rows', 'result');
    if (arr) {
      conferiu = true;
      const pvServ = new Map(arr.map(x => [String(x.id), parseInt(x.proxVenc) || 0]));
      sel.forEach(it => {
        const esperado = addM(it.meses[it.meses.length - 1].ym, 1);
        if ((pvServ.get(String(it.c.id)) || 0) >= esperado) confirmados++;
      });
    }
  } catch (_) { /* sem conexão: avisa abaixo */ }
  _baixando = false;

  document.getElementById('ft-final').innerHTML =
    `<div class="ft-ok">✅ Baixa feita em <strong>${sel.length}</strong> cliente(s) · ${fR(total)}</div>`
    + (conferiu
      ? `<div class="ft-meta">${confirmados === sel.length ? '☁️ Confirmado no servidor para todos.' : `⚠️ Servidor confirmou ${confirmados} de ${sel.length} — sincronize e confira.`}</div>`
      : '<div class="ft-meta">⚠️ Não foi possível conferir no servidor agora (sem conexão).</div>')
    + (falhas.length ? `<div class="ft-aviso">⚠️ Falha ao enviar: ${falhas.map(esc).join(', ')}</div>` : '')
    + `<div class="fact">
        <button class="btn bp" onclick="fecharFotoModal();abrirFolhaModal('folha', '${esc(_fotoSetor)}')">🖨️ Imprimir folha nova</button>
        ${modeloReciboPapel(_fotoSetor) ? `<button class="btn bp" onclick="fecharFotoModal();abrirFolhaModal('recibos', '${esc(_fotoSetor)}')">🧾 Imprimir recibos</button>` : ''}
        <button class="btn bc" onclick="fecharFotoModal()">Fechar</button>
      </div>`;
  prog.textContent = '';
  toast(`✅ Baixa feita em ${sel.length} cliente(s)`);
}

// ─────────────────────────────────────────────
// MODELOS DE RECIBO DE PAPEL POR PROPRIETÁRIO
// Chave = usuário do dono do setor. Cada modelo tem: nome, porFolha e
// render(recibos) → HTML das páginas A4. Para um novo dono ter o próprio
// recibo, basta registrar um modelo aqui com o usuário dele.
// ─────────────────────────────────────────────
const MODELOS_RECIBO_PAPEL = {};

function modeloReciboPapel(setor) {
  const dono = typeof _donoDoSetor === 'function' ? _donoDoSetor(setor) : null;
  return (dono && MODELOS_RECIBO_PAPEL[dono.usuario]) || null;
}

/** Mostra/esconde os botões da tela de Cobrança conforme os setores do usuário */
function atualizarBotoesFolha() {
  const r = document.getElementById('btn-imp-recibos');
  if (r) r.style.display = getMeusSetores().some(s => modeloReciboPapel(s)) ? '' : 'none';
  const f = document.getElementById('btn-baixa-foto');
  if (f) f.style.display = typeof abrirFotoModal === 'function' ? '' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('folhabg')?.addEventListener('click', function (e) { if (e.target === this) fecharFolhaModal(); });
  document.getElementById('fotobg')?.addEventListener('click', function (e) { if (e.target === this) fecharFotoModal(); });
});
