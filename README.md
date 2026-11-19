# Brinde PDV

PDV para bar: **vendas rápidas no celular** (balcão e comandas) e **gestão pelo computador**, com **Pix via Mercado Pago**.

- `backend/Pdv.Api` — ASP.NET Core 9 (minimal APIs), EF Core + SQLite, JWT com login por PIN
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

## Produção

```bash
cd frontend && npx ng build          # gera o site em backend/Pdv.Api/wwwroot
cd ../backend/Pdv.Api && dotnet publish -c Release
```

A API serve o frontend e a `/api` no mesmo endereço. Configure obrigatoriamente `Jwt__Key` (32+ caracteres aleatórios) e use HTTPS.

**PostgreSQL:** adicione o pacote `Npgsql.EntityFrameworkCore.PostgreSQL`, troque `UseSqlite` por `UseNpgsql` em `Program.cs` e ajuste `ConnectionStrings__Default`. Hoje o banco é criado com `EnsureCreated`; antes de ir para produção, passe a usar migrations (`dotnet ef migrations add Inicial`).

## Observações

- O disco do projeto é exFAT: o macOS cria arquivos `._*`, que já estão excluídos do build (.csproj, tsconfig e .gitignore).
- O lock de pagamentos é em memória: rode **uma** instância da API (suficiente para um bar).
