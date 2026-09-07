# Registro consolidado do projeto Biblio

Atualizado em 6 de setembro de 2026.

Este documento concentra o estado técnico, as decisões de arquitetura, os procedimentos de operação e as pendências conhecidas da Biblio. Não devem ser registrados aqui senhas, chaves, cookies, URLs com credenciais ou dados pessoais do acervo.

## 1. Objetivo

A Biblio é uma biblioteca particular para registrar e consultar:

- artigos e textos com formatação visual;
- temas e subtemas, autores e etiquetas;
- fontes e referências;
- imagens e vídeos anexados;
- imagens inseridas dentro do conteúdo dos artigos.

O público esperado é de uma a três pessoas. A aplicação prioriza simplicidade, portabilidade dos dados e operação local ou em uma única VPS.

## 2. Estado atual

- Repositório: `https://github.com/diogenesrsantos/biblio`
- Branch principal: `master`
- Tag mais recente preparada: `v0.1.8`
- Commit funcional atual registrado: `6792613`
- Versão declarada no `package.json`: `0.1.8`
- Runtime: Node.js 22
- Banco padrão da versão atual: SQLite
- Interface: HTML, CSS e JavaScript, instalável como PWA
- Aplicação desktop: Electron
- Servidor HTTP: implementação nativa do Node.js, sem framework web

## 3. Decisões de arquitetura

### Distribuição pessoal

A distribuição atual usa SQLite e é a modalidade recomendada para:

- Windows;
- Linux;
- execução manual em um computador pessoal;
- execução de uma única instância em VPS;
- backup e restauração portáveis entre sistemas operacionais.

O banco fica em `DATA_DIR/biblio.db` e os anexos em `DATA_DIR/media/`.

### Limites de implantação

A Biblio usa SQLite em todas as modalidades. Ela deve operar em uma única instância, com o banco em disco local; não é adequada para réplicas simultâneas ou armazenamento de rede.

Não executar múltiplas instâncias da versão SQLite apontando para o mesmo arquivo. Não colocar `biblio.db` em NFS.

## 4. Componentes principais

| Arquivo ou diretório | Responsabilidade |
|---|---|
| `server.js` | Servidor HTTP, autenticação, API, arquivos estáticos e mídias |
| `database.js` | Acesso ao SQLite e adaptação das consultas |
| `backup-service.js` | Geração de backups ZIP consistentes |
| `restore-service.js` | Validação e aplicação segura de backups |
| `desktop.js` | Aplicação Electron e inicialização do servidor empacotado |
| `public/` | Interface web e PWA |
| `scripts/launch.js` | Inicia o servidor e abre o navegador |
| `scripts/backup.js` | Backup pelo terminal |
| `scripts/restore.js` | Restauração pelo terminal |
| `scripts/reset-password.js` | Redefinição interativa de senha |
| `.github/workflows/build-installers.yml` | Geração de instaladores Windows e Linux |
| `data/` | Banco e mídias no desenvolvimento local |

## 5. Modelo de dados

Tabelas criadas automaticamente na inicialização:

- `users`: conta e hash de senha;
- `sessions`: sessões autenticadas com expiração;
- `themes`: temas do acervo, com subtemas em um nível por meio de `parent_id`;
- `articles`: artigos, cor do título, resumo, conteúdo, idioma, data e tema;
- `authors`: autores;
- `article_authors`: relação entre artigos e autores;
- `tags`: etiquetas;
- `article_tags`: relação entre artigos e etiquetas;
- `sources`: fontes e referências;
- `article_sources`: relação entre artigos e fontes;
- `attachments`: metadados dos arquivos de mídia.
- `settings`: personalização persistente do cabeçalho e do banner.

Os temas iniciais são Teologia, Filosofia, Culinária e Pensamentos.

## 6. Segurança implementada

- Uma conta inicial por instalação.
- Usuário com pelo menos 3 caracteres.
- Senha com pelo menos 12 caracteres.
- Hash de senha com `scrypt`, salt aleatório e comparação segura.
- Sessões aleatórias com duração de 30 dias.
- Cookie `HttpOnly`, `SameSite=Strict` e `Secure` quando `PUBLIC_HTTPS=true`.
- API e mídias protegidas por autenticação, exceto `/api/health`.
- Conteúdo HTML sanitizado no servidor.
- Links externos recebem `noopener noreferrer`.
- Mídias servidas com `X-Content-Type-Options: nosniff`.
- Servidor SQLite atual escuta somente em `127.0.0.1`.
- Arquivo de restauração pendente criado com modo `0600`.

Em VPS, Nginx e HTTPS são obrigatórios para acesso externo. As portas internas 8080 e de banco não devem ser expostas.

## 7. Limites atuais

- Imagem ou vídeo individual: 25 MB.
- Formatos de imagem: JPEG, PNG, GIF e WebP.
- Formatos de vídeo: MP4, WebM e QuickTime.
- Imagens personalizadas do banner e das boas-vindas: até 5 MB cada no frontend.
- Backup recebido para restauração: até 180 MB compactados.
- Corpo HTTP aceito pelo servidor: até 250 MB.
- Nginx recomendado para restauração: `client_max_body_size 260m`.
- Listagem de artigos: até 100 resultados, ordenados por atualização.
- Conteúdo do artigo: até aproximadamente 1.000.000 de caracteres.

## 8. API principal

| Método e rota | Uso |
|---|---|
| `GET /api/health` | Saúde da aplicação e banco ativo |
| `GET /api/auth/status` | Estado de autenticação e configuração inicial |
| `POST /api/auth/setup` | Cria a primeira conta |
| `POST /api/auth/login` | Inicia sessão |
| `POST /api/auth/logout` | Encerra sessão |
| `PUT /api/auth/account` | Altera usuário e/ou senha mediante confirmação da senha atual |
| `GET /api/themes` | Lista temas e seus subtemas |
| `POST /api/themes` | Cria tema ou subtema (`parent_id`) |
| `GET /api/articles` | Pesquisa ou lista artigos |
| `GET /api/articles/:id` | Abre artigo |
| `POST /api/articles` | Cria artigo |
| `PUT /api/articles/:id` | Atualiza artigo |
| `DELETE /api/articles/:id` | Exclui artigo e mídias associadas |
| `POST /api/articles/:id/attachments` | Envia imagem ou vídeo |
| `DELETE /api/attachments/:id` | Exclui anexo e remove referência no conteúdo |
| `GET /api/backup` | Baixa backup ZIP autenticado |
| `POST /api/restore` | Envia backup para restauração e reinício |
| `GET /media/:arquivo` | Entrega mídia autenticada |
| `GET /api/settings` | Lê a personalização do cabeçalho |
| `PUT /api/settings` | Salva textos do cabeçalho e imagens do banner e das boas-vindas |

## 9. PWA

A interface possui manifesto, ícone e service worker. Os arquivos estáticos são armazenados em cache para abertura da interface; artigos e mídias continuam dependendo do servidor.

O cache atual é identificado como `biblio-shell-v24`.

## 10. Interface de leitura e edição

- O cabeçalho possui três áreas, com banner personalizável ocupando a região central. A composição padrão usa o retrato do reverendo Albert em um tema evangélico voltado à juventude cristã.
- Após a autenticação, uma arte vertical de boas-vindas com o reverendo Albert aparece sobre a interface e é fechada ao clicar na imagem.
- A tela de personalização permite substituir tanto o banner quanto a arte de boas-vindas e informa as dimensões exigidas.
- A mesma tela permite atualizar o usuário e a senha; a senha atual é exigida e novas senhas têm no mínimo 12 caracteres.
- O botão de backup abre uma etapa de destino, com escolha de pasta/arquivo quando o navegador oferece a API correspondente, progresso visual, cancelamento e fechamento. Em navegadores sem essa API, o ZIP usa o download padrão.
- Título, subtítulo e imagem do banner são salvos no SQLite e incluídos nos backups.
- A biblioteca lateral esquerda é exibida por padrão e pode ser recolhida para ampliar a leitura.
- Temas do acervo podem conter subtemas. Um clique no tema principal expande ou recolhe os subtemas; o botão `＋` ao lado dele cria um subtema.
- O documento aberto mostra somente título e conteúdo; os demais metadados ficam em uma janela translúcida própria.
- Edição e criação usam um editor sobreposto à interface, com fundo desfocado e barra de ferramentas fixa.
- O editor permite aplicar tamanho e cor ao texto, além das opções de formatação anteriores.
- O editor permite alterar a entrelinha dos parágrafos entre compacta, normal, confortável e ampla.
- O menu de parágrafo permite alinhar blocos à esquerda, ao centro ou à direita.
- A cor do título possui controle próprio e é preservada junto ao artigo.
- Imagens escolhidas no campo de mídias são incorporadas na posição atual do cursor; vídeos permanecem como anexos.
- Imagens selecionadas no editor podem usar largura de 25%, 50%, 75%, 100% ou o tamanho original; a dimensão é preservada na leitura e na impressão.
- Imagens já anexadas podem ser incorporadas posteriormente pela ação **Inserir no texto**.
- A galeria direita é estreita, mostra uma única coluna de imagens usadas no texto e permanece oculta por padrão.
- O menu flutuante do artigo possui um atalho dedicado, com ícone próprio, para abrir diretamente o carrossel de imagens.
- A visualização ampliada percorre as imagens do artigo por setas na tela ou pelo teclado.
- A ação de impressão apresenta primeiro uma pré-visualização limpa do artigo e depois abre a impressão do navegador, permitindo escolher uma impressora ou salvar em PDF.
- O login permite exibir ou ocultar a senha e oferece seis temas visuais rápidos: Clássico, Oceano, Sépia, Rosé, Lavanda e Ardósia.
- O tema visual é salvo no navegador e no SQLite, acompanha os backups e também é aplicado antes da autenticação nos acessos seguintes.

## 11. Backup e restauração

O formato de backup é ZIP e contém:

```text
manifest.json
LEIA-ME.txt
data/biblio.db
data/media/*
```

O manifesto registra formato, versão do formato, versão da aplicação e data de criação.

O banco é copiado pela API de backup do SQLite, produzindo uma imagem consistente mesmo quando o WAL está ativo.

Antes de restaurar, a aplicação valida o manifesto e a presença do banco. A pasta anterior é preservada com um nome semelhante a:

```text
data.antes-da-restauracao-AAAA-MM-DDTHH-MM-SS
```

A restauração pela interface encerra o processo com código 75. O lançador desktop e o serviço `systemd` com `Restart=on-failure` iniciam novamente a aplicação, que aplica o arquivo pendente antes de abrir o banco.

### Backups da distribuição realizados durante a evolução

Fora do repositório, em `../biblio_servidor/`:

- `biblio-distribuicao-2026-09-01.tar.gz`: estado anterior às alterações portáteis;
- `biblio-distribuicao-portatil-2026-09-01.tar.gz`: estado da implementação portátil inicial.

Esses arquivos incluem os dados locais existentes no momento da criação, mas não incluem `.git` nem `node_modules`.

## 12. Comandos de operação

```bash
npm start
npm run open
npm run dev
npm run backup -- /caminho/do/destino
npm run restore -- /caminho/biblio-backup.zip
npm run reset-password
```

- `npm start`: inicia apenas o servidor.
- `npm run open`: inicia o servidor e abre a interface.
- `npm run dev`: reinicia automaticamente durante desenvolvimento.
- `npm run backup`: cria um ZIP em outro disco ou diretório.
- `npm run restore`: restaura com o servidor parado.
- `npm run reset-password`: redefine a senha e encerra sessões antigas.

## 13. Distribuição desktop

O Electron empacota interface e servidor sem exigir Node.js ou um serviço de banco de dados no computador do usuário.

Artefatos configurados:

- Windows x64: instalador NSIS `.exe`, com atalhos;
- Linux x64: `.AppImage` e pacote `.deb`.

Os dados desktop ficam na subpasta `data` do diretório de dados do usuário fornecido pelo Electron, separados dos arquivos internos do navegador. No Windows, por exemplo, o banco fica em `%APPDATA%\biblio-pessoal\data\biblio.db`. Essa separação permite renomear os dados durante a restauração sem conflito com arquivos mantidos abertos pelo Electron.

### Validações realizadas

- AppImage gerado localmente;
- pacote `.deb` gerado localmente;
- SQLite validado dentro do `app.asar` usando a ABI do Electron;
- workflow `v0.1.2`: Windows e Linux concluídos com sucesso;
- workflow `v0.1.3`: Windows e Linux concluídos com sucesso;
- workflows `v0.1.4` a `v0.1.7`: Windows e Linux concluídos com sucesso;
- validação automática da integridade do `package.json` dentro do ASAR;
- instalação e inicialização confirmadas em máquinas Windows e Linux;
- backup e restauração confirmados nos dois sistemas;
- restauração das imagens anexadas confirmada pelo usuário.
- instalação limpa confirmada no Windows 10 Home 22H2, sem atualizações adicionais do sistema.

### Estado da publicação

O workflow passou a tentar criar uma página GitHub Release depois dos builds. Na execução `v0.1.3`, os jobs `windows` e `linux` concluíram com sucesso, mas o job `release` falhou. Portanto, os instaladores dessa execução estão nos artifacts do GitHub Actions e a publicação em Releases permanece pendente de correção.

## 14. Histórico relevante

| Referência | Descrição |
|---|---|
| `89360f5` | Editor visual com imagens inseridas no texto |
| `55f9f96` | Distribuição portátil, SQLite, backup e Electron |
| `5d50364` | Merge do Pull Request da distribuição portátil |
| `b49efb3` / `v0.1.0` | Correção inicial do workflow integrada em `master` |
| `db3b056` / `v0.1.1` | Diagnóstico público de falhas do empacotamento |
| `4cf3c77` / `v0.1.2` | Desativação da publicação implícita; builds aprovados |
| `c12130b` / `v0.1.3` | Tentativa de publicar instaladores em GitHub Releases |
| `e13cdb0` / `v0.1.4` | Inicialização do servidor empacotado com `utilityProcess` |
| `6f2875a` / `v0.1.5` | Diagnóstico persistente da inicialização desktop |
| `ab586df` / `v0.1.6` | Correção da corrupção do ASAR por logs gravados durante o build |
| `6792613` / `v0.1.7` | Separação dos dados para permitir restauração no Windows |

Branches remotas relevantes:

- `master`: versão atual SQLite;
- `feature/editor-visual`: base histórica do editor;
- `feat/portable-installers`: implementação portátil inicial;
- `fix/installer-workflow`: correção inicial da automação.

## 15. Instalação e operação documentadas

- `README.md`: apresentação e início rápido;
- `INSTALL.md`: distribuição desktop e transferência entre computadores;
- `VPS-SQLITE-NGINX.md`: instalação recomendada em VPS;
- `OPERATIONS.md`: operação local e em VPS.

## 16. VPS SQLite recomendada

Estrutura definida:

```text
/opt/biblio                     código
/var/lib/biblio/data/biblio.db banco
/var/lib/biblio/data/media/    anexos
/etc/biblio/biblio.env         configuração
```

O serviço roda como usuário `biblio`, grava apenas em `/var/lib/biblio`, atende em loopback e é publicado por Nginx com HTTPS.

## 17. Pendências conhecidas

1. Corrigir o job `release` para publicar instaladores em uma página permanente do GitHub.
2. Adicionar ícones próprios nos instaladores Electron; atualmente o empacotador pode usar o ícone padrão.
3. Criar testes automatizados para API, banco, backup e restauração.
4. Modularizar `server.js`, que ainda concentra muitas responsabilidades.
5. Considerar streaming para backups grandes; atualmente o ZIP é montado em memória.
6. Considerar upload de restauração por streaming; atualmente o ZIP usa Base64 e memória.

## 18. Regras para evolução segura

- Fazer backup antes de migrações, atualizações ou restaurações.
- Nunca versionar `.env`, banco, mídias, senhas ou tokens.
- Não apagar pastas `antes-da-restauracao` até validar a cópia restaurada.
- Testar instaladores em ambiente limpo antes de recomendá-los como versão estável.
- Criar tags somente depois de atualizar a versão declarada e validar os builds.
- Manter os dados fora do diretório do código em instalações de produção.

## 19. Próxima sequência recomendada

1. Corrigir e validar a publicação em GitHub Releases.
2. Criar testes automatizados para os fluxos já validados manualmente.
3. Implantar a VPS SQLite seguindo o manual próprio.
4. Criar backup externo da VPS e testar uma restauração completa.
5. Somente então declarar uma nova versão estável.
