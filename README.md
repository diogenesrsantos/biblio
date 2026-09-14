# Biblio

O estado técnico consolidado, as decisões de arquitetura e as pendências estão registrados em [PROJETO.md](PROJETO.md).

Biblioteca pessoal para registrar artigos, autores, fontes, etiquetas e anexos de imagem ou vídeo. Foi desenhada para uso local de uma a três pessoas.

O conteúdo dos artigos possui editor visual com títulos, listas, ênfase, links, citações e imagens inseridas diretamente no texto. As imagens também podem ser coladas da área de transferência ou reutilizadas a partir do painel de mídias.

A interface separa leitura e edição: o documento aberto exibe apenas título e conteúdo, enquanto informações e edição aparecem em janelas sobrepostas. O menu do acervo pode ser recolhido, a galeria de imagens é opcional e o cabeçalho aceita título, subtítulo e banner personalizados.

A página inicial é um documento visual editável. Ela é criada automaticamente com um conteúdo básico, abre após o acesso e pode receber a mesma formatação, imagens e tabelas dos artigos comuns.

## Bíblia Sagrada offline

O módulo **Bíblia Sagrada** inclui a Bíblia Livre 2018 em português brasileiro, com cânon protestante de 66 livros. Velho e Novo Testamento, livros, capítulos e 31.102 versículos ficam em tabelas SQLite separadas e funcionam sem internet. A Bíblia possui pesquisa própria e nunca aparece na pesquisa geral da biblioteca.

Todas as Escrituras em português do módulo são da Bíblia Livre (BLIVRE), Copyright © 2018 Diego Santos, Mario Sérgio e Marco Teles, sob licença Creative Commons Atribuição 4.0 Brasil. Os créditos completos e a procedência estão em [resources/bible/README.md](resources/bible/README.md) e na própria interface.

Consulte [INSTALL.md](INSTALL.md) para gerar e testar instaladores de Windows e Linux.

Para uma implantação dedicada em VPS, siga [VPS-SQLITE-NGINX.md](VPS-SQLITE-NGINX.md).

## Executar localmente

Requer Node.js 22 ou superior. O banco SQLite e as mídias ficam em `data/`. Consulte [OPERATIONS.md](OPERATIONS.md) para a operação avançada.

```bash
npm install
npm start
```

Abra `http://127.0.0.1:8080`. No primeiro acesso, crie sua conta pessoal e uma senha com ao menos 12 caracteres. Os dados ficam em `data/biblio.db` e os anexos em `data/media`. Defina opcionalmente `DATA_DIR` no `.env` para manter essa pasta em outro disco.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

Para executar os testes automatizados:

```bash
npm test
```

## Redefinir a senha

Se a senha da conta for esquecida, ela não pode ser recuperada a partir do hash armazenado. Redefina-a em um terminal no diretório da aplicação:

```bash
npm run reset-password
```

O comando não exibe a senha digitada, exige ao menos 12 caracteres e encerra todas as sessões anteriores da conta.

## Acesso local

Por padrão, a Biblio atende somente em `127.0.0.1`, isto é, apenas no próprio computador. Essa escolha protege uma instalação pessoal. O modo de servidor compartilhado/remoto requer uma configuração separada e não faz parte dos instaladores locais.

## PWA

No Chrome/Edge para computador ou Android, abra o menu do navegador e escolha **Instalar aplicativo** ou **Adicionar à tela inicial**. A interface e seus arquivos estáticos permanecem disponíveis offline; os artigos exigem conexão com o servidor local.

## Cópia de segurança e restauração

Depois de entrar, use **Fazer cópia** no cabeçalho. Uma tela permite escolher a pasta, acompanhar o progresso, cancelar ou fechar a operação; em navegadores sem seletor de pasta, o `.zip` usa o download padrão. Em outra instalação, use **Restaurar cópia** e selecione esse arquivo; a Biblio reinicia e preserva a pasta anterior como segurança.

Pelo terminal, o mesmo backup pode ser criado com:

Conecte o HD externo e execute, substituindo o caminho pelo ponto de montagem dele:

```bash
npm run backup -- /media/SEU_HD_EXTERNO
```

No Windows, um exemplo seria:

```powershell
npm run backup -- E:\Backups
```

O comando cria um arquivo `.zip` datado, com banco e mídias. Recomenda-se executar semanalmente e testar a restauração em uma cópia do projeto.

Uploads de anexos, restaurações e downloads de backup são transferidos por streaming, evitando a amplificação de memória causada por Base64. O SQLite restaurado é verificado antes de substituir a biblioteca atual.

Com o servidor parado, a restauração também pode ser feita pelo terminal:

```bash
npm run restore -- /caminho/para/biblio-backup.zip
```

## Escopo atual

- Uma única conta local, protegida por senha e sessão de 30 dias.
- A instalação local usa SQLite, sem serviço de banco separado.
- Vídeos e imagens são limitados a 25 MB por arquivo.
- O HTML produzido pelo editor é sanitizado no servidor antes de ser armazenado.
- Arquivos de mídia têm formato e assinatura binária validados.
- `GET /api/diagnostics`, após autenticação, verifica o SQLite e aponta mídias ausentes ou órfãs.
