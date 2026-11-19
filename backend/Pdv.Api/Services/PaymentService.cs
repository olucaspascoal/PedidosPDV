using Microsoft.EntityFrameworkCore;
using Pdv.Api.Contracts;
using Pdv.Api.Data;
using Pdv.Api.Domain;
using Pdv.Api.Payments;

namespace Pdv.Api.Services;

public class PaymentService(
    AppDbContext db, OrderService orders, IPixGateway pix, MercadoPagoOptions mp, ILogger<PaymentService> log)
{
    // Serializa mudanças de status (webhook, polling e caixa podem chegar ao mesmo tempo).
    // Suficiente para uma única instância da API; com várias instâncias use um lock distribuído.
    private static readonly SemaphoreSlim Gate = new(1, 1);

    public bool Simulated => pix.IsSimulated;

    public async Task<Payment> CreateAsync(int orderId, CreatePaymentRequest req, int userId, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var order = await orders.GetOpenAsync(orderId, ct);
            if (order.Items.Count == 0) throw new DomainException("A venda não tem itens.");

            var remaining = order.Remaining;
            if (remaining <= 0) throw new DomainException("Esta venda já está paga.");
            var amount = Math.Round(req.Amount ?? remaining, 2);
            if (amount <= 0 || amount > remaining)
                throw new DomainException($"O valor deve ficar entre R$ 0,01 e R$ {remaining:N2}.");

            var payment = new Payment { Method = req.Method, Amount = amount, UserId = userId };

            switch (req.Method)
            {
                case PaymentMethod.Dinheiro:
                    var received = Math.Round(req.CashReceived ?? amount, 2);
                    if (received < amount) throw new DomainException("Valor recebido menor que o valor a pagar.");
                    payment.CashReceived = received;
                    payment.Change = received - amount;
                    Approve(payment);
                    break;

                case PaymentMethod.Credito:
                case PaymentMethod.Debito:
                    // Cartão passado na maquininha; o PDV só registra.
                    Approve(payment);
                    break;

                case PaymentMethod.Pix:
                    await CancelPendingPixAsync(order, ct);
                    order.Payments.Add(payment);
                    await db.SaveChangesAsync(ct); // garante o Id para a referência externa
                    await CreatePixChargeAsync(order, payment, req.PayerEmail, ct);
                    break;
            }

            if (!order.Payments.Contains(payment)) order.Payments.Add(payment);
            await orders.TryCloseAsync(order, ct);
            await db.SaveChangesAsync(ct);
            return payment;
        }
        finally { Gate.Release(); }
    }

    private async Task CreatePixChargeAsync(Order order, Payment payment, string? payerEmail, CancellationToken ct)
    {
        var expires = DateTimeOffset.UtcNow.AddMinutes(mp.PixExpirationMinutes);
        try
        {
            var charge = await pix.CreateAsync(new PixRequest(
                payment.Amount,
                order.Label is { Length: > 0 } label ? $"Venda #{order.Id} - {label}" : $"Venda #{order.Id}",
                $"pdv-order-{order.Id}-payment-{payment.Id}",
                Guid.NewGuid().ToString(),
                expires,
                string.IsNullOrWhiteSpace(payerEmail) ? mp.DefaultPayerEmail : payerEmail.Trim()), ct);

            payment.ExternalId = charge.ExternalId;
            payment.QrCode = charge.QrCode;
            payment.QrCodeBase64 = charge.QrCodeBase64;
            payment.TicketUrl = charge.TicketUrl;
            payment.ExpiresAt = charge.ExpiresAt;
            var status = PixStatus.Map(charge.Status, charge.ExpiresAt);
            if (status == PaymentStatus.Aprovado) Approve(payment);
            else payment.Status = status;
        }
        catch (Exception ex) when (ex is PixGatewayException or HttpRequestException or TaskCanceledException)
        {
            log.LogError(ex, "Falha ao gerar Pix da venda {OrderId}", order.Id);
            payment.Status = PaymentStatus.Recusado;
            await db.SaveChangesAsync(CancellationToken.None);
            throw new DomainException($"Não foi possível gerar o Pix. {ex.Message}", 502);
        }
    }

    /// <summary>Consulta o Mercado Pago se o Pix ainda estiver pendente e atualiza a venda.</summary>
    public async Task<Payment> SyncAsync(int paymentId, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var payment = await LoadAsync(p => p.Id == paymentId, ct) ?? throw new DomainException("Pagamento não encontrado.", 404);
            await RefreshAsync(payment, ct);
            return payment;
        }
        finally { Gate.Release(); }
    }

    public async Task SyncByExternalIdAsync(string externalId, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var payment = await LoadAsync(p => p.ExternalId == externalId, ct);
            if (payment is null)
            {
                log.LogInformation("Webhook para pagamento desconhecido {ExternalId}", externalId);
                return;
            }
            await RefreshAsync(payment, ct);
        }
        finally { Gate.Release(); }
    }

    public async Task<Payment> CancelAsync(int paymentId, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try
        {
            var payment = await LoadAsync(p => p.Id == paymentId, ct) ?? throw new DomainException("Pagamento não encontrado.", 404);
            await RefreshAsync(payment, ct);
            if (payment.Status != PaymentStatus.Pendente) return payment;
            await CancelPixAsync(payment, ct);
            await db.SaveChangesAsync(ct);
            return payment;
        }
        finally { Gate.Release(); }
    }

    /// <summary>Cancela Pix pendentes de uma venda (ex.: ao cancelar a venda).</summary>
    public async Task CancelPendingPixAsync(Order order, CancellationToken ct)
    {
        foreach (var pending in order.Payments.Where(p => p.Method == PaymentMethod.Pix && p.Status == PaymentStatus.Pendente).ToList())
            await CancelPixAsync(pending, ct);
    }

    private async Task CancelPixAsync(Payment payment, CancellationToken ct)
    {
        if (payment.ExternalId is { } id)
        {
            try { await pix.CancelAsync(id, ct); }
            catch (Exception ex) when (ex is PixGatewayException or HttpRequestException)
            {
                // Se o Mercado Pago já aprovou, não podemos marcar como cancelado.
                var status = await TryGetStatusAsync(id, payment.ExpiresAt, ct);
                if (status == PaymentStatus.Aprovado) { await ApplyAsync(payment, PaymentStatus.Aprovado, ct); return; }
                log.LogWarning(ex, "Não foi possível cancelar o Pix {ExternalId} no Mercado Pago", id);
            }
        }
        payment.Status = PaymentStatus.Cancelado;
    }

    private async Task RefreshAsync(Payment payment, CancellationToken ct)
    {
        if (payment.Method != PaymentMethod.Pix || payment.Status != PaymentStatus.Pendente || payment.ExternalId is null) return;

        var status = await TryGetStatusAsync(payment.ExternalId, payment.ExpiresAt, ct);
        if (status is null) return;
        // O simulador não expira sozinho; o Mercado Pago muda para "cancelled" após o vencimento.
        if (status == PaymentStatus.Pendente && pix.IsSimulated && payment.ExpiresAt < DateTime.UtcNow)
            status = PaymentStatus.Expirado;
        await ApplyAsync(payment, status.Value, ct);
    }

    private async Task<PaymentStatus?> TryGetStatusAsync(string externalId, DateTime? expiresAt, CancellationToken ct)
    {
        try { return PixStatus.Map(await pix.GetStatusAsync(externalId, ct), expiresAt); }
        catch (Exception ex) when (ex is PixGatewayException or HttpRequestException or TaskCanceledException)
        {
            log.LogWarning(ex, "Falha ao consultar o Pix {ExternalId}", externalId);
            return null;
        }
    }

    private async Task ApplyAsync(Payment payment, PaymentStatus status, CancellationToken ct)
    {
        if (status == payment.Status) return;
        var order = payment.Order!;

        if (status == PaymentStatus.Aprovado)
        {
            Approve(payment);
            if (order.Status == OrderStatus.Aberta) await orders.TryCloseAsync(order, ct);
            else log.LogWarning("Pix {ExternalId} aprovado para a venda {OrderId} que está {Status}; verifique estorno.",
                payment.ExternalId, order.Id, order.Status);
        }
        else payment.Status = status;

        await db.SaveChangesAsync(ct);
    }

    private static void Approve(Payment payment)
    {
        payment.Status = PaymentStatus.Aprovado;
        payment.PaidAt = DateTime.UtcNow;
    }

    private Task<Payment?> LoadAsync(System.Linq.Expressions.Expression<Func<Payment, bool>> predicate, CancellationToken ct) =>
        db.Payments
            .Include(p => p.Order!).ThenInclude(o => o.Items)
            .Include(p => p.Order!).ThenInclude(o => o.Payments)
            .AsSplitQuery()
            .FirstOrDefaultAsync(predicate, ct);
}
