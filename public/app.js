const $ = selector => document.querySelector(selector);
let authMode = 'login';
let themes = [];
let selectedTheme = null;
let currentArticle = null;
let editingId = null;
let editorAttachments = [];
let savedRange = null;
let bannerSettings = {};
let imageGallery = [];
let imageIndex = -1;
let welcomeShown = false;
let currentUser = null;
let backupController = null;
let backupDirectory = null;
let backupFile = null;
let backupWritable = null;
let backupBusy = false;
let backupCompleted = false;
let selectedEditorImage = null;
const visualThemes = ['classic', 'ocean', 'sepia', 'rose', 'lavender', 'slate'];

function storedVisualTheme() {
  try { return localStorage.getItem('biblio_visual_theme'); } catch { return null; }
}

function applyVisualTheme(theme, remember = true) {
  const selected = visualThemes.includes(theme) ? theme : 'classic';
  document.documentElement.dataset.visualTheme = selected;
  document.querySelectorAll('.visualThemeChoices [data-visual-theme]').forEach(button => button.classList.toggle('active', button.dataset.visualTheme === selected));
  if (remember) { try { localStorage.setItem('biblio_visual_theme', selected); } catch {} }
  return selected;
}

async function loadInitialVisualTheme() {
  const local = storedVisualTheme();
  if (local) return applyVisualTheme(local, false);
  try {
    const settings = await fetch('/api/appearance').then(response => response.json());
    applyVisualTheme(settings.visual_theme || 'classic');
  } catch { applyVisualTheme('classic', false); }
}

async function chooseVisualTheme(theme) {
  const selected = applyVisualTheme(theme);
  $('#visualThemeMenu').hidden = true;
  $('#visualThemeButton').setAttribute('aria-expanded', 'false');
  if (currentUser) {
    try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ visual_theme: selected }) }); }
    catch (error) { toast(error.message); }
  }
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const toast = message => {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.toastDelay);
  window.toastDelay = setTimeout(() => element.classList.remove('show'), 2800);
};
const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...options });
  if (!response.ok && response.status !== 204) {
    let error = 'Não foi possível concluir a operação.';
    try { error = (await response.json()).error || error; } catch {}
    if (response.status === 401) showAuth();
    throw new Error(error);
  }
  return response.status === 204 ? null : response.json();
};

function showAuth(configured = true) {
  authMode = configured ? 'login' : 'setup';
  $('#authEyebrow').textContent = configured ? 'ACESSO PRIVADO' : 'CONFIGURAÇÃO INICIAL';
  $('#authTitle').textContent = configured ? 'Entrar na Biblio' : 'Criar acesso pessoal';
  $('#authHelp').textContent = configured ? 'Use suas credenciais para acessar seu acervo.' : 'Crie a única conta desta instalação. Use uma senha com ao menos 12 caracteres.';
  $('#authSubmit').textContent = configured ? 'Entrar' : 'Criar conta e entrar';
  $('#loginPassword').autocomplete = configured ? 'current-password' : 'new-password';
  $('#loginPassword').type = 'password';
  $('#toggleLoginPassword').textContent = 'Exibir';
  $('#toggleLoginPassword').setAttribute('aria-label', 'Exibir senha');
  $('#toggleLoginPassword').setAttribute('aria-pressed', 'false');
  $('#auth').hidden = false;
}

function applyBanner(settings = {}) {
  bannerSettings = settings;
  $('#bannerTitle').textContent = settings.banner_title || 'Minha biblioteca';
  $('#bannerSubtitle').textContent = settings.banner_subtitle || 'Leituras, ideias e referências';
  $('#customizeBanner').style.backgroundImage = settings.banner_image
    ? `url("${settings.banner_image}")`
    : 'url("/brand/reverendo-albert-banner.png")';
  $('#welcomeArtwork img').src = settings.welcome_image || '/brand/reverendo-albert-boas-vindas.png';
}

async function loadSettings() {
  applyBanner(await api('/api/settings'));
}

async function boot() {
  try {
    await loadInitialVisualTheme();
    const status = await fetch('/api/auth/status').then(response => response.json());
    if (!status.authenticated) return showAuth(status.configured);
    currentUser = status.user;
    $('#auth').hidden = true;
    await Promise.all([loadThemes(), loadSettings()]);
    await renderList();
    showWelcomePopup();
  } catch {
    showAuth(true);
  }
}

function showWelcomePopup() {
  if (welcomeShown) return;
  welcomeShown = true;
  $('#welcomePopup').hidden = false;
  setTimeout(() => $('#welcomeArtwork').focus(), 0);
}

function closeWelcomePopup() {
  $('#welcomePopup').hidden = true;
}

async function loadThemes() {
  themes = await api('/api/themes');
  $('#theme_id').innerHTML = '<option value="">Selecione um tema</option>' + themes.map(theme => `<option value="${theme.id}">${escapeHtml(theme.name)}</option>`).join('');
  $('#allCount').textContent = themes.reduce((total, theme) => total + Number(theme.article_count || 0), 0);
  $('#allThemes').classList.toggle('active', selectedTheme === null);
  $('#themeList').innerHTML = themes.map(theme => `<button class="theme ${selectedTheme === theme.id ? 'active' : ''}" data-theme="${theme.id}" type="button"><span>${escapeHtml(theme.name)}</span><span class="themeCount">${theme.article_count}</span></button>`).join('');
  document.querySelectorAll('[data-theme]').forEach(button => button.onclick = () => selectTheme(Number(button.dataset.theme)));
}

function selectTheme(theme) {
  selectedTheme = theme;
  $('#search').value = '';
  loadThemes();
  renderList();
}

async function renderList() {
  const query = $('#search').value.trim();
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  else if (selectedTheme) params.set('theme', selectedTheme);
  try {
    const articles = await api('/api/articles' + (params.size ? '?' + params : ''));
    $('#count').textContent = articles.length + (articles.length === 1 ? ' artigo' : ' artigos');
    $('#articleList').innerHTML = articles.map(article => {
      const description = article.authors.map(author => author.name).join(', ') || article.summary || article.theme?.name || 'Sem informações';
      return `<button class="article ${article.id === currentArticle?.id ? 'active' : ''}" data-id="${article.id}" type="button"><b>${escapeHtml(article.title)}</b><small>${escapeHtml(description)}</small></button>`;
    }).join('') || '<p class="muted">Nenhum artigo encontrado.</p>';
    document.querySelectorAll('.article').forEach(button => button.onclick = () => loadArticle(Number(button.dataset.id)));
  } catch (error) { toast(error.message); }
}

async function loadArticle(id) {
  try {
    currentArticle = await api('/api/articles/' + id);
    if (window.matchMedia('(max-width: 920px)').matches) {
      document.body.classList.add('library-hidden');
      $('#toggleLibrary').setAttribute('aria-pressed', 'true');
      $('#toggleLibrary').title = 'Mostrar biblioteca';
      $('#toggleLibrary').setAttribute('aria-label', 'Mostrar biblioteca');
    }
    renderReader();
    renderMedia();
    renderList();
  } catch (error) { toast(error.message); }
}

function renderReader() {
  const hasArticle = Boolean(currentArticle);
  $('#welcome').hidden = hasArticle;
  $('#reader').hidden = !hasArticle;
  $('#showInfo').disabled = !hasArticle;
  $('#editArticle').disabled = !hasArticle;
  $('#printArticle').disabled = !hasArticle;
  $('#openArticleCarousel').disabled = !hasArticle;
  $('#toggleMedia').disabled = !hasArticle;
  if (!hasArticle) return;
  $('#readerTitle').textContent = currentArticle.title;
  $('#readerTitle').style.color = currentArticle.title_color || '#253229';
  $('#readerContent').innerHTML = currentArticle.content || '<p class="muted">Este artigo ainda não possui conteúdo.</p>';
  $('#reader').scrollIntoView({ block: 'start' });
}

function printCurrentArticle() {
  if (!currentArticle) return;
  $('#printPreviewTitle').textContent = currentArticle.title;
  $('#printPreviewTitle').style.color = currentArticle.title_color || '#253229';
  $('#printPreviewContent').innerHTML = currentArticle.content || '<p>Este artigo ainda não possui conteúdo.</p>';
  $('#printDocumentTitle').textContent = currentArticle.title;
  $('#printDocumentTitle').style.color = currentArticle.title_color || '#253229';
  $('#printDocumentContent').innerHTML = currentArticle.content || '<p>Este artigo ainda não possui conteúdo.</p>';
  $('#printDialog').showModal();
}

function confirmArticlePrint() {
  if (!currentArticle) return;
  const previousTitle = document.title;
  document.title = currentArticle.title;
  const restoreTitle = () => {
    document.title = previousTitle;
    window.removeEventListener('afterprint', restoreTitle);
  };
  window.addEventListener('afterprint', restoreTitle);
  window.print();
}

function mediaUrl(attachment) {
  return '/media/' + encodeURIComponent(attachment.storage_name);
}

function articleUsesAttachment(attachment) {
  const content = currentArticle?.content || '';
  return content.includes(`data-attachment-id="${attachment.id}"`) || content.includes(`data-attachment-id='${attachment.id}'`);
}

function renderMedia() {
  const empty = $('#mediaEmpty');
  const preview = $('#mediaPreview');
  const images = (currentArticle?.attachments || []).filter(item => item.mime_type.startsWith('image/') && articleUsesAttachment(item));
  if (!currentArticle) empty.textContent = 'Selecione um artigo para ver suas imagens.';
  else if (!images.length) empty.textContent = 'Este texto não possui imagens incorporadas.';
  empty.hidden = images.length > 0;
  preview.innerHTML = images.map(attachment => {
    const url = mediaUrl(attachment);
    const name = escapeHtml(attachment.original_name);
    return `<button class="mediaCard" type="button" data-image="${url}" data-name="${name}"><img src="${url}" alt=""><span title="${name}">${name}</span></button>`;
  }).join('');
  document.querySelectorAll('[data-image]').forEach(button => button.onclick = () => openImage(button.dataset.image, button.dataset.name));
}

function toggleMedia(force) {
  const open = typeof force === 'boolean' ? force : !document.body.classList.contains('media-open');
  if (open && window.matchMedia('(max-width: 920px)').matches) document.body.classList.add('library-hidden');
  document.body.classList.toggle('media-open', open);
  $('#mediaPanel').setAttribute('aria-hidden', String(!open));
  $('#toggleMedia').setAttribute('aria-pressed', String(open));
  $('#toggleMedia').title = open ? 'Ocultar imagens' : 'Mostrar imagens';
}

function formatDate(value, includeTime = false) {
  if (!value) return 'Não informada';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', includeTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(date);
}

function showArticleInfo() {
  if (!currentArticle) return;
  const authors = currentArticle.authors.map(item => item.name).join(', ') || 'Não informados';
  const tags = currentArticle.tags.map(item => item.name).join(', ') || 'Nenhuma';
  const sources = currentArticle.sources.length
    ? `<ul class="sourceList">${currentArticle.sources.map(source => {
      const label = escapeHtml(source.title);
      const link = /^https?:\/\//i.test(source.url || '') ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
      return `<li>${link}${source.publisher ? ` — ${escapeHtml(source.publisher)}` : ''}${source.source_date ? ` (${escapeHtml(source.source_date)})` : ''}</li>`;
    }).join('')}</ul>`
    : 'Nenhuma fonte informada';
  const field = (label, value, wide = false) => `<div class="infoField${wide ? ' wide' : ''}"><dt>${label}</dt><dd>${value}</dd></div>`;
  $('#articleInfo').innerHTML = `<dl class="articleInfo" style="display:contents">${field('Título', escapeHtml(currentArticle.title), true)}${field('Autores', escapeHtml(authors))}${field('Tema', escapeHtml(currentArticle.theme?.name || 'Sem tema'))}${field('Data do texto', escapeHtml(formatDate(currentArticle.written_date)))}${field('Última edição', escapeHtml(formatDate(currentArticle.updated_at, true)))}${field('Resumo', escapeHtml(currentArticle.summary || 'Sem resumo'), true)}${field('Etiquetas', escapeHtml(tags), true)}${field('Idioma', escapeHtml(currentArticle.language || 'Não informado'))}${field('Criado em', escapeHtml(formatDate(currentArticle.created_at, true)))}${field('Fontes e referências', sources, true)}</dl>`;
  $('#infoDialog').showModal();
}

function sourcesText(sources = []) {
  return sources.map(source => [source.title, source.url, source.publisher, source.source_date].join(' | ')).join('\n');
}

function sourceValues() {
  return $('#sources').value.split('\n').map(line => line.split('|').map(value => value.trim())).filter(values => values[0]).map(([title, url, publisher, source_date]) => ({ title, url, publisher, source_date }));
}

function fillEditor(article) {
  selectEditorImage(null);
  editingId = article.id;
  editorAttachments = article.attachments || [];
  $('#status').textContent = 'EDITANDO ARTIGO';
  ['title', 'summary', 'written_date', 'language'].forEach(key => $('#' + key).value = article[key] || '');
  $('#titleColor').value = article.title_color || '#253229';
  $('#title').style.color = $('#titleColor').value;
  $('#theme_id').value = article.theme?.id || '';
  $('#authors').value = article.authors.map(author => author.name).join(', ');
  $('#tags').value = article.tags.map(tag => tag.name).join(', ');
  $('#sources').value = sourcesText(article.sources);
  $('#content').innerHTML = article.content || '';
  $('#remove').hidden = false;
  renderAttachments();
}

function editCurrentArticle() {
  if (!currentArticle) return;
  savedRange = null;
  fillEditor(currentArticle);
  $('#editorDialog').showModal();
}

function fresh() {
  selectEditorImage(null);
  editingId = null;
  editorAttachments = [];
  savedRange = null;
  $('#articleForm').reset();
  $('#content').innerHTML = '';
  $('#language').value = 'pt-BR';
  $('#titleColor').value = '#253229';
  $('#title').style.color = '#253229';
  $('#status').textContent = 'NOVO ARTIGO';
  $('#remove').hidden = true;
  renderAttachments();
  $('#editorDialog').showModal();
  setTimeout(() => $('#title').focus(), 0);
}

function articlePayload() {
  const payload = Object.fromEntries(new FormData($('#articleForm')));
  const content = $('#content').cloneNode(true);
  content.querySelectorAll('.selectedEditorImage').forEach(image => image.classList.remove('selectedEditorImage'));
  payload.content = content.innerHTML;
  payload.sources = sourceValues();
  return payload;
}

async function saveArticle() {
  if (!$('#articleForm').reportValidity()) throw new Error('Preencha o título e escolha um tema antes de salvar.');
  const article = await api(editingId ? '/api/articles/' + editingId : '/api/articles', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(articlePayload()) });
  editingId = article.id;
  $('#status').textContent = 'EDITANDO ARTIGO';
  $('#remove').hidden = false;
  return article;
}

function renderAttachments() {
  const content = $('#content').innerHTML;
  $('#attachments').innerHTML = editorAttachments.map(attachment => {
    const image = attachment.mime_type.startsWith('image/');
    const inserted = content.includes(`data-attachment-id="${attachment.id}"`) || content.includes(`data-attachment-id='${attachment.id}'`);
    const insert = image && !inserted ? `<button class="attachmentInsert" type="button" data-insert="${attachment.id}">Inserir no texto</button>` : '';
    return `<div class="attachment"><a href="${mediaUrl(attachment)}" target="_blank" rel="noopener">${escapeHtml(attachment.original_name)}</a>${insert}<button class="attachmentDelete" type="button" data-delete="${attachment.id}" aria-label="Excluir anexo">×</button></div>`;
  }).join('');
  document.querySelectorAll('[data-insert]').forEach(button => button.onclick = async () => {
    const attachment = editorAttachments.find(item => item.id === Number(button.dataset.insert));
    if (!attachment) return;
    try {
      insertAttachmentFigure(attachment);
      await saveArticle();
      renderAttachments();
      toast('Imagem inserida no texto.');
    } catch (error) { toast(error.message); }
  });
  document.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => {
    try {
      await api('/api/attachments/' + button.dataset.delete, { method: 'DELETE' });
      const removed = editorAttachments.find(item => item.id === Number(button.dataset.delete));
      editorAttachments = editorAttachments.filter(item => item.id !== Number(button.dataset.delete));
      if (removed) document.querySelectorAll(`#content img[data-attachment-id="${removed.id}"]`).forEach(image => (image.closest('figure') || image).remove());
      renderAttachments();
      toast('Anexo excluído.');
    } catch (error) { toast(error.message); }
  });
}

function rememberSelection() {
  const selection = window.getSelection();
  if (selection.rangeCount && $('#content').contains(selection.getRangeAt(0).commonAncestorContainer)) savedRange = selection.getRangeAt(0).cloneRange();
}

function restoreSelection() {
  const content = $('#content');
  const selection = window.getSelection();
  selection.removeAllRanges();
  if (savedRange && content.contains(savedRange.commonAncestorContainer)) selection.addRange(savedRange);
  else {
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    selection.addRange(range);
  }
}

function runCommand(command, value = null) {
  restoreSelection();
  document.execCommand('styleWithCSS', false, false);
  document.execCommand(command, false, value);
  rememberSelection();
  $('#content').focus();
}

function setLineSpacing(value) {
  const content = $('#content');
  restoreSelection();
  let range = window.getSelection().getRangeAt(0);
  const blocks = [...content.querySelectorAll('p,div,h2,h3,blockquote,li')].filter(element => {
    try { return range.intersectsNode(element); } catch { return false; }
  });
  if (!blocks.length) {
    const directText = range.commonAncestorContainer.nodeType === Node.TEXT_NODE && range.commonAncestorContainer.parentElement === content
      ? range.commonAncestorContainer
      : null;
    if (directText) {
      const paragraph = document.createElement('p');
      content.insertBefore(paragraph, directText);
      paragraph.appendChild(directText);
      blocks.push(paragraph);
    }
  }
  if (!blocks.length) {
    let element = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    element = element?.closest('p,div,h2,h3,blockquote,li');
    if (element && element !== content && content.contains(element)) blocks.push(element);
  }
  if (!blocks.length) {
    document.execCommand('formatBlock', false, 'p');
    const selection = window.getSelection();
    range = selection.rangeCount ? selection.getRangeAt(0) : null;
    let element = range?.commonAncestorContainer || null;
    element = element?.nodeType === Node.ELEMENT_NODE ? element : element?.parentElement;
    element = element?.closest('p,div,h2,h3,blockquote,li');
    if (element && element !== content && content.contains(element)) blocks.push(element);
  }
  blocks.forEach(element => { element.style.lineHeight = value; });
  rememberSelection();
  $('#content').focus();
}

function selectEditorImage(image) {
  selectedEditorImage?.classList.remove('selectedEditorImage');
  selectedEditorImage = image && $('#content')?.contains(image) ? image : null;
  selectedEditorImage?.classList.add('selectedEditorImage');
  const control = $('#imageSize');
  if (!control) return;
  control.disabled = !selectedEditorImage;
  const width = selectedEditorImage?.style.width?.replace('%', '');
  control.value = ['25', '50', '75', '100'].includes(width) ? width : selectedEditorImage ? 'original' : '';
}

function setEditorImageSize(value) {
  if (!selectedEditorImage || !$('#content').contains(selectedEditorImage)) return selectEditorImage(null);
  if (value === 'original') {
    selectedEditorImage.style.removeProperty('width');
    selectedEditorImage.style.removeProperty('height');
    if (!selectedEditorImage.getAttribute('style')) selectedEditorImage.removeAttribute('style');
  } else if (['25', '50', '75', '100'].includes(value)) {
    selectedEditorImage.style.width = `${value}%`;
    selectedEditorImage.style.height = 'auto';
  }
  toast(value === 'original' ? 'Tamanho original aplicado.' : `Imagem ajustada para ${value}% do texto.`);
}

function setupRichEditor() {
  const toolbar = $('#editorToolbar');
  toolbar.addEventListener('mousedown', event => { if (event.target.closest('button')) event.preventDefault(); });
  toolbar.querySelectorAll('[data-command]').forEach(button => button.onclick = () => runCommand(button.dataset.command));
  $('#alignmentButton').onclick = event => {
    event.stopPropagation();
    const opening = $('#alignmentMenu').hidden;
    $('#alignmentMenu').hidden = !opening;
    $('#alignmentButton').setAttribute('aria-expanded', String(opening));
  };
  document.querySelectorAll('[data-align]').forEach(button => button.onclick = () => {
    runCommand(button.dataset.align);
    $('#alignmentMenu').hidden = true;
    $('#alignmentButton').setAttribute('aria-expanded', 'false');
  });
  $('#blockFormat').onchange = event => { runCommand('formatBlock', event.target.value); event.target.value = 'p'; };
  $('#fontSize').onchange = event => { if (event.target.value) runCommand('fontSize', event.target.value); event.target.value = ''; };
  $('#lineSpacing').onchange = event => { if (event.target.value) setLineSpacing(event.target.value); event.target.value = ''; };
  $('#imageSize').onchange = event => setEditorImageSize(event.target.value);
  $('#fontColor').oninput = event => runCommand('foreColor', event.target.value);
  $('#insertLink').onclick = () => { const href = prompt('Endereço do link:'); if (href) runCommand('createLink', href.trim()); };
  $('#insertImage').onclick = () => { rememberSelection(); $('#inlineImageInput').click(); };
  $('#inlineImageInput').onchange = async event => { const file = event.target.files[0]; event.target.value = ''; if (file) await insertInlineImage(file); };
  $('#files').onchange = async event => {
    const files = [...event.target.files];
    if (!files.length) return;
    try {
      await addEditorFiles(files);
      event.target.value = '';
      toast(files.some(file => file.type.startsWith('image/')) ? 'Imagem inserida no texto.' : 'Vídeo anexado ao artigo.');
    } catch (error) { toast(error.message); }
  };
  $('#content').addEventListener('keyup', rememberSelection);
  $('#content').addEventListener('mouseup', rememberSelection);
  $('#content').addEventListener('focus', rememberSelection);
  $('#content').addEventListener('click', event => selectEditorImage(event.target.closest('img')));
  $('#content').addEventListener('paste', event => {
    const image = [...event.clipboardData.items].find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
    if (!image) return;
    event.preventDefault();
    rememberSelection();
    insertInlineImage(image);
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
}

function imageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler as dimensões da imagem.')); };
    image.src = url;
  });
}

async function validateAppearanceImage(file, type) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) throw new Error('A imagem excede o limite de 5 MB.');
  const { width, height } = await imageDimensions(file);
  const ratio = width / height;
  if (type === 'banner' && (width < 1200 || height < 480 || ratio < 2.3 || ratio > 2.7)) {
    throw new Error(`O banner selecionado tem ${width} × ${height} px. Use proporção 5:2 e no mínimo 1200 × 480 px.`);
  }
  if (type === 'welcome' && (width < 800 || height < 1200 || ratio < .62 || ratio > .72)) {
    throw new Error(`A imagem do popup tem ${width} × ${height} px. Use proporção vertical 2:3 e no mínimo 800 × 1200 px.`);
  }
}

async function uploadFile(file) {
  if (!editingId) throw new Error('Salve o artigo antes de enviar anexos.');
  if (file.size > 25 * 1024 * 1024) throw new Error(file.name + ' excede 25 MB.');
  return api('/api/articles/' + editingId + '/attachments', { method: 'POST', body: JSON.stringify({ name: file.name, dataUrl: await readFile(file) }) });
}

function insertAttachmentFigure(attachment) {
  restoreSelection();
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  image.src = mediaUrl(attachment);
  image.alt = attachment.original_name;
  image.dataset.attachmentId = attachment.id;
  const caption = document.createElement('figcaption');
  caption.textContent = attachment.original_name;
  figure.append(image, caption);
  const paragraph = document.createElement('p');
  paragraph.append(document.createElement('br'));
  range.deleteContents();
  range.insertNode(figure);
  figure.after(paragraph);
  range.selectNodeContents(paragraph);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  savedRange = range.cloneRange();
  selectEditorImage(image);
}

async function insertInlineImage(file) {
  try {
    if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem compatível.');
    await addEditorFiles([file]);
    toast('Imagem inserida no texto.');
  } catch (error) { toast(error.message); }
}

async function addEditorFiles(files) {
  await saveArticle();
  let insertedImage = false;
  for (const file of files) {
    const attachment = await uploadFile(file);
    editorAttachments.unshift(attachment);
    if (attachment.mime_type.startsWith('image/')) {
      insertAttachmentFigure(attachment);
      insertedImage = true;
    }
  }
  if (insertedImage) await saveArticle();
  renderAttachments();
}

function readerImages() {
  return [...document.querySelectorAll('#readerContent img')].map(image => ({ url: image.getAttribute('src') || image.src, name: image.alt || currentArticle?.title || 'Imagem do artigo' }));
}

function comparableUrl(url) {
  try { return new URL(url, location.href).pathname; } catch { return url; }
}

function showGalleryImage(index) {
  if (!imageGallery.length) return;
  imageIndex = Math.max(0, Math.min(index, imageGallery.length - 1));
  const item = imageGallery[imageIndex];
  $('#imageModal img').src = item.url;
  $('#imageModal img').alt = item.name;
  $('#imageCaption').textContent = item.name;
  $('#previousImage').disabled = imageIndex === 0;
  $('#nextImage').disabled = imageIndex === imageGallery.length - 1;
}

function openImage(url, name) {
  imageGallery = readerImages();
  imageIndex = imageGallery.findIndex(item => comparableUrl(item.url) === comparableUrl(url));
  if (imageIndex < 0) {
    imageGallery.push({ url, name });
    imageIndex = imageGallery.length - 1;
  }
  showGalleryImage(imageIndex);
  $('#imageModal').hidden = false;
}

function openArticleCarousel() {
  const images = readerImages();
  if (!images.length) return toast('Este artigo não possui imagens incorporadas.');
  openImage(images[0].url, images[0].name);
}

function closeImage() {
  $('#imageModal').hidden = true;
  $('#imageModal img').removeAttribute('src');
  $('#imageCaption').textContent = '';
}

function setupRestore() {
  $('#restoreButton').onclick = () => $('#restoreInput').click();
  $('#restoreInput').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('A restauração substituirá a biblioteca atual. Uma cópia dos dados atuais será preservada. Continuar?')) { event.target.value = ''; return; }
    try {
      await api('/api/restore', { method: 'POST', body: JSON.stringify({ dataUrl: await readFile(file) }) });
      toast('Restauração em andamento. A Biblio será reiniciada.');
    } catch (error) { toast(error.message); }
    finally { event.target.value = ''; }
  };
}

function setupDialogs() {
  document.querySelectorAll('.closeDialog').forEach(button => button.onclick = () => button.closest('dialog').close());
  $('#closeEditor').onclick = () => $('#editorDialog').close();
  [$('#infoDialog'), $('#customizeDialog'), $('#printDialog')].forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
  $('#backupDialog').addEventListener('click', event => { if (event.target === $('#backupDialog') && !backupBusy) $('#backupDialog').close(); });
  $('#backupDialog').addEventListener('cancel', event => { if (backupBusy) { event.preventDefault(); backupController?.abort(); } });
}

function backupFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `biblio-backup-${stamp}.zip`;
}

function resetBackupDialog() {
  backupDirectory = null;
  backupFile = null;
  backupWritable = null;
  backupBusy = false;
  backupCompleted = false;
  $('#backupStatus').textContent = 'Escolha a pasta onde deseja guardar a cópia.';
  $('#backupDestinationLabel').textContent = 'Nenhuma pasta escolhida';
  $('#backupProgress').value = 0;
  $('#backupPercent').textContent = '0%';
  $('#backupDetail').textContent = 'A cópia só começa depois que você escolher o destino.';
  $('#chooseBackupFolder').disabled = false;
  $('#startBackup').disabled = true;
  $('#startBackup').textContent = 'Iniciar backup';
  $('#cancelBackup').disabled = true;
  $('#closeBackup').disabled = false;
}

function updateBackupProgress(received, total) {
  if (total) {
    const percent = Math.min(100, Math.round(received / total * 100));
    $('#backupProgress').value = percent;
    $('#backupPercent').textContent = `${percent}%`;
    $('#backupDetail').textContent = `${(received / 1024 / 1024).toFixed(1)} MB de ${(total / 1024 / 1024).toFixed(1)} MB`;
  } else {
    $('#backupDetail').textContent = `${(received / 1024 / 1024).toFixed(1)} MB recebidos`;
  }
}

async function runBackup() {
  if (backupBusy) return;
  backupBusy = true;
  backupController = new AbortController();
  $('#backupStatus').textContent = 'Preparando a cópia…';
  $('#chooseBackupFolder').disabled = true;
  $('#startBackup').disabled = true;
  $('#cancelBackup').disabled = false;
  $('#closeBackup').disabled = true;
  try {
    const response = await fetch('/api/backup', { signal: backupController.signal });
    if (!response.ok) throw new Error('Não foi possível gerar o backup.');
    const total = Number(response.headers.get('content-length')) || 0;
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || backupFilename();
    let writable = null;
    if (backupDirectory) writable = await backupDirectory.getFileHandle(filename, { create: true }).then(handle => handle.createWritable());
    else if (backupFile) writable = await backupFile.createWritable();
    backupWritable = writable;
    const reader = response.body?.getReader();
    const chunks = [];
    let received = 0;
    if (reader) {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        received += part.value.byteLength;
        if (writable) await writable.write(part.value);
        else chunks.push(part.value);
        updateBackupProgress(received, total);
      }
    } else {
      const value = new Uint8Array(await response.arrayBuffer());
      received = value.byteLength;
      if (writable) await writable.write(value);
      else chunks.push(value);
      updateBackupProgress(received, total);
    }
    if (writable) await writable.close();
    else {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob(chunks, { type: 'application/zip' }));
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    backupWritable = null;
    $('#backupProgress').value = 100;
    $('#backupPercent').textContent = '100%';
    $('#backupStatus').textContent = 'Backup concluído';
    $('#backupDetail').textContent = `Arquivo salvo como ${filename}.`;
    backupCompleted = true;
    $('#startBackup').textContent = 'Fechar';
    $('#startBackup').disabled = false;
    toast('Backup concluído.');
  } catch (error) {
    if (backupWritable) { try { await backupWritable.abort(); } catch {} }
    if (error.name === 'AbortError') {
      $('#backupStatus').textContent = 'Backup cancelado';
      $('#backupDetail').textContent = 'A operação foi interrompida antes da conclusão.';
    } else {
      $('#backupStatus').textContent = 'Não foi possível concluir o backup';
      $('#backupDetail').textContent = error.message;
      toast(error.message);
    }
  } finally {
    backupBusy = false;
    backupController = null;
    backupWritable = null;
    $('#chooseBackupFolder').disabled = false;
    if (!backupCompleted) {
      $('#startBackup').disabled = !backupDirectory && !backupFile;
      $('#startBackup').textContent = 'Iniciar backup';
    }
    $('#cancelBackup').disabled = true;
    $('#closeBackup').disabled = false;
  }
}

$('#toggleLibrary').onclick = () => {
  const hidden = document.body.classList.toggle('library-hidden');
  $('#toggleLibrary').setAttribute('aria-pressed', String(hidden));
  $('#toggleLibrary').title = hidden ? 'Mostrar biblioteca' : 'Ocultar biblioteca';
  $('#toggleLibrary').setAttribute('aria-label', hidden ? 'Mostrar biblioteca' : 'Ocultar biblioteca');
};
$('#toggleMedia').onclick = () => toggleMedia();
$('#closeMedia').onclick = () => toggleMedia(false);
$('#showInfo').onclick = showArticleInfo;
$('#editArticle').onclick = editCurrentArticle;
$('#printArticle').onclick = printCurrentArticle;
$('#openArticleCarousel').onclick = openArticleCarousel;
$('#confirmPrint').onclick = confirmArticlePrint;
$('#newArticle').onclick = fresh;
$('#sidebarNewArticle').onclick = fresh;
$('#emptyNew').onclick = fresh;
$('#allThemes').onclick = () => selectTheme(null);
$('#searchButton').onclick = renderList;
$('#titleColor').oninput = event => { $('#title').style.color = event.target.value; };
$('#search').oninput = () => { if ($('#search').value.trim()) selectedTheme = null; clearTimeout(window.searchDelay); window.searchDelay = setTimeout(() => { loadThemes(); renderList(); }, 220); };
$('#addTheme').onclick = async () => {
  const name = prompt('Nome do novo tema:');
  if (!name) return;
  try { await api('/api/themes', { method: 'POST', body: JSON.stringify({ name }) }); await loadThemes(); toast('Tema cadastrado.'); }
  catch (error) { toast(error.message); }
};

$('#articleForm').onsubmit = async event => {
  event.preventDefault();
  try {
    await saveArticle();
    const files = [...$('#files').files];
    if (files.length) await addEditorFiles(files);
    $('#files').value = '';
    currentArticle = await api('/api/articles/' + editingId);
    $('#editorDialog').close();
    renderReader();
    renderMedia();
    await Promise.all([renderList(), loadThemes()]);
    toast('Artigo salvo. Modo de leitura aberto.');
  } catch (error) { toast(error.message); }
};

$('#remove').onclick = async () => {
  if (!editingId || !confirm('Excluir este artigo? Esta ação não pode ser desfeita.')) return;
  try {
    await api('/api/articles/' + editingId, { method: 'DELETE' });
    if (currentArticle?.id === editingId) currentArticle = null;
    editingId = null;
    editorAttachments = [];
    $('#editorDialog').close();
    toggleMedia(false);
    renderReader();
    renderMedia();
    await Promise.all([renderList(), loadThemes()]);
    toast('Artigo excluído.');
  } catch (error) { toast(error.message); }
};

$('#customizeBanner').onclick = () => {
  $('#customTitle').value = bannerSettings.banner_title || '';
  $('#customSubtitle').value = bannerSettings.banner_subtitle || '';
  $('#customImage').value = '';
  $('#customWelcomeImage').value = '';
  $('#removeBannerImage').checked = false;
  $('#removeWelcomeImage').checked = false;
  $('#customBannerPreview').src = bannerSettings.banner_image || '/brand/reverendo-albert-banner.png';
  $('#customWelcomePreview').src = bannerSettings.welcome_image || '/brand/reverendo-albert-boas-vindas.png';
  $('#accountUsername').value = currentUser?.username || '';
  $('#accountCurrentPassword').value = '';
  $('#accountNewPassword').value = '';
  $('#accountConfirmPassword').value = '';
  $('#customizeDialog').showModal();
};

$('#saveAccount').onclick = async () => {
  const username = $('#accountUsername').value.trim();
  const currentPassword = $('#accountCurrentPassword').value;
  const newPassword = $('#accountNewPassword').value;
  const confirmPassword = $('#accountConfirmPassword').value;
  if (!currentPassword) return toast('Informe a senha atual para confirmar.');
  if (newPassword && newPassword !== confirmPassword) return toast('A confirmação da nova senha não confere.');
  try {
    const account = await api('/api/auth/account', { method: 'PUT', body: JSON.stringify({ username, current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword }) });
    currentUser = { username: account.username };
    $('#accountCurrentPassword').value = '';
    $('#accountNewPassword').value = '';
    $('#accountConfirmPassword').value = '';
    toast('Dados de acesso atualizados.');
  } catch (error) { toast(error.message); }
};

$('#customImage').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { await validateAppearanceImage(file, 'banner'); $('#customBannerPreview').src = await readFile(file); $('#removeBannerImage').checked = false; }
  catch (error) { event.target.value = ''; toast(error.message); }
};

$('#customWelcomeImage').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { await validateAppearanceImage(file, 'welcome'); $('#customWelcomePreview').src = await readFile(file); $('#removeWelcomeImage').checked = false; }
  catch (error) { event.target.value = ''; toast(error.message); }
};
$('#removeBannerImage').onchange = event => { if (event.target.checked) $('#customBannerPreview').src = '/brand/reverendo-albert-banner.png'; };
$('#removeWelcomeImage').onchange = event => { if (event.target.checked) $('#customWelcomePreview').src = '/brand/reverendo-albert-boas-vindas.png'; };

$('#customizeForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const bannerFile = $('#customImage').files[0];
    const welcomeFile = $('#customWelcomeImage').files[0];
    await validateAppearanceImage(bannerFile, 'banner');
    await validateAppearanceImage(welcomeFile, 'welcome');
    const payload = { banner_title: $('#customTitle').value.trim(), banner_subtitle: $('#customSubtitle').value.trim() };
    if ($('#removeBannerImage').checked) payload.banner_image = '';
    else if (bannerFile) payload.banner_image = await readFile(bannerFile);
    if ($('#removeWelcomeImage').checked) payload.welcome_image = '';
    else if (welcomeFile) payload.welcome_image = await readFile(welcomeFile);
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
    await loadSettings();
    $('#customizeDialog').close();
    toast('Cabeçalho personalizado.');
  } catch (error) { toast(error.message); }
};

$('#readerContent').onclick = event => {
  const image = event.target.closest('img');
  if (image) openImage(image.src, image.alt || currentArticle?.title || 'Imagem do artigo');
};
$('#imageModal').onclick = event => { if (event.target === $('#imageModal') || event.target === $('#closeImage')) closeImage(); };
$('#previousImage').onclick = () => showGalleryImage(imageIndex - 1);
$('#nextImage').onclick = () => showGalleryImage(imageIndex + 1);
document.addEventListener('click', event => {
  if (!event.target.closest('.toolbarMenu')) {
    $('#alignmentMenu').hidden = true;
    $('#alignmentButton').setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#welcomePopup').hidden) {
    closeWelcomePopup();
    return;
  }
  if ($('#imageModal').hidden) return;
  if (event.key === 'Escape') closeImage();
  if (event.key === 'ArrowLeft' && imageIndex > 0) showGalleryImage(imageIndex - 1);
  if (event.key === 'ArrowRight' && imageIndex < imageGallery.length - 1) showGalleryImage(imageIndex + 1);
});

$('#authForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const account = await api(authMode === 'setup' ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#loginUsername').value, password: $('#loginPassword').value }) });
    currentUser = { username: account.username };
    try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ visual_theme: applyVisualTheme(document.documentElement.dataset.visualTheme) }) }); } catch {}
    $('#auth').hidden = true;
    $('#loginPassword').value = '';
    await Promise.all([loadThemes(), loadSettings()]);
    await renderList();
    showWelcomePopup();
    toast('Acesso liberado.');
  } catch (error) { toast(error.message); }
};
$('#toggleLoginPassword').onclick = () => {
  const showing = $('#loginPassword').type === 'text';
  $('#loginPassword').type = showing ? 'password' : 'text';
  $('#toggleLoginPassword').textContent = showing ? 'Exibir' : 'Ocultar';
  $('#toggleLoginPassword').setAttribute('aria-label', showing ? 'Exibir senha' : 'Ocultar senha');
  $('#toggleLoginPassword').setAttribute('aria-pressed', String(!showing));
  $('#loginPassword').focus();
};
$('#visualThemeButton').onclick = event => {
  event.stopPropagation();
  const opening = $('#visualThemeMenu').hidden;
  $('#visualThemeMenu').hidden = !opening;
  $('#visualThemeButton').setAttribute('aria-expanded', String(opening));
};
document.querySelectorAll('.visualThemeChoices [data-visual-theme]').forEach(button => button.onclick = () => chooseVisualTheme(button.dataset.visualTheme));
document.addEventListener('click', event => {
  if (!event.target.closest('.visualThemePicker')) {
    $('#visualThemeMenu').hidden = true;
    $('#visualThemeButton').setAttribute('aria-expanded', 'false');
  }
});
$('#welcomeArtwork').onclick = closeWelcomePopup;
$('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); currentUser = null; welcomeShown = false; closeWelcomePopup(); showAuth(true); };

$('#backupButton').onclick = () => { resetBackupDialog(); $('#backupDialog').showModal(); };
$('#chooseBackupFolder').onclick = async () => {
  try {
    if ('showDirectoryPicker' in window) {
      backupDirectory = await window.showDirectoryPicker({ mode: 'readwrite' });
      backupFile = null;
      $('#backupDestinationLabel').textContent = `Pasta: ${backupDirectory.name || 'escolhida'}`;
      $('#backupDetail').textContent = 'A Biblio criará o arquivo ZIP dentro desta pasta.';
    } else if ('showSaveFilePicker' in window) {
      backupFile = await window.showSaveFilePicker({ suggestedName: backupFilename(), types: [{ description: 'Backup da Biblio', accept: { 'application/zip': ['.zip'] } }] });
      backupDirectory = null;
      $('#backupDestinationLabel').textContent = 'Arquivo de backup escolhido';
      $('#backupDetail').textContent = 'O arquivo ZIP será gravado no local selecionado.';
    } else {
      backupDirectory = null;
      backupFile = null;
      $('#backupDestinationLabel').textContent = 'Download padrão do navegador';
      $('#backupDetail').textContent = 'Este navegador não permite escolher pastas; a cópia será baixada automaticamente.';
    }
    backupCompleted = false;
    $('#startBackup').textContent = 'Iniciar backup';
    $('#startBackup').disabled = false;
    $('#backupStatus').textContent = 'Destino pronto. Você pode iniciar o backup.';
  } catch (error) {
    if (error.name !== 'AbortError') toast(error.message || 'Não foi possível escolher o destino.');
  }
};
$('#startBackup').onclick = () => { if (backupCompleted) $('#backupDialog').close(); else runBackup(); };
$('#cancelBackup').onclick = () => { if (backupController) backupController.abort(); };
$('#closeBackup').onclick = () => { if (!backupBusy) $('#backupDialog').close(); };

setupRestore();
setupDialogs();
setupRichEditor();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
boot();
