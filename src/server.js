import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { Bot, InlineKeyboard } from "grammy";
import { getDescricoes, addNovaOpcao, appendDespesa, appendReceita, appendAplicacao, getFgts, upsertFgts, appendCustodia } from "./sheets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL;

// ---------- Servidor Express (API + mini app) ----------

const app = express();
app.use(cors());
app.use(express.json());
app.use("/miniapp", express.static(path.join(__dirname, "..", "public", "miniapp")));

// Devolve as opções da aba Descrições pros dropdowns do formulário
app.get("/api/opcoes", async (req, res) => {
  try {
    const opcoes = await getDescricoes();
    res.json(opcoes);
  } catch (err) {
    console.error("Erro ao buscar opções:", err);
    res.status(500).json({ erro: "Não foi possível carregar as opções." });
  }
});

// Salva uma opção nova (quando o usuário escolhe "Outro" no formulário)
app.post("/api/opcoes", async (req, res) => {
  try {
    const { campo, valor } = req.body;
    if (!campo || !valor) return res.status(400).json({ erro: "campo e valor são obrigatórios." });
    await addNovaOpcao(campo, valor);
    res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao salvar nova opção:", err);
    res.status(500).json({ erro: "Não foi possível salvar a nova opção." });
  }
});

// Retorna a data de hoje já considerando o fuso horário de Brasília,
// independente de em qual fuso o servidor estiver rodando (ex: Render usa UTC)
function obterDataHojeBrasilia() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const partes = formatter.formatToParts(new Date());
  return {
    ano: Number(partes.find((p) => p.type === "year").value),
    mes: Number(partes.find((p) => p.type === "month").value), // 1-12
    dia: Number(partes.find((p) => p.type === "day").value),
  };
}

// Soma N meses a uma data (ano/mes/dia) e devolve no formato YYYY-MM-DD
function formatarDataComIncrementoMeses({ ano, mes, dia }, incrementoMeses) {
  const dataUtc = new Date(Date.UTC(ano, mes - 1 + incrementoMeses, dia));
  return dataUtc.toISOString().slice(0, 10);
}

// Devolve o último dia do mês de uma data (ano/mes), no formato YYYY-MM-DD
function obterUltimoDiaDoMes({ ano, mes }) {
  const dataUtc = new Date(Date.UTC(ano, mes, 0)); // dia 0 do mês seguinte = último dia do mês atual
  return dataUtc.toISOString().slice(0, 10);
}

// Registra uma despesa (ou várias, se for parcelada)
app.post("/api/despesa", async (req, res) => {
  try {
    const { descricao, valor, doQue, formaPagamento, status, observacao, parcelas, mesReferencia, anoReferencia } = req.body;

    if (!descricao || !valor) {
      return res.status(400).json({ erro: "Descrição e valor são obrigatórios." });
    }
    if (!mesReferencia || !anoReferencia) {
      return res.status(400).json({ erro: "Mês e ano de referência são obrigatórios." });
    }

    const totalParcelas = Number(parcelas) > 1 ? Number(parcelas) : 1;

    // Data de registro: sempre hoje, igual em todas as parcelas (é quando o lançamento foi feito)
    const dataRegistro = formatarDataComIncrementoMeses(obterDataHojeBrasilia(), 0);

    // Data de referência: mês/ano escolhido no formulário, sempre dia 1, avançando um mês por parcela
    const baseReferencia = { ano: Number(anoReferencia), mes: Number(mesReferencia), dia: 1 };

    for (let i = 0; i < totalParcelas; i++) {
      const dataReferencia = formatarDataComIncrementoMeses(baseReferencia, i);
      const observacaoFinal = totalParcelas > 1
        ? `Parcela ${i + 1} de ${totalParcelas}${observacao ? " — " + observacao : ""}`
        : (observacao || "");

      await appendDespesa({
        codigo: uuidv4(),
        dataRegistro,
        dataReferencia,
        descricao,
        formaPagamento,
        valor,
        status: status || "Pago",
        observacao: observacaoFinal,
        doQue,
      });
    }

    res.json({ ok: true, parcelas: totalParcelas });
  } catch (err) {
    console.error("Erro ao salvar despesa:", err);
    res.status(500).json({ erro: "Não foi possível salvar a despesa." });
  }
});

// Registra uma receita
app.post("/api/receita", async (req, res) => {
  try {
    const { descricao, valor, mesReferencia, anoReferencia, status, observacao } = req.body;

    if (!descricao || !valor || !mesReferencia || !anoReferencia) {
      return res.status(400).json({ erro: "Descrição, valor, mês e ano são obrigatórios." });
    }

    const data = formatarDataComIncrementoMeses(
      { ano: Number(anoReferencia), mes: Number(mesReferencia), dia: 1 },
      0
    );

    await appendReceita({
      codigo: uuidv4(),
      data,
      descricao,
      valor,
      status: status || "Pendente",
      observacao: observacao || "",
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao salvar receita:", err);
    res.status(500).json({ erro: "Não foi possível salvar a receita." });
  }
});

// Registra uma aplicação
app.post("/api/aplicacao", async (req, res) => {
  try {
    const { descricao, instituicao, dataAplicacao, valorComprado, valorDeCompra, valorRecebido } = req.body;

    if (!descricao || !instituicao || !dataAplicacao || !valorComprado || !valorDeCompra || !valorRecebido) {
      return res.status(400).json({ erro: "Todos os campos são obrigatórios." });
    }

    await appendAplicacao({
      codigo: uuidv4(),
      dataAplicacao,
      instituicao,
      descricao,
      valorComprado,
      valorDeCompra,
      valorRecebido,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao salvar aplicação:", err);
    res.status(500).json({ erro: "Não foi possível salvar a aplicação." });
  }
});

// Devolve o valor atual do FGTS (pra mostrar como referência no formulário)
app.get("/api/fgts", async (req, res) => {
  try {
    const fgts = await getFgts();
    res.json(fgts);
  } catch (err) {
    console.error("Erro ao buscar FGTS:", err);
    res.status(500).json({ erro: "Não foi possível carregar o FGTS." });
  }
});

// Atualiza (ou cria, na primeira vez) o registro único do FGTS
app.post("/api/fgts", async (req, res) => {
  try {
    const { valorAtualizado } = req.body;
    if (!valorAtualizado) {
      return res.status(400).json({ erro: "Valor atualizado é obrigatório." });
    }

    const data = obterUltimoDiaDoMes(obterDataHojeBrasilia());
    await upsertFgts({ data, valorAtualizado });

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao atualizar FGTS:", err);
    res.status(500).json({ erro: "Não foi possível atualizar o FGTS." });
  }
});

// Registra um lançamento de custódia
app.post("/api/custodia", async (req, res) => {
  try {
    const { descricao, instituicao, data, valor } = req.body;

    if (!descricao || !instituicao || !data || !valor) {
      return res.status(400).json({ erro: "Todos os campos são obrigatórios." });
    }

    await appendCustodia({
      codigo: uuidv4(),
      data,
      instituicao,
      descricao,
      valor,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao salvar custódia:", err);
    res.status(500).json({ erro: "Não foi possível salvar o registro de custódia." });
  }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

// ---------- Bot do Telegram ----------

const bot = new Bot(process.env.BOT_TOKEN);

bot.command("start", (ctx) => enviarMenu(ctx));

// Qualquer mensagem de texto também mostra o menu (fluxo pedido: manda msg -> recebe botão)
bot.on("message:text", (ctx) => enviarMenu(ctx));

async function enviarMenu(ctx) {
  const teclado = new InlineKeyboard()
    .webApp("💸 Registrar despesa", `${PUBLIC_URL}/miniapp/despesa.html`)
    .row()
    .webApp("💰 Registrar receita", `${PUBLIC_URL}/miniapp/receita.html`)
    .row()
    .webApp("📈 Registrar aplicação", `${PUBLIC_URL}/miniapp/aplicacao.html`)
    .row()
    .webApp("🏦 Atualizar FGTS", `${PUBLIC_URL}/miniapp/fgts.html`)
    .row()
    .webApp("👤 Registrar custódia", `${PUBLIC_URL}/miniapp/custodia.html`);
  await ctx.reply("O que você quer registrar?", { reply_markup: teclado });
}

bot.catch((err) => {
  console.error("Erro no bot:", err.message);
});

if (!PUBLIC_URL) {
  console.warn("Aviso: PUBLIC_URL não está definida. O botão da mini app não vai funcionar até você configurá-la.");
}

bot.start();
console.log("Bot iniciado (long polling).");
