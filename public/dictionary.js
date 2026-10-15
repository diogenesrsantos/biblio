/* Offline Easton dictionaries; each edition has its own SQLite, search and credits. */
(() => {
  let language = 'pt', data = null, generation = 0;
  const cache = new Map();
  const languageName = value => value === 'en' ? 'Inglês' : 'Português';
  const link = (url, title) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${title}</a>`;
  const endpoint = (route, selected = language) => '/api/dictionary' + route + (route.includes('?') ? '&' : '?') + 'lang=' + selected;
  async function load(selected) {
    if (!cache.has(selected)) cache.set(selected, await api(endpoint('', selected)));
    return cache.get(selected);
  }
  function credits() {
    const s = data.source;
    return `${escapeHtml(s.author)} · ${s.language === 'pt' ? 'Tradução: colaboradores do Wikisource em português.' : escapeHtml(s.distributors)}<br>${link(s.license_url, s.language === 'pt' ? 'CC BY-SA 4.0' : 'Domínio público')} · ${link(s.source_url, 'Fonte e procedência')}`;
  }
  function show(title, content, edition) {
    data = edition;
    $('#dictionaryToggle .themeCount').textContent = data.entries.length.toLocaleString('pt-BR');
    $('#dictionaryEditionLabel').textContent = '▤ Easton em ' + (language === 'pt' ? 'português' : 'inglês');
    const notice = language === 'pt'
      ? `Edição parcial em português · ${data.entries.length} verbetes disponíveis, de A a Acaicus. Somente os verbetes traduzidos disponíveis na fonte foram incluídos.`
      : `Edição em inglês · ${data.entries.length.toLocaleString('pt-BR')} verbetes · Texto em domínio público.`;
    showBibleReader(title, `<p class="dictionaryNotice">${notice}</p>${content}`, { section: 'dictionary', eyebrow: `DICIONÁRIO BÍBLICO · ${languageName(language).toUpperCase()} · OFFLINE` });
    $('#bibleLicense').innerHTML = credits();
  }
  function bindEntries() {
    document.querySelectorAll('[data-dictionary-entry]').forEach(button => button.onclick = () => openEntry(Number(button.dataset.dictionaryEntry)));
  }
  async function index(letter = null) {
    const token = ++generation, selected = language;
    try {
      const edition = await load(selected); if (token !== generation) return;
      const letters = [...new Set(edition.entries.map(entry => entry.title[0].toLocaleUpperCase(selected)))];
      const active = letter || (selected === 'en' ? letters[0] : null);
      const entries = active ? edition.entries.filter(entry => entry.title[0].toLocaleUpperCase(selected) === active) : edition.entries;
      const alphabet = selected === 'en' ? `<nav class="dictionaryAlphabet" aria-label="Índice por letra">${letters.map(value => `<button type="button" data-dictionary-letter="${escapeHtml(value)}" aria-pressed="${value === active}">${escapeHtml(value)}</button>`).join('')}</nav><p>${entries.length} verbetes na letra ${escapeHtml(active)}.</p>` : '';
      show('Dicionário Bíblico', `<p>${selected === 'pt' ? 'Tradução colaborativa do dicionário de Matthew George Easton (1897).' : 'Easton’s Bible Dictionary (1897), em inglês. Pesquise termos em inglês ou navegue pelo índice alfabético.'} Pesquise por palavra ou assunto, ou escolha um verbete.</p>${alphabet}<div class="dictionaryIndex" lang="${selected}">${entries.map(entry => `<button type="button" data-dictionary-entry="${entry.id}">${escapeHtml(entry.title)}</button>`).join('')}</div>`, edition);
      bindEntries();
      document.querySelectorAll('[data-dictionary-letter]').forEach(button => button.onclick = () => index(button.dataset.dictionaryLetter));
    } catch (error) { if (token === generation) toast(error.message); }
  }
  async function search() {
    const term = $('#dictionarySearch').value.trim();
    if (!term) return toast('Digite uma palavra para pesquisar.');
    const token = ++generation, selected = language;
    try {
      const [edition, response] = await Promise.all([load(selected), api(endpoint('/search?q=' + encodeURIComponent(term), selected))]);
      if (token !== generation) return;
      show(`Dicionário: ${term}`, response.results.length ? `<div class="dictionaryResults" lang="${selected}">${response.results.map(entry => `<button class="dictionaryResult" type="button" data-dictionary-entry="${entry.id}"><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.excerpt)}${entry.excerpt.length === 240 ? '…' : ''}</span></button>`).join('')}</div>` : `<p>${selected === 'pt' ? 'Nenhum resultado nesta edição parcial. Muitos termos ainda não possuem tradução disponível.' : 'Nenhum resultado na edição inglesa. Pesquise usando uma palavra em inglês.'}</p>`, edition);
      bindEntries();
    } catch (error) { if (token === generation) toast(error.message); }
  }
  async function openEntry(id) {
    const token = ++generation, selected = language;
    try {
      const [edition, entry] = await Promise.all([load(selected), api(endpoint('/entries/' + id, selected))]);
      if (token !== generation) return;
      const provenance = selected === 'pt' ? `${link(entry.source_url, 'Revisão original no Wikisource')} · ${link(entry.history_url, 'Histórico e créditos dos tradutores')}` : link(entry.source_url, 'Texto de origem no GetBible');
      const translation = selected === 'en' ? `<p><a class="dictionaryTranslate" href="${escapeHtml('https://translate.google.com/?sl=en&tl=pt&text=' + encodeURIComponent(entry.title + '\n\n' + entry.text) + '&op=translate')}" target="_blank" rel="noopener noreferrer">Traduzir para português ↗</a><br><small>Abre o Google Tradutor em outra aba. Requer internet.</small></p>` : '';
      show(entry.title, `${translation}<div class="dictionaryText" lang="${selected}">${escapeHtml(entry.text)}</div><p class="dictionaryProvenance">${selected === 'pt' ? 'Tradução em revisão. ' : ''}Texto histórico de 1897, que pode conter informações desatualizadas.<br>${provenance}</p><button id="dictionaryBack" class="bibleAbout" type="button">← Índice de verbetes</button>`, edition);
      $('#dictionaryBack').onclick = () => index();
    } catch (error) { if (token === generation) toast(error.message); }
  }
  $('#dictionaryToggle').onclick = async () => {
    const panel = $('#dictionaryPanel'); panel.hidden = !panel.hidden;
    $('#dictionaryToggle').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) {
      for (const prefix of ['bible', 'hebrew']) { $('#' + prefix + 'Panel').hidden = true; $('#' + prefix + 'Toggle').setAttribute('aria-expanded', 'false'); }
      await index();
    }
  };
  $('#dictionaryLanguage').onchange = () => {
    language = $('#dictionaryLanguage').value;
    $('#dictionarySearch').value = '';
    $('#dictionarySearch').placeholder = language === 'en' ? 'Termo em inglês: faith, Jerusalem…' : 'Palavra ou assunto';
    $('#dictionaryHint').textContent = language === 'en' ? 'Edição inglesa: 3.963 verbetes. Pesquise em inglês.' : 'Tradução parcial: 61 verbetes, de A a Acaicus.';
    showBibleReader('Dicionário Bíblico', '<p>Carregando edição…</p>', { section: 'dictionary', license: false });
    index();
  };
  $('#dictionarySearchButton').onclick = search;
  $('#dictionarySearch').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); search(); } };
  $('#dictionaryIndex').onclick = () => index();
  $('#dictionaryAbout').onclick = async () => {
    const token = ++generation, selected = language;
    try {
      const edition = await load(selected); if (token !== generation) return;
      const s = edition.source;
      const editionDetails = selected === 'pt' ? `<p><strong>Tradução:</strong> ${escapeHtml(s.translators)}. Os links de histórico em cada verbete identificam os respectivos colaboradores.</p><p>Este conjunto contém somente os ${edition.entries.length} verbetes traduzidos disponíveis na fonte importada. A tradução permanece incompleta e em revisão.</p>` : `<p><strong>Digitalização e distribuição:</strong> ${escapeHtml(s.distributors)}</p><p>São ${edition.entries.length.toLocaleString('pt-BR')} verbetes, com ${s.unique_key_count.toLocaleString('pt-BR')} títulos distintos. Definições com títulos repetidos foram preservadas. Módulo Easton ${escapeHtml(s.source_version)}.</p>`;
      show('Sobre o Dicionário Bíblico', `<h2>${escapeHtml(s.name)}</h2><p><strong>Autor original:</strong> ${escapeHtml(s.author)}.</p><p>${escapeHtml(s.original)}.</p>${editionDetails}<p><strong>Licença:</strong> ${escapeHtml(s.license)}. ${link(s.license_url, 'Consultar os termos e a fonte')}.</p><p>${escapeHtml(s.adaptations)}</p><p>O texto original é uma obra histórica de 1897 e pode conter informações desatualizadas. A pesquisa desta edição permanece separada do acervo, da outra edição e do léxico hebraico.</p><p>${link(s.source_url, 'Fonte desta edição')}</p>`, edition);
    } catch (error) { if (token === generation) toast(error.message); }
  };
})();
