# Paginação e busca

As listas de clientes, produtos, vendedores, regiões, veículos e usuários buscam a página exibida em `/api/lists/{recurso}?page=1&pageSize=20&search=termo`. Os filtros dessas listas são aplicados pela API. Os endpoints anteriores continuam disponíveis para os fluxos de seleção de cadastros, indicadores e relatórios; esses consumidores ainda não foram migrados para consultas específicas. Cargas e pedidos também usam filtros no servidor, conforme a seção abaixo. Financeiro, estoque e produção mantêm o comportamento anterior.

A API aceita exclusivamente 20 registros por página, valida número da página e tamanho do termo, aplica a busca antes de contar e paginar e ordena com identificador como desempate. `%`, `_` e barras são tratados literalmente na busca PostgreSQL. Cadastros inativos ficam fora da lista; usuários incluem inativos para permitir reativação. O retorno contém `items`, `total`, `page`, `pageSize` e `totalPages`. Se uma exclusão esvaziar a última página, a API retorna a última página válida; nenhum resultado produz página 1 vazia.

O frontend mantém um estado independente para cada lista e renderiza somente os itens da resposta. Digitar aguarda 300 ms e volta à página 1; respostas de buscas anteriores ou de outra sessão são descartadas. Anterior/Próxima mostram a posição no total filtrado. Falhas oferecem nova tentativa; a navegação preserva a página e o termo. Ao sair da sessão, os estados, timers e campos de busca são limpos. As páginas são consultadas ao abrir a tela e na atualização da tela visível, inclusive após salvar/excluir.

As permissões são verificadas novamente pela API: clientes para administrador/faturamento, produtos para todos os setores, demais cadastros e usuários para administrador. Usuários usam projeção explícita sem hash de senha nem carimbo de segurança.

Verificação: testes PostgreSQL em schema temporário isolado cobrem páginas completas, busca fora da primeira página, curingas literais, inativos, ordenação com empate e exclusão da última página. Testes HTTP cobrem permissões e parâmetros inválidos. Testes JavaScript cobrem envio da busca, troca de página, debounce e descarte de respostas antigas.

## Filtros de cargas e pedidos

Os filtros das listas ficam em painéis separados, acima dos registros. GET /api/delivery-loads/page recebe page/pageSize, search, stage (0 preparação, 1 em rota, 2 conferência, 3 concluída), regionId, vehicleId, driver, from/to e shortages. A API combina os critérios no PostgreSQL antes de contar e paginar em blocos de 20. Limites, identificadores e período são validados pela API. A busca usa ILIKE com curingas escapados e inclui cliente, cidade, bairro, rua, região, motorista e veículo.

GET /api/delivery-loads/filter-options retorna regiões e veículos usados nas cargas, independentemente da página atual. GET /api/delivery-loads/summary fornece totais e até três cargas em rota para o dashboard, sem baixar todas as cargas para filtrar a lista. O detalhe de uma carga acessada pelo QR é buscado por ID, inclusive fora da página e dos filtros. Exportações continuam usando a rota própria de relatório.

GET /api/lists/orders recebe search/status e a paginação comum. A lista não filtra um cache de pedidos no navegador. Respostas antigas de pesquisa e de outra sessão são descartadas. A mudança de critérios volta à primeira página.
