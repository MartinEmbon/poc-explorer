# CAPES Explorer

Consulta inteligente de pós-graduação brasileira (CAPES/MEC).

## Arquitetura

```
Browser → [server.js] → serve HTML (GET /)
                       → proxy MCP (POST /api/query) → Digibee Pipeline → MySQL
```

## Deploy no Render

1. Crie um repositório no GitHub com estes arquivos
2. Acesse [render.com](https://render.com) e crie uma conta
3. Clique em **New → Web Service**
4. Conecte o repositório GitHub
5. Configure:
   - **Name:** capes-explorer
   - **Runtime:** Node
   - **Build Command:** (deixe vazio)
   - **Start Command:** node server.js
   - **Plan:** Free
6. Em **Environment Variables**, adicione:
   - `MCP_ENDPOINT` = `https://test.godigibee.io/pipeline/digibee/v1/poc-capes-v2/mcp`
7. Clique em **Deploy**

A URL final será algo como: `https://capes-explorer.onrender.com`

## Variáveis de ambiente

| Variável | Descrição | Default |
|----------|-----------|---------|
| `PORT` | Porta do servidor | 3001 |
| `MCP_ENDPOINT` | URL do pipeline MCP na Digibee | (obrigatório) |

## Rodar localmente

```bash
# Clone e entre na pasta
git clone <repo-url>
cd capes-explorer

# Defina o endpoint (opcional, tem default)
export MCP_ENDPOINT=https://test.godigibee.io/pipeline/digibee/v1/poc-capes-v2/mcp

# Rode
node server.js

# Acesse http://localhost:3001
```
