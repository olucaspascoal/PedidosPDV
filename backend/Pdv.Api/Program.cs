using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using Pdv.Api.Auth;
using Pdv.Api.Data;
using Pdv.Api.Domain;
using Pdv.Api.Endpoints;
using Pdv.Api.Payments;
using Pdv.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Render, Railway, Fly etc. informam a porta pela variável PORT.
if (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } port)
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();

// Banco: SQLite em desenvolvimento; PostgreSQL (Supabase) quando a connection string for "Host=..." ou "postgresql://...".
var connectionString = builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(connectionString))
{
    // Variável criada mas vazia (ex.: no painel da hospedagem) cairia num Npgsql sem host; em produção, falhe com mensagem clara.
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("ConnectionStrings:Default está vazia. Configure a variável ConnectionStrings__Default com a connection string do banco.");
    connectionString = "Data Source=pdv.db";
}
builder.Services.AddDbContext<AppDbContext>(o => DatabaseSetup.Configure(o, connectionString));

// Frontend hospedado em outro domínio (ex.: Hostinger): liste as origens em Cors:Origins, separadas por vírgula.
var corsOrigins = (builder.Configuration["Cors:Origins"] ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Select(o => o.TrimEnd('/'))
    // Aceita só o domínio ("meusite.com.br"): vira https://meusite.com.br e https://www.meusite.com.br.
    .SelectMany(o => o.Contains("://")
        ? new[] { o }
        : o.StartsWith("www.", StringComparison.OrdinalIgnoreCase)
            ? new[] { $"https://{o}", $"https://{o[4..]}" }
            : new[] { $"https://{o}", $"https://www.{o}" })
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod()));

// Atrás do proxy da hospedagem: usa o IP real do cliente (limite de tentativas de login) e o esquema https.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

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

app.UseForwardedHeaders();
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
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapAuthAndUsers();
app.MapCatalog();
app.MapPromotions();
app.MapOrders();
app.MapAdmin();
app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await DatabaseSetup.InitializeAsync(db, builder.Configuration["Seed:AdminPin"]);
}
app.Logger.LogInformation("Banco: {Provider}", DatabaseSetup.IsPostgres(connectionString) ? "PostgreSQL" : "SQLite");

if (string.IsNullOrWhiteSpace(mp.AccessToken))
    app.Logger.LogWarning("Mercado Pago sem access token: Pix em MODO SIMULADO.");

app.Run();
