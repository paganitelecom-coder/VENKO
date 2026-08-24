// Rascunho automático — salva o formulário no localStorage a cada 5s
// e restaura ao abrir a página. Não interfere no fluxo de envio.
(function(){
  const KEY = 'venko_draft_v1';
  const DEBOUNCE_MS = 1500;
  // Campos que NUNCA devem ser salvos/restaurados no rascunho:
  // - preço é sempre recalculado por buscarPreco(), nunca deve vir "congelado"
  // - status/criar_hp têm lógica própria de default por sessão
  const EXCLUDE_KEYS = new Set(['mensalidade', 'debito', 'status', 'criar_hp']);
  // Campos de plano (pill) — precisam de tratamento especial pra sincronizar visual
  const PLANO_KEYS = ['plano_banda', 'plano_mesh', 'plano_controle', 'plano_pos', 'plano_tv', 'plano_fixo'];
  let timer = null;
  function collect(){
    const data = {};
    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (!el.name && !el.id) return;
      const key = el.name || el.id;
      if (EXCLUDE_KEYS.has(key)) return;
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
  // CORREÇÃO: antes o restore() repunha QUALQUER valor salvo (mesmo
  // string vazia) e sempre chamava buscarPreco() no final — isso fazia
  // cidade/plano de um rascunho antigo (de uma ficha já finalizada, ou
  // do formulário "limpo" antes do limparRascunho() ter sido chamado)
  // reaparecerem sozinhos e a Receita/Valor do Plano serem calculados
  // sem o vendedor ter escolhido nada na sessão atual — parecia bug
  // de cálculo, mas na verdade era o rascunho antigo voltando.
  // Agora: (1) ignora valores vazios, (2) só mexe em pills/preço se
  // ALGO de fato foi restaurado, (3) avisa o vendedor com um toast,
  // pra nunca ficar "silencioso" preenchendo por trás.
  function restore(){
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const { data, t } = JSON.parse(raw);
      // ignora rascunhos com mais de 24h
      if (Date.now() - t > 24*3600*1000) { localStorage.removeItem(KEY); return; }

      let restaurouAlgo = false;
      Object.entries(data).forEach(([k, v]) => {
        if (!v) return; // não repõe valor vazio (evita "falso restaurou")
        const el = document.querySelector(`[name="${k}"], #${CSS.escape(k)}`);
        if (el && !el.value) { el.value = v; restaurouAlgo = true; }
      });

      // Nada foi restaurado (rascunho vazio ou formulário já preenchido)
      // -> não mexe em pills nem dispara buscarPreco() à toa.
      if (!restaurouAlgo) return;

      // Sincroniza as pills visualmente com o valor restaurado
      // e recalcula o preço a partir da tabela — nunca deixa um
      // valor de preço "congelado" de uma ficha anterior.
      if (typeof window.restaurarPill === 'function') {
        restaurarPill('plano_banda', 'pills-banda');
        restaurarPill('plano_controle', 'pills-controle');
        restaurarPill('plano_pos', 'pills-pos');
        restaurarPill('plano_tv', 'pills-tv');
        restaurarPill('plano_fixo', 'pills-fixo');
      }
      if (typeof window.restaurarMesh === 'function') restaurarMesh();
      if (typeof window.atualizarProgresso === 'function') atualizarProgresso();
      if (typeof window.buscarPreco === 'function') buscarPreco();

      // Avisa o vendedor — sem isso ele acha que o app "inventou"
      // cidade/plano/preço sozinho.
      if (typeof window.showToast === 'function') {
        showToast('📝 Rascunho anterior restaurado — confira os dados antes de enviar', 'info', 5000);
      }
    } catch(e){}
  }
  window.addEventListener('DOMContentLoaded', () => {
    // Espera o app.js terminar o init() (que roda antes do DOMContentLoaded,
    // já que os scripts são defer) antes de restaurar — garante que as
    // funções restaurarPill/buscarPreco já existem.
    restore();
    document.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(save, DEBOUNCE_MS);
    }, { passive: true });
  });
  // limpa após envio bem-sucedido
  window.limparRascunho = () => { try { localStorage.removeItem(KEY); } catch(e){} };
})();
