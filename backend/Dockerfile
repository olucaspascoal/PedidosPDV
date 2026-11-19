# API do PDV — build: docker build -t pdv-api ./backend
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY Pdv.Api/Pdv.Api.csproj Pdv.Api/
RUN dotnet restore Pdv.Api/Pdv.Api.csproj
COPY Pdv.Api/ Pdv.Api/
RUN dotnet publish Pdv.Api/Pdv.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Pdv.Api.dll"]
