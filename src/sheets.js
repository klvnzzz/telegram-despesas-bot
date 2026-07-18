import { google } from "googleapis";

const SHEET_ID = process.env.SHEET_ID;

// Colunas da aba "Descrições" e a que campo cada uma alimenta
const COLUNAS_DESCRICOES = {
  despesas: "A",
  receitas: "B",
  pagamentos: "C",
  doQue: "D",
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

// Lê as 4 colunas da aba Descrições e devolve as listas já limpas (sem células vazias)
export async function getDescricoes() {
  const sheets = await getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Descrições!A2:D500",
  });

  const rows = data.values || [];
  const resultado = { despesas: [], receitas: [], pagamentos: [], doQue: [] };

  for (const row of rows) {
    if (row[0]) resultado.despesas.push(row[0]);
    if (row[1]) resultado.receitas.push(row[1]);
    if (row[2]) resultado.pagamentos.push(row[2]);
    if (row[3]) resultado.doQue.push(row[3]);
  }

  const comparar = (a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  resultado.despesas.sort(comparar);
  resultado.receitas.sort(comparar);
  resultado.pagamentos.sort(comparar);
  resultado.doQue.sort(comparar);

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
