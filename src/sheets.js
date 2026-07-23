import { google } from "googleapis";

const SHEET_ID = process.env.SHEET_ID;

// Colunas da aba "Descrições" e a que campo cada uma alimenta
const COLUNAS_DESCRICOES = {
  despesas: "A",
  receitas: "B",
  pagamentos: "C",
  doQue: "D",
  aplicacao: "E",
  instituicao: "F",
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

// Lê as 6 colunas da aba Descrições e devolve as listas já limpas (sem células vazias)
export async function getDescricoes() {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Descrições!A2:F500",
  });

  const rows = data.values || [];
  const resultado = { despesas: [], receitas: [], pagamentos: [], doQue: [], aplicacao: [], instituicao: [] };

  for (const row of rows) {
    if (row[0]) resultado.despesas.push(row[0]);
    if (row[1]) resultado.receitas.push(row[1]);
    if (row[2]) resultado.pagamentos.push(row[2]);
    if (row[3]) resultado.doQue.push(row[3]);
    if (row[4]) resultado.aplicacao.push(row[4]);
    if (row[5]) resultado.instituicao.push(row[5]);
  }

  const comparar = (a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  resultado.despesas.sort(comparar);
  resultado.receitas.sort(comparar);
  resultado.pagamentos.sort(comparar);
  resultado.doQue.sort(comparar);
  resultado.aplicacao.sort(comparar);
  resultado.instituicao.sort(comparar);

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
