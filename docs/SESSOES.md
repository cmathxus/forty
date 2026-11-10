# Sessões e renovação automática

O login emite access token de 15 minutos e refresh token protegido pelo ASP.NET Core. A sessão do dispositivo dura no máximo 30 dias desde o login; a renovação não estende esse limite. O frontend renova antes de enviar uma requisição perto do vencimento ou, se receber 401, tenta renovar e repetir a requisição uma única vez. Não repete erros 403, falhas de rede ou erros de servidor.

Os tokens ficam juntos em `localStorage` na origem do frontend, permitindo reabrir o navegador. Não são colocados em URLs nem enviados a serviços externos. A integração usa JSON e Authorization, sem cookies entre GitHub Pages e Render. Requisições simultâneas compartilham uma renovação; Web Locks serializa a rotação entre abas nos navegadores que suportam a API. Alterações de sessão em outra aba são sincronizadas. Falha temporária de rede preserva os tokens para tentar novamente.

AuthSessions registra usuário, identificador, validade, revogação e nonce de rotação. Não armazena o refresh token em texto. Cada renovação substitui o nonce atomicamente no PostgreSQL: um refresh já utilizado não pode ser reutilizado. Sair revoga a sessão do dispositivo e limpa os tokens locais. Se a saída acontecer sem conexão, a limpeza local funciona, mas a revogação no servidor não pode ser garantida. Troca de senha, alteração de perfil e desativação continuam invalidando sessões pelo SecurityStamp e pela verificação do usuário na API.

DataProtectionKeys preserva as chaves de proteção no banco para que reinícios/deploys do Render não invalidem todos os tokens. Essas tabelas são internas, sem endpoints públicos. A migration RefreshSessions é aditiva. Não altera pedidos, cargas ou estoque.

Na primeira implantação, sessões antigas podem exigir um novo login: elas não tinham sessão persistida, e as chaves anteriores do filesystem não são importadas para o banco. Depois desse login, a renovação passa a funcionar. É necessário publicar API e frontend juntos e aguardar a migration no início da API.

Para testar, faça login, recarregue/feche e reabra o navegador e confira que permanece autenticado. Na aba Network, após aproximadamente 14 minutos, a próxima ação deve chamar POST /api/auth/refresh e continuar sem tela de login. Sair deve impedir renovação com os tokens anteriores. Os testes automatizados simulam vencimento sem esperar 15 minutos e verificam rotação, revogação e concorrência.
