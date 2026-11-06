# Revisão técnica e de usabilidade

## Entregue nesta rodada

- Autenticação com credenciais configuradas fora do Git, hash de senha, token protegido, limite de tentativas e troca de senha. Não exige confirmação de e-mail.
- CORS restrito e configuração local que evita conectar o frontend à API antiga por acidente.
- Banco Supabase em schema próprio, com migrations e bootstrap do administrador.
- Login responsivo, contraste dos botões, foco visível, teclado no modal, retorno de foco e prevenção de descarte acidental.
- Menu acessível quando minimizado, preferência persistida e recolhimento automático em telas menores.
- Estado de sincronização, atualização manual, pausa do polling durante formulários/edições e com aba oculta; intervalo de um minuto.
- Atualização dos grupos de dados em paralelo, sem sobrepor ciclos; bloqueio de envio duplicado.
- Busca de cliente por nome/nome fantasia/CNPJ corrigida; busca e situação dos pedidos; renderização em blocos de 40.
- Endpoint de pedidos paginado, com tamanho máximo de 200 e filtro de situação. O frontend percorre as páginas para manter totais e relatórios completos.
- Substituição dos itens em um único SaveChanges, com transação implícita; bloqueio de edição/exclusão de pedidos com carga ou lançamento financeiro.
- Cargas preservam os vínculos mantidos em edição. Saída, baixa e exclusão validam o estado; criação da carga e seus pedidos é atômica.
- Numeração de pedidos e cargas serializada por advisory lock transacional no PostgreSQL, evitando colisões entre criações concorrentes que usam esses fluxos.
- Bloqueio de alteração/exclusão e baixa repetida de contas já liquidadas.
- Preço negociado não vaza para outro produto; mudar quantidade recalcula o total; validação monetária no backend.
- Cadastro de cliente passa a mostrar IE, nome fantasia e complemento.
- Relatório de vendas identifica vendedor/produto em cada linha e chama vencimento pelo nome correto.
- Escape de textos nos cadastros, financeiro, pedidos, cargas, notificações e executados; mensagens de falha mais úteis.

## Limites e próximos passos

- Há somente o administrador configurado. Gestão de usuários e permissões diferentes para faturamento, financeiro e expedição continuam pendentes de definição.
- A condição 30/60 ainda representa apenas o primeiro vencimento. Parcelamento real, geração automática de recebíveis e centralização de vencimentos no backend precisam de uma etapa própria com regra comercial validada.
- A interface ainda agrega o histórico de pedidos em memória para dashboard/relatórios. Os próximos ganhos para bases grandes são endpoints agregados de dashboard, filtros por período no servidor e paginação também de cadastros/cargas/financeiro.
- As proteções de estado reduzem alterações destrutivas, mas ainda falta controle otimista de concorrência para duas pessoas editando simultaneamente. Ainda não há auditoria completa nem estorno formal de baixas.
- A numeração ainda usa Max + 1 dentro do lock; excluir o último número pode permitir sua reutilização. Uma sequência permanente exige migração e definição de política de numeração.
- Backup, restauração, monitoramento e deploy não foram configurados nesta revisão. NF-e real continua fora do escopo implementado.
- Os testes cobrem regressões específicas, sem substituir homologação com dados e documentos reais da cliente.

## Verificação

Build Release, testes de JavaScript, testes de autenticação por HTTP e teste relacional no Supabase. A API foi executada com runtime .NET 8 local. O runner .NET usa roll-forward nesta máquina, pois os SDKs instalados são 9/10 e o runtime 8 foi instalado em diretório local isolado.
