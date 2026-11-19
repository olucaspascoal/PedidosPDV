using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Pdv.Api.Auth;
using Pdv.Api.Data;
using Pdv.Api.Domain;
using Pdv.Api.Endpoints;
using Pdv.Api.Payments;
using Pdv.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();

// Banco: SQLite em desenvolvimento. Para PostgreSQL, troque por UseNpgsql (pacote Npgsql.EntityFrameworkCore.PostgreSQL).
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=pdv.db"));

// Autenticação por PIN + JWT
var jwt = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (Encoding.UTF8.GetByteCount(jwt.Key) < 32)
    throw new InvalidOperationException("Configure Jwt:Key com pelo menos 32 caracteres (appsettings ou variável Jwt__Key).");
builder.Services.AddSingleton(jwt);
builder.Services.AddSingleton<TokenService>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = jwt.Issuer,
        ValidAudience = jwt.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
        NameClaimType = "name",
        RoleClaimType = "role",
        ClockSkew = TimeSpan.FromMinutes(1),
    };
});
builder.Services.AddAuthorizationBuilder().AddPolicy("Admin", p => p.RequireRole(nameof(UserRole.Admin)));

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

// Mercado Pago: sem access token, roda o Pix simulado para desenvolvimento.
var mp = builder.Configuration.GetSection("MercadoPago").Get<MercadoPagoOptions>() ?? new MercadoPagoOptions();
builder.Services.AddSingleton(mp);
if (string.IsNullOrWhiteSpace(mp.AccessToken))
    builder.Services.AddSingleton<IPixGateway, SimulatedPixGateway>();
else
    builder.Services.AddHttpClient<IPixGateway, MercadoPagoPixGateway>(c =>
    {
        c.BaseAddress = new Uri("https://api.mercadopago.com/");
        c.Timeout = TimeSpan.FromSeconds(20);
    });

builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<PaymentService>();

var app = builder.Build();

app.UseExceptionHandler();
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (DomainException ex) when (!ctx.Response.HasStarted)
    {
        ctx.Response.StatusCode = ex.StatusCode;
        await ctx.Response.WriteAsJsonAsync(new { message = ex.Message });
    }
});

app.UseDefaultFiles();
app.UseStaticFiles(); // frontend compilado em wwwroot (produção)
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapAuthAndUsers();
app.MapCatalog();
app.MapOrders();
app.MapAdmin();
app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();
    await Seed.RunAsync(db);
}

if (string.IsNullOrWhiteSpace(mp.AccessToken))
    app.Logger.LogWarning("Mercado Pago sem access token: Pix em MODO SIMULADO.");

app.Run();
