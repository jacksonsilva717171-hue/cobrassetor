/* ═══════════════════════════════════════════════════════════════
   CobraSetor v1 — config.js
   Constantes · Estado Global · API Sheets · Helpers · Utils
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────
// CONFIGURAÇÃO SHEETS
// ─────────────────────────────────────────────
const SHEET_ID_DEFAULT = '15tc3NJ_N1CLlSNEP3CYo8Uze-trMNrOy864dUpUhM98';

// URL do Apps Script do app EPS em produção (fallback hardcoded para compatibilidade)
const SCRIPT_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbzyvuro1A0qZlXhy_dv2jKi6SGjVSm3LLYx3Y5NGpU-30RQacgYdt9PLi5un8D5HEc/exec';

let SHEET_ID   = localStorage.getItem('cobr_sheet_id')  || SHEET_ID_DEFAULT;
let SCRIPT_URL = localStorage.getItem('cobr_script_url')
              || localStorage.getItem('eps_script_url')  // compatibilidade EPS
              || SCRIPT_URL_DEFAULT;                      // fallback hardcoded

// ─────────────────────────────────────────────
// USUÁRIOS PADRÃO (hardcoded seed)
// ─────────────────────────────────────────────
const USUARIOS_PADRAO = [
  {
    usuario:    'admin',
    senha:      'cobra2025',
    role:       'admin',
    nome:       'Administrador',
    bloqueado:  false,
  },
  {
    usuario:    'preto',
    senha:      'jack0411',
    role:       'proprietario',
    nome:       'Preto',
    tel:        '',
    chavePix:   '',
    logoUrl:    '',
    setores:    ['Setor 13', 'Setor 02'],
    valorMensal: 100,
    bloqueado:  false,
  },
  {
    usuario:    'elite2022',
    senha:      'elite2022',
    role:       'proprietario',
    nome:       'Vinicius',
    tel:        '',
    chavePix:   '',
    logoUrl:    '',
    setores:    ['Setor 03', 'Setor 04', 'Setor 05', 'Setor 06', 'Setor 07', 'Setor 08'],
    valorMensal: 300,
    bloqueado:  false,
  },
];

// Mescla padrão + extras salvos no localStorage
function carregarUsuarios() {
  // Lê ambas as chaves; cobr_usuarios tem PRIORIDADE sobre eps_usuarios
  const salvosCobr = JSON.parse(localStorage.getItem('cobr_usuarios') || '[]');
  const salvosEps  = JSON.parse(localStorage.getItem('eps_usuarios')  || '[]');

  const merged = USUARIOS_PADRAO.map(p => ({ ...p }));

  // 1ª passagem: aplica eps_usuarios (prioridade baixa — dados legados do EPS)
  salvosEps.forEach(s => {
    const idx = merged.findIndex(u => u.usuario === s.usuario);
    // normaliza role legado antes de aplicar
    const role = s.role === 'vigia' ? 'cobrador'
               : s.role === 'dono'  ? 'proprietario'
               : (s.role || 'cobrador');
    const norm = { ...s, role };
    if (idx >= 0) merged[idx] = { ...merged[idx], ...norm };
    else merged.push(norm);
  });

  // 2ª passagem: aplica cobr_usuarios (prioridade alta — dados do CobraSetor)
  // Sobrescreve qualquer entrada do eps_usuarios com o mesmo usuário
  salvosCobr.forEach(s => {
    const idx = merged.findIndex(u => u.usuario === s.usuario);
    if (idx >= 0) merged[idx] = { ...merged[idx], ...s };
    else merged.push(s);
  });

  return merged;
}

function salvarUsuarios() {
  // Salva apenas os que diferem do padrão + os extras
  const extras = USUARIOS.filter(u => !USUARIOS_PADRAO.find(p => p.usuario === u.usuario));
  const modificados = USUARIOS.filter(u => {
    const pad = USUARIOS_PADRAO.find(p => p.usuario === u.usuario);
    if (!pad) return false;
    return JSON.stringify(u) !== JSON.stringify(pad);
  });
  const toSave = [...modificados, ...extras];
  localStorage.setItem('cobr_usuarios', JSON.stringify(toSave));
  // sincroniza chave legada EPS para cobrador EPS-compatível
  localStorage.setItem('eps_usuarios', JSON.stringify(
    toSave.map(u => ({
      ...u,
      role: u.role === 'proprietario' ? 'dono' : u.role === 'cobrador' ? 'vigia' : u.role,
      setor: Array.isArray(u.setores) ? (u.setores[0] || '') : (u.setores || ''),
    }))
  ));
  USUARIOS = carregarUsuarios();
}

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
let USUARIOS = carregarUsuarios();
let CLI  = [];   // clientes
let PAG  = [];   // pagamentos
let DESP = [];   // despesas
let USER = null; // usuário logado

// Controles de UI
let cobTab  = 'todos'; // aba ativa na cobrança
let relTab  = 'mes';   // período do relatório

// Filtros da tela de Clientes (variáveis JS — não dependem do DOM .value)
let fCliSetor  = '';
let fCliStatus = '';
let fCliForma  = '';

function setFCliSetor(v)  { fCliSetor  = v; renderCli(); }
function setFCliStatus(v) { fCliStatus = v; renderCli(); }
function setFCliForma(v)  { fCliForma  = v; renderCli(); }

// Controles de modais
let editId      = null; // cliente sendo editado
let editDespId  = null; // despesa sendo editada
let editCobrId  = null; // cobrador sendo editado (usuario string)
let editPropId  = null; // proprietário sendo editado (usuario string)
let pagId       = null;
let pagMes      = null;
let pagForma    = 'dinheiro';
let pagVoltar   = null;
let remarkId    = null;
let obsId       = null;

// Sync
let bloqSync = false; // bloqueia sync 15s após pagamento

// ─────────────────────────────────────────────
// HELPERS DE DATA/MÊS
// ─────────────────────────────────────────────
/** Retorna AAAAMM a partir de um Date */
function YM(d) {
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

/** Adiciona/subtrai meses de um AAAAMM */
function addM(ym, n) {
  let y = Math.floor(ym / 100);
  let m = (ym % 100) - 1 + n;
  y += Math.floor(m / 12);
  m  = ((m % 12) + 12) % 12;
  return y * 100 + (m + 1);
}

const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/** Formata AAAAMM → "Mai/2026" */
function lbM(ym) {
  const n = parseInt(ym) || 0;
  if (!n) return '---';
  return MES_ABREV[(n % 100) - 1] + '/' + Math.floor(n / 100);
}

/** Formata data ISO → "dd/mm/yyyy HH:MM" */
function fData(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
}

/** Hoje no formato YYYY-MM-DD (para input[type=date]) */
function hojeISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// CÁLCULO DE STATUS DO CLIENTE
// ─────────────────────────────────────────────
/**
 * Retorna o status calculado do cliente:
 * 'inativo' | 'remarcado' | 'hoje' | 'atrasado' | 'ok' | 'adiantado'
 */
function st(c) {
  if (c.status === 'inativo') return 'inativo';

  // Remarcado: a única fonte de verdade é dataRemarcacao (persistida no Sheets
  // pela ação remarcarCliente) — não depende de c.status, que nunca é gravado na planilha
  if (c.dataRemarcacao) {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const ret  = new Date(c.dataRemarcacao + 'T00:00:00');
    if (ret > hoje) return 'remarcado'; // ainda no futuro
    // data de retorno chegou → reativa automaticamente (localmente e no Sheets)
    c.status = 'ativo';
    c.dataRemarcacao = '';
    // persiste a reativação em segundo plano sem bloquear UI
    setTimeout(() => sheetPost('remarcarCliente', { id: c.id, dataRemarcacao: '' }).catch(() => {}), 100);
  }

  return _stCalc(c);
}

function _stCalc(c) {
  const h  = new Date();
  const yh = YM(h);
  const dh = h.getDate();
  const pv = parseInt(String(c.proxVenc || '').replace(/\..*$/, '')) || yh;
  const vd = parseInt(String(c.vencDia  || '').replace(/\..*$/, '')) || 1;

  if (pv < yh) return 'atrasado';
  if (pv > yh) return 'adiantado';
  if (vd === dh) return 'hoje';
  if (vd <  dh) return 'atrasado';
  return 'ok';
}

/** Quantos meses de atraso o cliente tem */
function calcMesesAtraso(c) {
  const yh = YM(new Date());
  const pv = parseInt(c.proxVenc) || yh;
  if (pv >= yh) return 0;
  const ay = Math.floor(yh / 100), am = yh % 100;
  const py = Math.floor(pv / 100), pm = pv % 100;
  return (ay - py) * 12 + (am - pm);
}

/** HTML do badge de status */
function stLbl(s) {
  const map = {
    hoje:      '<span class="st-hj">⚡ Hoje</span>',
    atrasado:  '<span class="st-la">🔴 Atraso</span>',
    adiantado: '<span class="st-ad">⭐ Adiantado</span>',
    remarcado: '<span class="st-rm">🔵 Remarcado</span>',
    inativo:   '<span class="st-in">⚫ Inativo</span>',
    ok:        '<span class="st-ok">✅ Em dia</span>',
  };
  return map[s] || map.ok;
}

/** HTML do badge de forma de pagamento */
function fpLbl(forma) {
  const map = {
    dinheiro:       '<span class="fp-din">💵 Dinheiro</span>',
    cartao:         '<span class="fp-cart">💳 Cartão</span>',
    pix_presencial: '<span class="fp-pixp">✅ Pix Pres.</span>',
    pix_auto:       '<span class="fp-pixa">🤖 Pix Auto</span>',
    pix:            '<span class="fp-pixp">✅ Pix</span>',  // compat EPS
  };
  return map[forma] || `<span class="fp-din">${forma||'-'}</span>`;
}

// ─────────────────────────────────────────────
// ORDENAÇÃO DE CLIENTES (ordemRua → ordemRua2 → num → nome)
// ─────────────────────────────────────────────
/**
 * Extrai os números de prefixo do campo rua.
 * Formato esperado: "01-02 - NOME DA RUA" → [1, 2]
 * Retorna [9999, 9999] se não houver prefixo.
 */
function _parseOrdemRua(c) {
  // Se ordemRua já foi explicitamente definido (campo do cadastro)
  const explicit = parseInt(c.ordemRua);
  if (explicit && explicit !== 9999) return [explicit, 0];

  // Tenta extrair do prefixo do campo rua: "XX-YY - NOME" ou "XX - NOME"
  const match = String(c.rua || '').match(/^(\d+)(?:-(\d+))?[^\d]/);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2] || '0')];
  }
  return [9999, 9999];
}

function sortClientes(list) {
  return [...list].sort((a, b) => {
    const [oa1, oa2] = _parseOrdemRua(a);
    const [ob1, ob2] = _parseOrdemRua(b);
    if (oa1 !== ob1) return oa1 - ob1;
    if (oa2 !== ob2) return oa2 - ob2;
    const na = parseInt(a.num) || 0;
    const nb = parseInt(b.num) || 0;
    if (na !== nb) return na - nb;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });
}

// ─────────────────────────────────────────────
// FILTRO DE CLIENTES POR ROLE
// ─────────────────────────────────────────────
function getClisFiltrados() {
  if (!USER) return [];
  if (USER.role === 'admin') return CLI;
  if (USER.role === 'proprietario') {
    // Comparação case-insensitive + trim para tolerar variações de digitação
    // ex: "Setor 03" === "setor 03" === "Setor 03 " (espaço extra)
    const setoresNorm = (USER.setores || []).map(s => s.trim().toLowerCase());
    return CLI.filter(c => setoresNorm.includes((c.setor || '').trim().toLowerCase()));
  }
  if (USER.role === 'cobrador') {
    const meus = Array.isArray(USER.setores) ? USER.setores
                 : (USER.setor ? [USER.setor] : []);
    const meusNorm = meus.map(s => s.trim().toLowerCase());
    return CLI.filter(c => meusNorm.includes((c.setor || '').trim().toLowerCase()));
  }
  return [];
}

/** Setores que o usuário pode ver */
function getMeusSetores() {
  if (!USER) return [];
  if (USER.role === 'admin') return [...new Set(CLI.map(c => c.setor).filter(Boolean))].sort();
  if (USER.role === 'proprietario') return [...(USER.setores || [])].sort();
  if (USER.role === 'cobrador') {
    return Array.isArray(USER.setores) ? [...USER.setores].sort()
           : (USER.setor ? [USER.setor] : []);
  }
  return [];
}

// ─────────────────────────────────────────────
// FORMATAÇÃO DE MOEDA
// ─────────────────────────────────────────────
function fR(v) {
  const n = parseFloat(v || 0);
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formata endereço completo */
function addr(c) {
  return [c.rua, c.num && ('Nº ' + c.num), c.complemento, c.bairro, c.cidade]
    .filter(Boolean).join(', ');
}

// ─────────────────────────────────────────────
// GERAÇÃO DE ID
// ─────────────────────────────────────────────
function gerarId() {
  const nums = CLI.map(c => parseInt((c.id || '').replace('EPS', '')) || 0);
  const max  = nums.length ? Math.max(...nums) : 0;
  return 'EPS' + String(max + 1).padStart(3, '0');
}

// ─────────────────────────────────────────────
// API — GOOGLE SHEETS
// ─────────────────────────────────────────────
async function fetchComTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(tid);
    return r;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

async function _tentarSheetReq(url, acao, dados) {
  const params = new URLSearchParams({ acao, ...dados });
  // cache:'no-store' garante que o navegador nunca reaproveite uma resposta
  // antiga do Apps Script — cada "Sincronizar" busca dado fresco de verdade
  const r    = await fetchComTimeout(`${url}?${params}`, { method: 'GET', cache: 'no-store' }, 10000);
  const text = await r.text();
  return JSON.parse(text); // pode lançar — às vezes o Apps Script retorna HTML de erro
}

// Uma URL antiga do Apps Script salva neste navegador (tela Configurações,
// chaves cobr_script_url/eps_script_url) fica presa no localStorage para
// sempre — nem "Sincronizar" nem F5/Ctrl+Shift+R limpam isso, então o
// navegador continua batendo num deployment desatualizado/quebrado e caindo
// no fallback local (dados antigos) silenciosamente. Se a URL configurada
// falhar e for diferente da URL padrão embutida no código, tenta a padrão
// uma vez; se funcionar, autocorrige o localStorage para não repetir o erro.
let _tentouUrlPadrao = false;
async function sheetReq(acao, dados = {}) {
  if (!SCRIPT_URL) return offlineReq(acao, dados);
  setSyncStatus('sync', 'Conectando ao Sheets...');
  try {
    const json = await _tentarSheetReq(SCRIPT_URL, acao, dados);
    setSyncStatus('ok', '✅ Sincronizado · ' + new Date().toLocaleTimeString('pt-BR'));
    return json;
  } catch (e) {
    console.warn('sheetReq erro em', SCRIPT_URL, ':', e.message);
    if (SCRIPT_URL !== SCRIPT_URL_DEFAULT && !_tentouUrlPadrao) {
      _tentouUrlPadrao = true;
      try {
        const json = await _tentarSheetReq(SCRIPT_URL_DEFAULT, acao, dados);
        SCRIPT_URL = SCRIPT_URL_DEFAULT;
        localStorage.setItem('cobr_script_url', SCRIPT_URL_DEFAULT);
        localStorage.setItem('eps_script_url', SCRIPT_URL_DEFAULT);
        setSyncStatus('ok', '✅ Sincronizado (URL corrigida automaticamente)');
        toast('🔧 A URL do Sheets salva neste navegador estava desatualizada — corrigida automaticamente.', 'warn');
        return json;
      } catch (e2) {
        console.warn('URL padrão também falhou:', e2.message);
      }
    }
    setSyncStatus('err', '🔴 Sem conexão com o Sheets — dados locais (podem estar desatualizados)');
    toast('🔴 Não foi possível buscar dados atualizados do Sheets — mostrando dados salvos neste navegador.', 'err');
    return offlineReq(acao, dados);
  }
}

async function sheetPost(acao, dados = {}) {
  if (!SCRIPT_URL) return offlinePost(acao, dados);
  try {
    setSyncStatus('sync', 'Salvando...');
    const r    = await fetchComTimeout(SCRIPT_URL, {
      method: 'POST',
      cache:  'no-store',
      body:   JSON.stringify({ acao, ...dados }),
    }, 8000);
    const json = await r.json();
    setSyncStatus('ok', 'Salvo · ' + new Date().toLocaleTimeString('pt-BR'));
    return json;
  } catch (e) {
    setSyncStatus('err', 'Sem conexão — dados locais');
    return offlinePost(acao, dados);
  }
}

// ─────────────────────────────────────────────
// OFFLINE — localStorage fallback
// ─────────────────────────────────────────────
function offlineReq(acao, dados) {
  if (acao === 'getClientes') {
    let list = JSON.parse(localStorage.getItem('eps_cli') || '[]');
    if (dados.setor) list = list.filter(c => c.setor === dados.setor);
    return { ok: true, data: list };
  }
  if (acao === 'getPagamentos') {
    const pag = JSON.parse(localStorage.getItem('eps_pag') || '[]');
    return { ok: true, data: pag };
  }
  if (acao === 'getDespesas') {
    const desp = JSON.parse(localStorage.getItem('cobr_desp') || '[]');
    return { ok: true, data: desp };
  }
  return { ok: true, data: [] };
}

function offlinePost(acao, dados) {
  let cli  = JSON.parse(localStorage.getItem('eps_cli')   || '[]');
  let pag  = JSON.parse(localStorage.getItem('eps_pag')   || '[]');
  let desp = JSON.parse(localStorage.getItem('cobr_desp') || '[]');

  switch (acao) {
    case 'addCliente':
    case 'editCliente': {
      const idx = cli.findIndex(c => c.id === dados.id);
      if (idx >= 0) cli[idx] = dados; else cli.push(dados);
      localStorage.setItem('eps_cli', JSON.stringify(cli));
      break;
    }
    case 'delCliente':
      cli = cli.filter(c => c.id !== dados.id);
      localStorage.setItem('eps_cli', JSON.stringify(cli));
      break;

    case 'addPagamento': {
      pag.push(dados);
      localStorage.setItem('eps_pag', JSON.stringify(pag));
      // atualiza proxVenc local
      const idxPag = cli.findIndex(c => c.id === dados.cid);
      if (idxPag >= 0) { cli[idxPag].proxVenc = dados.novoPv; localStorage.setItem('eps_cli', JSON.stringify(cli)); }
      break;
    }

    case 'addDespesa':
    case 'editDespesa': {
      const di = desp.findIndex(d => d.id === dados.id);
      if (di >= 0) desp[di] = dados; else desp.push(dados);
      localStorage.setItem('cobr_desp', JSON.stringify(desp));
      break;
    }
    case 'delDespesa':
      desp = desp.filter(d => d.id !== dados.id);
      localStorage.setItem('cobr_desp', JSON.stringify(desp));
      break;
  }
  return { ok: true };
}

// ─────────────────────────────────────────────
// SYNC PRINCIPAL
// ─────────────────────────────────────────────

/**
 * Extrai array de uma resposta do Apps Script.
 * Aceita múltiplos formatos: {ok,data}, {status,clientes}, array direto, etc.
 */
function extArr(r, ...keys) {
  if (Array.isArray(r)) return r;
  for (const k of keys) if (Array.isArray(r?.[k])) return r[k];
  return null;
}

async function syncAll() {
  // Restaura bloqueio de sync do sessionStorage (sobrevive a page reload — ex: iOS ao retornar do WhatsApp)
  if (!bloqSync) {
    const exp = parseInt(sessionStorage.getItem('bloqSync_exp') || '0');
    if (exp > Date.now()) {
      bloqSync = true;
      setTimeout(() => { bloqSync = false; sessionStorage.removeItem('bloqSync_exp'); }, exp - Date.now());
    }
  }
  if (bloqSync) return; // silencioso — não exibir toast ao restaurar de reload
  if (!USER) return;

  setSyncStatus('sync', 'Carregando dados...');

  // ── Monta map local (localStorage + memória) para merge de proxVenc ──────
  const cachedForMerge = JSON.parse(localStorage.getItem('eps_cli') || '[]');
  const localById = {};
  cachedForMerge.forEach(c => { if (c.id) localById[c.id] = c; });
  CLI.forEach(c => { if (c.id) localById[c.id] = c; });

  function applyMerge(arr) {
    const merged = arr.map(c => {
      const norm = normalizarCliente(c);
      const local = localById[norm.id];
      if (local) {
        // Preserva proxVenc local se estiver mais adiantado (pagamento recente ainda não refletido no Sheets)
        if (local.proxVenc > norm.proxVenc) norm.proxVenc = local.proxVenc;
        // Apps Script bug: addPagamento às vezes corrompe colunas do cliente
        // (ex: grava valor_mensalidade em vencDia e zera valor)
        // → preserva dados locais válidos quando o Sheets retorna dados inválidos
        if (local.valor > 0 && norm.valor === 0) norm.valor = local.valor;
        if (local.vencDia >= 1 && local.vencDia <= 31 &&
            (norm.vencDia < 1 || norm.vencDia > 31)) {
          norm.vencDia = local.vencDia;
        }
        // dataRemarcacao agora é persistida no Sheets (ação remarcarCliente) e o
        // Sheets é a fonte de verdade — mas se o POST de remarcarCliente ainda não
        // chegou lá (race entre remarcar e este sync), preserva o valor local
        // enquanto ele continuar válido (data futura) e o remoto vier vazio.
        if (local.dataRemarcacao && !norm.dataRemarcacao) {
          const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
          const ret  = new Date(local.dataRemarcacao + 'T00:00:00');
          if (ret > hoje) norm.dataRemarcacao = local.dataRemarcacao;
        }
      }
      return norm;
    });

    // Reintegra clientes que existem só localmente (cadastro/edição feito
    // neste dispositivo mas ainda não refletido no Sheets) — sem isso, um
    // cadastro cuja gravação no Apps Script falhar/atrasar some da lista
    // assim que este sync roda.
    const mergedIds = new Set(merged.map(c => c.id));
    const somenteLocais = Object.values(localById)
      .filter(c => c.id && !mergedIds.has(c.id))
      .map(c => normalizarCliente(c));

    return merged.concat(somenteLocais);
  }

  // ── Determina promise de clientes ────────────────────────────────────────
  let cliReqPromise;
  if (USER.role === 'cobrador') {
    const meus = Array.isArray(USER.setores) ? USER.setores : [USER.setor].filter(Boolean);
    cliReqPromise = meus.length === 1
      ? sheetReq('getClientes', { setor: meus[0] })
      : sheetReq('getClientes', {});
  } else {
    // Tenta busca geral (rápida, sem setor) — funciona quando o Apps Script
    // retorna todos os clientes de todas as abas num único call.
    cliReqPromise = sheetReq('getClientes', {});
  }

  const promises = [cliReqPromise];
  if (USER.role !== 'cobrador') {
    promises.push(sheetReq('getPagamentos'));
    promises.push(sheetReq('getDespesas'));
  } else {
    promises.push(Promise.resolve({ ok: true, data: [] }));
    promises.push(Promise.resolve({ ok: true, data: [] }));
  }

  const [rCli, rPag, rDesp] = await Promise.all(promises);

  const cliData  = extArr(rCli,  'data', 'clientes', 'rows', 'result');
  const pagData  = extArr(rPag,  'data', 'pagamentos', 'rows', 'result');
  const despData = extArr(rDesp, 'data', 'despesas', 'rows', 'result');

  if (cliData !== null && cliData.length > 0) {
    CLI = applyMerge(cliData);
    localStorage.setItem('eps_cli', JSON.stringify(CLI));

    // ── Fallback por setor: se a busca geral não trouxe clientes dos nossos setores
    // (ex: Apps Script retorna só setores 03-08 na chamada sem parâmetro),
    // busca cada setor sequencialmente para não saturar a cota.
    if (USER.role === 'proprietario' && getClisFiltrados().length === 0) {
      const meus = USER.setores || [];
      if (meus.length > 0) {
        const allCli = [];
        for (const s of meus) {
          const r = await sheetReq('getClientes', { setor: s });
          const arr = extArr(r, 'data', 'clientes', 'rows', 'result');
          if (arr) allCli.push(...arr);
        }
        if (allCli.length > 0) {
          const seen = new Set();
          const deduped = allCli.filter(c => {
            if (!c.id || seen.has(c.id)) return false;
            seen.add(c.id); return true;
          });
          CLI = applyMerge(deduped);
          localStorage.setItem('eps_cli', JSON.stringify(CLI));
        }
      }
    }

  } else if (CLI.length === 0) {
    const cached = JSON.parse(localStorage.getItem('eps_cli') || '[]');
    if (cached.length > 0) CLI = cached.map(c => normalizarCliente(c));
  }

  if (pagData !== null && pagData.length > 0) {
    PAG = pagData;
    localStorage.setItem('eps_pag', JSON.stringify(PAG));
  } else {
    PAG = JSON.parse(localStorage.getItem('eps_pag') || '[]');
  }

  // Corrige proxVenc baseado nos pagamentos registrados.
  // O Apps Script addPagamento não atualiza a coluna proxVenc na planilha,
  // então derivamos o valor correto a partir do maior mesPago de cada cliente.
  {
    const maxMesPago = {};
    for (const p of PAG) {
      const mes = parseInt(p.mesPago) || 0;
      if (mes && (!maxMesPago[p.cid] || mes > maxMesPago[p.cid])) maxMesPago[p.cid] = mes;
    }
    let corrigido = false;
    CLI = CLI.map(c => {
      const max = maxMesPago[c.id];
      if (!max) return c;
      const expectedPv = addM(max, 1);
      if (expectedPv > (parseInt(c.proxVenc) || 0)) { corrigido = true; return { ...c, proxVenc: expectedPv }; }
      return c;
    });
    if (corrigido) localStorage.setItem('eps_cli', JSON.stringify(CLI));
  }

  if (despData !== null) {
    DESP = despData;
    if (DESP.length > 0) localStorage.setItem('cobr_desp', JSON.stringify(DESP));
  } else if (DESP.length === 0) {
    DESP = JSON.parse(localStorage.getItem('cobr_desp') || '[]');
  }

  renderAll();

  const dot = document.getElementById('sync-dot');
  if (dot && dot.classList.contains('sync')) {
    setSyncStatus('ok', `📦 Dados locais · ${CLI.length} cliente(s)`);
  }
}

/** Normaliza tipos do cliente (garante tipos corretos — evita TypeError em .slice / .localeCompare) */
function normalizarCliente(c) {
  let pv = parseInt(String(c.proxVenc || '').replace(/\..*$/, '')) || YM(new Date());
  // compatibilidade: corrige anos anteriores (dados antigos EPS)
  if (pv > 0 && pv < 202500) {
    const mes = pv % 100;
    pv = 202600 + mes;
  }
  return {
    ...c,
    // campos de texto — sempre string (planilha pode enviar número em campo obs ou nome)
    id:       String(c.id    || ''),
    nome:     String(c.nome  || '').trim(),
    rua:      String(c.rua   || '').trim(),
    setor:    (() => {
      if (c.setor) return String(c.setor).trim();
      // cabeçalho da coluna pode ter sido renomeado na planilha (ex: "Setor 02" em vez de "setor")
      const k = Object.keys(c).find(k => /^[Ss]etor\s*\d+/i.test(k));
      return k ? String(c[k] || '').trim() : '';
    })(),
    bairro:   String(c.bairro || ''),
    cidade:   String(c.cidade || ''),
    obs: (() => {
      const o = c.obs != null ? String(c.obs).trim() : '';
      // Apps Script bug: addPagamento grava novoPv (ex: "202606") na coluna obs
      if (/^20[2-9]\d(0[1-9]|1[0-2])$/.test(o)) return '';
      return o;
    })(),
    tel:         String(c.tel   || ''),
    inativadoEm: c.inativadoEm ? String(c.inativadoEm) : '',
    dataRemarcacao: (() => {
      if (!c.dataRemarcacao) return '';
      // Sheets pode devolver a célula como objeto Date em vez de string 'YYYY-MM-DD'
      if (c.dataRemarcacao instanceof Date) return c.dataRemarcacao.toISOString().slice(0, 10);
      return String(c.dataRemarcacao).slice(0, 10);
    })(),
    // campos numéricos
    proxVenc:  pv,
    vencDia:   (() => {
      const d = parseInt(String(c.vencDia || '').replace(/\..*$/, '')) || 1;
      // Apps Script bug: às vezes grava valor_mensalidade na coluna vencDia (ex: 50, 200)
      return (d >= 1 && d <= 31) ? d : 1;
    })(),
    valor:     (() => {
      let v = String(c.valor || '').trim().replace(/[^\d.,]/g, '');
      // formato brasileiro (ex: "1.500,00") → inglês ("1500.00")
      if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
      return parseFloat(v) || 0;
    })(),
    ordemRua:  parseInt(c.ordemRua) || 9999,
    status:    c.status || 'ativo',
  };
}

// ─────────────────────────────────────────────
// SYNC STATUS UI
// ─────────────────────────────────────────────
function setSyncStatus(state, msg) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-txt');
  if (dot) dot.className = 'sync-dot ' + state;
  if (txt) txt.textContent = msg;
}

// ─────────────────────────────────────────────
// CONFIG (modal)
// ─────────────────────────────────────────────
function openConfig() {
  document.getElementById('cfg-url').value = SCRIPT_URL || '';
  document.getElementById('cfg-id').value  = SHEET_ID   || '';
  document.getElementById('config-screen').classList.add('open');
}
function closeConfig() {
  document.getElementById('config-screen').classList.remove('open');
}
function salvarConfig() {
  const url = document.getElementById('cfg-url').value.trim();
  const id  = document.getElementById('cfg-id').value.trim();
  if (url) { SCRIPT_URL = url; localStorage.setItem('cobr_script_url', url); localStorage.setItem('eps_script_url', url); }
  if (id)  { SHEET_ID   = id;  localStorage.setItem('cobr_sheet_id', id); }
  closeConfig();
  toast('✅ Configuração salva!');
}

// ─────────────────────────────────────────────
// NAVEGAÇÃO
// ─────────────────────────────────────────────
function goTo(sec, el) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  const secEl = document.getElementById('sec-' + sec);
  if (secEl) secEl.classList.add('active');
  if (el)    el.classList.add('active');
  closeSB();
  // render específico da seção
  switch (sec) {
    case 'dashboard':      renderDash(); renderResumoSetor(); break;
    case 'clientes':       updSetorSel(); renderCli(); break;
    case 'cobranca':       updSetorSel(); renderCob(); break;
    case 'despesas':       renderDesp(); break;
    case 'relatorio':      renderRel(); break;
    case 'cobradores':     renderCobradores(); break;
    case 'proprietarios':  renderProprietarios(); break;
  }
}

function toggleSB() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('ovl').classList.toggle('open');
}
function closeSB() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('ovl').classList.remove('open');
}

// ─────────────────────────────────────────────
// RENDER GERAL (chama todos os renders ativos)
// ─────────────────────────────────────────────
function renderAll() {
  renderDash();
  renderResumoSetor();
  updSetorSel();
  renderCli();
  renderCob();
  renderDesp();
  renderRel();
  updBadge();
}

/** Atualiza badge de cobrança pendente */
function updBadge() {
  const n = getClisFiltrados().filter(c => ['hoje','atrasado'].includes(st(c))).length;
  ['badge-cobr','mob-badge'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.textContent = n; b.style.display = n > 0 ? '' : 'none'; }
  });
}

/** Atualiza selects de setor nos filtros */
function updSetorSel() {
  const setores = getMeusSetores();

  // Filtro clientes — sincroniza select visual com variável fCliSetor
  const filSe = document.getElementById('fil-setor');
  if (filSe) {
    filSe.innerHTML = '<option value="">Todos os setores</option>'
      + setores.map(s => `<option value="${s}">${s}</option>`).join('');
    filSe.value = fCliSetor; // espelha variável JS no select visual
  }

  // Filtro cobrança
  const fset = document.getElementById('fsetor');
  const wrap = document.getElementById('wrap-fsetor');
  if (fset) {
    const cur2 = fset.value;
    fset.innerHTML = '<option value="">Todos</option>'
      + setores.map(s => `<option value="${s}">${s}</option>`).join('');
    if (setores.length <= 1 && USER.role === 'cobrador') {
      if (wrap) wrap.style.display = 'none';
      if (setores.length === 1) fset.value = setores[0];
    } else {
      if (wrap) wrap.style.display = '';
      fset.value = cur2; // restaura valor anterior
    }
  }

  // Datalist setores no form de cliente
  const dlS = document.getElementById('dl-setores');
  if (dlS) dlS.innerHTML = setores.map(s => `<option value="${s}">`).join('');

  // Select despesa setor
  const deS = document.getElementById('de-setor');
  if (deS) {
    const cur3 = deS.value;
    deS.innerHTML = '<option value="">Selecione o setor...</option>'
      + setores.map(s => `<option value="${s}">${s}</option>`).join('');
    deS.value = cur3;
  }

  // Select filtro despesas
  const dFilt = document.getElementById('desp-setor');
  if (dFilt) {
    const cur4 = dFilt.value;
    dFilt.innerHTML = '<option value="">Todos os setores</option>'
      + setores.map(s => `<option value="${s}">${s}</option>`).join('');
    dFilt.value = cur4;
  }

  // Select filtro relatório por setor — não precisa, usa todas
}

// ─────────────────────────────────────────────
// CLOCK
// ─────────────────────────────────────────────
function tick() {
  const n = new Date();
  const c = document.getElementById('clock');
  const d = document.getElementById('dateInfo');
  if (c) c.textContent = n.toLocaleTimeString('pt-BR');
  if (d) d.textContent = n.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
/** Máscara de telefone */
function mPhone(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 11);
  if      (v.length > 6) v = '(' + v.slice(0,2) + ') ' + v.slice(2,7) + '-' + v.slice(7);
  else if (v.length > 2) v = '(' + v.slice(0,2) + ') ' + v.slice(2);
  else if (v.length > 0) v = '(' + v;
  el.value = v;
}

/** Toast notification */
let _toastTimer;
function toast(msg, tipo = 'ok') {
  const t  = document.getElementById('toast');
  const tm = document.getElementById('tmsg');
  if (!t || !tm) return;
  tm.textContent = msg;
  t.className = `toast show ${tipo === 'err' ? 'err' : tipo === 'warn' ? 'bw' : 'ok'}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.addEventListener('load', () => {
  tick();
  setInterval(tick, 1000);

  // restaura sessão
  const sess = sessionStorage.getItem('cobr_user') || sessionStorage.getItem('eps_user');
  if (sess) {
    try {
      USER = JSON.parse(sess);
      // normaliza role legado
      if (USER.role === 'dono')   USER.role = 'proprietario';
      if (USER.role === 'vigia')  USER.role = 'cobrador';
      iniciarApp();
    } catch (e) {
      sessionStorage.clear();
    }
  }

  // PWA — registra service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Quando o SW atualizar, recarrega a página automaticamente para usar o novo código
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'SW_UPDATED') {
        window.location.reload();
      }
    });
  }
});
