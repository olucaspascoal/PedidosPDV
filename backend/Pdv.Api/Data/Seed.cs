using Microsoft.EntityFrameworkCore;
using Pdv.Api.Auth;
using Pdv.Api.Domain;

namespace Pdv.Api.Data;

public static class Seed
{
    /// <param name="adminPin">PIN do primeiro administrador (Seed:AdminPin). Em produção, sempre defina.</param>
    public static async Task RunAsync(AppDbContext db, string? adminPin = null)
    {
        if (!await db.Users.AnyAsync())
        {
            var pin = PinHasher.IsValidPin(adminPin) ? adminPin! : "1234";
            db.Users.Add(new User { Name = "Administrador", Role = UserRole.Admin, PinHash = PinHasher.Hash(pin) });
            // O usuário "Caixa" de exemplo só é criado quando o PIN do admin não foi definido (desenvolvimento).
            if (!PinHasher.IsValidPin(adminPin))
                db.Users.Add(new User { Name = "Caixa", Role = UserRole.Atendente, PinHash = PinHasher.Hash("0000") });
        }

        if (!await db.Categories.AnyAsync())
        {
            var cervejas = new Category { Name = "Cervejas", Icon = "🍺", SortOrder = 1 };
            var drinks = new Category { Name = "Drinks", Icon = "🍹", SortOrder = 2 };
            var doses = new Category { Name = "Doses", Icon = "🥃", SortOrder = 3 };
            var semAlcool = new Category { Name = "Sem álcool", Icon = "🥤", SortOrder = 4 };
            var petiscos = new Category { Name = "Petiscos", Icon = "🍟", SortOrder = 5 };
            var diversos = new Category { Name = "Diversos", Icon = "🧊", SortOrder = 6 };

            Product P(Category c, string name, decimal price, string? desc = null, int? stock = null, bool featured = false) => new()
            {
                Category = c, Name = name, Price = price, Description = desc, Featured = featured,
                TrackStock = stock.HasValue, Stock = stock ?? 0,
            };

            db.Products.AddRange(
                P(cervejas, "Heineken Long Neck", 12.00m, "330 ml", 96, true),
                P(cervejas, "Budweiser Long Neck", 10.00m, "330 ml", 72),
                P(cervejas, "Original 600 ml", 16.00m, "Garrafa 600 ml", 48, true),
                P(cervejas, "Chopp Pilsen", 11.00m, "Copo 300 ml", featured: true),
                P(cervejas, "Chopp IPA", 15.00m, "Copo 300 ml"),
                P(drinks, "Caipirinha de Limão", 22.00m, "Cachaça, limão e açúcar", featured: true),
                P(drinks, "Caipiroska de Morango", 26.00m, "Vodka, morango e açúcar"),
                P(drinks, "Gin Tônica", 28.00m, "Gin, tônica e especiarias", featured: true),
                P(drinks, "Aperol Spritz", 30.00m, "Aperol, espumante e laranja"),
                P(drinks, "Moscow Mule", 29.00m, "Vodka, limão e espuma de gengibre"),
                P(doses, "Dose de Cachaça", 8.00m, "50 ml"),
                P(doses, "Dose de Whisky", 22.00m, "50 ml"),
                P(doses, "Dose de Tequila", 18.00m, "50 ml, com sal e limão"),
                P(semAlcool, "Água sem gás", 5.00m, "500 ml", 60),
                P(semAlcool, "Água com gás", 6.00m, "500 ml", 40),
                P(semAlcool, "Refrigerante Lata", 7.00m, "350 ml", 80, true),
                P(semAlcool, "Energético", 15.00m, "250 ml", 36),
                P(semAlcool, "Suco Natural", 12.00m, "Laranja, limão ou abacaxi"),
                P(petiscos, "Porção de Batata Frita", 32.00m, "500 g, com cheddar e bacon", featured: true),
                P(petiscos, "Calabresa Acebolada", 38.00m, "Com pão"),
                P(petiscos, "Amendoim", 8.00m, "Porção individual", 50),
                P(diversos, "Gelo (saco 5 kg)", 15.00m, null, 20),
                P(diversos, "Cigarro (maço)", 14.00m, null, 30),
                P(diversos, "Isqueiro", 6.00m, null, 25));
        }

        await db.SaveChangesAsync();
    }
}
