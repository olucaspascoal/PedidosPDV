using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Pdv.Api.Auth;
using Pdv.Api.Contracts;
using Pdv.Api.Data;
using Pdv.Api.Domain;
using Pdv.Api.Payments;
using Pdv.Api.Services;

namespace Pdv.Api.Endpoints;

public static class OrderEndpoints
{
    public static void MapOrders(this IEndpointRouteBuilder app)
    {
        var orders = app.MapGroup("/api/orders").RequireAuthorization();

        orders.MapGet("/", async (OrderStatus? status, DateOnly? from, DateOnly? to, int? take, AppDbContext db, CancellationToken ct) =>
        {
            var query = db.Orders.Include(o => o.Items).Include(o => o.Payments).Include(o => o.User).AsSplitQuery().AsQueryable();
            if (status is not null) query = query.Where(o => o.Status == status);
            if (from is not null) { var f = Clock.StartOfDayUtc(from.Value); query = query.Where(o => o.CreatedAt >= f); }
            if (to is not null) { var t = Clock.StartOfDayUtc(to.Value.AddDays(1)); query = query.Where(o => o.CreatedAt < t); }
            var list = await query.OrderByDescending(o => o.Id).Take(Math.Clamp(take ?? 200, 1, 1000)).ToListAsync(ct);
            return list.Select(OrderSummaryDto.From);
        });

        orders.MapGet("/{id:int}", async (int id, OrderService svc, IPixGateway pix, CancellationToken ct) =>
        {
            var order = await svc.LoadAsync(id, ct) ?? throw new DomainException("Venda não encontrada.", 404);
            return OrderDto.From(order, pix.IsSimulated);
        });

        orders.MapPost("/", async (CreateOrderRequest req, ClaimsPrincipal user, AppDbContext db, OrderService svc, IPixGateway pix, CancellationToken ct) =>
        {
            var order = new Order { Label = Clean(req.Label, 60), Notes = Clean(req.Notes, 300), UserId = user.UserId() };
            await svc.AddItemsAsync(order, req.Items ?? [], ct);
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);
            return Results.Ok(await Reload(order.Id, svc, pix, ct));
        });

        orders.MapPost("/{id:int}/items", async (int id, AddItemsRequest req, AppDbContext db, OrderService svc, IPixGateway pix, CancellationToken ct) =>
        {
            var order = await svc.GetOpenAsync(id, ct);
            await svc.AddItemsAsync(order, req.Items ?? [], ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(OrderDto.From(order, pix.IsSimulated));
        });

        orders.MapPatch("/{id:int}/items/{itemId:int}", async (int id, int itemId, UpdateItemRequest req, AppDbContext db, OrderService svc, IPixGateway pix, CancellationToken ct) =>
        {
            var order = await svc.GetOpenAsync(id, ct);
            await svc.UpdateItemAsync(order, itemId, req.Quantity, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(OrderDto.From(order, pix.IsSimulated));
        });

        orders.MapPatch("/{id:int}", async (int id, UpdateOrderRequest req, ClaimsPrincipal user, AppDbContext db, OrderService svc, IPixGateway pix, CancellationToken ct) =>
        {
            var order = await svc.GetOpenAsync(id, ct);
            order.Label = Clean(req.Label, 60);
            order.Notes = Clean(req.Notes, 300);
            if (req.Discount is { } discount && Math.Round(discount, 2) != order.Discount)
            {
                if (!user.IsAdmin()) throw new DomainException("Só administradores podem dar desconto.", 403);
                order.Discount = Math.Round(discount, 2);
            }
            svc.EnsureConsistent(order);
            await svc.TryCloseAsync(order, ct); // desconto pode quitar o saldo
            await db.SaveChangesAsync(ct);
            return Results.Ok(OrderDto.From(order, pix.IsSimulated));
        });

        orders.MapPost("/{id:int}/cancel", async (int id, AppDbContext db, OrderService svc, PaymentService payments, IPixGateway pix, CancellationToken ct) =>
        {
            var order = await svc.GetOpenAsync(id, ct);
            if (order.Paid > 0) throw new DomainException("Esta venda já tem pagamentos aprovados e não pode ser cancelada.", 409);
            await payments.CancelPendingPixAsync(order, ct);
            order.Status = OrderStatus.Cancelada;
            order.ClosedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(OrderDto.From(order, pix.IsSimulated));
        });

        // ---------- Pagamentos ----------
        orders.MapPost("/{id:int}/payments", async (int id, CreatePaymentRequest req, ClaimsPrincipal user, PaymentService payments, OrderService svc, CancellationToken ct) =>
        {
            var payment = await payments.CreateAsync(id, req, user.UserId(), ct);
            var order = await svc.LoadAsync(id, ct);
            return Results.Ok(new PaymentStatusDto(PaymentDto.From(payment, payments.Simulated), order!.Status, order.Remaining));
        });

        var pay = app.MapGroup("/api/payments").RequireAuthorization();

        pay.MapGet("/{id:int}", async (int id, PaymentService payments, CancellationToken ct) =>
        {
            var payment = await payments.SyncAsync(id, ct);
            return new PaymentStatusDto(PaymentDto.From(payment, payments.Simulated), payment.Order!.Status, payment.Order.Remaining);
        });

        pay.MapPost("/{id:int}/cancel", async (int id, PaymentService payments, CancellationToken ct) =>
        {
            var payment = await payments.CancelAsync(id, ct);
            return new PaymentStatusDto(PaymentDto.From(payment, payments.Simulated), payment.Order!.Status, payment.Order.Remaining);
        });

        // Só existe no modo simulado (sem access token): aprova o Pix como se o cliente tivesse pago.
        pay.MapPost("/{id:int}/simulate-approval", async (int id, AppDbContext db, IPixGateway pix, PaymentService payments, CancellationToken ct) =>
        {
            if (pix is not SimulatedPixGateway simulator) return Results.NotFound();
            var externalId = await db.Payments.Where(p => p.Id == id).Select(p => p.ExternalId).FirstOrDefaultAsync(ct);
            if (externalId is null) return Results.NotFound();
            simulator.Approve(externalId);
            var payment = await payments.SyncAsync(id, ct);
            return Results.Ok(new PaymentStatusDto(PaymentDto.From(payment, true), payment.Order!.Status, payment.Order.Remaining));
        });
    }

    private static async Task<OrderDto> Reload(int id, OrderService svc, IPixGateway pix, CancellationToken ct) =>
        OrderDto.From((await svc.LoadAsync(id, ct))!, pix.IsSimulated);

    private static string? Clean(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var v = value.Trim();
        return v.Length > max ? v[..max] : v;
    }
}
