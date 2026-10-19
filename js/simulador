/* ════════════════════════════════════════════════════════════
   VENKO — SIMULADOR DE PREÇOS
   Escolhe cidade + produtos e mostra Receita, Valor do Plano e
   Valor 6 Meses. NÃO duplica regra de preço: usa o buscarPreco()
   do app.js. Para isso, preenche os campos da ficha por um instante,
   lê o resultado e DEVOLVE a ficha exatamente como estava.
   Instalação: <script defer src="js/simulador.js"></script> no index.html
   (depois do init.js). Nada mais precisa mudar.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  // Campos da ficha que o buscarPreco() lê/escreve
  const CAMPOS = ['cidade', 'plano_banda', 'plano_mesh', 'plano_controle', 'plano_pos',
    'plano_tv', 'plano_fixo', 'dep_pago', 'dep_gratis', 'ponto_adicional',
    'mensalidade', 'debito', 'valor_promocional'];

  // Grupos de produtos: chave do estado, campo da ficha, rótulo, opções
  const GRUPOS = [
    { k: 'banda',    campo: 'plano_banda',    rotulo: '🌐 Banda Larga', ops: [['250MB','250 MB'],['350MB','350 MB'],['500MB','500 MB'],['600MB','600 MB'],['1GB','1 GB']] },
    { k: 'mesh',     campo: 'plano_mesh',     rotulo: '🔀 Mesh',        ops: [['2','2 un'],['3','3 un'],['4','4 un']], precisaBanda: true },
    { k: 'controle', campo: 'plano_controle', rotulo: '📱 Controle',    ops: [['25GB','25 GB'],['20GB','20 GB']] },
    { k: 'pos',      campo: 'plano_pos',      rotulo: '📱 Pós',         ops: [['50GB','50 GB'],['60GB','60 GB'],['100GB','100 GB'],['150GB','150 GB'],['200GB','200 GB'],['500GB','500 GB']] },
    { k: 'tv',       campo: 'plano_tv',       rotulo: '📺 TV',          ops: [['BOX','BOX'],['CABO','CABO']] },
    { k: 'fixo',     campo: 'plano_fixo',     rotulo: '☎️ Fixo',        ops: [['MUNDO','MUNDO'],['BRASIL','BRASIL']] }
  ];
  const QTDS = [
    { k: 'ponto',    campo: 'ponto_adicional', rotulo: '📺 Ponto adicional' },
    { k: 'dep_pago', campo: 'dep_pago',        rotulo: '💰 Dep. Pago' }
  ];

  const estado = { cidade: '', banda: '', mesh: '', controle: '', pos: '', tv: '', fixo: '', ponto: 0, dep_pago: 0 };
  let token = 0, timer = null;

  /* ---------- CSS ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .btn-simulador{background:#16a34a;color:#fff;border:none;font-family:inherit;flex:1 1 100% !important;}
  .sim-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000;align-items:flex-end;justify-content:center;}
  .sim-overlay.aberto{display:flex;}
  .sim-sheet{background:var(--white,#fff);color:var(--text,#111);width:100%;max-width:560px;max-height:92vh;overflow-y:auto;
    border-radius:16px 16px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));}
  .sim-topo{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
  .sim-topo h3{margin:0;font-size:1rem;}
  .sim-x{background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted,#666);}
  .sim-grupo{margin-bottom:12px;}
  .sim-lbl{font-size:.72rem;font-weight:700;margin-bottom:5px;color:var(--text,#111);}
  .sim-pills{display:flex;flex-wrap:wrap;gap:6px;}
  .sim-pill{padding:7px 12px;border-radius:999px;border:1.5px solid var(--border,#ddd);background:var(--white,#fff);
    color:var(--text,#111);font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit;}
  .sim-pill.ativo{background:var(--grad,#000);color:#fff;border-color:transparent;}
  .sim-grupo.bloqueado{opacity:.45;pointer-events:none;}
  .sim-cidade{width:100%;padding:10px 12px;border:1.5px solid var(--border,#ddd);border-radius:8px;font-family:inherit;
    font-size:.9rem;text-transform:uppercase;background:var(--white,#fff);color:var(--text,#111);box-sizing:border-box;}
  .sim-qtd{display:flex;align-items:center;gap:12px;}
  .sim-qtd button{width:40px;height:34px;border-radius:8px;border:1.5px solid var(--border,#ddd);background:var(--white,#fff);
    color:var(--text,#111);font-size:1.1rem;font-weight:700;cursor:pointer;font-family:inherit;}
  .sim-qtd span{min-width:24px;text-align:center;font-weight:700;}
  .sim-res{margin-top:6px;padding:14px;border-radius:12px;background:#f3f4f6;color:#111;}
  .sim-res-linha{display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;font-size:.82rem;}
  .sim-res-linha strong{font-size:1.05rem;}
  .sim-res-linha.rec strong{color:#16a34a;}
  .sim-msg{font-size:.78rem;color:#b45309;text-align:center;padding:4px 0;}
  .sim-limpar{width:100%;margin-top:10px;padding:10px;border-radius:10px;border:1.5px solid var(--border,#ddd);
    background:var(--white,#fff);color:var(--text,#111);font-weight:700;font-family:inherit;cursor:pointer;}
  `;
  document.head.appendChild(css);

  /* ---------- Modal ---------- */
  const ov = document.createElement('div');
  ov.className = 'sim-overlay';
  ov.innerHTML = `
    <div class="sim-sheet" role="dialog" aria-label="Simulador de preços">
      <div class="sim-topo"><h3>🧮 Simulador de Preços</h3><button class="sim-x" aria-label="Fechar">✕</button></div>
      <div class="sim-grupo">
        <div class="sim-lbl">📍 Cidade</div>
        <input class="sim-cidade" id="sim-cidade" list="sim-cidades" placeholder="DIGITE A CIDADE" autocomplete="off" autocorrect="off" spellcheck="false">
        <datalist id="sim-cidades"></datalist>
      </div>
      <div id="sim-grupos"></div>
      <div class="sim-res" id="sim-res"></div>
      <button class="sim-limpar" id="sim-limpar">Limpar simulação</button>
    </div>`;
  document.body.appendChild(ov);

  function render() {
    const box = $('sim-grupos');
    box.innerHTML = '';
    GRUPOS.forEach(g => {
      const d = document.createElement('div');
      d.className = 'sim-grupo' + (g.precisaBanda && !estado.banda ? ' bloqueado' : '');
      d.innerHTML = `<div class="sim-lbl">${g.rotulo}${g.precisaBanda ? ' <span style="font-weight:400;color:var(--muted,#666)">(precisa de Banda Larga)</span>' : ''}</div><div class="sim-pills"></div>`;
      const p = d.querySelector('.sim-pills');
      g.ops.forEach(([v, t]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sim-pill' + (estado[g.k] === v ? ' ativo' : '');
        b.textContent = t;
        b.onclick = () => {
          estado[g.k] = estado[g.k] === v ? '' : v;
          if (g.k === 'banda' && !estado.banda) estado.mesh = '';
          render(); agendar();
        };
        p.appendChild(b);
      });
      box.appendChild(d);
    });
    QTDS.forEach(q => {
      const d = document.createElement('div');
      d.className = 'sim-grupo';
      d.innerHTML = `<div class="sim-lbl">${q.rotulo}</div><div class="sim-qtd"><button type="button">−</button><span>${estado[q.k]}</span><button type="button">+</button></div>`;
      const [menos, mais] = d.querySelectorAll('button');
      menos.onclick = () => { estado[q.k] = Math.max(0, estado[q.k] - 1); render(); agendar(); };
      mais.onclick  = () => { estado[q.k] += 1; render(); agendar(); };
      box.appendChild(d);
    });
  }

  function mostrar(r, msg) {
    const el = $('sim-res');
    if (msg) { el.innerHTML = `<div class="sim-msg">${msg}</div>`; return; }
    el.innerHTML = `
      <div class="sim-res-linha rec"><span>Receita</span><strong>${r.mensalidade || '—'}</strong></div>
      <div class="sim-res-linha"><span>Valor do Plano</span><strong>${r.debito || '—'}</strong></div>
      <div class="sim-res-linha"><span>Valor 6 Meses</span><strong>${r.valor_promocional || '—'}</strong></div>`;
  }

  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(simular, 250);
  }

  /* ---------- Motor: usa o buscarPreco() da ficha e devolve tudo ---------- */
  async function simular() {
    const meu = ++token;
    const temProduto = estado.banda || estado.controle || estado.pos || estado.tv || estado.fixo || estado.dep_pago;
    if (!estado.cidade.trim()) return mostrar(null, 'Escolha a cidade para ver os preços.');
    if (!temProduto)           return mostrar(null, 'Escolha ao menos um produto.');
    if (typeof buscarPreco !== 'function') return mostrar(null, 'Tabela de preços indisponível (buscarPreco não encontrado).');

    // 1) guarda a ficha como está
    const salvo = {};
    CAMPOS.forEach(id => { const e = $(id); salvo[id] = e ? e.value : ''; });
    const statusHtml = $('preco-status') ? $('preco-status').innerHTML : '';
    const flags = (typeof camposAutoPreenchidos !== 'undefined') ? new Set(camposAutoPreenchidos) : null;

    const set = (id, v) => { const e = $(id); if (e) e.value = v; };
    let resultado = null;
    try {
      // 2) preenche com a simulação (sem flags de edição manual)
      if (flags) ['mensalidade_manual', 'debito_manual', 'valor_promocional_manual'].forEach(f => camposAutoPreenchidos.delete(f));
      set('cidade', estado.cidade.toUpperCase());
      set('plano_banda', estado.banda);
      set('plano_mesh', estado.banda ? estado.mesh : '');
      set('plano_controle', estado.controle);
      set('plano_pos', estado.pos);
      set('plano_tv', estado.tv);
      set('plano_fixo', estado.fixo);
      set('dep_pago', estado.dep_pago || '');
      set('dep_gratis', '');
      set('ponto_adicional', estado.ponto || '');
      set('mensalidade', ''); set('debito', ''); set('valor_promocional', '');

      // 3) pede o cálculo e espera estabilizar (buscarPreco pode ser assíncrono)
      await Promise.resolve(buscarPreco());
      let ultimo = '', estavel = 0;
      for (let i = 0; i < 20 && estavel < 2; i++) {
        await new Promise(r => setTimeout(r, 150));
        if (meu !== token) return; // chegou uma simulação mais nova
        const atual = ['mensalidade', 'debito', 'valor_promocional'].map(id => ($(id) || {}).value || '').join('|');
        estavel = (atual === ultimo && atual !== '||') ? estavel + 1 : 0;
        ultimo = atual;
      }
      resultado = {
        mensalidade: val('mensalidade'), debito: val('debito'), valor_promocional: val('valor_promocional')
      };
    } finally {
      // 4) devolve a ficha exatamente como estava
      CAMPOS.forEach(id => set(id, salvo[id]));
      if ($('preco-status')) $('preco-status').innerHTML = statusHtml;
      if (flags) { camposAutoPreenchidos.clear(); flags.forEach(f => camposAutoPreenchidos.add(f)); }
      if (typeof atualizarBarraPlano === 'function') atualizarBarraPlano();
    }
    if (meu !== token) return;
    if (!resultado.mensalidade && !resultado.debito) mostrar(null, 'Sem preço na tabela para essa cidade/combinação.');
    else mostrar(resultado);
  }
  function val(id) { const e = $(id); return e ? String(e.value || '').trim() : ''; }

  /* ---------- Abrir / fechar ---------- */
  function abrir() {
    // sugestões de cidade, se o app expõe a lista
    try {
      const dl = $('sim-cidades');
      if (!dl.children.length && typeof CIDADES !== 'undefined') {
        const nomes = Array.isArray(CIDADES) ? CIDADES.map(c => (typeof c === 'string' ? c : c.cidade || c.nome)) : Object.keys(CIDADES);
        nomes.filter(Boolean).sort().forEach(n => { const o = document.createElement('option'); o.value = n; dl.appendChild(o); });
      }
    } catch (e) { /* sem sugestões, segue digitando */ }
    ov.classList.add('aberto');
    render();
    mostrar(null, 'Escolha a cidade e os produtos.');
    agendar();
  }
  function fechar() { ov.classList.remove('aberto'); token++; }

  ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
  ov.querySelector('.sim-x').onclick = fechar;
  $('sim-cidade').addEventListener('input', e => { estado.cidade = e.target.value; agendar(); });
  $('sim-limpar').onclick = () => {
    Object.assign(estado, { banda: '', mesh: '', controle: '', pos: '', tv: '', fixo: '', ponto: 0, dep_pago: 0 });
    render(); agendar();
  };

  /* ---------- Botão nos atalhos do topo ---------- */
  function criarBotao() {
    const linha = document.querySelector('.atalhos-linha');
    if (!linha || linha.querySelector('.btn-simulador')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-atalho btn-simulador';
    b.textContent = '🧮 Simulador de Preços';
    b.onclick = abrir;
    linha.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', criarBotao);
  else criarBotao();
})();
