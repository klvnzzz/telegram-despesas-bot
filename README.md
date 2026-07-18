# Bot de despesas — Telegram + Google Sheets

PoC do fluxo: manda mensagem no bot → aparece botão "Registrar despesa" → abre a mini app → salva direto na aba **Despesa** da sua planilha.

## 1. Criar o bot no Telegram

1. Abra uma conversa com **@BotFather**
2. Envie `/newbot` e siga as instruções
3. Guarde o **token** que ele te der (algo como `123456:ABC-...`)

## 2. Dar acesso à planilha (Google Sheets API)

1. Vá em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto (grátis)
2. Ative a **Google Sheets API** (menu "APIs e serviços" → "Ativar APIs")
3. Crie uma **conta de serviço** ("Credenciais" → "Criar credenciais" → "Conta de serviço")
4. Nela, crie uma **chave** no formato JSON e baixe o arquivo
5. Abra sua planilha do Google Sheets → botão **Compartilhar** → cole o e-mail da conta de serviço (algo como `nome@projeto.iam.gserviceaccount.com`) com permissão de **Editor**
6. Do arquivo JSON baixado, você vai precisar de dois campos: `client_email` e `private_key`

## 3. Configurar o projeto

```bash
cd telegram-despesas-bot
npm install
cp .env.example .env
```

Preencha o `.env`:
- `BOT_TOKEN`: o token do BotFather
- `SHEET_ID`: o ID da planilha (está na URL: `docs.google.com/spreadsheets/d/ESSE-PEDACO-AQUI/edit`)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: o `client_email` do JSON
- `GOOGLE_PRIVATE_KEY`: o `private_key` do JSON (mantenha as aspas e os `\n`)
- `PUBLIC_URL`: por enquanto deixe em branco — só é necessário quando publicar (passo 5)

## 4. Rodar localmente (teste)

```bash
npm start
```

Isso já conecta o bot (via long polling) e sobe o servidor local na porta 3000. Mande uma mensagem pro seu bot no Telegram — ele deve responder com o botão.

**Atenção:** localmente o botão só vai abrir se você usar um túnel público (ex: `ngrok http 3000`) e colocar essa URL no `PUBLIC_URL`, porque o Telegram exige HTTPS público pra abrir mini apps — `localhost` não funciona direto no app do Telegram.

## 5. Publicar de graça no Render

1. Suba este projeto num repositório no GitHub
2. Em [render.com](https://render.com), crie um **Web Service** novo apontando pro repositório
3. Build command: `npm install` — Start command: `npm start`
4. Em "Environment", cole as mesmas variáveis do seu `.env`
5. Depois do primeiro deploy, copie a URL que o Render gerou (ex: `https://seu-app.onrender.com`) e coloque em `PUBLIC_URL` nas variáveis de ambiente do Render
6. Redeploy — pronto, o bot já está público e gratuito (com o efeito "dormindo" do free tier: a primeira mensagem depois de um tempo parado demora alguns segundos)

## Estrutura da aba "Despesa" esperada

Colunas na ordem: `código | data de registro | descrição | forma de pagamento | valor | status | observação | do que?`

## Estrutura da aba "Descrições" esperada

Colunas: `Despesas | Receitas | Pagamentos | Do que?` — cada uma é uma lista independente (tamanhos diferentes, sem problema).

## Próximos passos

Este PoC cobre só o formulário de despesa. Os próximos (receita, aplicação, resgate, FGTS, Isabella, edição) seguem a mesma lógica — dropdown com "Outro" e leitura/escrita direta nas abas correspondentes.
