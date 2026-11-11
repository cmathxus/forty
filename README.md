# FORTY

O FORTY organiza pedidos, expedição, estoque, produção e financeiro para uma distribuidora de alimentos e doces. Este README registra as decisões de produto e engenharia desde o MVP para orientar quem voltar ao projeto depois de um tempo.

Caio desenvolve o sistema e Duda valida os fluxos com a operação. O ponto de partida foi o retrabalho entre sistemas antigos, planilhas e papel, especialmente no faturamento e na separação de cargas. A migração fiscal do catálogo para o Omie era uma dificuldade relatada. Como uma indisponibilidade interrompe o faturamento, estabilidade, recuperação e suporte fazem parte da preparação para uso diário.

## Evolução do projeto

| Período | Decisões registradas | Referências no Git |
|---|---|---|
| Julho de 2026 | O MVP reuniu cadastros, pedidos por código de produto, cargas por região, baixa de entregas, importação e financeiro. O primeiro plano de publicação combinava Pages e Railway. A API passou a usar .NET 8 e depois foi apontada para uma VM com systemd e Caddy. | `78b1f35`, `6b6f3f0`, `e4b0dfe` |
| Julho de 2026, feedback da Duda | O vale ganhou o nome Executado. Entraram preço negociado, condições de pagamento, contatos do vendedor e relatórios mais próximos do trabalho de expedição. O dashboard passou a ser a entrada da operação. | `fddab72`, `b40f96a` |
| 5 de novembro de 2026 | A revisão trouxe login, Supabase em schema próprio, validações de negócio e uma identidade visual do FORTY. O ambiente de demonstração passou a apontar para o Render. | `0302950`, `c8ec730`, `ea01e67` |
| 6 de novembro de 2026 | Contagem inicial, movimentos de estoque, conferência por item e programação de produção passaram a cobrir o que saía, voltava ou precisava ser fabricado. A correção da confirmação de produção passou a ler o campo de quantidade explicitamente. | `17732b0`, `811ed94` |
| 10 de novembro de 2026 | Foram confirmados quatro perfis. A conferência passou a registrar faltas por produto e responsáveis, com QR por carga no romaneio. A interface separou lista, detalhes e etapas. | `aea38fa`, `a13d203`, `9ef0658`, `7e3fd53` |
| 10 de novembro de 2026 | Entraram paginação dos cadastros, registro da chegada real ao depósito, controles de formulário compartilhados, renovação de sessão e feedback animado de carregamento. | `d824042`, `4bb757b`, `38695e3`, `2dfa570` |

## Pedidos, cadastros e financeiro

- **Código do produto.** O pedido parte do código e da quantidade. Descrição, unidade, peso e preço vêm do catálogo. O item guarda os dados comerciais usados na operação. Preço e total negociados são permitidos e validados pela API. Trocar o código limpa a negociação do produto anterior, e mudar a quantidade recalcula o total.
- **Cliente e vendedor.** O cliente é escolhido explicitamente em um novo pedido. O vendedor do cliente é a referência padrão da regra de negócio e pode ser substituído no pedido. Região é um agrupamento operacional para montar rotas com frota própria.
- **Executado.** É o documento interno que a equipe chamava de vale. A interface usa o nome pedido pela Duda, a rota `/api/orders/{id}/vale` mantém a compatibilidade e a impressão gera três vias. O campo **Emitir NF-e** guarda a intenção fiscal. A emissão autorizada fica no escopo futuro de integração.
- **Condições de pagamento.** O formulário sugere o vencimento conforme a condição escolhida. A opção 30/60 ddl representa hoje o primeiro vencimento, em 30 dias. Parcelamento com valores e vencimentos separados ainda depende de regra comercial.
- **Histórico.** Pedidos vinculados a cargas ou lançamentos financeiros têm restrições de edição e exclusão. Cadastros que já fazem parte do histórico podem ser inativados. A API protege contas liquidadas contra alteração, exclusão e baixa repetida.
- **Contas e alertas.** Contas a pagar e a receber têm fluxos próprios. O sino é calculado no navegador a partir das contas a pagar da API. Ele indica contas abertas vencidas ou com vencimento nos próximos sete dias. O sistema ainda carece de um serviço de notificações persistentes ou envio externo.
- **Importação.** O catálogo inicial veio de planilhas de clientes e produtos. Os endpoints `/api/import/customers` e `/api/import/products` recebem `multipart/form-data` no campo `file`. Clientes sem referências usam a região `Importado` e o vendedor `DIRETO`. Produtos usam `preco_caixa` para a venda por fardo (`FD`). Preço unitário e códigos de barras internos ficam em campos separados. A importação informa criados, atualizados, ignorados, duplicados e avisos. A planilha de catálogo não informa saldo físico.
- **Relatórios.** Pedidos, vendas, cargas, carregamento, clientes, produtos, estoque e produção têm relatórios operacionais. O navegador imprime o HTML ou salva como PDF. O romaneio preserva código, descrição, quantidade e unidade de venda em colunas próprias. A quantidade de fardos permanece na unidade de venda ao imprimir.

## Cargas, retorno e estoque

A lista de cargas mostra o essencial para identificar cada saída. Os detalhes seguem **Preparação → Em rota → Conferência → Concluída**, com a próxima ação em destaque. Romaneio, relatórios, edição e exclusão ficam em **Opções da carga**, conforme a etapa.

1. Monte a carga com data, região, veículo, motorista e pedidos confirmados da região. A criação grava a carga e seus vínculos em conjunto. Depois da saída, o histórico da carga limita edição e exclusão.
2. Antes de despachar, registre a contagem física inicial do produto. A contagem informa o saldo observado. O sistema grava como ajuste a diferença para o saldo atual. Uma saída debita o estoque na unidade de venda e só é confirmada se houver saldo para todos os itens.
3. Registre a data e hora reais da chegada ao depósito. O sistema guarda também quem lançou a chegada e quando fez o registro. A chegada tira a carga do contador em rota e é independente do horário da conferência dos pedidos.
4. Confira por pedido e produto o que foi entregue e o que voltou fisicamente. O faltante é `saída − entregue − devolvido` e exige uma observação. Somente o retorno físico repõe estoque. A conferência registra responsável, horário e valores recebidos. A opção de entrega não realizada pede a contagem real, porque a quantidade que voltou pode ser menor que a que saiu.
5. Consulte o consolidado por produto ou imprima a conferência. As quantidades permanecem separadas por unidade. Pedidos pendentes e históricos sem contagem são identificados à parte. Cargas antigas sem débito de saída podem ser conferidas e preservam a regra que impede crédito retroativo.

O estoque é calculado pelo histórico de movimentos. Entradas, ajustes, saídas, retornos e produção têm origem e responsável. Ajustar um erro de saldo gera uma nova contagem com motivo. Operações que competem pelo mesmo saldo são serializadas no PostgreSQL. Reenvios de movimentos e baixas são protegidos contra duplicação. Trocar a unidade de um produto com movimentos ou inativar um produto com saldo é bloqueado.

**QR no romaneio.** A Duda queria facilitar a conferência que era feita no papel ou só pela contagem do caminhão. Cada carga recebe um QR ao gerar o relatório, inclusive cargas já cadastradas. O código carrega o endereço da tela com o identificador da carga, mantém o destino após o login e abre os detalhes para quem tem acesso à expedição. A leitura serve para localizar a carga. A equipe continua contando e confirmando os itens, e é essa confirmação que movimenta estoque. Etiquetas por item e leitura automática ficaram para avaliação.

## Produção

A programação serve para passar à equipe o que fabricar. Ela registra data, observações e quantidades por produto. A lista impressa destaca código, embalagem, unidade e quantidade planejada, com espaço para preencher o realizado.

A fabricação só entra no estoque quando alguém confirma a quantidade realmente produzida e a data. Uma programação pode ser concluída ou cancelada, preservando o histórico. Produção avulsa atende o que foi fabricado fora de uma programação. Uma mesma fabricação deve ser lançada uma vez, pelo fluxo que a originou. Receitas, consumo de matéria-prima, lotes, validade e múltiplos depósitos ficam para uma etapa futura.

## Acessos e sessões

| Perfil | Responsabilidade |
|---|---|
| Administrador | Acesso completo, cadastro geral, gestão de usuários, entradas avulsas e ajustes de estoque. |
| Faturamento | Clientes, pedidos, executados, contas e relatórios de faturamento. |
| Expedição | Montagem, saída, retorno, documentos, conferência e recebimentos registrados na entrega. Consulta os pedidos necessários à carga. |
| Produção | Programação, impressão e confirmação da fabricação. |

Todos consultam produtos e saldos. A matriz completa e as permissões de referência estão em [Usuários e acessos](docs/ACESSOS.md). A API aplica as políticas de `AccessRules` e o frontend usa as mesmas permissões para menus e ações. A administração da equipe protege a própria conta e o último administrador ativo.

O login usa e-mail como identificador e senha com hash. A equipe é cadastrada pelo administrador e pode entrar sem etapa de confirmação de e-mail. O administrador inicial vem da configuração da instalação, e reiniciar o serviço preserva a senha existente. Login tem limite de tentativas por IP. Alterar senha, perfil ou estado da conta invalida sessões anteriores pelo `SecurityStamp` e pelas verificações da API.

O acesso evoluiu do token de oito horas guardado na aba para um access token de 15 minutos com renovação automática e sessão de até 30 dias por login. Os tokens ficam no `localStorage` da origem do frontend para sobreviver ao fechamento do navegador. O refresh gira a cada uso e o logout revoga a sessão do dispositivo quando alcança a API. As chaves de Data Protection ficam no PostgreSQL para preservar sessões entre reinícios do backend. [Detalhes de renovação e revogação](docs/SESSOES.md).

## Interface e consultas

- **Identidade.** A marca usa índigo na navegação, ultramarino nas ações e laranja nos destaques. IBM Plex Sans é a tipografia da interface e Barlow é usada na marca. O dashboard mostra pedidos confirmados, preparação, cargas em rota e próximos passos a partir dos dados operacionais. A proposta de uma paleta verde ficou adiada. [Identidade visual](docs/IDENTIDADE.md).
- **Formulários.** A lista recebe o espaço principal. O botão de adição abre o modal de cadastro, e os atalhos da home usam os mesmos formulários de pedido e carga. Novos registros começam vazios, com placeholders. Edição recupera o registro existente. O X fica à direita no cabeçalho e as ações ficam à direita no rodapé. Descarte e exclusão usam a confirmação da aplicação. Calendários, dropdowns, relógio e checkboxes têm controles compartilhados. [Controles de interface](docs/CONTROLES-DE-INTERFACE.md).
- **Carregamento.** A abertura e o login usam uma tela animada. Consultas e salvamentos usam um indicador discreto quando a resposta demora. As animações respeitam movimento reduzido. A atualização periódica ocorre a cada minuto e pausa durante edição ou com a aba oculta, para preservar o trabalho em andamento.
- **Filtros.** A regra para listas é aplicar busca, filtros e paginação na API. O navegador envia os critérios e apresenta a página recebida. Os controles ficam em um painel acima e fora da lista ou tabela. Clientes, produtos, vendedores, regiões, veículos e usuários já usam essa paginação na `main`, com 20 registros por página. [Paginação e busca](docs/PAGINACAO.md).

**Estado local em 11/11/2026.** A cópia de trabalho já tem o modal de novo pedido na tela de pedidos, filtros e paginação de cargas e pedidos na API, filtros em painéis separados, ajuste de espaçamento das listas e navegação compacta em telas estreitas. Em cargas, os critérios incluem etapa, região, veículo, motorista, período, faltas e busca por carga, cliente ou localização. O QR busca o detalhe pelo ID mesmo fora da página atual. Essas mudanças estavam pendentes de publicação quando este registro foi escrito. A última revisão de código na `main` antes deste README é `2dfa570`.

## Arquitetura e ambientes

| Parte | Escolha |
|---|---|
| API | C# e ASP.NET Core 8 em `src/DudaErp.Api`. FORTY é a marca pública. `DudaErp` permanece nos nomes internos e no executável por compatibilidade. |
| Persistência | PostgreSQL no Supabase, com EF Core 8 e Npgsql. `Data/Migrations` guarda as mudanças de schema. `Services` concentra regras como preço e estoque. |
| Interface | HTML, CSS e JavaScript em `wwwroot`. O mesmo conteúdo estático é servido pela API local e publicado no Pages. Fontes, Tom Select, Flatpickr e biblioteca de QR estão no repositório. |
| Publicação | GitHub Pages publica `wwwroot` pela Action em pushes na `main`. O frontend aponta para a API no Render em `wwwroot/config.js`. O Dockerfile empacota a API em .NET 8. |
| Banco e histórico | A conexão Supabase usa pooler de sessão. O schema `forty` isola as tabelas da aplicação e o `__EFMigrationsHistory`. A configuração explícita do schema do histórico evita a tentativa de recriar uma tabela que já existe em `forty`. |

A configuração remota aponta para [FORTY no Pages](https://cmathxus.github.io/forty/) e [API no Render](https://forty-3ot8.onrender.com/health). Railway foi uma proposta inicial. A VM com systemd e Caddy é uma referência histórica. O banco e as credenciais são fornecidos por configuração externa. O CORS permite as origens necessárias. Login, renovação e arquivos estáticos têm as exceções de acesso previstas na API, e `/health` é público.

Em desenvolvimento, use PostgreSQL local ou externo. Docker é opcional. O Compose permanece como alternativa para subir PostgreSQL de desenvolvimento. O frontend de `localhost` e `127.0.0.1` usa a API da mesma origem.

## Retomar o desenvolvimento

1. Confira `git status` e a branch `main`. Preserve mudanças em andamento. Para uma branch nova, use o prefixo `codex/`.
2. Instale SDK e runtime ASP.NET Core 8 e Node.js. Restaure com `dotnet tool restore` e compile com `dotnet build DudaErp.sln -c Release`.
3. Configure `ConnectionStrings:Postgres`, `Authentication:AdminEmail` e `Authentication:AdminPassword` em user-secrets ou variáveis de ambiente. Variáveis usam `__` no lugar de `:`. O formato Npgsql para Supabase é `Host=HOST;Port=5432;Database=postgres;Username=USUARIO;Password=SENHA;SSL Mode=Require;Search Path=forty`. Converta a URI de conexão para esse formato e mantenha os segredos fora do Git.
4. Confira qual banco está configurado antes de iniciar. A API aplica migrations no startup. Use uma base de desenvolvimento para alterações e testes. Publicação e intervenções em dados de produção dependem de pedido explícito.
5. Inicie com `dotnet run --project src/DudaErp.Api --launch-profile http`. Em Windows, `scripts/start-local.ps1` também compila e roda usando o runtime 8 local quando disponível. [Abrir FORTY local](http://127.0.0.1:5161/).

```powershell
dotnet test DudaErp.sln -c Release
node --test tests/*.test.mjs
```

Os testes relacionais usam `FORTY_TEST_CONNECTION` em um banco com permissão para criar e remover schemas `forty_test_*`. Sem a variável, são ignorados. Os testes HTTP externos de `tests/auth.test.mjs` usam `FORTY_TEST_BASE_URL`, `FORTY_TEST_EMAIL` e `FORTY_TEST_PASSWORD`. Para o TestHost, use runtime .NET 8. Em uma máquina com SDKs mais novos e runtime 8 separado, aponte `RunConfiguration/DotNetHostPath` do `.runsettings` para o `dotnet.exe` desse runtime. Combine a verificação automatizada com homologação dos fluxos e documentos reais antes de uso diário.

## Decisões ainda em aberto

- **Emissão fiscal.** Definir fornecedor, validar catálogo e regras com o contador e tratar certificado, homologação, autorização, rejeição, XML, DANFE e eventos. Custos e escopo da integração são negociados à parte.
- **Financeiro.** Validar parcelamento real, data base do vencimento, geração automática de recebíveis e acerto por vendedor, carga, forma de pagamento e banco. A decisão precisa evitar duplicar lançamentos que a equipe já faz manualmente.
- **Integridade e escala.** A numeração de pedidos e cargas usa `Max + 1` sob lock transacional e pode reutilizar o último número excluído. Definir uma sequência permanente se isso for necessário. Auditoria completa, concorrência otimista na edição, estorno formal e migração dos filtros remanescentes de relatórios e outras áreas para o servidor continuam em aberto.
- **Produção.** Foram sugeridos filtros por situação, prioridade visual para atrasos, colunas de planejado e produzido e resumo por produto com unidades separadas. São propostas de interface para validar com a equipe.
- **Operação.** Definir backup e restauração testada, monitoramento, ambiente de homologação separado, contingência e canal de suporte. Houve proposta de valores separados para implantação, infraestrutura e manutenção. Aceite, disponibilidade e prazo de atendimento dependem do acordo comercial.

Para entender mudanças antigas, consulte [a revisão técnica de novembro](docs/REVISAO.md), [o fluxo de estoque, retorno e QR](docs/ESTOQUE-E-RETORNO.md) e os commits da linha do tempo. Quando uma decisão mudar, atualize este README com a regra nova e a referência do commit para manter o contexto recuperável.
