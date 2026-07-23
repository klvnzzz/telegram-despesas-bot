import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";

const SHEET_ID = process.env.SHEET_ID;

// Colunas da aba "Descrições" e a que campo cada uma alimenta
const COLUNAS_DESCRICOES = {
  despesas: "A",
  receitas: "B",
  pagamentos: "C",
  doQue: "D",
  aplicacao: "E",
  instituicao: "F",
  custodia: "G",
};

function getAuthClient() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheetsClient() {
  const auth = getAuthClient();
  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

// Lê as 7 colunas da aba Descrições e devolve as listas já limpas (sem células vazias)
export async function getDescricoes() {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Descrições!A2:G500",
  });

  const rows = data.values || [];
  const resultado = { despesas: [], receitas: [], pagamentos: [], doQue: [], aplicacao: [], instituicao: [], custodia: [] };

  for (const row of rows) {
    if (row[0]) resultado.despesas.push(row[0]);
    if (row[1]) resultado.receitas.push(row[1]);
    if (row[2]) resultado.pagamentos.push(row[2]);
    if (row[3]) resultado.doQue.push(row[3]);
    if (row[4]) resultado.aplicacao.push(row[4]);
    if (row[5]) resultado.instituicao.push(row[5]);
    if (row[6]) resultado.custodia.push(row[6]);
  }

  const comparar = (a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  resultado.despesas.sort(comparar);
  resultado.receitas.sort(comparar);
  resultado.pagamentos.sort(comparar);
  resultado.doQue.sort(comparar);
  resultado.aplicacao.sort(comparar);
  resultado.instituicao.sort(comparar);
  resultado.custodia.sort(comparar);

  return resultado;
}

// Adiciona um novo valor no final de uma coluna específica da aba Descrições
// campo: "despesas" | "receitas" | "pagamentos" | "doQue"
export async function addNovaOpcao(campo, valor) {
  const coluna = COLUNAS_DESCRICOES[campo];
  if (!coluna) throw new Error(`Campo inválido: ${campo}`);

  const sheets = await getSheetsClient();

  // Descobre a próxima linha vazia dessa coluna específica
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `Descrições!${coluna}2:${coluna}500`,
  });
  const rows = data.values || [];
  const proximaLinha = rows.length + 2; // +2 porque a lista começa na linha 2

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Descrições!${coluna}${proximaLinha}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[valor]] },
  });
}

// Lê o registro único do FGTS (ou null se ainda não existir)
export async function getFgts() {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "FGTS!A2:C2",
  });
  const linha = data.values && data.values[0];
  if (!linha) return null;
  return { codigo: linha[0], data: linha[1], valorAtualizado: linha[2] };
}

// Cria (na primeira vez) ou atualiza (nas seguintes) o único registro do FGTS
export async function upsertFgts({ data, valorAtualizado }) {
  const sheets = await getSheetsClient();
  const existente = await getFgts();
  const codigo = existente ? existente.codigo : uuidv4();

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "FGTS!A2:C2",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[codigo, data, valorAtualizado]] },
  });
}

// Lista as aplicações existentes, formatadas pra virar um dropdown legível
// (mais recentes primeiro)
export async function getAplicacoesParaSelecao() {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Aplicação!A2:D500",
  });

  const rows = data.values || [];
  const opcoes = rows
    .filter((row) => row[0])
    .map((row) => ({
      codigo: row[0],
      label: `${row[3] || "Sem descrição"} — ${row[2] || "Sem instituição"} (${row[1] || "sem data"})`,
    }));

  return opcoes.reverse();
}

// Adiciona uma nova linha na aba Resgate
// (a coluna "lucro" é fórmula da planilha e não é preenchida por aqui)
// resgate: { codigo, codigoAplicacao, dataResgate, valorResgate }
export async function appendResgate(resgate) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Resgate!A:D",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        resgate.codigo,
        resgate.codigoAplicacao,
        resgate.dataResgate,
        resgate.valorResgate,
      ]],
    },
  });
}

// Adiciona uma nova linha na aba Custódia
// custodia: { codigo, data, instituicao, descricao, valor }
export async function appendCustodia(custodia) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Custódia!A:E",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        custodia.codigo,
        custodia.data,
        custodia.instituicao,
        custodia.descricao,
        custodia.valor,
      ]],
    },
  });
}

// Configuração de cada aba editável: nome real da aba, colunas na ordem da planilha,
// quais colunas são datas (pra converter serial->ISO) e como montar o rótulo da lista
const CONFIG_ABAS = {
  despesa: {
    nome: "Despesa",
    intervalo: "A:I",
    colunas: ["codigo", "dataRegistro", "dataReferencia", "descricao", "formaPagamento", "valor", "status", "observacao", "doQue"],
    camposData: ["dataRegistro", "dataReferencia"],
    label: (r) => `${r.descricao || "Sem descrição"} — R$ ${Number(r.valor || 0).toFixed(2).replace(".", ",")} (${r.dataReferencia || "sem data"})`,
  },
  receita: {
    nome: "Receita",
    intervalo: "A:F",
    colunas: ["codigo", "data", "descricao", "valor", "status", "observacao"],
    camposData: ["data"],
    label: (r) => `${r.descricao || "Sem descrição"} — R$ ${Number(r.valor || 0).toFixed(2).replace(".", ",")} (${r.data || "sem data"})`,
  },
  aplicacao: {
    nome: "Aplicação",
    intervalo: "A:G",
    colunas: ["codigo", "dataAplicacao", "instituicao", "descricao", "valorComprado", "valorDeCompra", "valorRecebido"],
    camposData: ["dataAplicacao"],
    label: (r) => `${r.descricao || "Sem descrição"} — ${r.instituicao || "Sem instituição"} (${r.dataAplicacao || "sem data"})`,
  },
  custodia: {
    nome: "Custódia",
    intervalo: "A:E",
    colunas: ["codigo", "data", "instituicao", "descricao", "valor"],
    camposData: ["data"],
    label: (r) => `${r.descricao || "Sem descrição"} — ${r.instituicao || "Sem instituição"} (${r.data || "sem data"})`,
  },
};

// Converte um número serial do Google Sheets (dias desde 1899-12-30) em data YYYY-MM-DD
function serialParaISO(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

// Lê todas as linhas de uma aba, já convertendo datas e marcando o número da linha real na planilha
async function listarLinhas(aba) {
  const config = CONFIG_ABAS[aba];
  if (!config) throw new Error(`Aba inválida: ${aba}`);

  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${config.nome}!${config.intervalo}`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });

  const rows = data.values || [];
  return rows
    .map((row, index) => {
      const objeto = { _linha: index + 2 }; // a linha 2 da planilha é a primeira linha de dados
      config.colunas.forEach((nomeColuna, i) => {
        let valor = row[i];
        if (valor === undefined || valor === null) valor = "";
        if (config.camposData.includes(nomeColuna) && typeof valor === "number") {
          valor = serialParaISO(valor);
        }
        objeto[nomeColuna] = valor;
      });
      return objeto;
    })
    .filter((obj) => obj.codigo); // ignora linhas vazias
}

// Lista os registros de uma aba (mais recentes primeiro), já com o rótulo pronto pra exibir
export async function listarRegistros(aba) {
  const config = CONFIG_ABAS[aba];
  const linhas = await listarLinhas(aba);
  return linhas.reverse().map((linha) => ({ ...linha, label: config.label(linha) }));
}

// Busca um registro específico pelo código (UUID)
export async function buscarRegistro(aba, codigo) {
  const linhas = await listarLinhas(aba);
  return linhas.find((l) => l.codigo === codigo) || null;
}

// Atualiza um registro existente. Só sobrescreve os campos enviados em novosCampos;
// qualquer campo não enviado mantém o valor atual da planilha.
export async function atualizarRegistro(aba, codigo, novosCampos) {
  const config = CONFIG_ABAS[aba];
  if (!config) throw new Error(`Aba inválida: ${aba}`);

  const linhas = await listarLinhas(aba);
  const linha = linhas.find((l) => l.codigo === codigo);
  if (!linha) throw new Error("Registro não encontrado.");

  const valores = config.colunas.map((nomeColuna) => {
    if (nomeColuna === "codigo") return codigo;
    return Object.prototype.hasOwnProperty.call(novosCampos, nomeColuna)
      ? novosCampos[nomeColuna]
      : linha[nomeColuna];
  });

  const ultimaColuna = String.fromCharCode(65 + config.colunas.length - 1);
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${config.nome}!A${linha._linha}:${ultimaColuna}${linha._linha}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [valores] },
  });
}

// Adiciona uma nova linha na aba Aplicação
// (as demais colunas — quantidade recebida, valor atual, P/L, saldo — são fórmulas da planilha)
// aplicacao: { codigo, dataAplicacao, instituicao, descricao, valorComprado, valorDeCompra, valorRecebido }
export async function appendAplicacao(aplicacao) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Aplicação!A:G",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        aplicacao.codigo,
        aplicacao.dataAplicacao,
        aplicacao.instituicao,
        aplicacao.descricao,
        aplicacao.valorComprado,
        aplicacao.valorDeCompra,
        aplicacao.valorRecebido,
      ]],
    },
  });
}
// Adiciona uma nova linha na aba Receita
// receita: { codigo, data, descricao, valor, status, observacao }
export async function appendReceita(receita) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Receita!A:F",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        receita.codigo,
        receita.data,
        receita.descricao,
        receita.valor,
        receita.status,
        receita.observacao,
      ]],
    },
  });
}
// Adiciona uma nova linha na aba Despesa
// despesa: { codigo, dataRegistro, dataReferencia, descricao, formaPagamento, valor, status, observacao, doQue }
export async function appendDespesa(despesa) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Despesa!A:I",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        despesa.codigo,
        despesa.dataRegistro,
        despesa.dataReferencia,
        despesa.descricao,
        despesa.formaPagamento,
        despesa.valor,
        despesa.status,
        despesa.observacao,
        despesa.doQue,
      ]],
    },
  });
}
