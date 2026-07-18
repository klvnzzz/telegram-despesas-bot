import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { Bot, InlineKeyboard } from "grammy";
import { getDescricoes, addNovaOpcao, appendDespesa } from "./sheets.js";

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

// Registra uma despesa (ou várias, se for parcelada)
app.post("/api/despesa", async (req, res) => {
  try {
    const { descricao, valor, doQue, formaPagamento, status, observacao, parcelas } = req.body;

    if (!descricao || !valor) {
      return res.status(400).json({ erro: "Descrição e valor são obrigatórios." });
    }

    const totalParcelas = Number(parcelas) > 1 ? Number(parcelas) : 1;
    const hoje = new Date();

    for (let i = 0; i < totalParcelas; i++) {
      const dataParcela = new Date(hoje.getFullYear(), hoje.getMonth() + i, hoje.getDate());
      const observacaoFinal = totalParcelas > 1
        ? `Parcela ${i + 1} de ${totalParcelas}${observacao ? " — " + observacao : ""}`
        : (observacao || "");

      await appendDespesa({
        codigo: uuidv4(),
        dataRegistro: dataParcela.toISOString().slice(0, 10),
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

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

// ---------- Bot do Telegram ----------

const bot = new Bot(process.env.BOT_TOKEN);

bot.command("start", (ctx) => enviarMenu(ctx));

// Qualquer mensagem de texto também mostra o menu (fluxo pedido: manda msg -> recebe botão)
bot.on("message:text", (ctx) => enviarMenu(ctx));

async function enviarMenu(ctx) {
  const teclado = new InlineKeyboard().webApp(
    "💸 Registrar despesa",
    `${PUBLIC_URL}/miniapp/despesa.html`
  );
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
