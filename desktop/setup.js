const input = document.querySelector('#server-url');
input.value = (await window.eloDesktop.getConfig()).serverUrl;
document.querySelector('#setup-form').onsubmit = async event => {
  event.preventDefault();
  try { await window.eloDesktop.saveServer(input.value); }
  catch { document.querySelector('#setup-error').textContent = 'Não foi possível salvar. Use o endereço HTTPS completo da comunidade.'; }
};
