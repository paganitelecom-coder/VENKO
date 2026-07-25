// Rascunho automático — salva o formulário no localStorage a cada 5s
// e restaura ao abrir a página. Não interfere no fluxo de envio.
(function(){
  const KEY = 'venko_draft_v1';
  const DEBOUNCE_MS = 1500;
  let timer = null;

  function collect(){
    const data = {};
    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (!el.name && !el.id) return;
      const key = el.name || el.id;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) data[key] = el.value;
      } else if (el.type !== 'password' && el.type !== 'file') {
        data[key] = el.value;
      }
    });
    return data;
  }

  function save(){
    try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), data: collect() })); } catch(e){}
  }

  function restore(){
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const { data, t } = JSON.parse(raw);
      // ignora rascunhos com mais de 24h
      if (Date.now() - t > 24*3600*1000) { localStorage.removeItem(KEY); return; }
      Object.entries(data).forEach(([k, v]) => {
        const el = document.querySelector(`[name="${k}"], #${CSS.escape(k)}`);
        if (el && !el.value) el.value = v;
      });
    } catch(e){}
  }

  window.addEventListener('DOMContentLoaded', () => {
    restore();
    document.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE_MS);
    }, { passive: true });
  });

  // limpa após envio bem-sucedido
  window.limparRascunho = () => { try { localStorage.removeItem(KEY); } catch(e){} };
})();
