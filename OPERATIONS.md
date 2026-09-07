# Operação da Biblio

A Biblio utiliza SQLite em todas as instalações. É indicada para uma biblioteca particular com uma única instância do serviço e de uma a três pessoas. O banco e as mídias são arquivos locais e devem permanecer fora do diretório do código em servidores.

Para instalar ou administrar uma VPS com Nginx e HTTPS, siga o manual completo [VPS-SQLITE-NGINX.md](VPS-SQLITE-NGINX.md).

## Ambiente local

- Requer Node.js 22 ou superior.
- O banco fica em `data/biblio.db` e as mídias em `data/media/`.
- Defina `DATA_DIR` no `.env` para usar outro diretório de dados.
- Por segurança, o servidor atende somente em `127.0.0.1`.

```bash
npm install
npm start
```

A interface fica disponível em `http://127.0.0.1:8080`. Para abrir o navegador automaticamente, use `npm run open`; durante o desenvolvimento, use `npm run dev`.

## Dados, backup e restauração

O backup inclui uma cópia consistente do banco SQLite e todas as mídias em um arquivo ZIP. Crie cópias regularmente em outro disco ou serviço de armazenamento:

```bash
npm run backup -- /caminho/do/destino
```

Com o servidor parado, restaure um backup com:

```bash
npm run restore -- /caminho/para/biblio-backup.zip
```

A restauração também está disponível na interface autenticada. A pasta de dados anterior é preservada como `data.antes-da-restauracao-...`; só a remova depois de validar os artigos e mídias restaurados.

## Redefinição de senha

Em um terminal interativo, execute:

```bash
npm run reset-password
```

O comando exige uma nova senha com ao menos 12 caracteres e encerra as sessões anteriores.

## Limites operacionais

- Execute uma única instância da Biblio para cada banco.
- Não mantenha `biblio.db` em NFS, compartilhamento de rede ou volume sincronizado entre servidores.
- Não use réplicas ou múltiplos contêineres apontando para o mesmo `DATA_DIR`.
- Mantenha espaço suficiente para o banco, mídias, backups e a pasta preservada durante uma restauração.
