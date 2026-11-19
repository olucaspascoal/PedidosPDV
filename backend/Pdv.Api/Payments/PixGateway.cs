using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Pdv.Api.Domain;

namespace Pdv.Api.Payments;

public class MercadoPagoOptions
{
    /// <summary>Access token da aplicação no Mercado Pago. Vazio = modo simulado.</summary>
    public string AccessToken { get; set; } = "";
    /// <summary>Assinatura secreta do webhook (Suas integrações → Webhooks). Opcional, mas recomendado.</summary>
    public string WebhookSecret { get; set; } = "";
    /// <summary>URL pública para o Mercado Pago avisar mudanças, ex.: https://seu-dominio/api/webhooks/mercadopago</summary>
    public string NotificationUrl { get; set; } = "";
    /// <summary>E-mail do pagador exigido pela API quando o cliente não informa um.</summary>
    public string DefaultPayerEmail { get; set; } = "cliente@exemplo.com.br";
    public int PixExpirationMinutes { get; set; } = 15;
}

public record PixRequest(decimal Amount, string Description, string ExternalReference, string IdempotencyKey,
    DateTimeOffset ExpiresAt, string PayerEmail);

public record PixCharge(string ExternalId, string Status, string QrCode, string? QrCodeBase64, string? TicketUrl, DateTime? ExpiresAt);

public class PixGatewayException(string message) : Exception(message);

public interface IPixGateway
{
    bool IsSimulated { get; }
    Task<PixCharge> CreateAsync(PixRequest request, CancellationToken ct);
    /// <summary>Status bruto do Mercado Pago (pending, approved, cancelled, rejected...).</summary>
    Task<string> GetStatusAsync(string externalId, CancellationToken ct);
    Task CancelAsync(string externalId, CancellationToken ct);
    /// <summary>Devolve ao cliente o valor inteiro de um Pix aprovado.</summary>
    Task RefundAsync(string externalId, string idempotencyKey, CancellationToken ct);
}

public static class PixStatus
{
    public static PaymentStatus Map(string status, DateTime? expiresAt) => status switch
    {
        "approved" => PaymentStatus.Aprovado,
        "rejected" => PaymentStatus.Recusado,
        "cancelled" when expiresAt is { } e && e <= DateTime.UtcNow => PaymentStatus.Expirado,
        "refunded" => PaymentStatus.Estornado,
        "cancelled" or "charged_back" => PaymentStatus.Cancelado,
        _ => PaymentStatus.Pendente, // pending, in_process, authorized
    };
}

/// <summary>Integração real com a API de pagamentos do Mercado Pago (Pix via /v1/payments).</summary>
public class MercadoPagoPixGateway(HttpClient http, MercadoPagoOptions options, ILogger<MercadoPagoPixGateway> log) : IPixGateway
{
    public bool IsSimulated => false;

    public async Task<PixCharge> CreateAsync(PixRequest r, CancellationToken ct)
    {
        var body = new Dictionary<string, object?>
        {
            ["transaction_amount"] = r.Amount,
            ["description"] = r.Description,
            ["payment_method_id"] = "pix",
            ["external_reference"] = r.ExternalReference,
            ["date_of_expiration"] = r.ExpiresAt.ToOffset(TimeSpan.FromHours(-3)).ToString("yyyy-MM-dd'T'HH:mm:ss.fffzzz", CultureInfo.InvariantCulture),
            ["payer"] = new { email = r.PayerEmail },
        };
        if (!string.IsNullOrWhiteSpace(options.NotificationUrl)) body["notification_url"] = options.NotificationUrl;

        using var msg = Request(HttpMethod.Post, "v1/payments", body);
        msg.Headers.Add("X-Idempotency-Key", r.IdempotencyKey);
        using var doc = await SendAsync(msg, ct);
        var root = doc.RootElement;

        var tx = root.GetProperty("point_of_interaction").GetProperty("transaction_data");
        return new PixCharge(
            ExternalId: root.GetProperty("id").ToString(),
            Status: root.GetProperty("status").GetString() ?? "pending",
            QrCode: tx.GetProperty("qr_code").GetString() ?? "",
            QrCodeBase64: tx.TryGetProperty("qr_code_base64", out var b64) ? b64.GetString() : null,
            TicketUrl: tx.TryGetProperty("ticket_url", out var url) ? url.GetString() : null,
            ExpiresAt: root.TryGetProperty("date_of_expiration", out var exp) && exp.ValueKind == JsonValueKind.String
                ? DateTimeOffset.Parse(exp.GetString()!, CultureInfo.InvariantCulture).UtcDateTime
                : r.ExpiresAt.UtcDateTime);
    }

    public async Task<string> GetStatusAsync(string externalId, CancellationToken ct)
    {
        using var msg = Request(HttpMethod.Get, $"v1/payments/{Uri.EscapeDataString(externalId)}");
        using var doc = await SendAsync(msg, ct);
        return doc.RootElement.GetProperty("status").GetString() ?? "pending";
    }

    public async Task CancelAsync(string externalId, CancellationToken ct)
    {
        using var msg = Request(HttpMethod.Put, $"v1/payments/{Uri.EscapeDataString(externalId)}", new { status = "cancelled" });
        using var _ = await SendAsync(msg, ct);
    }

    public async Task RefundAsync(string externalId, string idempotencyKey, CancellationToken ct)
    {
        // Corpo vazio = estorno total. A chave de idempotência evita estornar duas vezes numa nova tentativa.
        using var msg = Request(HttpMethod.Post, $"v1/payments/{Uri.EscapeDataString(externalId)}/refunds", new { });
        msg.Headers.Add("X-Idempotency-Key", idempotencyKey);
        using var _ = await SendAsync(msg, ct);
    }

    private HttpRequestMessage Request(HttpMethod method, string path, object? body = null)
    {
        var msg = new HttpRequestMessage(method, path);
        msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.AccessToken);
        if (body is not null) msg.Content = JsonContent.Create(body);
        return msg;
    }

    private async Task<JsonDocument> SendAsync(HttpRequestMessage msg, CancellationToken ct)
    {
        using var res = await http.SendAsync(msg, ct);
        var json = await res.Content.ReadAsStringAsync(ct);
        if (res.IsSuccessStatusCode) return JsonDocument.Parse(json);

        log.LogError("Mercado Pago respondeu {Status} em {Method} {Path}: {Body}", (int)res.StatusCode, msg.Method, msg.RequestUri, json);
        var message = $"Mercado Pago respondeu {(int)res.StatusCode}";
        try
        {
            using var err = JsonDocument.Parse(json);
            if (err.RootElement.TryGetProperty("message", out var m)) message += $": {m.GetString()}";
        }
        catch (JsonException) { }
        throw new PixGatewayException(message);
    }
}

/// <summary>
/// Gateway de desenvolvimento usado quando não há access token. Gera um código Pix
/// com formato válido (não pagável) e permite aprovar o pagamento pela própria API.
/// </summary>
public class SimulatedPixGateway : IPixGateway
{
    private readonly ConcurrentDictionary<string, string> _status = new();

    public bool IsSimulated => true;

    public Task<PixCharge> CreateAsync(PixRequest r, CancellationToken ct)
    {
        var id = "SIM" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant();
        _status[id] = "pending";
        var code = BrCode.Build(r.Amount, id, "simulado@pdv.local", "PDV SIMULADO", "SAO PAULO");
        return Task.FromResult(new PixCharge(id, "pending", code, null, null, r.ExpiresAt.UtcDateTime));
    }

    public Task<string> GetStatusAsync(string externalId, CancellationToken ct) =>
        Task.FromResult(_status.GetValueOrDefault(externalId, "pending"));

    public Task CancelAsync(string externalId, CancellationToken ct)
    {
        _status[externalId] = "cancelled";
        return Task.CompletedTask;
    }

    public Task RefundAsync(string externalId, string idempotencyKey, CancellationToken ct)
    {
        if (_status.GetValueOrDefault(externalId) != "approved")
            throw new PixGatewayException("Só é possível estornar um Pix aprovado.");
        _status[externalId] = "refunded";
        return Task.CompletedTask;
    }

    public void Approve(string externalId) => _status[externalId] = "approved";
}

/// <summary>Monta um payload Pix "copia e cola" (BR Code / EMV) com CRC16.</summary>
public static class BrCode
{
    public static string Build(decimal amount, string txId, string key, string merchant, string city)
    {
        static string F(string id, string value) => id + value.Length.ToString("00") + value;
        var payload = new StringBuilder()
            .Append(F("00", "01"))
            .Append(F("26", F("00", "br.gov.bcb.pix") + F("01", key)))
            .Append(F("52", "0000"))
            .Append(F("53", "986"))
            .Append(F("54", amount.ToString("0.00", CultureInfo.InvariantCulture)))
            .Append(F("58", "BR"))
            .Append(F("59", merchant))
            .Append(F("60", city))
            .Append(F("62", F("05", txId)))
            .Append("6304")
            .ToString();
        return payload + Crc16(payload).ToString("X4");
    }

    private static ushort Crc16(string data)
    {
        ushort crc = 0xFFFF;
        foreach (var b in Encoding.UTF8.GetBytes(data))
        {
            crc ^= (ushort)(b << 8);
            for (var i = 0; i < 8; i++)
                crc = (crc & 0x8000) != 0 ? (ushort)((crc << 1) ^ 0x1021) : (ushort)(crc << 1);
        }
        return crc;
    }
}
