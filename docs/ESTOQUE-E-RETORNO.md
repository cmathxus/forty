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

## Entregas não realizadas e faltas no retorno

Em Cargas e entregas, o quadro Saída e retorno por produto consolida as quantidades da carga, agrupando produtos sem misturar unidades de venda. Apresenta saiu (ou a sair, enquanto a carga está aberta), entregue, voltou, faltante e quantidade ainda a conferir. Pedidos antigos sem conferência aparecem em uma coluna separada, sem presumir que houve falta ou que tudo voltou. Cargas com faltas abrem o quadro automaticamente e podem ser localizadas pelo filtro Mostrar somente cargas com produtos faltantes.

No pedido em rota, Entrega não realizada — informar o que voltou zera a quantidade entregue e o recebimento financeiro, mas deixa o retorno para contagem manual. Exemplo: saíram dez fardos, não houve entrega e voltaram oito; a conferência registra dois faltantes e exige uma observação. Somente os oito que voltaram são repostos no estoque.

A saída registra nome do usuário e data/hora. A baixa registra quem conferiu, a data/hora e a observação do pedido. O relatório inclui esses dados, motorista/veículo, resumo por produto e detalhamento por pedido. Para registros anteriores, nomes e horários ausentes permanecem Não registrado: a migration DeliveryReconciliationAudit só adiciona colunas opcionais e não inventa informações históricas.

Todos os novos pedidos de baixa, inclusive em cargas históricas, exigem a conferência dos itens. A proteção que evita créditos retroativos em cargas sem débito de estoque continua valendo.

## QR Code no romaneio

Carregamento expedição imprime um QR Code por carga, também no relatório agrupado por região e no PDF salvo pelo navegador. O código contém apenas o endereço do frontend com #conferencia=ID_DA_CARGA. A geração é local, em SVG com margem branca, sem serviço externo. O endereço conserva o domínio e o caminho da instalação (inclusive /forty/ no Pages) e remove parâmetros da URL. Para testar no celular, imprima a partir de um endereço publicado e acessível; localhost do computador não é acessível no celular.

Use a câmera do celular para abrir o link. Se necessário, faça login: o destino permanece até a autenticação. Somente expedição ou administrador pode abrir a conferência; as políticas da API continuam exigindo autenticação e permissão. A carga aparece isolada, identificada pelo número, motorista e veículo, com botão para ver todas. Cargas ainda não despachadas aguardam saída; pedidos já conferidos mostram o resultado, sem permitir outra baixa. Carga inexistente ou link inválido informa o erro.

Escanear não altera estoque e não conta produtos. A pessoa conta fisicamente o retorno e preenche entregue/voltou por produto e pedido. A confirmação existente calcula faltas, exige observação quando há divergência e registra o responsável. Não há etiqueta individual, leitura de itens nem baixa automática nesta etapa.

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
