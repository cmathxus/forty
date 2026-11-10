# Controles dos formulários

As confirmações usam `askConfirmation(mensagem, opções)`, uma Promise resolvida pelo modal de confirmação do FORTY. As opções incluem título, texto dos botões e destaque para ação destrutiva. Cancelar, X e Escape não executam a operação. A confirmação foca Cancelar inicialmente, bloqueia pedidos duplicados e rejeita a ação se a sessão mudou enquanto o modal estava aberto. Não usar `window.confirm`, `window.alert` ou `window.prompt` nos fluxos da aplicação.

Foram substituídas confirmações de descarte ao abrir/fechar formulários, exclusões, saída da conta, descarte e registro do retorno, descarte e confirmação da conferência de entrega, descarte da confirmação de produção, cancelamento e conclusão de produção. Sair da conta sempre pede confirmação e informa quando há formulários em preenchimento. O listener beforeunload foi removido: fechar/recarregar a aba não pode abrir um modal personalizado, e o navegador não deve apresentar o alerta nativo. O descarte pelos controles do sistema continua protegido pelo modal.

Calendários Flatpickr e dropdowns Tom Select são anexados a `controlOverlayRoot`, fora dos cartões de modal que possuem overflow. `popupPlacement` calcula o lado com espaço disponível, limita largura e altura ao viewport visual e permite rolar o conteúdo quando necessário. Rolagem do formulário fecha os menus; rolagem dentro deles é preservada. Mudanças de tamanho, inclusive do teclado virtual, reposicionam os controles. Não corrigir cortes apenas aumentando z-index dentro de contêineres com overflow.

Campos de horário são aprimorados por FortyTime. A pessoa pode digitar HH:mm (ou HH:mm:ss) ou usar o relógio de 24 horas. O anel externo seleciona 1–12 e o interno 13–23/00; os minutos aceitam posições exatas pelo ponteiro ou digitação. Escolher no relógio altera apenas o rascunho até Usar horário; Cancelar/X/Escape mantém o campo original. Um campo vazio continua vazio até escolha explícita. A API continua recebendo o horário através do campo original do formulário.

As barras de rolagem usam indicador fino, arredondado e com contraste ao interagir. A rolagem permanece disponível em página, modais, listas e menus.

Verificação automatizada: `node --test tests/controls.test.mjs tests/frontend.test.mjs`. Inclui posicionamento em viewport pequeno, anéis do relógio, minutos exatos, validação de horário, confirmação assíncrona, cancelamento, troca de sessão, confirmação obrigatória do logout e verificação que proíbe chamadas a diálogos nativos na aplicação.
