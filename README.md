# Biblio

Biblioteca pessoal para registrar artigos, autores, fontes, etiquetas e anexos de imagem ou vídeo. Foi desenhada para uso local de uma a três pessoas.

O conteúdo dos artigos possui editor visual com títulos, listas, ênfase, links, citações e imagens inseridas diretamente no texto. As imagens também podem ser coladas da área de transferência ou reutilizadas a partir do painel de mídias.

Consulte [INSTALL.md](INSTALL.md) para gerar e testar instaladores de Windows e Linux.

## Executar localmente

Requer Node.js 22 ou superior. A instalação local não requer PostgreSQL: o banco SQLite e as mídias ficam em `data/`. Consulte [OPERATIONS.md](OPERATIONS.md) para a migração da instalação antiga em PostgreSQL e operação avançada.

```bash
npm install
npm start
```

Abra `http://127.0.0.1:8080`. No primeiro acesso, crie sua conta pessoal e uma senha com ao menos 12 caracteres. Os dados ficam em `data/biblio.db` e os anexos em `data/media`. Defina opcionalmente `DATA_DIR` no `.env` para manter essa pasta em outro disco.

Para desenvolvimento com reinício automático:

```bash
npm run dev
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

Depois de entrar, use **Fazer cópia** no cabeçalho. O navegador perguntará onde salvar o arquivo `.zip`, incluindo em um HD externo. Em outra instalação, use **Restaurar cópia** e selecione esse arquivo; a Biblio reinicia e preserva a pasta anterior como segurança.

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

Com o servidor parado, a restauração também pode ser feita pelo terminal:

```bash
npm run restore -- /caminho/para/biblio-backup.zip
```

## Escopo atual

- Uma única conta local, protegida por senha e sessão de 30 dias.
- A instalação local usa SQLite, sem serviço de banco separado.
- Vídeos e imagens são limitados a 25 MB por arquivo.
- O HTML produzido pelo editor é sanitizado no servidor antes de ser armazenado.
