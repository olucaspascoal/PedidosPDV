# Brinde PDV

PDV para bar: **vendas rápidas no celular** (balcão e comandas) e **gestão pelo computador**, com **Pix via Mercado Pago**.

- `backend/Pdv.Api` — ASP.NET Core 9 (minimal APIs), EF Core (SQLite em dev, PostgreSQL/Supabase em produção), JWT com login por PIN
- `frontend` — Angular 20 (standalone, signals, zoneless), sem biblioteca de UI

## Rodando em desenvolvimento

Pré-requisitos: .NET 9 SDK e Node 22.

```bash
# API em http://localhost:5080 (cria pdv.db com dados iniciais)
cd backend/Pdv.Api && dotnet run --launch-profile http

# Frontend em http://localhost:4200 (faz proxy de /api para a API)
cd frontend && npm install && npx ng serve
```

Usuários iniciais: **Administrador** (PIN `1234`) e **Caixa** (PIN `0000`). Troque os PINs em Gestão → Usuários.

Para ver no celular na mesma rede: `npx ng serve --host 0.0.0.0` e abra `http://IP-DO-COMPUTADOR:4200`.

## Telas

| Celular (PDV) `/pdv` | Computador (Gestão) `/gestao` — só admin |
|---|---|
| Catálogo com busca, categorias e destaques | Visão geral: faturamento, ticket médio, vendas por hora/dia, formas de pagamento, mais vendidos, estoque baixo |
| Pedido com observações por item | Vendas: filtro por período e status, detalhes e cancelamento |
| Cobrar na hora ou abrir comanda | Produtos (preço, estoque, destaque, imagem) |
| Comandas abertas, adicionar itens, desconto (admin) | Categorias e usuários |
| Pagamento: Pix (QR Code), dinheiro com troco, crédito, débito, e pagamento dividido | Configurações do Mercado Pago |

No computador, o PDV mostra o carrinho fixo ao lado do catálogo.

## Pix com Mercado Pago

Sem access token a API roda em **modo simulado**: gera um QR Code de teste e mostra o botão "Simular pagamento aprovado".

Para cobranças reais, configure no servidor (variáveis de ambiente ou `appsettings`):

```bash
MercadoPago__AccessToken=APP_USR-...          # credencial de produção (ou de teste)
MercadoPago__NotificationUrl=https://seu-dominio/api/webhooks/mercadopago
MercadoPago__WebhookSecret=...                # assinatura secreta do webhook
```

Fluxo: `POST /v1/payments` com `payment_method_id=pix` → o app mostra o QR e o copia-e-cola → a confirmação chega pelo webhook (assinatura `x-signature` validada) **e** por consulta a cada 3 s, então funciona mesmo sem URL pública. A API nunca confia no corpo do webhook: sempre consulta o status no Mercado Pago. A venda só fecha (e baixa o estoque) quando o valor é quitado.

## Produção: Hostinger + Supabase + API

```
Celular / PC ──► Hostinger (site Angular, estático)
                     │  chamadas /api
                     ▼
                 API C# (servidor Coolify, Docker) ──► Supabase (PostgreSQL)
                     ▲
        Mercado Pago (webhook do Pix)
```

A hospedagem compartilhada da Hostinger não roda .NET, por isso a API fica em um serviço à parte.

### 1. Banco no Supabase
1. Crie o projeto escolhendo a região **South America (São Paulo)**.
2. Em **Connect → Connection string**, copie a do **Session pooler** (a conexão direta só funciona com IPv6).
3. Pronto: a API cria as tabelas sozinha ao iniciar (migrations), no schema `pdv`. Fora do schema `public`, as tabelas não ficam expostas pela API REST automática do Supabase.

### 2. API no Coolify
1. **DNS:** crie um registro **A** para o subdomínio da API (ex.: `api.seudominio.com.br`) apontando para o IP do servidor Coolify. Se o domínio está na Hostinger, isso fica em *Domínios → Zona DNS*.
2. No Coolify: **+ New Resource → Public Repository** (ou *Private Repository (with GitHub App)* se o repositório for privado) com `https://github.com/olucaspascoal/PedidosPDV`, branch `main`.
3. Em **Build Pack** escolha **Dockerfile** e configure:
   - **Base Directory:** `/backend`
   - **Dockerfile Location:** `/Dockerfile`
   - **Ports Exposes:** `8080`
   - **Domains:** `https://api.seudominio.com.br` (o Coolify emite o certificado HTTPS)
4. Em **Environment Variables**, cadastre as de [`backend/.env.example`](backend/.env.example): `ConnectionStrings__Default`, `Jwt__Key`, `Cors__Origins`, `Seed__AdminPin` e as do Mercado Pago. Não marque como *Build Variable*, elas só são usadas na execução.
5. **Deploy.** Nos logs deve aparecer `Banco: PostgreSQL` e a criação das tabelas. Teste `https://api.seudominio.com.br/api/health`.
6. Opcional: ative **Auto Deploy** (webhook do GitHub) para publicar a cada push na `main`.

O container tem `HEALTHCHECK` em `/api/health`, que o Coolify usa para saber se a API subiu.

### 3. Site na Hostinger
```bash
cd frontend && npm run build:hostinger
```
1. Edite `frontend/dist/hostinger/browser/config.js` e coloque o endereço da API em `apiUrl`.
2. Envie **todo o conteúdo** de `frontend/dist/hostinger/browser/` para o `public_html` (Gerenciador de Arquivos ou FTP), incluindo o `.htaccess`, que faz as rotas do Angular funcionarem ao recarregar a página.
3. Coloque o domínio do site em `Cors__Origins` na API.

Para trocar a API depois, basta editar o `config.js` no `public_html`, sem recompilar.

### 4. Mercado Pago
`MercadoPago__AccessToken` com a credencial de produção, `MercadoPago__NotificationUrl=https://api.seudominio.com.br/api/webhooks/mercadopago` e, no painel do Mercado Pago, cadastre essa mesma URL no webhook (evento **Pagamentos**) e copie a assinatura secreta para `MercadoPago__WebhookSecret`.

### Migrations
Ao mudar as entidades, gere uma nova migration (o `dotnet-ef` está no manifesto de ferramentas do `backend`):
```bash
cd backend && dotnet tool restore && dotnet ef migrations add NomeDaMudanca --project Pdv.Api/Pdv.Api.csproj --output-dir Data/Migrations
```
Em desenvolvimento (SQLite), o banco continua sendo criado com `EnsureCreated`; apague o `pdv.db` quando o modelo mudar.

### Tudo em um servidor só (alternativa)
`npm run build` gera o site em `backend/Pdv.Api/wwwroot`, e a API passa a servir o site e a `/api` no mesmo endereço (não precisa de CORS nem de `config.js`).

No Coolify, use o [`Dockerfile`](Dockerfile) da raiz, que compila o Angular e a API num container só: **Base Directory** `/` e **Dockerfile Location** `/Dockerfile` (o resto igual ao passo 2). É assim que a produção atual roda, em `https://pdv-api.pascoal.tech`.

## Observações

- O disco do projeto é exFAT: o macOS cria arquivos `._*`, que já estão excluídos do build (.csproj, tsconfig e .gitignore).
- O lock de pagamentos é em memória: rode **uma** instância da API (suficiente para um bar).
