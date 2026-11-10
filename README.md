# FORTY

Sistema de gestão operacional para distribuidoras. API ASP.NET Core 8, PostgreSQL/EF Core 8 e interface em HTML, CSS e JavaScript.

## Funcionalidades

- Login com e-mail e senha, sem confirmação de e-mail; sessão de oito horas e troca de senha.
- Dashboard, cadastros, pedidos/executados, cargas, baixa de entregas e contas a pagar/receber.
- Importação de clientes/produtos por planilha e relatórios com impressão do navegador.
- Executado é um documento operacional; a marcação de NF-e não realiza emissão fiscal.

## Desenvolvimento local

Requer SDK e runtime ASP.NET Core 8 e Node.js para os testes do frontend. Docker é opcional; pode ser usado PostgreSQL externo/Supabase.

1. Restaure e compile: `dotnet tool restore` e `dotnet build DudaErp.sln -c Release`.
2. Configure `ConnectionStrings:Postgres`, `Authentication:AdminEmail` e `Authentication:AdminPassword` em user-secrets do projeto ou variáveis de ambiente (com `__` no lugar de `:`). Nunca grave credenciais no repositório.
3. Execute `dotnet run --project src/DudaErp.Api --launch-profile http`.
4. Acesse [FORTY local](http://localhost:5161).

Nesta máquina, `scripts/start-local.ps1` compila e inicia usando o runtime 8 instalado no diretório local do usuário. Ele usa os mesmos user-secrets e não inicia Docker.

A conexão Npgsql usa o formato `Host=HOST;Port=5432;Database=postgres;Username=USUARIO;Password=SENHA;SSL Mode=Require;Search Path=forty`. A URI PostgreSQL precisa ser convertida para esse formato. Use a porta de session pooling do Supabase.

Com `Search Path=forty`, o startup cria esse schema e mantém seu histórico de migrations nele. As tabelas de outros schemas não são apagadas. Sem essa opção, mantém o comportamento anterior de usar o schema padrão. Migrations são aplicadas automaticamente ao iniciar: confira o banco configurado antes de executar.

O administrador é criado somente se o e-mail configurado ainda não existir; reiniciar não redefine sua senha. A senha fica armazenada com hash PBKDF2. A troca de senha invalida sessões anteriores. Não há cadastro público nem envio de e-mail. A interface mantém o token apenas na sessão da aba; sair limpa a sessão local.

Em localhost/127.0.0.1, o frontend usa a mesma origem da API. A URL remota em `wwwroot/config.js` permanece para o frontend publicado. O usuário de teste desta instalação foi configurado somente em user-secrets.

## Validação

- `node --check src/DudaErp.Api/wwwroot/app.js`
- `node --test tests/frontend.test.mjs`
- `dotnet test DudaErp.sln -c Release`

Os testes PostgreSQL exigem `FORTY_TEST_CONNECTION` e permissão para criar/remover schemas temporários. Eles aplicam as migrations em schemas próprios `forty_test_*` e os removem ao terminar, sem alterar as tabelas da aplicação. Sem a variável, aparecem como ignorados. Prefira um banco dedicado de testes.

Os testes HTTP em `tests/auth.test.mjs` exigem `FORTY_TEST_BASE_URL`, `FORTY_TEST_EMAIL` e `FORTY_TEST_PASSWORD`, com a API em execução. Rode `node --test tests/auth.test.mjs`. Sem configuração, aparecem como ignorados.

## Segurança e operação

Todos os controllers exigem autenticação. Login, arquivos estáticos e `/health` são públicos. O login limita tentativas por IP. CORS permite GitHub Pages e as origens locais padrão; ajuste `Cors:AllowedOrigins` para outras origens. Não há endpoint público de registro de usuários.

Os perfis Administrador, Faturamento, Expedição e Produção têm permissões diferentes na API e na interface. Somente o administrador gerencia usuários em Cadastros → Usuários e acessos (`/api/users`). Alterar o acesso, desativar a conta ou redefinir a senha revoga as sessões anteriores. Veja [a divisão de acessos](docs/ACESSOS.md).

As chaves de ASP.NET Data Protection protegem os tokens. Em produção, preserve o diretório de chaves da conta do serviço entre deploys e compartilhe-o se houver múltiplas instâncias. Não use a senha de teste em uma implantação real.

O workflow do GitHub Pages publica o frontend em pushes na main. O backend histórico usa systemd/Caddy. Esta revisão não faz deploy nem troca a configuração remota para o novo banco.

Veja [a revisão técnica](docs/REVISAO.md) para decisões, limites e próximos passos.
