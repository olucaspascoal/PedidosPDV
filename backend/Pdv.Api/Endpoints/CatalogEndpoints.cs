using Microsoft.EntityFrameworkCore;
using Pdv.Api.Contracts;
using Pdv.Api.Data;
using Pdv.Api.Domain;

namespace Pdv.Api.Endpoints;

public static class CatalogEndpoints
{
    public static void MapCatalog(this IEndpointRouteBuilder app)
    {
        // ---------- Categorias ----------
        var categories = app.MapGroup("/api/categories").RequireAuthorization();

        categories.MapGet("/", async (bool? all, AppDbContext db, CancellationToken ct) =>
            await db.Categories
                .Where(c => all == true || c.Active)
                .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
                .Select(c => new CategoryDto(c.Id, c.Name, c.Icon, c.SortOrder, c.Active, c.Products.Count(p => p.Active)))
                .ToListAsync(ct));

        categories.MapPost("/", async (SaveCategoryRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var category = new Category();
            Apply(category, req);
            db.Categories.Add(category);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new CategoryDto(category.Id, category.Name, category.Icon, category.SortOrder, category.Active, 0));
        }).RequireAuthorization("Admin");

        categories.MapPut("/{id:int}", async (int id, SaveCategoryRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var category = await db.Categories.FindAsync([id], ct) ?? throw new DomainException("Categoria não encontrada.", 404);
            Apply(category, req);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new CategoryDto(category.Id, category.Name, category.Icon, category.SortOrder, category.Active,
                await db.Products.CountAsync(p => p.CategoryId == id && p.Active, ct)));
        }).RequireAuthorization("Admin");

        categories.MapDelete("/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var category = await db.Categories.FindAsync([id], ct) ?? throw new DomainException("Categoria não encontrada.", 404);
            if (await db.Products.AnyAsync(p => p.CategoryId == id, ct))
                throw new DomainException("Mova ou exclua os produtos desta categoria antes de removê-la.", 409);
            db.Categories.Remove(category);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization("Admin");

        // ---------- Produtos ----------
        var products = app.MapGroup("/api/products").RequireAuthorization();

        products.MapGet("/", async (bool? all, AppDbContext db, CancellationToken ct) =>
            (await db.Products.Include(p => p.Category)
                .Where(p => all == true || (p.Active && p.Category!.Active))
                .OrderBy(p => p.Category!.SortOrder).ThenBy(p => p.Name)
                .ToListAsync(ct))
            .Select(ProductDto.From));

        products.MapPost("/", async (SaveProductRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var product = new Product();
            await ApplyAsync(product, req, db, ct);
            db.Products.Add(product);
            await db.SaveChangesAsync(ct);
            await db.Entry(product).Reference(p => p.Category).LoadAsync(ct);
            return Results.Ok(ProductDto.From(product));
        }).RequireAuthorization("Admin");

        products.MapPut("/{id:int}", async (int id, SaveProductRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var product = await db.Products.FindAsync([id], ct) ?? throw new DomainException("Produto não encontrado.", 404);
            await ApplyAsync(product, req, db, ct);
            await db.SaveChangesAsync(ct);
            await db.Entry(product).Reference(p => p.Category).LoadAsync(ct);
            return Results.Ok(ProductDto.From(product));
        }).RequireAuthorization("Admin");

        products.MapDelete("/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var product = await db.Products.FindAsync([id], ct) ?? throw new DomainException("Produto não encontrado.", 404);
            // Produtos já vendidos ficam inativos para preservar o histórico.
            if (await db.OrderItems.AnyAsync(i => i.ProductId == id, ct)) product.Active = false;
            else db.Products.Remove(product);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization("Admin");
    }

    private static void Apply(Category category, SaveCategoryRequest req)
    {
        var name = req.Name?.Trim() ?? "";
        if (name.Length is < 1 or > 60) throw new DomainException("Informe o nome da categoria.");
        category.Name = name;
        category.Icon = string.IsNullOrWhiteSpace(req.Icon) ? "🍺" : req.Icon.Trim();
        category.SortOrder = req.SortOrder;
        category.Active = req.Active;
    }

    private static async Task ApplyAsync(Product product, SaveProductRequest req, AppDbContext db, CancellationToken ct)
    {
        var name = req.Name?.Trim() ?? "";
        if (name.Length is < 1 or > 120) throw new DomainException("Informe o nome do produto.");
        if (req.Price is < 0 or > 100_000) throw new DomainException("Preço inválido.");
        if (!await db.Categories.AnyAsync(c => c.Id == req.CategoryId, ct)) throw new DomainException("Categoria inválida.");
        if (req.ImageUrl is { Length: > 0 } url && !(Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https"))
            throw new DomainException("A imagem deve ser um link http(s).");

        product.Name = name;
        product.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        product.Price = Math.Round(req.Price, 2);
        product.CategoryId = req.CategoryId;
        product.ImageUrl = string.IsNullOrWhiteSpace(req.ImageUrl) ? null : req.ImageUrl.Trim();
        product.TrackStock = req.TrackStock;
        product.Stock = req.Stock;
        product.Featured = req.Featured;
        product.Active = req.Active;
    }
}
