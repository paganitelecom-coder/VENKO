// Rascunho automático DESATIVADO.
// Nada mais é salvo nem restaurado. Ao carregar, apaga qualquer rascunho
// antigo que ainda esteja no aparelho (cada usuário é limpo na próxima
// vez que abrir o app com este arquivo).
// window.limparRascunho continua existindo porque o app.js a chama
// (com checagem typeof) depois de enviar/limpar uma ficha.
(function () {
  const KEYS = ['venko_draft_v1'];
  function limpar() {
    try { KEYS.forEach(k => localStorage.removeItem(k)); } catch (e) {}
  }
  limpar();
  window.limparRascunho = limpar;
})();
