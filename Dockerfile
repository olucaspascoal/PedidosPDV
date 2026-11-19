# PDV completo (site Angular + API) em um container só: a API serve o site e a /api no mesmo endereço.
# Build: docker build -t pdv .        (no Coolify: Base Directory "/", Dockerfile "/Dockerfile")
# Só a API (site hospedado em outro lugar): use backend/Dockerfile.

# 1) Site Angular → backend/Pdv.Api/wwwroot (outputPath do angular.json)
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build

# 2) API, já com o site em wwwroot
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src/backend
COPY backend/Pdv.Api/Pdv.Api.csproj Pdv.Api/
RUN dotnet restore Pdv.Api/Pdv.Api.csproj
COPY backend/Pdv.Api/ Pdv.Api/
COPY --from=web /src/backend/Pdv.Api/wwwroot/ Pdv.Api/wwwroot/
RUN dotnet publish Pdv.Api/Pdv.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0
# curl para o health check (o Coolify usa o HEALTHCHECK do container)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT:-8080}/api/health" || exit 1
USER app
ENTRYPOINT ["dotnet", "Pdv.Api.dll"]
