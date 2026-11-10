# Usuários e acessos

Divisão confirmada em 10/11/2026. Cada usuário tem um dos quatro perfis abaixo.

| Perfil | Acesso |
|---|---|
| Administrador | Todas as áreas. Gerencia usuários, perfis, senhas e status das contas. Mantém os cadastros gerais, faz entradas avulsas e ajustes de saldo do estoque. |
| Faturamento | Cadastro de clientes, lançamento/edição de pedidos, executados, contas a pagar/receber e relatórios de vendas e clientes. |
| Expedição | Montagem de cargas, saída, documentos de expedição, conferência por produto de entregas/devoluções/faltas e registro dos valores recebidos na entrega. Consulta os pedidos necessários à montagem da carga. Não acessa as contas financeiras. |
| Produção | Cria e consulta programações, imprime listas e confirma a fabricação. A confirmação da programação soma o que foi produzido ao estoque. |

Todos consultam produtos e saldos de estoque. Só o administrador altera o catálogo e acessa o histórico completo de movimentos manuais. Regiões, vendedores e veículos podem ser consultados como referências nos fluxos que deles dependem; sua manutenção é do administrador.

## Gestão da equipe

No perfil administrador, abra Cadastros → Usuários e acessos. Novo usuário pede nome, e-mail, perfil e senha inicial de pelo menos oito caracteres. O e-mail é o identificador do login, sem confirmação por e-mail. O sistema não envia senhas por mensagem; a comunicação da senha inicial deve ser feita pelo administrador.

Editar acesso permite alterar dados, setor e ativar/desativar a conta. Contas inativas ficam no histórico e não podem entrar. Redefinir senha altera a senha de outra conta; a própria senha é alterada no perfil, informando a senha atual. A própria conta não pode ser desativada nem perder seu acesso de administrador. Alterações concorrentes também não podem deixar o sistema sem um administrador ativo.

## Aplicação das regras

As permissões são definidas em AccessRules e aplicadas por políticas ASP.NET na API. Esconder um menu não substitui a autorização: chamadas diretas a áreas não permitidas recebem 403; chamadas sem sessão recebem 401. Endpoints novos sem regra explícita exigem administrador por padrão.

O endpoint /api/auth/me informa os dados da conta e as permissões. O frontend carrega somente os módulos autorizados e encaminha o usuário para a tela do seu setor. Não há cadastro público nem opção de escolher o perfil no login.

Edição do usuário, troca/redefinição de senha e desativação renovam o security stamp, revogando os tokens anteriores. Cada requisição verifica a conta ativa, o stamp e o perfil atual no banco. Os endpoints de usuários nunca retornam hashes de senha ou stamps.

Esta alteração usa o campo Role já existente em Users e não exige migration. Nenhum usuário adicional é criado automaticamente; o administrador inicial é preservado.

## Verificação

Testes HTTP usam login real e tokens de cada perfil para verificar permissões de leitura/escrita, bloqueios, revogação e gestão de usuários. Não acessam a base de produção. O teste relacional cria um schema temporário e verifica a proteção do último administrador sob duas alterações simultâneas. Testes do frontend verificam menus, atalhos, ações e tela inicial de cada setor.

Nesta máquina, os testes HTTP devem usar o runtime .NET 8 local. Com SDKs 9/10, use um arquivo .runsettings com RunConfiguration/DotNetHostPath apontando para o dotnet.exe do runtime 8, em vez de executar o TestHost 8 com roll-forward para outro runtime.
