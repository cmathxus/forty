# Forty

MVP em .NET para acelerar pedidos, vales, cargas e entregas de uma distribuidora.

## O que esta implementado

- Interface web simples em `/` para demonstrar o fluxo.
- Cadastro de regioes, vendedores, clientes, produtos e veiculos.
- Produto com dados comerciais e campos fiscais base para futura NF-e.
- Criacao de pedido usando codigo do produto e quantidade.
- Preco, descricao, unidade, peso e totais preenchidos pelo cadastro do produto.
- Marcacao de pedido como vale interno ou pedido com NF-e solicitada.
- Vendedor padrao herdado do cliente, com opcao de trocar no pedido.
- Programacao de carga por data, regiao, veiculo, placa/modelo e motorista.
- Inclusao de pedidos confirmados dentro da carga.
- Baixa da entrega com status, forma de pagamento, valor recebido e observacao.
- Resumo da carga com total, recebido, pendentes, entregues e retornados.
- Persistencia PostgreSQL com Entity Framework Core.
- Testes do fluxo principal do pedido.

## Requisitos

- .NET SDK 9
- Docker Desktop ou PostgreSQL 17 local

## Executar localmente

```powershell
$env:DOCKER_API_VERSION = "1.50"
docker compose up -d
dotnet tool restore
dotnet ef database update --project src/DudaErp.Api
dotnet run --project src/DudaErp.Api
```

O Docker publica o Postgres na porta `55432` para evitar conflito com Postgres local na porta `5432`.
Nesta maquina, o Docker Desktop respondeu corretamente usando `DOCKER_API_VERSION=1.50`.

Acesse a tela em `https://localhost:7295` ou `http://localhost:5161`.

A documentacao OpenAPI fica disponivel em `/openapi/v1.json` no ambiente de desenvolvimento. A saude da API pode ser consultada em `/health`.

Para carregar dados iniciais de demonstracao, clique em `Carregar exemplo` na tela ou chame:

```powershell
Invoke-RestMethod -Method Post http://localhost:5161/api/demo/seed
```

## Testes

```powershell
dotnet test DudaErp.sln
```

## Deploy rápido: front no GitHub Pages e back no Railway

### Frontend no GitHub Pages

O workflow `.github/workflows/pages.yml` publica automaticamente o conteúdo de:

```txt
src/DudaErp.Api/wwwroot
```

Depois do primeiro push para a branch `main`, vá no GitHub:

```txt
Settings > Pages > Build and deployment > Source: GitHub Actions
```

O front deve ficar em:

```txt
https://cmathxus.github.io/forty/
```

Quando o backend estiver no Railway, edite:

```txt
src/DudaErp.Api/wwwroot/config.js
```

E coloque a URL do Railway:

```js
window.FORTY_CONFIG = {
  apiBaseUrl: "https://sua-url-do-railway.up.railway.app"
};
```

### Backend no Railway

No Railway:

1. Crie um projeto pelo GitHub Repository.
2. Selecione `cmathxus/forty`.
3. Adicione um serviço PostgreSQL.
4. No serviço da API, configure a variável:

```txt
ConnectionStrings__Postgres=Host=...;Port=...;Database=...;Username=...;Password=...
```

O backend lê a variável `PORT` do Railway automaticamente e aplica migrations no banco ao iniciar.

## Importar planilhas

Depois de subir a API, importe os arquivos enviados pela cliente:

```powershell
curl.exe -X POST http://localhost:5161/api/import/customers -F "file=@C:\Users\akirasz\Downloads\clientes_organizados.xlsx"
curl.exe -X POST http://localhost:5161/api/import/products -F "file=@C:\Users\akirasz\Downloads\Tabela_Geral_Completa_OMIE_BlocoK_CORRETO.xlsx"
```

Clientes sem regiao/vendedor na planilha entram com regiao `Importado` e vendedor `DIRETO`.
Produtos usam `preco_caixa` como preco do pedido, porque o fluxo atual vende por caixa/fardo no vale.

## Proximas etapas

1. Autenticacao e perfis de usuario.
2. Impressao do vale em PDF com layout parecido com o papel atual.
3. Relatorio de acerto por vendedor, carga e banco.
4. Importacao da planilha atual de clientes/produtos/pedidos.
5. Integracao de NF-e via API fiscal, depois de validar dados com o contador.
