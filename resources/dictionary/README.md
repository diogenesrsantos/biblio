# Dicionário Bíblico Easton em português — edição parcial

Este módulo offline contém **61 verbetes em português**, de **A a Acaicus**, provenientes da tradução colaborativa disponível no Wikisource em português. O índice alfabético e a apresentação do projeto não são verbetes e foram excluídos. O restante da edição inglesa não é incluído.

## Autoria, créditos e licença

- Autor original: **Matthew George Easton (1823–1894)**.
- Obra original: *Illustrated Bible Dictionary*, terceira edição, **Thomas Nelson, 1897**. Texto original em domínio público.
- Tradução: **colaboradores do Wikisource em português**, com identificação individual no histórico de cada página. O projeto registra a participação de Manoel Fernández e Abreu Guilherme; isso não é uma lista exaustiva de autores da tradução.
- Projeto: https://pt.wikisource.org/wiki/Em_Tradu%C3%A7%C3%A3o:Dicion%C3%A1rio_B%C3%ADblico_Easton_(1897)
- Participantes do projeto: https://pt.wikisource.org/wiki/Wikisource:Projetos/Dicion%C3%A1rios_B%C3%ADblicos
- Licença da tradução publicada no Wikisource: **Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional (CC BY-SA 4.0)**, conforme o rodapé das páginas.
- Termos da licença: https://creativecommons.org/licenses/by-sa/4.0/deed.pt
- A conversão e adaptação do conteúdo pela Biblio são distribuídas sob **CC BY-SA 4.0**. A licença do conteúdo não altera a licença do restante da aplicação.

A interface preserva os créditos e oferece, em cada verbete, links para a revisão exata importada e para o histórico dos colaboradores. O arquivo JSON distribuído permite recuperar o wikitexto e os identificadores das revisões utilizados. O banco SQLite contém os mesmos links, inclusive quando distribuído separadamente.

## Limitações e alterações

A tradução é **incompleta e ainda em revisão**. O texto de origem é uma obra histórica de 1897 e pode conter informações desatualizadas. Nomes próprios e grafias foram preservados conforme os colaboradores; nenhuma tradução automática foi acrescentada.

A Biblio remove marcação de navegação e formatação wiki, converte o conteúdo para texto simples, conserva as referências de notas entre parênteses e adiciona pesquisa SQLite FTS5 sem distinção de acentos. Não preenche páginas ausentes nem transforma o texto em material de autoria da Biblio.

## Dados e reprodução

- `wikisource-easton-pt.json`: instantâneo obtido em 15/10/2026 pela API pública do Wikisource, com 63 páginas e respectivas revisões.
- SHA-256 desse arquivo: `4630c892fa435fe4cdd9be16a8c8910713c0cf251d1e8dfdda9ecc3b39a88694`.
- `dictionary.sqlite`: banco distribuído, somente para leitura em tempo de execução.
- Tabelas: `dictionary_source`, `dictionary_entries` e `dictionary_entries_fts`.

Recriar o SQLite a partir do instantâneo versionado, sem internet:

```bash
npm run build:dictionary
```

Para atualizar a fonte, execute `node scripts/download-dictionary-source.js` e revise o novo instantâneo antes de executar o build e os testes. Uma atualização exige revisar contagem, cobertura, hash e créditos. A aplicação nunca baixa conteúdo durante a leitura.

## Edição inglesa — 3.963 verbetes

O seletor de idioma também oferece o módulo **Easton 2.0.1**, com **3.963 verbetes e 3.961 títulos distintos**, em inglês. As duas definições adicionais com títulos repetidos são mantidas como verbetes separados. O conteúdo foi baixado em 15/10/2026, e os bytes do texto e dos metadados conferem com os SHA-256 publicados no manifesto GetBible.

Créditos desta edição:

- **Matthew George Easton**: autor de *Illustrated Bible Dictionary*, terceira edição, publicada por **Thomas Nelson, 1897**.
- **Christian Classics Ethereal Library (CCEL)**: fonte do texto eletrônico indicada pelo módulo.
- **CrossWire Bible Society / SWORD**: preparação e distribuição do módulo Easton.
- **GetBible**: conversão do módulo para JSON estático e distribuição dos arquivos.
- **Biblio**: conversão para SQLite e índice de pesquisa. O texto inglês foi preservado, sem tradução ou abreviação adicional. As ilustrações já não fazem parte do módulo de origem.

O texto inglês é **domínio público (Public Domain)**, conforme a licença do módulo. A licença CC BY-SA da tradução portuguesa não é aplicada à edição inglesa.

Fontes:

- Conteúdo: https://dictionaries.getbible.net/v1/easton.json
- Metadados e procedência: https://dictionaries.getbible.net/v1/easton/metadata.json
- Manifesto de integridade: https://dictionaries.getbible.net/v1/hashes.json
- Módulo: https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=Easton
- Domínio público: https://www.crosswire.org/sword/copyright/ModInfoCopyright.jsp?modName=Easton
- Documentação do distribuidor: https://getbible.net/api/dictionaries/v1/

Arquivos versionados:

- `getbible-easton-en.json`: conteúdo integral publicado, SHA-256 `f509362bbf079b87a88a56afb01a460940135665cafad1ca53a8889e9d2a464d`.
- `getbible-easton-en-metadata.json`: metadados originais, SHA-256 `7108734a0770d23ea7f68d264df6ef3776808a02f0ed5a7e65ef7fa9f9a4c01f`.
- `getbible-easton-en-hashes.json`: os dois registros extraídos do manifesto de integridade publicado pelo GetBible.
- `dictionary-en.sqlite`: banco inglês, com as mesmas tabelas da edição portuguesa e metadados de procedência próprios.

`npm run build:dictionary` reconstrói **ambos os bancos** a partir dos snapshots locais; a etapa inglesa verifica hashes, licença, idioma e contagem antes de importar. Para atualizar apenas os arquivos de origem ingleses, execute `node scripts/download-dictionary-english-source.js`, revise as mudanças e reconstrua com o servidor parado. Não há downloads durante o uso da aplicação.

A API usa `lang=en` para a edição inglesa e `lang=pt` para a portuguesa; omitir `lang` preserva o português como padrão. Cada consulta acessa somente o banco do idioma escolhido. No Electron, ambos os SQLite acompanham o instalador fora do ASAR.
