using Microsoft.EntityFrameworkCore;
using Pdv.Api.Auth;
using Pdv.Api.Contracts;
using Pdv.Api.Data;
using Pdv.Api.Domain;

namespace Pdv.Api.Endpoints;

public static class AuthAndUsersEndpoints
{
    public static void MapAuthAndUsers(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth");

        // Lista de quem pode entrar (tela de login com PIN, como em PDVs de balcão).
        auth.MapGet("/users", async (AppDbContext db, CancellationToken ct) =>
            await db.Users.Where(u => u.Active).OrderBy(u => u.Name)
                .Select(u => new { u.Id, u.Name, u.Role }).ToListAsync(ct));

        auth.MapPost("/login", async (LoginRequest req, AppDbContext db, TokenService tokens, CancellationToken ct) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == req.UserId && u.Active, ct);
            if (user is null || string.IsNullOrEmpty(req.Pin) || !PinHasher.Verify(req.Pin, user.PinHash))
                return Results.Json(new { message = "PIN incorreto." }, statusCode: StatusCodes.Status401Unauthorized);
            return Results.Ok(new LoginResponse(tokens.Create(user), UserDto.From(user)));
        }).RequireRateLimiting("login");

        auth.MapGet("/me", async (System.Security.Claims.ClaimsPrincipal principal, AppDbContext db, CancellationToken ct) =>
        {
            var user = await db.Users.FindAsync([principal.UserId()], ct);
            return user is { Active: true } ? Results.Ok(UserDto.From(user)) : Results.Unauthorized();
        }).RequireAuthorization();

        var users = app.MapGroup("/api/users").RequireAuthorization("Admin");

        users.MapGet("/", async (AppDbContext db, CancellationToken ct) =>
            (await db.Users.OrderBy(u => u.Name).ToListAsync(ct)).Select(UserDto.From));

        users.MapPost("/", async (SaveUserRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var name = Validate(req);
            if (!PinHasher.IsValidPin(req.Pin)) throw new DomainException("O PIN deve ter de 4 a 8 números.");
            if (await db.Users.AnyAsync(u => u.Name == name, ct)) throw new DomainException("Já existe um usuário com esse nome.");
            var user = new User { Name = name, Role = req.Role, Active = req.Active, PinHash = PinHasher.Hash(req.Pin!) };
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);
            return Results.Ok(UserDto.From(user));
        });

        users.MapPut("/{id:int}", async (int id, SaveUserRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var user = await db.Users.FindAsync([id], ct) ?? throw new DomainException("Usuário não encontrado.", 404);
            var name = Validate(req);
            if (await db.Users.AnyAsync(u => u.Name == name && u.Id != id, ct)) throw new DomainException("Já existe um usuário com esse nome.");

            var losesAdmin = user.Role == UserRole.Admin && user.Active && (req.Role != UserRole.Admin || !req.Active);
            if (losesAdmin && !await db.Users.AnyAsync(u => u.Id != id && u.Role == UserRole.Admin && u.Active, ct))
                throw new DomainException("É preciso manter pelo menos um administrador ativo.");

            user.Name = name;
            user.Role = req.Role;
            user.Active = req.Active;
            if (!string.IsNullOrEmpty(req.Pin))
            {
                if (!PinHasher.IsValidPin(req.Pin)) throw new DomainException("O PIN deve ter de 4 a 8 números.");
                user.PinHash = PinHasher.Hash(req.Pin);
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(UserDto.From(user));
        });
    }

    private static string Validate(SaveUserRequest req)
    {
        var name = req.Name?.Trim() ?? "";
        if (name.Length is < 2 or > 80) throw new DomainException("Informe um nome com 2 a 80 caracteres.");
        return name;
    }
}
