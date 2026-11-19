using System.Globalization;
using Pdv.Api.Domain;

namespace Pdv.Api.Services;

/// <summary>Regras de desconto das promoções (o frontend repete a mesma conta só para mostrar a prévia no carrinho).</summary>
public static class PromotionCalculator
{
    private static readonly CultureInfo PtBr = CultureInfo.GetCultureInfo("pt-BR");

    /// <summary>Desconto para <paramref name="quantity"/> unidades a <paramref name="unitPrice"/> cada. Só grupos completos contam.</summary>
    public static decimal Discount(Promotion p, int quantity, decimal unitPrice)
    {
        if (p.Quantity < 2 || quantity < p.Quantity) return 0;
        var groups = quantity / p.Quantity;
        var perGroup = p.Type switch
        {
            PromotionType.LevePorPreco when p.Price is { } price => p.Quantity * unitPrice - price,
            PromotionType.LeveXPagueY when p.PayQuantity is { } pay => (p.Quantity - pay) * unitPrice,
            _ => 0,
        };
        return perGroup > 0 ? Math.Round(groups * perGroup, 2) : 0;
    }

    public static bool IsValidOn(Promotion p, DateOnly day) =>
        p.Active && (p.StartsOn is null || p.StartsOn <= day) && (p.EndsOn is null || p.EndsOn >= day);

    public static string Money(decimal value) => value.ToString("C", PtBr);

    /// <summary>Texto curto da regra: "3 por R$ 10,00" ou "Leve 2, pague 1".</summary>
    public static string Rule(Promotion p) => p.Type switch
    {
        PromotionType.LevePorPreco => $"{p.Quantity} por {Money(p.Price ?? 0)}",
        _ => $"Leve {p.Quantity}, pague {p.PayQuantity}",
    };
}
