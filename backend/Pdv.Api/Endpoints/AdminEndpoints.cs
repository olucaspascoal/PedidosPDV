using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Pdv.Api.Contracts;
using Pdv.Api.Data;
using Pdv.Api.Domain;
using Pdv.Api.Payments;
using Pdv.Api.Services;

namespace Pdv.Api.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdmin(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/dashboard", async (DateOnly? from, DateOnly? to, AppDbContext db, CancellationToken ct) =>
        {
            var today = Clock.Today();
            var f = from ?? today;
            var t = to ?? f;
            if (t < f) (f, t) = (t, f);
            var fromUtc = Clock.StartOfDayUtc(f);
            var toUtc = Clock.StartOfDayUtc(t.AddDays(1));

            var paid = await db.Orders.Include(o => o.Items).Include(o => o.Payments).Include(o => o.User).AsSplitQuery()
                .Where(o => o.Status == OrderStatus.Paga && o.ClosedAt >= fromUtc && o.ClosedAt < toUtc)
                .ToListAsync(ct);
            var open = await db.Orders.Include(o => o.Items).Include(o => o.Payments).AsSplitQuery()
                .Where(o => o.Status == OrderStatus.Aberta).ToListAsync(ct);
            var canceled = await db.Orders.CountAsync(o => o.Status == OrderStatus.Cancelada && o.ClosedAt >= fromUtc && o.ClosedAt < toUtc, ct);
            var lowStock = await db.Products.Where(p => p.Active && p.TrackStock && p.Stock <= 10)
                .OrderBy(p => p.Stock).Take(8).Select(p => new LowStockProduct(p.Id, p.Name, p.Stock)).ToListAsync(ct);

            var revenue = paid.Sum(o => o.Total);
            var approved = paid.SelectMany(o => o.Payments).Where(p => p.Status == PaymentStatus.Aprovado).ToList();

            var byMethod = Enum.GetValues<PaymentMethod>()
                .Select(m => new MethodTotal(m, approved.Where(p => p.Method == m).Sum(p => p.Amount), approved.Count(p => p.Method == m)))
                .ToList();

            var byHour = Enumerable.Range(0, 24).Select(h =>
            {
                var orders = paid.Where(o => Clock.ToLocal(o.ClosedAt!.Value).Hour == h).ToList();
                return new SeriesPoint($"{h:00}h", orders.Sum(o => o.Total), orders.Count);
            }).ToList();

            var days = t.DayNumber - f.DayNumber + 1;
            var byDay = Enumerable.Range(0, Math.Min(days, 92)).Select(i =>
            {
                var day = f.AddDays(i);
                var orders = paid.Where(o => DateOnly.FromDateTime(Clock.ToLocal(o.ClosedAt!.Value)) == day).ToList();
                return new SeriesPoint(day.ToString("dd/MM"), orders.Sum(o => o.Total), orders.Count);
            }).ToList();

            var top = paid.SelectMany(o => o.Items)
                .GroupBy(i => i.ProductId)
                .Select(g => new TopProduct(g.Key, g.Last().ProductName, g.Sum(i => i.Quantity), g.Sum(i => i.Quantity * i.UnitPrice)))
                .OrderByDescending(x => x.Quantity).ThenByDescending(x => x.Revenue)
                .Take(8).ToList();

            return new DashboardDto(f, t, revenue, paid.Count, paid.Count == 0 ? 0 : Math.Round(revenue / paid.Count, 2),
                paid.Sum(o => o.Items.Sum(i => i.Quantity)), open.Count, open.Sum(o => o.Remaining), canceled,
                byMethod, byHour, byDay, top, lowStock,
                paid.OrderByDescending(o => o.ClosedAt).Take(8).Select(OrderSummaryDto.From).ToList());
        }).RequireAuthorization("Admin");

        app.MapGet("/api/settings/payments", (IPixGateway pix, MercadoPagoOptions mp) =>
            new PaymentSettingsDto(pix.IsSimulated ? "simulado" : "mercadopago",
                !string.IsNullOrWhiteSpace(mp.NotificationUrl), !string.IsNullOrWhiteSpace(mp.WebhookSecret), mp.PixExpirationMinutes))
            .RequireAuthorization("Admin");

        // Webhook do Mercado Pago. Não confia no corpo: só usa o id e consulta o status na API.
        app.MapPost("/api/webhooks/mercadopago", async (HttpRequest request, MercadoPagoOptions mp, PaymentService payments,
            ILoggerFactory loggers, CancellationToken ct) =>
        {
            var log = loggers.CreateLogger("MercadoPagoWebhook");
            string? type = request.Query["type"].FirstOrDefault() ?? request.Query["topic"].FirstOrDefault();
            string? dataId = request.Query["data.id"].FirstOrDefault() ?? request.Query["id"].FirstOrDefault();

            if (request.ContentLength is > 0 and < 64_000)
            {
                try
                {
                    using var doc = await JsonDocument.ParseAsync(request.Body, cancellationToken: ct);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("type", out var tp) && tp.ValueKind == JsonValueKind.String) type ??= tp.GetString();
                    if (root.TryGetProperty("data", out var data) && data.TryGetProperty("id", out var idEl))
                        dataId ??= idEl.ToString();
                }
                catch (JsonException) { }
            }

            if (type is not ("payment" or null) || string.IsNullOrWhiteSpace(dataId)) return Results.Ok();

            if (!string.IsNullOrWhiteSpace(mp.WebhookSecret) && !ValidSignature(request, dataId, mp.WebhookSecret))
            {
                log.LogWarning("Webhook do Mercado Pago com assinatura inválida para {DataId}", dataId);
                return Results.Unauthorized();
            }

            await payments.SyncByExternalIdAsync(dataId, ct);
            return Results.Ok();
        });
    }

    /// <summary>Valida o cabeçalho x-signature (HMAC-SHA256) enviado pelo Mercado Pago.</summary>
    private static bool ValidSignature(HttpRequest request, string dataId, string secret)
    {
        string? ts = null, v1 = null;
        foreach (var part in request.Headers["x-signature"].ToString().Split(','))
        {
            var kv = part.Split('=', 2);
            if (kv.Length != 2) continue;
            switch (kv[0].Trim())
            {
                case "ts": ts = kv[1].Trim(); break;
                case "v1": v1 = kv[1].Trim(); break;
            }
        }
        if (ts is null || v1 is null) return false;

        var requestId = request.Headers["x-request-id"].ToString();
        var manifest = new StringBuilder($"id:{dataId.ToLowerInvariant()};");
        if (!string.IsNullOrEmpty(requestId)) manifest.Append($"request-id:{requestId};");
        manifest.Append($"ts:{ts};");

        var expected = Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(manifest.ToString())));
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(v1.ToLowerInvariant()));
    }
}
