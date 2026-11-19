using Microsoft.EntityFrameworkCore;
using Pdv.Api.Contracts;
using Pdv.Api.Data;
using Pdv.Api.Domain;

namespace Pdv.Api.Services;

public class OrderService(AppDbContext db)
{
    public Task<Order?> LoadAsync(int id, CancellationToken ct = default) =>
        db.Orders.Include(o => o.Items).Include(o => o.Payments).Include(o => o.User)
            .AsSplitQuery()
            .FirstOrDefaultAsync(o => o.Id == id, ct);

    public async Task<Order> GetOpenAsync(int id, CancellationToken ct = default)
    {
        var order = await LoadAsync(id, ct) ?? throw new DomainException("Venda não encontrada.", 404);
        if (order.Status != OrderStatus.Aberta) throw new DomainException("Esta venda não está mais aberta.", 409);
        return order;
    }

    public async Task AddItemsAsync(Order order, IReadOnlyCollection<OrderItemInput> items, CancellationToken ct = default)
    {
        if (items.Count == 0) throw new DomainException("Adicione pelo menos um item.");
        var ids = items.Select(i => i.ProductId).Distinct().ToList();
        var products = await db.Products.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);

        foreach (var input in items)
        {
            if (input.Quantity is <= 0 or > 999) throw new DomainException("Quantidade inválida.");
            if (!products.TryGetValue(input.ProductId, out var product) || !product.Active)
                throw new DomainException("Um dos produtos não está mais disponível.");

            var notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim();
            var existing = order.Items.FirstOrDefault(i => i.ProductId == product.Id && i.Notes == notes && i.UnitPrice == product.Price);
            if (existing is not null) existing.Quantity += input.Quantity;
            else order.Items.Add(new OrderItem
            {
                ProductId = product.Id, ProductName = product.Name, UnitPrice = product.Price,
                Quantity = input.Quantity, Notes = notes,
            });
        }

        EnsureStock(order, products.Values);
    }

    public async Task UpdateItemAsync(Order order, int itemId, int quantity, CancellationToken ct = default)
    {
        var item = order.Items.FirstOrDefault(i => i.Id == itemId) ?? throw new DomainException("Item não encontrado.", 404);
        if (quantity < 0 || quantity > 999) throw new DomainException("Quantidade inválida.");
        if (quantity == 0) order.Items.Remove(item);
        else item.Quantity = quantity;

        var product = await db.Products.FindAsync([item.ProductId], ct);
        if (product is not null) EnsureStock(order, [product]);
        EnsureConsistent(order);
    }

    public void EnsureConsistent(Order order)
    {
        if (order.Discount < 0) throw new DomainException("Desconto inválido.");
        if (order.Discount > order.Subtotal) order.Discount = order.Subtotal;
        if (order.Paid > order.Total)
            throw new DomainException("O total não pode ficar menor do que o valor já pago.");
    }

    /// <summary>Fecha a venda quando o valor estiver quitado e baixa o estoque.</summary>
    public async Task<bool> TryCloseAsync(Order order, CancellationToken ct = default)
    {
        if (order.Status != OrderStatus.Aberta || order.Items.Count == 0 || order.Remaining > 0) return false;

        order.Status = OrderStatus.Paga;
        order.ClosedAt = DateTime.UtcNow;

        var ids = order.Items.Select(i => i.ProductId).Distinct().ToList();
        var tracked = await db.Products.Where(p => ids.Contains(p.Id) && p.TrackStock).ToListAsync(ct);
        foreach (var product in tracked)
            product.Stock -= order.Items.Where(i => i.ProductId == product.Id).Sum(i => i.Quantity);
        return true;
    }

    private static void EnsureStock(Order order, IEnumerable<Product> products)
    {
        foreach (var p in products.Where(p => p.TrackStock))
        {
            var wanted = order.Items.Where(i => i.ProductId == p.Id).Sum(i => i.Quantity);
            if (wanted > p.Stock)
                throw new DomainException(p.Stock <= 0
                    ? $"{p.Name} está sem estoque."
                    : $"Só há {p.Stock} unidade(s) de {p.Name} em estoque.");
        }
    }
}
