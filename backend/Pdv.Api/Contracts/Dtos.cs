using Pdv.Api.Domain;

namespace Pdv.Api.Contracts;

// ---------- Auth / usuários ----------
public record LoginRequest(int UserId, string Pin);
public record UserDto(int Id, string Name, UserRole Role, bool Active)
{
    public static UserDto From(User u) => new(u.Id, u.Name, u.Role, u.Active);
}
public record LoginResponse(string Token, UserDto User);
public record SaveUserRequest(string Name, UserRole Role, bool Active, string? Pin);

// ---------- Catálogo ----------
public record CategoryDto(int Id, string Name, string Icon, int SortOrder, bool Active, int ProductCount);
public record SaveCategoryRequest(string Name, string? Icon, int SortOrder, bool Active);

public record ProductDto(int Id, string Name, string? Description, decimal Price, int CategoryId, string CategoryName,
    string CategoryIcon, string? ImageUrl, bool TrackStock, int Stock, bool Featured, bool Active)
{
    public static ProductDto From(Product p) => new(p.Id, p.Name, p.Description, p.Price, p.CategoryId,
        p.Category?.Name ?? "", p.Category?.Icon ?? "", p.ImageUrl, p.TrackStock, p.Stock, p.Featured, p.Active);
}
public record SaveProductRequest(string Name, string? Description, decimal Price, int CategoryId, string? ImageUrl,
    bool TrackStock, int Stock, bool Featured, bool Active);

// ---------- Vendas / comandas ----------
public record OrderItemInput(int ProductId, int Quantity, string? Notes);
public record CreateOrderRequest(string? Label, string? Notes, List<OrderItemInput> Items);
public record AddItemsRequest(List<OrderItemInput> Items);
public record UpdateItemRequest(int Quantity);
public record UpdateOrderRequest(string? Label, string? Notes, decimal? Discount);
public record RefundOrderRequest(string? Reason);

public record OrderItemDto(int Id, int ProductId, string ProductName, decimal UnitPrice, int Quantity, string? Notes, decimal Total);

public record PaymentDto(int Id, int OrderId, PaymentMethod Method, PaymentStatus Status, decimal Amount,
    decimal? CashReceived, decimal? Change, string? QrCode, string? QrCodeBase64, string? TicketUrl,
    DateTime? ExpiresAt, DateTime CreatedAt, DateTime? PaidAt, bool Simulated, DateTime? RefundedAt, string? RefundReason)
{
    public static PaymentDto From(Payment p, bool simulated) => new(p.Id, p.OrderId, p.Method, p.Status, p.Amount,
        p.CashReceived, p.Change, p.QrCode, p.QrCodeBase64, p.TicketUrl, p.ExpiresAt, p.CreatedAt, p.PaidAt,
        simulated && p.Method == PaymentMethod.Pix, p.RefundedAt, p.RefundReason);
}

public record OrderPromotionDto(string Description, decimal Amount);

public record OrderDto(int Id, string? Label, string? Notes, OrderStatus Status, string UserName, DateTime CreatedAt,
    DateTime? ClosedAt, decimal Subtotal, decimal PromoDiscount, List<OrderPromotionDto> Promotions, decimal Discount,
    decimal Total, decimal Paid, decimal Remaining, List<OrderItemDto> Items, List<PaymentDto> Payments)
{
    public static OrderDto From(Order o, bool simulated) => new(o.Id, o.Label, o.Notes, o.Status, o.User?.Name ?? "",
        o.CreatedAt, o.ClosedAt, o.Subtotal, o.PromoDiscount,
        o.Promotions.OrderBy(p => p.Id).Select(p => new OrderPromotionDto(p.Description, p.Amount)).ToList(),
        o.Discount, o.Total, o.Paid, o.Remaining,
        o.Items.OrderBy(i => i.Id).Select(i => new OrderItemDto(i.Id, i.ProductId, i.ProductName, i.UnitPrice, i.Quantity, i.Notes, i.UnitPrice * i.Quantity)).ToList(),
        o.Payments.OrderBy(p => p.Id).Select(p => PaymentDto.From(p, simulated)).ToList());
}

public record OrderSummaryDto(int Id, string? Label, OrderStatus Status, string UserName, DateTime CreatedAt,
    DateTime? ClosedAt, int ItemCount, decimal Total, decimal Paid, List<PaymentMethod> Methods)
{
    public static OrderSummaryDto From(Order o) => new(o.Id, o.Label, o.Status, o.User?.Name ?? "", o.CreatedAt, o.ClosedAt,
        o.Items.Sum(i => i.Quantity), o.Total, o.Paid,
        o.Payments.Where(p => p.Status == PaymentStatus.Aprovado).Select(p => p.Method).Distinct().ToList());
}

// ---------- Promoções ----------
public record PromotionDto(int Id, string Name, PromotionType Type, int ProductId, string ProductName, decimal ProductPrice,
    int Quantity, decimal? Price, int? PayQuantity, DateOnly? StartsOn, DateOnly? EndsOn, bool Active, string Rule, bool ValidToday);
public record SavePromotionRequest(string? Name, PromotionType Type, int ProductId, int Quantity, decimal? Price, int? PayQuantity,
    DateOnly? StartsOn, DateOnly? EndsOn, bool Active);

// ---------- Pagamentos ----------
public record CreatePaymentRequest(PaymentMethod Method, decimal? Amount, decimal? CashReceived, string? PayerEmail);
public record PaymentStatusDto(PaymentDto Payment, OrderStatus OrderStatus, decimal OrderRemaining);

// ---------- Dashboard ----------
public record DashboardDto(
    DateOnly From, DateOnly To,
    decimal Revenue, int OrderCount, decimal AverageTicket, int ItemsSold,
    int OpenOrders, decimal OpenOrdersValue, int CanceledOrders,
    List<MethodTotal> ByMethod, List<SeriesPoint> ByHour, List<SeriesPoint> ByDay,
    List<TopProduct> TopProducts, List<LowStockProduct> LowStock, List<OrderSummaryDto> Recent);
public record MethodTotal(PaymentMethod Method, decimal Amount, int Count);
public record SeriesPoint(string Label, decimal Amount, int Count);
public record TopProduct(int ProductId, string Name, int Quantity, decimal Revenue);
public record LowStockProduct(int Id, string Name, int Stock);

public record PaymentSettingsDto(string PixMode, bool NotificationUrlConfigured, bool WebhookSecretConfigured, int PixExpirationMinutes);
