namespace Pdv.Api.Domain;

public enum UserRole { Admin, Atendente }
public enum OrderStatus { Aberta, Paga, Cancelada, Estornada }
public enum PaymentMethod { Pix, Dinheiro, Credito, Debito }
public enum PaymentStatus { Pendente, Aprovado, Cancelado, Expirado, Recusado, Estornado }
/// <summary>LevePorPreco: "3 por R$ 10". LeveXPagueY: "leve 2, pague 1" (compre um e leve outro).</summary>
public enum PromotionType { LevePorPreco, LeveXPagueY }

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string PinHash { get; set; } = "";
    public UserRole Role { get; set; } = UserRole.Atendente;
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "🍺";
    public int SortOrder { get; set; }
    public bool Active { get; set; } = true;
    public List<Product> Products { get; set; } = [];
}

public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    public string? ImageUrl { get; set; }
    public bool TrackStock { get; set; }
    public int Stock { get; set; }
    public bool Featured { get; set; }
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Uma venda. Fica "Aberta" enquanto for uma comanda e vira "Paga" quando o valor é quitado.</summary>
public class Order
{
    public int Id { get; set; }
    public string? Label { get; set; }
    public string? Notes { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Aberta;
    public int UserId { get; set; }
    public User? User { get; set; }
    public decimal Discount { get; set; }
    /// <summary>Soma dos descontos de promoção, recalculada enquanto a venda está aberta e congelada ao fechar.</summary>
    public decimal PromoDiscount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAt { get; set; }
    public List<OrderItem> Items { get; set; } = [];
    public List<Payment> Payments { get; set; } = [];
    public List<OrderPromotion> Promotions { get; set; } = [];

    public decimal Subtotal => Items.Sum(i => i.UnitPrice * i.Quantity);
    public decimal Total => Math.Max(0, Subtotal - PromoDiscount - Discount);
    public decimal Paid => Payments.Where(p => p.Status == PaymentStatus.Aprovado).Sum(p => p.Amount);
    public decimal Remaining => Math.Max(0, Total - Paid);
}

public class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    public string ProductName { get; set; } = "";
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Payment
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public PaymentMethod Method { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.Pendente;
    /// <summary>Valor abatido da venda (para dinheiro, sem o troco).</summary>
    public decimal Amount { get; set; }
    public decimal? CashReceived { get; set; }
    public decimal? Change { get; set; }
    /// <summary>Id do pagamento no Mercado Pago.</summary>
    public string? ExternalId { get; set; }
    public string? QrCode { get; set; }
    public string? QrCodeBase64 { get; set; }
    public string? TicketUrl { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public int UserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PaidAt { get; set; }
    /// <summary>Estorno: quando, por quem e por quê (o valor estornado é sempre o pagamento inteiro).</summary>
    public DateTime? RefundedAt { get; set; }
    public int? RefundedByUserId { get; set; }
    public string? RefundReason { get; set; }
}

/// <summary>Promoção de um produto. Só uma promoção (a de maior desconto) vale por produto em cada venda.</summary>
public class Promotion
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public PromotionType Type { get; set; }
    public int ProductId { get; set; }
    public Product? Product { get; set; }
    /// <summary>Quantas unidades formam um grupo da promoção (o "3" de "3 por R$ 10" ou o "2" de "leve 2, pague 1").</summary>
    public int Quantity { get; set; }
    /// <summary>LevePorPreco: preço do grupo inteiro.</summary>
    public decimal? Price { get; set; }
    /// <summary>LeveXPagueY: quantas unidades do grupo são cobradas.</summary>
    public int? PayQuantity { get; set; }
    /// <summary>Validade opcional (datas no fuso do bar), inclusive.</summary>
    public DateOnly? StartsOn { get; set; }
    public DateOnly? EndsOn { get; set; }
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Promoção aplicada numa venda, com o valor do desconto no momento da venda.</summary>
public class OrderPromotion
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public int? PromotionId { get; set; }
    public string Description { get; set; } = "";
    public decimal Amount { get; set; }
}

public class DomainException(string message, int statusCode = 400) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
