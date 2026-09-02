# Instalação e distribuição

## Computador de desenvolvimento

Com Node.js 22, execute `npm install` e `npm run open`. Esse comando inicia a Biblio em `127.0.0.1` e abre a interface no navegador.

## Instaladores de teste

O workflow **Gerar instaladores** do GitHub Actions produz os artefatos nativos abaixo a partir de uma tag `v*` ou por execução manual:

- Windows 64 bits: instalador `.exe` (NSIS), com atalhos no Menu Iniciar e na Área de Trabalho.
- Linux 64 bits: `.AppImage` portátil e pacote `.deb`.

Eles incluem o runtime necessário; quem testa não precisa instalar Node.js nem PostgreSQL. Os dados de cada instalação ficam separados da aplicação no diretório de dados do usuário, para sobreviver a atualizações e desinstalações.

## Transferir uma biblioteca

1. No computador antigo, clique em **Fazer cópia** e salve o ZIP em um disco externo.
2. Instale a Biblio no computador novo.
3. Entre ou crie a conta inicial e clique em **Restaurar cópia**.
4. Escolha o ZIP. A aplicação reinicia e mantém os dados anteriores em uma pasta de segurança.

Também é possível criar uma cópia pelo terminal com `npm run backup -- DESTINO` e restaurar, com o servidor parado, por `npm run restore -- ARQUIVO.zip`.
