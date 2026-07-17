FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY DudaErp.sln ./
COPY src/DudaErp.Api/DudaErp.Api.csproj src/DudaErp.Api/
COPY tests/DudaErp.Api.Tests/DudaErp.Api.Tests.csproj tests/DudaErp.Api.Tests/

RUN dotnet restore DudaErp.sln

COPY . .
RUN dotnet publish src/DudaErp.Api/DudaErp.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production
ENTRYPOINT ["dotnet", "DudaErp.Api.dll"]
