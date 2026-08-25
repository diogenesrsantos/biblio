const $ = selector => document.querySelector(selector);
let currentId = null;
let currentAttachments = [];
let authMode = 'login';
let themes = [];
let selectedTheme = null;
let savedRange = null;
let previewMode = false;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const toast = message => { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2600); };
const api = async (url, options = {}) => {
  const response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...options });
  if (!response.ok && response.status !== 204) {
    const error = (await response.json()).error || 'Não foi possível concluir a operação.';
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
  $('#auth').hidden = false;
}

function setupCollapsibleHeader() {
  const form = $('#articleForm');
  const contentField = $('.contentField');
  const header = document.createElement('div');
  header.className = 'articleHeader';
  form.insertBefore(header, form.firstChild);
  while (header.nextSibling && header.nextSibling !== contentField) header.append(header.nextSibling);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'headerToggle';
  toggle.textContent = 'Retrair';
  toggle.onclick = () => {
    const collapsed = header.classList.toggle('collapsed');
    toggle.textContent = collapsed ? 'Expandir' : 'Retrair';
  };
  header.querySelector('.actions').prepend(toggle);
}

function setupSearchButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'searchButton';
  button.textContent = 'Pesquisar';
  button.onclick = () => renderList();
  $('.search').append(button);
}

function setPreviewMode(enabled) {
  previewMode = enabled;
  $('#content').contentEditable = String(!enabled);
  $('.richEditor').classList.toggle('preview', enabled);
  $('#previewContent').textContent = enabled ? 'Editar' : 'Visualizar';
  if (!enabled) $('#content').focus();
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
  setPreviewMode(false);
  restoreSelection();
  document.execCommand(command, false, value);
  rememberSelection();
  $('#content').focus();
}

function setupRichEditor() {
  const toolbar = $('#editorToolbar');
  toolbar.addEventListener('mousedown', event => { if (event.target.closest('button')) event.preventDefault(); });
  toolbar.querySelectorAll('[data-command]').forEach(button => button.onclick = () => runCommand(button.dataset.command));
  $('#blockFormat').onchange = event => { runCommand('formatBlock', event.target.value); event.target.value = 'p'; };
  $('#insertLink').onclick = () => {
    const href = prompt('Endereço do link:');
    if (href) runCommand('createLink', href.trim());
  };
  $('#insertImage').onclick = () => { setPreviewMode(false); rememberSelection(); $('#inlineImageInput').click(); };
  $('#inlineImageInput').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) await insertInlineImage(file);
  };
  $('#previewContent').onclick = () => setPreviewMode(!previewMode);
  $('#content').addEventListener('keyup', rememberSelection);
  $('#content').addEventListener('mouseup', rememberSelection);
  $('#content').addEventListener('focus', rememberSelection);
  $('#content').addEventListener('paste', event => {
    const image = [...event.clipboardData.items].find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
    if (!image) return;
    event.preventDefault();
    rememberSelection();
    insertInlineImage(image);
  });
}

async function boot() {
  try {
    const status = await fetch('/api/auth/status').then(response => response.json());
    if (!status.authenticated) return showAuth(status.configured);
    $('#auth').hidden = true;
    await loadThemes();
    renderList();
  } catch {
    showAuth(true);
  }
}

async function loadThemes() {
  themes = await api('/api/themes');
  $('#theme_id').innerHTML = '<option value="">Selecione um tema</option>' + themes.map(theme => `<option value="${theme.id}">${escapeHtml(theme.name)}</option>`).join('');
  $('#themeList').innerHTML = themes.map(theme => `<button class="theme ${selectedTheme === theme.id ? 'active' : ''}" data-theme="${theme.id}"><span>${escapeHtml(theme.name)}</span><span class="themeCount">${theme.article_count}</span></button>`).join('');
  document.querySelectorAll('[data-theme]').forEach(button => button.onclick = () => {
    selectedTheme = Number(button.dataset.theme);
    $('#search').value = '';
    renderList();
    loadThemes();
  });
}

function mediaUrl(attachment) { return '/media/' + encodeURIComponent(attachment.storage_name); }

function renderMedia() {
  const empty = $('#mediaEmpty');
  const preview = $('#mediaPreview');
  if (!currentId) {
    empty.textContent = 'Selecione um artigo para ver suas mídias.';
    empty.hidden = false;
    preview.innerHTML = '';
    return;
  }
  if (!currentAttachments.length) {
    empty.textContent = 'Este artigo ainda não possui fotos ou vídeos.';
    empty.hidden = false;
    preview.innerHTML = '';
    return;
  }
  empty.hidden = true;
  preview.innerHTML = currentAttachments.map(attachment => {
    const url = mediaUrl(attachment);
    const name = escapeHtml(attachment.original_name);
    const image = attachment.mime_type.startsWith('image/');
    if (image) return `<div class="mediaItem"><button class="mediaCard mediaImage" type="button" data-image="${url}" data-name="${name}"><img src="${url}" alt=""><span class="mediaType">FOTO</span><span title="${name}">${name}</span></button><button class="mediaInsert" type="button" data-insert-attachment="${attachment.id}">Inserir no texto</button></div>`;
    return `<a class="mediaCard" href="${url}" target="_blank" rel="noopener"><video src="${url}" muted preload="metadata"></video><span class="mediaType">VÍDEO</span><span title="${name}">${name}</span></a>`;
  }).join('');
  document.querySelectorAll('[data-image]').forEach(button => button.onclick = () => openImage(button.dataset.image, button.dataset.name));
  document.querySelectorAll('[data-insert-attachment]').forEach(button => button.onclick = async () => {
    const attachment = currentAttachments.find(item => item.id === Number(button.dataset.insertAttachment));
    if (!attachment) return;
    insertAttachmentFigure(attachment);
    await saveArticle();
    toast('Imagem inserida no texto.');
  });
}

function setupImageModal() {
  const modal = document.createElement('div');
  modal.className = 'imageModal';
  modal.hidden = true;
  modal.innerHTML = '<button type="button" class="closeImage" aria-label="Fechar imagem">×</button><img alt="">';
  modal.onclick = event => { if (event.target === modal || event.target.classList.contains('closeImage')) modal.hidden = true; };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') modal.hidden = true; });
  document.body.append(modal);
  window.openImage = (url, name) => { modal.querySelector('img').src = url; modal.querySelector('img').alt = name; modal.hidden = false; };
}

function sourcesText(sources = []) { return sources.map(source => [source.title, source.url, source.publisher, source.source_date].join(' | ')).join('\n'); }
function sourceValues() { return $('#sources').value.split('\n').map(line => line.split('|').map(value => value.trim())).filter(values => values[0]).map(([title, url, publisher, source_date]) => ({ title, url, publisher, source_date })); }

function renderAttachments() {
  $('#attachments').innerHTML = currentAttachments.map(attachment => `<div class="attachment"><a href="${mediaUrl(attachment)}" target="_blank" rel="noopener">${escapeHtml(attachment.original_name)}</a> <button type="button" data-delete="${attachment.id}" aria-label="Excluir anexo">×</button></div>`).join('');
  document.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => {
    try {
      await api('/api/attachments/' + button.dataset.delete, { method: 'DELETE' });
      const removed = currentAttachments.find(attachment => attachment.id === Number(button.dataset.delete));
      currentAttachments = currentAttachments.filter(attachment => attachment.id !== Number(button.dataset.delete));
      if (removed) document.querySelectorAll(`#content img[data-attachment-id="${removed.id}"]`).forEach(image => (image.closest('figure') || image).remove());
      renderAttachments();
      renderMedia();
      toast('Anexo excluído.');
    } catch (error) { toast(error.message); }
  });
}

function setEditorContent(value) {
  const content = $('#content');
  content.innerHTML = value || '';
}

function fill(article) {
  currentId = article.id;
  $('#welcome').hidden = true;
  $('#editor').hidden = false;
  $('#status').textContent = 'EDITANDO ARTIGO';
  ['title', 'summary', 'written_date', 'language'].forEach(key => $('#' + key).value = article[key] || '');
  setEditorContent(article.content);
  $('#theme_id').value = article.theme?.id || '';
  $('#authors').value = article.authors.map(author => author.name).join(', ');
  $('#tags').value = article.tags.map(tag => tag.name).join(', ');
  $('#sources').value = sourcesText(article.sources);
  currentAttachments = article.attachments;
  setPreviewMode(false);
  renderAttachments();
  renderMedia();
  $('#remove').hidden = false;
}

async function load(id) {
  try { fill(await api('/api/articles/' + id)); renderList(); }
  catch (error) { toast(error.message); }
}

async function renderList() {
  const query = $('#search').value.trim();
  const params = new URLSearchParams();
  if (query) params.set('q', query); else if (selectedTheme) params.set('theme', selectedTheme);
  try {
    const articles = await api('/api/articles' + (params.size ? '?' + params : ''));
    $('#count').textContent = articles.length + (articles.length === 1 ? ' artigo' : ' artigos');
    $('#articleList').innerHTML = articles.map(article => {
      const description = article.summary || article.authors.map(author => author.name).join(', ') || 'Sem resumo';
      return `<button class="article ${article.id === currentId ? 'active' : ''}" data-id="${article.id}"><b>${escapeHtml(article.title)}</b><small>${escapeHtml(article.theme?.name || 'Sem tema')} · ${escapeHtml(description)}</small></button>`;
    }).join('') || '<p class="muted">Nenhum artigo encontrado.</p>';
    document.querySelectorAll('.article').forEach(button => button.onclick = () => load(button.dataset.id));
  } catch (error) { toast(error.message); }
}

function fresh() {
  currentId = null;
  currentAttachments = [];
  savedRange = null;
  $('#articleForm').reset();
  $('#content').innerHTML = '';
  $('#language').value = 'pt-BR';
  $('#status').textContent = 'NOVO ARTIGO';
  $('.articleHeader').classList.remove('collapsed');
  $('.headerToggle').textContent = 'Retrair';
  $('#welcome').hidden = true;
  $('#editor').hidden = false;
  $('#remove').hidden = true;
  setPreviewMode(false);
  renderAttachments();
  renderMedia();
  $('#title').focus();
}

function articlePayload() {
  const payload = Object.fromEntries(new FormData($('#articleForm')));
  payload.content = $('#content').innerHTML;
  payload.sources = sourceValues();
  return payload;
}

async function saveArticle() {
  if (!$('#articleForm').reportValidity()) throw new Error('Preencha o título e escolha um tema antes de inserir a imagem.');
  const article = await api(currentId ? '/api/articles/' + currentId : '/api/articles', { method: currentId ? 'PUT' : 'POST', body: JSON.stringify(articlePayload()) });
  currentId = article.id;
  $('#status').textContent = 'EDITANDO ARTIGO';
  $('#remove').hidden = false;
  return article;
}

function readFile(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
}

async function uploadFile(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error(file.name + ' excede 25 MB.');
  return api('/api/articles/' + currentId + '/attachments', { method: 'POST', body: JSON.stringify({ name: file.name, dataUrl: await readFile(file) }) });
}

function insertAttachmentFigure(attachment) {
  setPreviewMode(false);
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
}

async function insertInlineImage(file) {
  try {
    if (!file.type.startsWith('image/')) throw new Error('Selecione uma imagem compatível.');
    await saveArticle();
    const attachment = await uploadFile(file);
    currentAttachments.unshift(attachment);
    insertAttachmentFigure(attachment);
    await saveArticle();
    renderAttachments();
    renderMedia();
    renderList();
    toast('Imagem inserida no texto.');
  } catch (error) { toast(error.message); }
}

$('#newArticle').onclick = fresh;
$('#emptyNew').onclick = fresh;
$('#search').oninput = () => { if ($('#search').value.trim()) selectedTheme = null; clearTimeout(window.searchDelay); window.searchDelay = setTimeout(renderList, 220); };
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
    for (const file of files) currentAttachments.unshift(await uploadFile(file));
    $('#files').value = '';
    fill(await api('/api/articles/' + currentId));
    renderList();
    toast('Artigo salvo.');
  } catch (error) { toast(error.message); }
};
$('#remove').onclick = async () => {
  if (!currentId || !confirm('Excluir este artigo? Esta ação não pode ser desfeita.')) return;
  try {
    await api('/api/articles/' + currentId, { method: 'DELETE' });
    currentId = null;
    currentAttachments = [];
    $('#editor').hidden = true;
    $('#welcome').hidden = false;
    renderMedia();
    renderList();
    toast('Artigo excluído.');
  } catch (error) { toast(error.message); }
};
$('#authForm').onsubmit = async event => {
  event.preventDefault();
  try {
    await api(authMode === 'setup' ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#loginUsername').value, password: $('#loginPassword').value }) });
    $('#auth').hidden = true;
    $('#loginPassword').value = '';
    await loadThemes();
    renderList();
    toast('Acesso liberado.');
  } catch (error) { toast(error.message); }
};
$('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); showAuth(true); };

setupCollapsibleHeader();
setupSearchButton();
setupImageModal();
setupRichEditor();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
boot();
