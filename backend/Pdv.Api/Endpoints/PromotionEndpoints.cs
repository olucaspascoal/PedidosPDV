using Microsoft.EntityFrameworkCore;
using Pdv.Api.Contracts;
using Pdv.Api.Data;
using Pdv.Api.Domain;
using Pdv.Api.Services;

namespace Pdv.Api.Endpoints;

public static class PromotionEndpoints
{
    public static void MapPromotions(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/promotions").RequireAuthorization();

        // PDV: só as que valem hoje. Gestão (all=true): todas.
        group.MapGet("/", async (bool? all, AppDbContext db, CancellationToken ct) =>
        {
            var today = Clock.Today();
            var list = await db.Promotions.Include(p => p.Product)
                .Where(p => all == true || p.Active)
                .OrderBy(p => p.Product!.Name).ThenBy(p => p.Quantity)
                .ToListAsync(ct);
            return list.Where(p => all == true || PromotionCalculator.IsValidOn(p, today)).Select(p => ToDto(p, today));
        });

        group.MapPost("/", async (SavePromotionRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var promo = new Promotion();
            await ApplyAsync(promo, req, db, ct);
            db.Promotions.Add(promo);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(promo, Clock.Today()));
        }).RequireAuthorization("Admin");

        group.MapPut("/{id:int}", async (int id, SavePromotionRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var promo = await db.Promotions.FindAsync([id], ct) ?? throw new DomainException("Promoção não encontrada.", 404);
            await ApplyAsync(promo, req, db, ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(promo, Clock.Today()));
        }).RequireAuthorization("Admin");

        // Vendas já feitas guardam o desconto e a descrição; excluir não muda o histórico.
        group.MapDelete("/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var promo = await db.Promotions.FindAsync([id], ct) ?? throw new DomainException("Promoção não encontrada.", 404);
            db.Promotions.Remove(promo);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }

    private static PromotionDto ToDto(Promotion p, DateOnly today) => new(p.Id, p.Name, p.Type, p.ProductId,
        p.Product?.Name ?? "", p.Product?.Price ?? 0, p.Quantity, p.Price, p.PayQuantity, p.StartsOn, p.EndsOn, p.Active,
        PromotionCalculator.Rule(p), PromotionCalculator.IsValidOn(p, today));

    private static async Task ApplyAsync(Promotion promo, SavePromotionRequest req, AppDbContext db, CancellationToken ct)
    {
        var product = await db.Products.FindAsync([req.ProductId], ct) ?? throw new DomainException("Escolha o produto da promoção.");
        if (req.Quantity is < 2 or > 99) throw new DomainException("A quantidade da promoção deve ficar entre 2 e 99.");

        promo.Type = req.Type;
        promo.ProductId = product.Id;
        promo.Product = product;
        promo.Quantity = req.Quantity;

        switch (req.Type)
        {
            case PromotionType.LevePorPreco:
                var price = Math.Round(req.Price ?? 0, 2);
                var full = req.Quantity * product.Price;
                if (price <= 0) throw new DomainException("Informe o preço da promoção.");
                if (price >= full)
                    throw new DomainException($"O preço da promoção precisa ser menor que {req.Quantity} x {PromotionCalculator.Money(product.Price)} = {PromotionCalculator.Money(full)}.");
                promo.Price = price;
                promo.PayQuantity = null;
                break;

            case PromotionType.LeveXPagueY:
                if (req.PayQuantity is not { } pay || pay < 1 || pay >= req.Quantity)
                    throw new DomainException("Em \"leve e pague\", a quantidade paga deve ser menor que a levada (ex.: leve 2, pague 1).");
                promo.PayQuantity = pay;
                promo.Price = null;
                break;

            default:
                throw new DomainException("Tipo de promoção inválido.");
        }

        if (req.StartsOn is { } s && req.EndsOn is { } e && e < s) throw new DomainException("A data final deve ser depois da inicial.");
        promo.StartsOn = req.StartsOn;
        promo.EndsOn = req.EndsOn;
        promo.Active = req.Active;

        var name = req.Name?.Trim() ?? "";
        promo.Name = name.Length > 0 ? (name.Length > 80 ? name[..80] : name) : $"{product.Name} {PromotionCalculator.Rule(promo)}";
    }
}
