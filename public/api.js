window.biblioRequest = async function request(url, options = {}, onUnauthorized = () => {}) {
  const response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...options });
  if (!response.ok && response.status !== 204) {
    let error = 'Não foi possível concluir a operação.';
    try { error = (await response.json()).error || error; } catch {}
    if (response.status === 401) onUnauthorized();
    throw new Error(error);
  }
  return response.status === 204 ? null : response.json();
};
