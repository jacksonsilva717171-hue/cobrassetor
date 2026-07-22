// ================================================
// EPS – GOOGLE APPS SCRIPT v6
// ================================================

const SHEET_CLIENTES   = 'clientes';
const SHEET_PAGAMENTOS = 'PAGAMENTOS';

const COL_CLI = ['id','nome','tel','cep','rua','num','complemento','bairro','cidade','setor',
                 'vencDia','valor','pix','chavePix','lat','lng','obs','proxVenc','criadoPor','criadoEm',
                 'dataRemarcacao'];
const COL_PAG = ['cid','nome','setor','valor','forma','mesPago','novoPv','data','vigia','origem'];

// Retorna o índice real da coluna lendo o cabeçalho da aba —
// nunca usa índice fixo do array COL_CLI para evitar escrita na coluna errada
function colIdx(header, nome) {
  return header.map(h => String(h).trim().toLowerCase())
               .indexOf(String(nome).trim().toLowerCase());
}

// Acha a coluna real do setor mesmo se o cabeçalho tiver sido renomeado
// (ex: "Setor 02" em vez de "setor") — tenta 'setor' primeiro, depois
// qualquer cabeçalho no formato "Setor N". Sem isso, getClientes(setor),
// atualizaProxVenc e atualizaAbaSetor voltam sempre vazios quando a coluna
// não se chama literalmente "setor" (já aconteceu 2x nesta planilha).
function colIdxSetor(header) {
  const direto = colIdx(header, 'setor');
  if (direto !== -1) return direto;
  return header.findIndex(h => /^[Ss]etor\s*\d+/i.test(String(h).trim()));
}

// Garante que a coluna exista no cabeçalho real da aba — se não existir, adiciona
// no final (nunca desloca colunas existentes). Necessário porque a aba "clientes"
// já existe em produção e não ganha colunas novas do COL_CLI automaticamente
// (isso só acontece quando a aba é criada do zero por getOrCreateSheet).
function ensureHeaderColumn(sheet, header, nomeCol) {
  let idx = colIdx(header, nomeCol);
  if (idx === -1) {
    idx = header.length;
    sheet.getRange(1, idx + 1).setValue(nomeCol);
    // formata a coluna inteira como texto simples — evita o Sheets converter
    // um valor tipo "2026-07-13" em data serial ao gravar via setValue
    sheet.getRange(1, idx + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    header.push(nomeCol);
  }
  return idx;
}

// ================================================
// ENTRYPOINTS
// ================================================
function doGet(e) {
  let resultado;
  try {
    const acao = e.parameter.acao;
    if      (acao === 'getClientes')     resultado = getClientes(e.parameter.setor || null);
    else if (acao === 'getPagamentos')   resultado = getPagamentos();
    else if (acao === 'getClientesPix')  resultado = getClientesPix(e.parameter.setor || null, e.parameter.vencDia || null);
    else if (acao === 'getStatusPix')    resultado = getStatusPix(e.parameter.setor || null);
    else resultado = { ok: false, erro: 'Ação desconhecida: ' + acao };
  } catch(err) { resultado = { ok: false, erro: err.toString() }; }
  return jsonResponse(resultado);
}

function doPost(e) {
  let resultado;
  try {
    const body = JSON.parse(e.postData.contents);
    const acao = body.acao;
    if      (acao === 'addCliente')            resultado = addCliente(body);
    else if (acao === 'editCliente')           resultado = editCliente(body);
    else if (acao === 'delCliente')            resultado = delCliente(body.id);
    else if (acao === 'remarcarCliente')       resultado = remarcarCliente(body);
    else if (acao === 'addPagamento')          resultado = addPagamento(body);
    else if (acao === 'confirmarPagamentoPix') resultado = confirmarPagamentoPix(body);
    else resultado = { ok: false, erro: 'Ação desconhecida: ' + acao };
  } catch(err) { resultado = { ok: false, erro: err.toString() }; }
  return jsonResponse(resultado);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ================================================
// CLIENTES
// ================================================
function getClientes(setor) {
  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const data   = rows.slice(1).map(row => rowToObj(header, row)).filter(c => c.id);

  // A coluna 'setor' pode ter sido renomeada na planilha (ex: "Setor 02") —
  // sem esse fallback, c.setor fica sempre vazio e o filtro por setor nunca
  // casa com nada (getClientes(setor) voltava sempre com 0 resultados).
  const cSetor       = colIdxSetor(header);
  const nomeColSetor = cSetor >= 0 ? header[cSetor] : null;
  function setorDe(c) {
    if (c.setor) return String(c.setor).trim();
    return nomeColSetor ? String(c[nomeColSetor] || '').trim() : '';
  }

  const setorNorm = setor ? setor.trim().toLowerCase() : null;
  const result = setorNorm
    ? data.filter(c => setorDe(c).toLowerCase() === setorNorm)
    : data;

  result.forEach(c => {
    c.setor    = setorDe(c); // normaliza a chave 'setor' na resposta, mesmo com header renomeado
    c.vencDia  = parseInt(c.vencDia)  || 1;
    c.valor    = parseFloat(c.valor)  || 0;
    c.proxVenc = parseInt(c.proxVenc) || 0;
    c.lat      = parseFloat(c.lat)    || null;
    c.lng      = parseFloat(c.lng)    || null;
    // dataRemarcacao: normaliza para string 'yyyy-MM-dd' — o Sheets pode devolver
    // a célula como objeto Date dependendo do formato aplicado na coluna
    if (c.dataRemarcacao instanceof Date) {
      c.dataRemarcacao = Utilities.formatDate(c.dataRemarcacao, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (c.dataRemarcacao) {
      c.dataRemarcacao = String(c.dataRemarcacao);
    } else {
      c.dataRemarcacao = '';
    }
  });
  return { ok: true, data: result };
}

function addCliente(dados) {
  if (!dados || !dados.id)   return { ok: false, erro: 'addCliente: id não informado' };
  if (!dados.nome)           return { ok: false, erro: 'addCliente: nome não informado' };

  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const ids    = rows.slice(1).map(r => String(r[0]));
  if (ids.includes(String(dados.id))) return editCliente(dados);

  // CORRIGIDO: usa cabeçalho real para montar a linha
  const row = header.map(col => dados[col] !== undefined ? dados[col] : '');
  sheet.appendRow(row);
  if (dados.setor) atualizaAbaSetor(dados.setor);
  return { ok: true };
}

function editCliente(dados) {
  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(dados.id)) {
      // CORRIGIDO: usa ci (índice real na aba) em vez de COL_CLI.indexOf(col)
      const row = header.map((col, ci) =>
        dados[col] !== undefined ? dados[col] : rows[i][ci]
      );
      sheet.getRange(i+1, 1, 1, row.length).setValues([row]);
      if (dados.setor) atualizaAbaSetor(dados.setor);
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Cliente não encontrado: ' + dados.id };
}

function delCliente(id) {
  const sheet = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) { sheet.deleteRow(i+1); return { ok: true }; }
  }
  return { ok: false, erro: 'Cliente não encontrado: ' + id };
}

// Ação dedicada de remarcação: grava (ou limpa, se dataRemarcacao vier vazio)
// SOMENTE a célula da coluna dataRemarcacao da linha do cliente — nunca toca
// no resto da linha, então não corre o risco de sobrescrever outros campos
// com um snapshot local desatualizado (o mesmo tipo de bug já visto em
// editCliente/addPagamento quando o payload enviado estava incompleto/velho).
function remarcarCliente(dados) {
  if (!dados.id) return { ok: false, erro: 'id não informado' };

  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const cDataRem = ensureHeaderColumn(sheet, header, 'dataRemarcacao');

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(dados.id)) {
      const range = sheet.getRange(i + 1, cDataRem + 1);
      range.setNumberFormat('@'); // reforça texto puro nesta célula específica
      range.setValue(dados.dataRemarcacao || '');
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Cliente não encontrado: ' + dados.id };
}

// ================================================
// PAGAMENTOS
// ================================================
function getPagamentos() {
  const sheet  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const data   = rows.slice(1).map(row => rowToObj(header, row)).filter(p => p.cid);
  data.forEach(p => {
    p.valor   = parseFloat(p.valor)  || 0;
    p.mesPago = parseInt(p.mesPago)  || 0;
    p.novoPv  = parseInt(p.novoPv)   || 0;
  });
  return { ok: true, data };
}

function addPagamento(dados) {
  const sheet = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  sheet.appendRow(COL_PAG.map(col => dados[col] !== undefined ? dados[col] : ''));
  atualizaProxVenc(dados.cid, dados.novoPv);
  return { ok: true };
}

// CORRIGIDO: usa colIdxSetor(header) para achar a coluna do setor mesmo que
// tenha sido renomeada na aba (ex: "Setor 02") — antes usava colIdx(header,
// 'setor') puro, que voltava -1 e nunca chamava atualizaAbaSetor.
function atualizaProxVenc(id, novoPv) {
  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const cPv    = colIdx(header, 'proxVenc');
  const cSetor = colIdxSetor(header);
  if (cPv === -1) { Logger.log('ERRO: coluna proxVenc não encontrada'); return; }
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sheet.getRange(i+1, cPv+1).setValue(novoPv);
      const setor = cSetor >= 0 ? rows[i][cSetor] : null;
      if (setor) atualizaAbaSetor(String(setor));
      return;
    }
  }
}

// ================================================
// ABAS POR SETOR
// ================================================
function atualizaAbaSetor(setor) {
  try {
    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    let tab   = ss.getSheetByName(setor);
    if (!tab) {
      tab = ss.insertSheet(setor);
      tab.getRange(1,1,1,COL_CLI.length).setValues([COL_CLI]);
      tab.getRange(1,1,1,COL_CLI.length).setFontWeight('bold').setBackground('#0c1028').setFontColor('#00cfff');
      tab.setFrozenRows(1);
    } else {
      if (tab.getLastRow() > 1)
        tab.getRange(2,1,tab.getLastRow()-1,tab.getLastColumn()).clearContent();
    }
    const sheetCli = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
    const rows     = sheetCli.getDataRange().getValues();
    const header   = rows[0];
    // Garante que a aba de setor já criada antes desta versão acompanhe
    // colunas novas do cabeçalho principal (ex: dataRemarcacao)
    if (tab.getLastColumn() < header.length) {
      tab.getRange(1, 1, 1, header.length).setValues([header]);
    }
    // CORRIGIDO: usa colIdxSetor (com fallback "Setor N") em vez de colIdx
    // puro — a coluna real da aba "clientes" está renomeada para "Setor 02"
    const cSetor = colIdxSetor(header);
    if (cSetor === -1) return;
    const setorRows = rows.slice(1).filter(r => r[cSetor] === setor);
    if (setorRows.length > 0)
      tab.getRange(2,1,setorRows.length,header.length).setValues(setorRows);
  } catch(e) { Logger.log('Erro atualizaAbaSetor: ' + e); }
}

function atualizaTodasAbas() {
  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const cSetor = colIdxSetor(header);
  if (cSetor === -1) return { ok: false, erro: 'Coluna setor não encontrada' };
  const setores = [...new Set(rows.slice(1).map(r => r[cSetor]).filter(Boolean))];
  setores.forEach(s => atualizaAbaSetor(s));
  return { ok: true, setores };
}

// ================================================
// REPARAR DADOS CORROMPIDOS
// Roda uma única vez para corrigir registros afetados
// pelo bug de índice de coluna. Sem confirmação.
// Pode ser executado pelo menu ⚡EPS ou diretamente
// pelo botão ▶ Run no editor do Apps Script.
// ================================================
function repararDadosCorretos() {
  const sheetCli  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerPag = rowsPag[0];

  // índices reais das colunas
  const ci = {
    id:       colIdx(headerCli, 'id'),
    nome:     colIdx(headerCli, 'nome'),
    obs:      colIdx(headerCli, 'obs'),
    proxVenc: colIdx(headerCli, 'proxVenc'),
    vencDia:  colIdx(headerCli, 'vencDia'),
    valor:    colIdx(headerCli, 'valor'),
  };
  const pi = {
    cid:    colIdx(headerPag, 'cid'),
    valor:  colIdx(headerPag, 'valor'),
    novoPv: colIdx(headerPag, 'novoPv'),
  };

  // histórico de pagamentos por cliente (mais recente primeiro)
  const pagMap = {};
  rowsPag.slice(1).forEach(r => {
    const cid = String(r[pi.cid] || '');
    if (!cid) return;
    if (!pagMap[cid]) pagMap[cid] = [];
    pagMap[cid].push({ valor: parseFloat(r[pi.valor]) || 0, novoPv: parseInt(r[pi.novoPv]) || 0 });
  });
  Object.keys(pagMap).forEach(cid => pagMap[cid].reverse()); // mais recente primeiro

  const YM    = /^20[2-9]\d(0[1-9]|1[0-2])$/; // padrão yyyymm
  const fixes  = [];
  const manual = [];

  for (let i = 1; i < rowsCli.length; i++) {
    const row      = rowsCli[i];
    const id       = String(row[ci.id]   || '');
    if (!id) continue;
    const nome     = String(row[ci.nome] || '');
    const obsVal   = ci.obs      >= 0 ? String(row[ci.obs]   || '').trim() : '';
    const proxVenc = ci.proxVenc >= 0 ? (parseInt(row[ci.proxVenc]) || 0)   : 0;
    const vencDia  = ci.vencDia  >= 0
      ? (parseInt(String(row[ci.vencDia] || '').replace(/\..*$/, '')) || 0) : 0;
    const valor    = ci.valor    >= 0 ? (parseFloat(row[ci.valor])   || 0)   : 0;
    const pags     = pagMap[id] || [];

    const rowFixes  = [];
    let newProxVenc = proxVenc;

    // ── Correção 1: obs com yyyymm (deveria ser proxVenc) ──────────────────
    if (ci.obs >= 0 && YM.test(obsVal)) {
      sheetCli.getRange(i+1, ci.obs+1).setValue('');
      rowFixes.push('obs limpa (' + obsVal + ' → "")');
      const ym = parseInt(obsVal);
      if (ym > newProxVenc) {
        newProxVenc = ym;
        rowFixes.push('proxVenc ← obs (' + ym + ')');
      }
    }

    // ── Correção 2: proxVenc zerado → recupera do último pagamento ──────────
    if (ci.proxVenc >= 0 && newProxVenc === 0 && pags.length > 0 && pags[0].novoPv > 0) {
      newProxVenc = pags[0].novoPv;
      rowFixes.push('proxVenc ← PAG (' + newProxVenc + ')');
    }
    if (ci.proxVenc >= 0 && newProxVenc !== proxVenc)
      sheetCli.getRange(i+1, ci.proxVenc+1).setValue(newProxVenc);

    // ── Correção 3: vencDia > 31 e valor = 0 ────────────────────────────────
    // O bug gravava valor_mensalidade na coluna vencDia e zerava valor.
    // Recupera: valor ← vencDia; vencDia ← último pagamento ou 1 (manual)
    if (ci.vencDia >= 0 && ci.valor >= 0 && vencDia > 31 && valor === 0) {
      sheetCli.getRange(i+1, ci.valor+1).setValue(vencDia); // recupera mensalidade
      sheetCli.getRange(i+1, ci.vencDia+1).setValue(1);     // placeholder seguro
      rowFixes.push('valor ← vencDia (' + vencDia + '); vencDia=1 (ajuste manual)');
      manual.push('• ' + nome + ' (' + id + ')  vencDia real desconhecido — ajustar manualmente');
    }
    // ── Correção 4: vencDia > 31 mas valor já OK ────────────────────────────
    else if (ci.vencDia >= 0 && vencDia > 31 && valor > 0) {
      sheetCli.getRange(i+1, ci.vencDia+1).setValue(1);     // placeholder seguro
      rowFixes.push('vencDia inválido (' + vencDia + ') → 1 (ajuste manual)');
      manual.push('• ' + nome + ' (' + id + ')  vencDia era ' + vencDia + ' — ajustar manualmente');
    }
    // ── Correção 5: valor = 0 sem vencDia corrompido → recupera de PAGAMENTOS
    else if (ci.valor >= 0 && valor === 0 && pags.length > 0 && pags[0].valor > 0) {
      sheetCli.getRange(i+1, ci.valor+1).setValue(pags[0].valor);
      rowFixes.push('valor ← PAG (R$' + pags[0].valor + ')');
    }

    if (rowFixes.length > 0) fixes.push('• ' + nome + ' [' + id + ']: ' + rowFixes.join(' | '));
  }

  // reconstrói abas de setor com dados corrigidos
  atualizaTodasAbas();

  // relatório (sem confirmação prévia — só resultado final)
  let msg = '';
  if (fixes.length > 0) {
    msg += '✅ CORRIGIDO AUTOMATICAMENTE (' + fixes.length + ' clientes):\n\n';
    msg += fixes.slice(0, 20).join('\n');
    if (fixes.length > 20) msg += '\n... e mais ' + (fixes.length - 20) + ' clientes';
    msg += '\n\n';
  }
  if (manual.length > 0) {
    msg += '⚠️ AJUSTE MANUAL NECESSÁRIO (' + manual.length + ' clientes):\n';
    msg += 'Corrija o campo vencDia diretamente na aba "clientes":\n\n';
    msg += manual.join('\n');
  }
  if (!msg) msg = '✅ Nenhum dado corrompido encontrado. Planilha OK!';

  Logger.log(msg);
  SpreadsheetApp.getUi().alert('Reparo de Dados — Relatório', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ================================================
// CORRIGIR proxVenc A PARTIR DE PAGAMENTOS
// Recalcula proxVenc de cada cliente usando o novoPv
// do pagamento mais recente (por data) na aba PAGAMENTOS.
// Cliente sem pagamento registrado → proxVenc = 0.
// Sem confirmação prévia. Rode uma vez pelo botão ▶ Run.
// ================================================
function corrigirProxVenc() {
  const sheetCli  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const sheetPag  = getOrCreateSheet(SHEET_PAGAMENTOS, COL_PAG);
  const rowsCli   = sheetCli.getDataRange().getValues();
  const headerCli = rowsCli[0];
  const rowsPag   = sheetPag.getDataRange().getValues();
  const headerPag = rowsPag[0];

  const cId       = colIdx(headerCli, 'id');
  const cProxVenc = colIdx(headerCli, 'proxVenc');
  if (cId === -1 || cProxVenc === -1) {
    SpreadsheetApp.getUi().alert('Erro: coluna id ou proxVenc não encontrada na aba clientes.');
    return;
  }

  const pCid    = colIdx(headerPag, 'cid');
  const pNovoPv = colIdx(headerPag, 'novoPv');
  const pData   = colIdx(headerPag, 'data');
  if (pCid === -1 || pNovoPv === -1) {
    SpreadsheetApp.getUi().alert('Erro: coluna cid ou novoPv não encontrada na aba PAGAMENTOS.');
    return;
  }

  // Para cada cliente, guarda o pagamento mais recente por data.
  // Se a data estiver ausente/inválida em algum registro, usa a ordem
  // de leitura da planilha (linhas de baixo são mais recentes) como desempate.
  const ultimoPag = {}; // cid -> { novoPv, data, linha }
  for (let i = 1; i < rowsPag.length; i++) {
    const row    = rowsPag[i];
    const cid    = String(row[pCid] || '');
    const novoPv = parseInt(row[pNovoPv]) || 0;
    if (!cid || !novoPv) continue;

    const dataRaw   = pData >= 0 ? row[pData] : null;
    const data      = dataRaw ? new Date(dataRaw) : null;
    const dataValida = data && !isNaN(data.getTime());

    const atual = ultimoPag[cid];
    if (!atual) {
      ultimoPag[cid] = { novoPv, data: dataValida ? data : null, linha: i };
      continue;
    }
    const usaEstaLinha = (dataValida && atual.data)
      ? data > atual.data          // ambas com data válida → compara data
      : i > atual.linha;           // sem data confiável → mantém a última lida
    if (usaEstaLinha) ultimoPag[cid] = { novoPv, data: dataValida ? data : atual.data, linha: i };
  }

  let totalClientes = 0, atualizados = 0, zerados = 0, jaCorretos = 0;

  for (let i = 1; i < rowsCli.length; i++) {
    const id = String(rowsCli[i][cId] || '');
    if (!id) continue;
    totalClientes++;

    const pag        = ultimoPag[id];
    const novoValor   = pag ? pag.novoPv : 0;
    const valorAtual  = parseInt(rowsCli[i][cProxVenc]) || 0;

    if (valorAtual === novoValor) { jaCorretos++; continue; }

    sheetCli.getRange(i + 1, cProxVenc + 1).setValue(novoValor);
    if (novoValor) atualizados++; else zerados++;
  }

  // Reconstrói as abas de setor com os valores corrigidos
  atualizaTodasAbas();

  const msg =
    '✅ proxVenc recalculado a partir de PAGAMENTOS:\n\n' +
    '• ' + atualizados  + ' cliente(s) atualizado(s) com o novoPv do pagamento mais recente\n' +
    '• ' + zerados      + ' cliente(s) zerado(s) (sem pagamento registrado)\n' +
    '• ' + jaCorretos   + ' de ' + totalClientes + ' já estavam corretos';

  Logger.log(msg);
  SpreadsheetApp.getUi().alert('Corrigir proxVenc — Relatório', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ================================================
// DIAGNÓSTICO (só leitura): lista ids de cliente duplicados entre setores
// ================================================
// Ids duplicados são perigosos: qualquer ação por id (pagar, editar,
// remarcar) pode acabar afetando o cliente errado. Rode esta função pra
// ver a lista completa e decida manualmente novos ids únicos pra um dos
// dois de cada par (ex: trocar VIN0423 duplicado para VIN0423B). NÃO
// renomeia nada sozinho — só mostra o relatório, porque os ids também
// aparecem no histórico da aba PAGAMENTOS (coluna cid) e uma troca errada
// quebraria esse histórico.
function detectarIdsDuplicados() {
  const sheet  = getOrCreateSheet(SHEET_CLIENTES, COL_CLI);
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const cId    = colIdx(header, 'id');
  const cNome  = colIdx(header, 'nome');
  const cSetor = colIdxSetor(header);

  const porId = {};
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][cId] || '');
    if (!id) continue;
    (porId[id] = porId[id] || []).push({
      linha: i + 1,
      nome:  cNome  >= 0 ? rows[i][cNome]  : '',
      setor: cSetor >= 0 ? rows[i][cSetor] : '',
    });
  }

  const duplicados = Object.keys(porId).filter(id => porId[id].length > 1);
  let msg;
  if (duplicados.length === 0) {
    msg = '✅ Nenhum id duplicado encontrado na aba clientes.';
  } else {
    msg = '⚠️ ' + duplicados.length + ' id(s) duplicado(s) — cada um usado por clientes DIFERENTES:\n\n';
    duplicados.forEach(id => {
      msg += id + ':\n';
      porId[id].forEach(r => msg += '  linha ' + r.linha + ': ' + r.nome + ' (' + r.setor + ')\n');
      msg += '\n';
    });
    msg += 'Corrija manualmente: troque o id de um dos dois de cada par direto\n';
    msg += 'na aba "clientes" (ex: VIN0423 → VIN0423B) para um valor que não exista\n';
    msg += 'em nenhuma outra linha. Não precisa mexer na aba PAGAMENTOS — o\n';
    msg += 'histórico antigo dos pagamentos já feitos continua vinculado ao id antigo.';
  }

  Logger.log(msg);
  SpreadsheetApp.getUi().alert('Ids duplicados — Relatório', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ================================================
// ENDPOINTS N8N
// ================================================
function getClientesPix(setor, vencDia) {
  let clientes = getClientes(setor).data.filter(c => c.pix === 'sim');
  if (vencDia) clientes = clientes.filter(c => parseInt(c.vencDia) === parseInt(vencDia));
  const hoje = new Date();
  const ym   = hoje.getFullYear() * 100 + (hoje.getMonth() + 1);
  clientes = clientes.map(c => {
    const pv = parseInt(c.proxVenc) || ym;
    return { ...c, statusPagamento: pv > ym ? 'pago' : pv < ym ? 'atrasado' : 'pendente' };
  });
  const pendentes = clientes.filter(c => c.statusPagamento !== 'pago');
  return { ok: true, total: pendentes.length, setor: setor||'todos', vencDia: vencDia||'todos', data: pendentes };
}

function getStatusPix(setor) {
  const pixClients = getClientes(setor).data.filter(c => c.pix === 'sim');
  const hoje = new Date();
  const ym   = hoje.getFullYear() * 100 + (hoje.getMonth() + 1);
  const pagos     = pixClients.filter(c => parseInt(c.proxVenc) > ym);
  const pendentes = pixClients.filter(c => parseInt(c.proxVenc) <= ym);
  const totalMes  = pixClients.reduce((a,c) => a + (c.valor||0), 0);
  const totalPago = pagos.reduce((a,c) => a + (c.valor||0), 0);
  return { ok:true, setor:setor||'todos', totalClientes:pixClients.length,
           pagos:pagos.length, pendentes:pendentes.length,
           totalMes, totalPago, totalPendente:totalMes-totalPago };
}

function confirmarPagamentoPix(dados) {
  const cli = getClientes(null).data.find(c => c.id === dados.cid);
  if (!cli) return { ok: false, erro: 'Cliente não encontrado: ' + dados.cid };
  const hoje  = new Date();
  const ym    = hoje.getFullYear() * 100 + (hoje.getMonth() + 1);
  const mes   = parseInt(String(ym).slice(-2));
  const ano   = parseInt(String(ym).slice(0, 4));
  const pag   = {
    cid: cli.id, nome: cli.nome, setor: cli.setor,
    valor:  parseFloat(dados.valor || cli.valor),
    forma:  'pix', mesPago: ym,
    novoPv: mes === 12 ? (ano+1)*100+1 : ym+1,
    data:   hoje.toISOString(),
    vigia:  dados.dono || 'n8n', origem: 'n8n',
  };
  return addPagamento(pag);
}

// ================================================
// HELPERS
// ================================================
function getOrCreateSheet(nome, colunas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script sem planilha ativa vinculada (getActiveSpreadsheet retornou null) — verifique se o Apps Script está vinculado (Extensões > Apps Script) à planilha certa.');
  let sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
    sheet.getRange(1,1,1,colunas.length).setValues([colunas]);
    sheet.getRange(1,1,1,colunas.length).setFontWeight('bold').setBackground('#0c1028').setFontColor('#00cfff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowToObj(header, row) {
  const obj = {};
  header.forEach((col, i) => { obj[col] = row[i] !== undefined ? row[i] : ''; });
  return obj;
}

// ================================================
// MENU + TRIGGERS
// ================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ EPS')
    .addItem('🔧 Reparar dados corrompidos', 'repararDadosCorretos')
    .addItem('💰 Corrigir proxVenc a partir de PAGAMENTOS', 'corrigirProxVenc')
    .addItem('🆔 Detectar ids de cliente duplicados', 'detectarIdsDuplicados')
    .addItem('♻️ Atualizar todas as abas de setor', 'atualizaTodasAbas')
    .addSeparator()
    .addItem('📋 Publicar Web App (instruções)', 'instrucoes')
    .addToUi();
}

function instrucoes() {
  SpreadsheetApp.getUi().alert(
    '📋 Como republicar após atualizar o código:\n\n' +
    '1. Implantar → Gerenciar implantações\n' +
    '2. Clique no lápis (editar)\n' +
    '3. Versão → Nova versão\n' +
    '4. Implantar\n\n' +
    'A URL permanece a mesma.'
  );
}

function copiarSetor02() {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const clientes = ss.getSheetByName('clientes');
  const setor02  = ss.getSheetByName('Setor 02');
  const dados    = clientes.getDataRange().getValues();
  const header   = dados[0];
  const setorIdx = header.findIndex(h => String(h).toLowerCase().trim() === 'setor');
  if (setorIdx === -1) { SpreadsheetApp.getUi().alert('Coluna setor não encontrada.'); return; }
  const filtrado = dados.slice(1).filter(r => String(r[setorIdx]).trim() === 'Setor 02');
  if (filtrado.length === 0) { SpreadsheetApp.getUi().alert('Nenhum cliente do Setor 02 encontrado.'); return; }
  if (setor02.getLastRow() > 1) setor02.getRange(2,1,setor02.getLastRow()-1,setor02.getLastColumn()).clearContent();
  setor02.getRange(2,1,filtrado.length,header.length).setValues(filtrado);
  SpreadsheetApp.getUi().alert('✅ ' + filtrado.length + ' clientes restaurados no Setor 02!');
}
