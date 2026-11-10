# Estoque e conferência do retorno

Os áudios de 02/11/2026 pedem controle dos produtos que voltam das entregas, identificação de faltas nas cargas e estoque da empresa. O outro ponto levantado é disponibilidade de suporte; isso depende de um acordo comercial e não foi convertido em promessa de atendimento.

## Operação

1. Em Operação → Estoque, use Movimentar estoque → Contagem física para informar o saldo real de cada produto. O catálogo importado não informa estoque e nenhum saldo é presumido.
2. Entradas posteriores podem ser registradas com quantidade e motivo/documento. A contagem informa o saldo final contado, não uma quantidade a somar. A diferença gera um movimento de ajuste.
   Para fabricação própria, selecione Produção de produtos acabados: informe produto, quantidade, data da produção e referência (por exemplo, turno ou lote). O lançamento soma ao saldo e fica identificado como Produção no histórico. Não há consumo automático de matérias-primas, pois receitas/composição não foram informadas.
3. Marcar a saída de uma carga debita os itens dos pedidos, na unidade de venda. Estoque insuficiente bloqueia a saída inteira, sem movimentações parciais.
4. Para cada pedido em rota, abra Conferir entrega e retorno. Informe as quantidades entregues ao cliente e devolvidas fisicamente ao depósito. Faltante = saída − entregue − devolvido.
5. Faltas exigem uma observação. Somente o retorno físico repõe estoque. A baixa registra os itens, o valor recebido e os movimentos em uma transação.
6. Conferência da carga imprime saída, entregue, devolvido, faltante e observações de cada produto/pedido. A posição de estoque também pode ser impressa. Não soma unidades diferentes como se fossem equivalentes.

## Programação para a equipe de produção

A tela Operação → Produção permite criar uma programação com data, observação e lista de produtos/quantidades. Imprimir lista de produção gera uma folha com código, descrição, unidade e quantidade a produzir em destaque, além de espaço para anotar a produção real e a conferência. A programação não soma estoque nem presume que a fabricação foi realizada.

Após a fabricação, Confirmar produção solicita data e quantidade efetivamente produzida em cada item. Só essas quantidades geram movimentos de estoque, uma única vez. Exemplo: planejar 100 e confirmar 90 soma 90 ao saldo. Itens que não foram produzidos podem ser informados com zero; se nenhum foi produzido, a programação deve ser cancelada. Programações concluídas ou canceladas preservam o histórico e não podem ser concluídas novamente.

Produção avulsa continua disponível em Movimentar estoque para fabricação que não veio de uma programação. Uma produção programada deve ser confirmada pela própria programação, sem ser lançada também como movimento avulso.

A divisão de acesso por setor foi posteriormente confirmada e implementada. Consulte ACESSOS.md.

## Integridade e histórico

- Saída e baixa repetidas são bloqueadas. Entradas manuais usam identificador de requisição para evitar duplicação por reenvio.
- Operações de estoque são serializadas por lock transacional no PostgreSQL: duas cargas não podem consumir o mesmo saldo.
- Não é possível trocar a unidade de produto com histórico de estoque ou inativar produto com saldo. A importação também preserva essa restrição.
- Cargas já em rota antes desta alteração podem receber conferência, mas não geram crédito retroativo, pois não tiveram saída debitada. Relatórios identificam pedidos antigos sem conferência.
- Não há exclusão de movimentos pela API. Correções de saldo usam uma nova contagem com motivo. O histórico conserva data, origem e usuário responsável.
- A lista apresenta os últimos 100 movimentos; o saldo considera o histórico completo.

## Implantação e verificação

As migrations InventoryControl, ProductionDate e ProductionPlanning adicionam StockMovements, DeliveryItemResults, o indicador InventoryTracked, a data de fabricação e as programações de produção. São aditivas e não preenchem saldo nem reescrevem entregas antigas. Não foram aplicadas às tabelas de produção durante o desenvolvimento.

Os testes PostgreSQL criam schemas temporários forty_test_* com migrations próprias e os removem ao terminar. Não usam as tabelas da aplicação. Cobrem concorrência de saída, devolução parcial com falta, repetição de movimentos/baixas e compatibilidade de cargas antigas. Testes JavaScript verificam a conferência de quantidades.

Reservas de estoque, lotes/validade, múltiplos depósitos e estorno de baixa não foram solicitados nesses áudios e não fazem parte desta implementação.
