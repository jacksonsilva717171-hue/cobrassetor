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
      <td class="fl-x"><span class="fl-box"></span>${it.meses.length > 1 ? '<span class="fl-meses">____ meses</span>' : ''}</td>
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
    <div class="fl-instr">Marque com <strong>X</strong> a caixinha de cada cliente que pagou. Se pagou mais de 1 mês, escreva quantos em <strong>"____ meses"</strong>.</div>
    ${itens.length ? `<table class="fl-tab">
      <colgroup>
        <col style="width:17mm"><col style="width:37mm"><col style="width:29mm"><col>
        <col style="width:23mm"><col style="width:21mm"><col style="width:13mm"><col style="width:21mm">
      </colgroup>
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
  [1, 2, 3, 4, 5].forEach(i => {
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

// Meses pagos por cliente na conferência: _fotoN[i] = N; _fotoAvisoN[i] = texto amarelo ou null
let _fotoN = [], _fotoAvisoN = [];

/**
 * N padrão de cada cliente: o número lido junto ao X; sem número → 1
 * (nunca assume que pagou tudo). Nunca passa do total em aberto.
 */
function _fotoPadraoN(it, m) {
  const max = it.meses.length;
  const lido = m && Number.isInteger(m.meses) && m.meses >= 1 ? m.meses : null;
  if (lido !== null) {
    if (lido > max) return { n: max, aviso: `Lido "${lido}" meses, mas só há ${max} em aberto — usei ${max}. Confira.` };
    return { n: lido, aviso: m.confiancaMeses !== 'alta' ? `Número de meses duvidoso (lido ${lido}) — confira na folha.` : null };
  }
  return { n: 1, aviso: max >= 2 ? 'Quantos meses foram pagos?' : null };
}

function _fotoRenderRevisao() {
  const lidos = new Map((_fotoLeitura.marcados || []).map(m => [String(m.codigo).toUpperCase(), m]));
  const naLista = new Set(_fotoItens.map(it => String(it.c.id).toUpperCase()));

  const fora = [...lidos.values()].filter(m => !naLista.has(String(m.codigo).toUpperCase()));
  const avisoFora = fora.length
    ? `<div class="ft-aviso">⚠️ Lido na foto mas <strong>não está na lista</strong> deste setor/data: ${fora.map(m => esc(m.codigo)).join(', ')} — confira na folha.</div>`
    : '';

  _fotoN = []; _fotoAvisoN = [];
  const linhas = _fotoItens.map((it, i) => {
    const c = it.c;
    const m = lidos.get(String(c.id).toUpperCase());
    const duvida = m && m.confianca !== 'alta';
    const marcado = m && !duvida;
    const pad = _fotoPadraoN(it, m);
    _fotoN[i] = pad.n; _fotoAvisoN[i] = pad.aviso;
    const jaPago = it.meses.filter(ms => PAG.some(p => p.cid === c.id && parseInt(p.mesPago) === ms.ym));
    const meses = it.meses.length > 1 ? ` · ${it.meses.length} meses em aberto (${it.meses.map(ms => lbM(ms.ym)).join(', ')})` : ` · ${lbM(it.meses[0].ym)}`;
    return `<label class="ft-item${duvida ? ' duvida' : ''}${marcado ? ' ok' : ''}" data-i="${i}">
      <input type="checkbox" data-i="${i}" ${marcado ? 'checked' : ''} onchange="_fotoAtualizaResumo()">
      <span class="ft-ord">${it.ordem}</span>
      <span class="ft-txt"><strong>${esc(c.id)}</strong> — ${esc(c.nome)}
        <small>${esc(_ruaNum(c))}${meses} · ${fR(c.valor)}/mês</small>
        ${duvida ? `<small class="ft-warn">⚠️ Leitura duvidosa (confiança ${esc(m.confianca)}) — confira na folha antes de marcar</small>` : ''}
        ${jaPago.length ? `<small class="ft-warn">⚠️ Já existe pagamento de ${jaPago.map(ms => lbM(ms.ym)).join(', ')}</small>` : ''}
        <span class="ft-n">Meses pagos:
          <button type="button" class="btn bc bxs" onclick="fotoAjustaN(${i},-1)" aria-label="menos">−</button>
          <b id="ft-n-${i}">${pad.n}</b>
          <button type="button" class="btn bc bxs" onclick="fotoAjustaN(${i},1)" aria-label="mais">+</button>
          <small class="ft-n-de">de ${it.meses.length} em aberto</small>
        </span>
        <small class="ft-warn ft-aviso-n" id="ft-aviso-${i}">${pad.aviso ? '⚠️ ' + esc(pad.aviso) : ''}</small>
      </span>
    </label>`;
  }).join('');

  const usados = (_fotoLeitura.fotos || []).map(f => `Foto ${f.foto}: ${f.usado === 'sonnet' ? 'revisada pelo Sonnet' : 'Haiku'}`).join(' · ');
  document.getElementById('ft-revisao').innerHTML =
    `<div class="ft-meta">${esc(_fotoSetor)} · vencimento até ${_fmtData(_dataDeISO(_fotoData))} · ${esc(usados)}</div>`
    + avisoFora + linhas;
  _fotoAtualizaResumo();
}

/** Botões − / +: entre 1 e o total de meses em aberto. Editar tira o aviso amarelo. */
function fotoAjustaN(i, delta) {
  const it = _fotoItens[i];
  if (!it) return;
  _fotoN[i] = Math.min(it.meses.length, Math.max(1, (_fotoN[i] || 1) + delta));
  _fotoAvisoN[i] = null;
  document.getElementById('ft-n-' + i).textContent = _fotoN[i];
  document.getElementById('ft-aviso-' + i).textContent = '';
  _fotoAtualizaResumo();
}

/** Selecionados com os meses que serão pagos: [{ it, n, meses:[{ym,data}], valor }] */
function _fotoSelecionados() {
  return [...document.querySelectorAll('#ft-revisao input[type=checkbox]:checked')]
    .map(cb => {
      const i = parseInt(cb.dataset.i);
      const it = _fotoItens[i];
      if (!it) return null;
      const n = Math.min(it.meses.length, Math.max(1, _fotoN[i] || 1));
      return { i, it, n, meses: it.meses.slice(0, n), valor: (parseFloat(it.c.valor) || 0) * n };
    }).filter(Boolean);
}

function _fotoTotais(sel) {
  return {
    clientes: sel.length,
    mensalidades: sel.reduce((a, s) => a + s.n, 0),
    total: sel.reduce((a, s) => a + s.valor, 0),
  };
}

function _fotoAtualizaResumo() {
  const sel = _fotoSelecionados();
  const t = _fotoTotais(sel);
  document.querySelectorAll('#ft-revisao .ft-item').forEach(el => {
    const i = parseInt(el.dataset.i);
    const marcado = el.querySelector('input').checked;
    el.classList.toggle('sel', marcado);
    el.classList.toggle('aviso-n', marcado && !!_fotoAvisoN[i]);
  });
  document.getElementById('ft-resumo').innerHTML = sel.length
    ? `<strong>${t.clientes} cliente(s), ${t.mensalidades} mensalidade(s), total ${fR(t.total)}</strong><br><small>${sel.map(s => esc(s.it.c.nome) + (s.n > 1 ? ` (${s.n} meses)` : '')).join(', ')}</small>`
    : 'Nenhum cliente marcado.';
  document.getElementById('ft-btn-confirmar').disabled = !sel.length;
}

/** "Confirmar baixa": mostra o resumo final; só grava depois de "Gravar baixa" */
function fotoMostrarResumo() {
  const sel = _fotoSelecionados();
  if (!sel.length) return;
  const t = _fotoTotais(sel);
  const pendentes = sel.filter(s => _fotoAvisoN[s.i]);
  document.getElementById('ft-resumo-final').innerHTML =
    `<div class="ft-resumo-tit">${t.clientes} cliente(s), ${t.mensalidades} mensalidade(s), total ${fR(t.total)}</div>`
    + (pendentes.length ? `<div class="ft-aviso">⚠️ Ainda com aviso amarelo: ${pendentes.map(s => esc(s.it.c.nome)).join(', ')} — confira os meses antes de gravar.</div>` : '')
    + '<div class="ft-resumo-lista">' + sel.map(s =>
      `<div class="ft-resumo-item"><strong>${esc(s.it.c.id)} — ${esc(s.it.c.nome)}</strong>
        <span>${s.n} ${s.n > 1 ? 'meses' : 'mês'}: ${s.meses.map(ms => lbM(ms.ym)).join(', ')} · ${fR(s.valor)}</span></div>`).join('')
    + '</div>';
  _fotoPasso(5);
}

/**
 * Grava a baixa com o MESMO núcleo de pagamento do app (registrarPagamento,
 * cobrancas.js): exatamente N mensalidades por cliente — os N meses mais
 * antigos em aberto —, cada uma com o valor da mensalidade; o vencimento
 * avança N meses.
 */
async function fotoGravarBaixa() {
  if (_baixando) return;
  const sel = _fotoSelecionados();
  if (!sel.length) return;
  const t = _fotoTotais(sel);

  _baixando = true;
  _fotoPasso(4);
  const prog = document.getElementById('ft-progresso');
  const falhas = [];
  let k = 0;
  for (const s of sel) {
    k++;
    prog.textContent = `⏳ Gravando ${k}/${sel.length}: ${s.it.c.nome} (${s.n} ${s.n > 1 ? 'meses' : 'mês'})...`;
    for (const ms of s.meses) {
      const c = CLI.find(x => x.id === s.it.c.id && x.setor === s.it.c.setor) || s.it.c;
      const { envio } = registrarPagamento(c, ms.ym, formaPadraoPagamento(c), 'Baixa pela folha (foto)');
      const r = await envio;
      if (!r || r.ok === false) falhas.push(`${s.it.c.nome} (${lbM(ms.ym)})`);
    }
  }
  renderAll();

  // Confere direto no servidor se o vencimento avançou exatamente N meses
  prog.textContent = '🔎 Conferindo no servidor...';
  let confirmados = 0, conferiu = false;
  try {
    const r = await _tentarSheetReq(SCRIPT_URL, 'getClientes', { setor: _fotoSetor });
    const arr = extArr(r, 'data', 'clientes', 'rows', 'result');
    if (arr) {
      conferiu = true;
      const pvServ = new Map(arr.map(x => [String(x.id), parseInt(x.proxVenc) || 0]));
      sel.forEach(s => {
        const esperado = addM(s.meses[s.meses.length - 1].ym, 1);
        if ((pvServ.get(String(s.it.c.id)) || 0) === esperado) confirmados++;
      });
    }
  } catch (_) { /* sem conexão: avisa abaixo */ }
  _baixando = false;

  document.getElementById('ft-final').innerHTML =
    `<div class="ft-ok">✅ Baixa feita em <strong>${t.clientes}</strong> cliente(s) · ${t.mensalidades} mensalidade(s) · ${fR(t.total)}</div>`
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
  toast(`✅ Baixa feita em ${t.clientes} cliente(s) · ${t.mensalidades} mensalidade(s)`);
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

// ─────────────────────────────────────────────
// VALOR POR EXTENSO (reais e centavos)
// ─────────────────────────────────────────────
const _EXT_UNI = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const _EXT_DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const _EXT_CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function _extenso999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, partes = [];
  if (c) partes.push(_EXT_CEN[c]);
  if (r) {
    if (r < 20) partes.push(_EXT_UNI[r]);
    else {
      const d = Math.floor(r / 10), u = r % 10;
      partes.push(u ? _EXT_DEZ[d] + ' e ' + _EXT_UNI[u] : _EXT_DEZ[d]);
    }
  }
  return partes.join(' e ');
}

function _extensoInteiro(n) {
  if (n === 0) return 'zero';
  const grupos = [];
  let x = n;
  while (x > 0) { grupos.push(x % 1000); x = Math.floor(x / 1000); }
  const nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let txt = (i === 1 && g === 1) ? 'mil' : _extenso999(g) + (i ? ' ' + nomes[i][g === 1 ? 0 : 1] : '');
    partes.push({ g, txt });
  }
  // "e" antes do último grupo quando ele é < 100 ou centena redonda (ex.: mil e cinquenta, mil e duzentos)
  return partes.map((p, i) => {
    if (i === 0) return p.txt;
    const sep = (i === partes.length - 1 && (p.g < 100 || p.g % 100 === 0)) ? ' e ' : ' ';
    return sep + p.txt;
  }).join('');
}

/** 120.5 → "cento e vinte reais e cinquenta centavos" */
function valorPorExtenso(valor) {
  const total = Math.round((parseFloat(valor) || 0) * 100);
  const reais = Math.floor(total / 100), cent = total % 100;
  const partes = [];
  if (reais) {
    const milhoesRedondos = reais >= 1000000 && reais % 1000000 === 0;
    partes.push(_extensoInteiro(reais) + (milhoesRedondos ? ' de' : '') + (reais === 1 ? ' real' : ' reais'));
  }
  if (cent) partes.push(_extensoInteiro(cent) + (cent === 1 ? ' centavo' : ' centavos'));
  return partes.length ? partes.join(' e ') : 'zero reais';
}

// ─────────────────────────────────────────────
// FUNÇÃO 3 — RECIBOS DE PAPEL
// ─────────────────────────────────────────────
const _MESES_EXT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * Um recibo por mês em aberto, na MESMA lista e ordem da folha
 * (listaFolhaCobranca). Numeração = posição do cliente na folha.
 */
function listaRecibosPapel(setor, dataISO) {
  const recibos = [];
  listaFolhaCobranca(setor, dataISO).forEach(it => {
    it.meses.forEach((m, i) => {
      recibos.push({
        n: recibos.length + 1,
        ordem: it.ordem,
        parte: it.meses.length > 1 ? `${i + 1}/${it.meses.length}` : '',
        c: it.c,
        valor: parseFloat(it.c.valor) || 0,
        data: m.data,
        ym: m.ym,
      });
    });
  });
  return recibos;
}

/** Quebra o texto em 2 linhas pelo limite de caracteres da 1ª caixa */
function _quebra2(txt, max) {
  if (txt.length <= max) return [txt, ''];
  const palavras = txt.split(' ');
  let a = '';
  while (palavras.length && (a ? a + ' ' + palavras[0] : palavras[0]).length <= max) a = a ? a + ' ' + palavras.shift() : palavras.shift();
  return [a, palavras.join(' ')];
}

const _ICONE_ZAP = '<svg viewBox="0 0 24 24" class="re-zap" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="#000" stroke-width="2"/><path d="M8.2 6.9c.3-.3.8-.3 1 .1l1 1.9c.2.3.1.7-.1 1l-.7.7c.5 1.2 1.6 2.4 2.9 3l.7-.7c.3-.3.7-.3 1-.1l1.9 1c.4.2.4.7.1 1l-.9.9c-.6.6-1.6.7-2.4.3-2.2-1.1-3.9-2.8-5-5-.4-.8-.3-1.8.3-2.4z" fill="#000"/></svg>';

/** Um recibo GRUPO ELITE (126 × 62 mm), igual ao RECIBOS.pdf, assinatura em branco */
function _reciboEliteHTML(r) {
  const c = r.c;
  const [ext1, ext2] = _quebra2(valorPorExtenso(r.valor), 46);
  const dia = String(r.data.getDate()).padStart(2, '0');
  const mes = _MESES_EXT[r.data.getMonth()];
  const ano = r.data.getFullYear();
  const linha2 = [c.id, _ruaNum(c)].filter(Boolean).join(' · ');
  return `<div class="re">
    <div class="re-num">#${r.ordem}${r.parte ? ' · ' + r.parte : ''}</div>
    <div class="re-cab">
      <div class="re-marca">GRUPO ELITE</div>
      <div class="re-ramo">CONDOMÍNIOS - RESIDENCIAIS - COMÉRCIOS</div>
      <div class="re-cnpj">38.165.898/0001-20</div>
      <div class="re-tel">(47) 99944.7354${_ICONE_ZAP}</div>
    </div>
    <div class="re-cxval">
      <div class="re-tit">RECIBO</div>
      <div class="re-rs">R$</div>
      <div class="re-campo-rs">${esc(r.valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'))}</div>
    </div>
    <div class="re-lbl re-l1">Recebi(emos) de</div>
    <div class="re-cx re-c1"><span class="re-nome">${esc(c.nome)}</span></div>
    <div class="re-cx re-c2"><span class="re-peq">${esc(linha2)}</span></div>
    <div class="re-lbl re-l3">a importância de</div>
    <div class="re-cx re-c3"><span>${esc(ext1)}</span></div>
    <div class="re-cx re-c4"><span>${esc(ext2)}</span></div>
    <div class="re-prov">Proveniente de <b><i>SERVIÇO DE SEGURANÇA ELETRÔNICA.</i></b></div>
    <div class="re-data"><span class="re-bl re-bl1">${dia}</span>de<span class="re-bl re-bl2">${mes}</span>de<span class="re-bl re-bl3">${ano}</span></div>
    <div class="re-clareza">Para maior clareza, firmamos o presente</div>
    <div class="re-assin">ASSINATURA</div>
  </div>`;
}

/** Folhas A4 com 6 recibos: 4 em pé à esquerda (1-4) e 2 deitados à direita (5-6) */
function _paginasRecibos6(recibos, renderUm) {
  const paginas = [];
  for (let i = 0; i < recibos.length; i += 6) {
    const grupo = recibos.slice(i, i + 6);
    const slots = grupo.map((r, k) =>
      `<div class="rp-slot ${k < 4 ? 'rp-pe rp-pe' + (k + 1) : 'rp-deit rp-deit' + (k - 3)}">${renderUm(r)}</div>`).join('');
    paginas.push(`<div class="rp-page">
      <div class="rp-corte rp-cv"></div>
      <div class="rp-corte rp-ch rp-ch1"></div>
      <div class="rp-corte rp-ch rp-ch2"></div>
      <div class="rp-corte rp-ch rp-ch3"></div>
      ${slots}
    </div>`);
  }
  return paginas.join('');
}

MODELOS_RECIBO_PAPEL.elite2022 = {
  nome: 'GRUPO ELITE',
  porFolha: 6,
  render: recibos => _paginasRecibos6(recibos, _reciboEliteHTML),
};

function htmlRecibosPapel(setor, dataISO) {
  const modelo = modeloReciboPapel(setor);
  if (!modelo) return '';
  const recibos = listaRecibosPapel(setor, dataISO);
  if (!recibos.length) return '<div class="fl-page"><div class="fl-vazio">Nenhum recibo: nenhum cliente com vencimento até esta data.</div></div>';
  return modelo.render(recibos);
}

function imprimirRecibos(setor, dataISO) {
  if (!podeVerSetor(setor)) { toast('🚫 Setor fora das suas permissões.', 'err'); return; }
  if (!modeloReciboPapel(setor)) { toast('⚠️ Este setor ainda não tem modelo de recibo de papel.', 'warn'); return; }
  const n = listaRecibosPapel(setor, dataISO).length;
  abrirImpressao(`Recibos — ${setor} · ${n} recibo(s)`, htmlRecibosPapel(setor, dataISO), '0');
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
