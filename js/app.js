const SHEETS_URL = "https://script.google.com/macros/s/AKfycbwRo3WixS8Lg_FycKV53snEqtEJInEcUlDJiHkq2cY_t6e1sAvO-rb8BPvO3mDocuqqyw/exec";

  // ══════════════════════════════════════════════════════════════
  // USUÁRIOS — agora vêm da aba USUARIOS da planilha (não mais fixos
  // no código nem salvos só no localStorage do navegador). O cache
  // local (usuariosCache) é só pra não ficar re-buscando a cada
  // função que precisa da lista — ele é atualizado ao carregar a
  // página e depois de criar/remover um usuário.
  // ══════════════════════════════════════════════════════════════
  let usuariosCache = JSON.parse(localStorage.getItem('venko_usuarios_cache') || '[]');

  function getAllUsers() {
    return usuariosCache;
  }

  async function carregarUsuarios() {
    try {
      const resp = await fetch(SHEETS_URL + '?action=usuarios', { cache: 'no-store' });
      const dados = await resp.json();
      if (dados.status === 'ok' && Array.isArray(dados.usuarios)) {
        usuariosCache = dados.usuarios;
        localStorage.setItem('venko_usuarios_cache', JSON.stringify(usuariosCache));
        if (document.getElementById('page-usuarios')?.classList.contains('active')) renderUsuarios();
        if (session?.role === 'admin') preencherSelectsVendedor();
      }
    } catch (e) {}
  }

  let session = null;
  function checkAuth() {
    const raw = sessionStorage.getItem('venko_session');
    if (!raw) { window.location.href = 'login.html'; return false; }
    session = JSON.parse(raw);
    return true;
  }
  function logout() {
    sessionStorage.removeItem('venko_session');
    window.location.href = 'login.html';
  }

  // ══════════════════════════════════════════════════════════════
  // MODAL: ESCOLHER WHATSAPP NORMAL OU BUSINESS
  // ══════════════════════════════════════════════════════════════
  const WPP_ALVOS = {
    fatura: { numero: '5548988710567', mensagem: 'Solicito fatura',          titulo: 'Enviar solicitação de fatura por qual WhatsApp?' },
    visita: { numero: '5548988283770', mensagem: 'Solicito visita técnica',  titulo: 'Enviar solicitação de visita por qual WhatsApp?' }
  };
  let wppAlvoAtual = null;

  function abrirEscolhaWhatsApp(tipo) {
    wppAlvoAtual = WPP_ALVOS[tipo];
    if (!wppAlvoAtual) return;
    document.getElementById('modal-wpp-titulo').textContent = wppAlvoAtual.titulo;
    document.getElementById('modal-wpp-overlay').classList.add('show');
  }

  function fecharModalWpp() {
    document.getElementById('modal-wpp-overlay').classList.remove('show');
  }

  // No Android dá pra forçar um app específico (com.whatsapp = normal,
  // com.whatsapp.w4b = Business) via link "intent://". Usamos o esquema
  // nativo "whatsapp://send" — é o link oficial de "click to chat" da
  // Meta, reconhecido do mesmo jeito pelos dois apps (só muda o pacote
  // de destino no intent). No iPhone e no desktop não existe essa
  // distinção (a Apple não permite escolher o app por link), então
  // nesses casos cai no link padrão wa.me, que abre o WhatsApp
  // configurado como app padrão no aparelho.
  function confirmarEnvioWpp(app) {
    if (!wppAlvoAtual) return;
    const { numero, mensagem } = wppAlvoAtual;
    const texto = encodeURIComponent(mensagem);
    const isAndroid = /Android/i.test(navigator.userAgent);

    if (isAndroid) {
      const pkg = app === 'business' ? 'com.whatsapp.w4b' : 'com.whatsapp';
      const fallback = encodeURIComponent(`https://wa.me/${numero}?text=${texto}`);
      window.location.href = `intent://send/?phone=${numero}&text=${texto}#Intent;package=${pkg};scheme=whatsapp;S.browser_fallback_url=${fallback};end`;
    } else {
      window.open(`https://wa.me/${numero}?text=${texto}`, '_blank');
    }
    fecharModalWpp();
  }

  function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('venko-dark-mode', isDark);
    document.querySelector('.btn-dark-toggle').textContent = isDark ? '☀️' : '🌙';
    showToast(isDark ? '🌙 Modo escuro ativado' : '☀️ Modo claro ativado', 'info');
  }
  if (localStorage.getItem('venko-dark-mode') === 'true') {
    document.body.classList.add('dark-mode');
    document.querySelector('.btn-dark-toggle').textContent = '☀️';
  }

  function showToast(message, type = 'success', duration = 3000) {
    const toast = document.getElementById('toast');
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    toast.className = `toast ${type}`;
    toast.textContent = `${icons[type]} ${message}`;
    toast.style.display = 'flex';
    setTimeout(() => {
      toast.classList.add('saindo');
      setTimeout(() => { toast.style.display = 'none'; toast.classList.remove('saindo'); }, 300);
    }, duration);
  }

  // ══════════════════════════════════════════════════════════════
  // FILA DE REENVIO — fichas que falharam ao enviar
  // ══════════════════════════════════════════════════════════════
  let filaReenvio = JSON.parse(localStorage.getItem('venko_fila') || '[]');

  function salvarFila() {
    localStorage.setItem('venko_fila', JSON.stringify(filaReenvio));
    atualizarBadgeFila();
  }

  function atualizarBadgeFila() {
    const badge = document.getElementById('fila-badge');
    const count = document.getElementById('fila-count');
    if (filaReenvio.length > 0) {
      count.textContent = filaReenvio.length;
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
  }

  // ── Envia via POST com leitura real da resposta (detecta falha de verdade) ────
  // CORREÇÃO: antes ia por GET com a ficha inteira na query string da URL.
  // Fichas com endereço/observações longas geravam URLs compridas, que em
  // sinal de celular fraco / proxies de operadora podiam ser truncadas ou
  // rejeitadas antes de chegar no Apps Script — perdendo a ficha de forma
  // silenciosa. POST com corpo elimina esse limite de tamanho de vez.
  async function enviarParaSheets(ficha) {
    const params = new URLSearchParams();
    Object.entries(ficha).forEach(([k, v]) => params.append(k, v || ''));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeout);
      const dados = await resp.json();
      // success:true cobre inserção nova E reenvio de duplicata (já estava salva) —
      // ambos os casos significam "está garantido na planilha".
      return !!(dados && dados.success);
    } catch (err) {
      clearTimeout(timeout);
      // Rede falhou de verdade (timeout, sem sinal, CORS bloqueado etc.):
      // a ficha já está salva localmente (garantido em enviarFicha) e cai
      // na fila de reenvio — sem fallback via iframe, que não funciona com
      // POST e mascarava falhas reais como sucesso incerto.
      return false;
    }
  }

  // Reenviar todas as fichas da fila
  async function reenviarFila() {
    if (!filaReenvio.length) { showToast('Nenhuma ficha pendente.', 'info'); return; }
    setSyncStatus('loading', `⏳ Reenviando ${filaReenvio.length} ficha(s) pendente(s)...`);
    let enviadas = 0;
    const novaFila = [];
    for (const ficha of filaReenvio) {
      const ok = await enviarParaSheets(ficha);
      if (ok) { enviadas++; } else { novaFila.push(ficha); }
    }
    filaReenvio = novaFila;
    salvarFila();
    if (novaFila.length === 0) {
      setSyncStatus('ok', `✅ ${enviadas} ficha(s) reenviada(s) com sucesso!`);
      showToast(`✅ ${enviadas} ficha(s) enviada(s)!`);
    } else {
      setSyncStatus('erro', `⚠️ ${enviadas} enviada(s). ${novaFila.length} ainda com falha. <button onclick="reenviarFila()" style="background:none;border:none;color:#991b1b;font-weight:700;cursor:pointer;text-decoration:underline;padding:0;font-family:inherit">Tentar novamente</button>`);
    }
    setTimeout(() => hideSyncStatus(), 8000);
  }

  // Alias para compatibilidade
  async function reenviarPendentes() { return reenviarFila(); }

  // ══════════════════════════════════════════════════════════════
  // SISTEMA DE PREÇOS AUTOMÁTICO (NOVA LÓGICA — por serviço)
  // ══════════════════════════════════════════════════════════════
  let tabelaPrecos  = [];
  let tabelaCidades = [];
  let camposAutoPreenchidos = new Set();

  function normalizar(str) {
    return String(str || '')
      .toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  // Deixa maiúsculo sem mexer em acentos nem remover espaços —
  // usado para o VALOR REAL salvo (WhatsApp / Sheets / Excel).
  // Diferente de normalizar(), que faz trim() e tira acento
  // (isso é só para comparação com a tabela de preços/cidades).
  function up(v) {
    return String(v || '').toUpperCase();
  }

  // (carregarPrecos removida — a busca de preços/cidades agora
  // acontece dentro do bootstrap único, veja carregarBootstrap() logo abaixo)

  // ══════════════════════════════════════════════════════════════
  // BOOTSTRAP — carrega tudo que o app precisa (fichas, preços,
  // cidades, usuários, faltas, adiantamentos, metas) numa ÚNICA
  // chamada ao Sheets, em vez de 7 requisições separadas. Usado
  // tanto no carregamento inicial (init) quanto no botão Atualizar.
  //
  // CORREÇÃO: agora com AbortController de 20s — antes, se o
  // Apps Script demorasse (cold start + 7 leituras de planilha
  // sem cache no servidor), o fetch ficava esperando indefinidamente
  // e o app parecia "travado" no login sem nenhum feedback nem
  // limite. Combinado com o cache de 45s adicionado no Code.gs
  // (handleBootstrap), essa é a correção completa da lentidão.
  //
  // Retorna true se conseguiu buscar do servidor, false se falhou
  // (nesse caso quem chamou decide se quer avisar o usuário).
  // ══════════════════════════════════════════════════════════════
  async function carregarBootstrap() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const resp = await fetch(SHEETS_URL + '?action=bootstrap', { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeout);
      const dados = await resp.json();
      if (dados.status !== 'ok') return false;

      if (Array.isArray(dados.fichas))        mesclarFichas(dados.fichas);
      if (Array.isArray(dados.precos))        tabelaPrecos = dados.precos;
      if (Array.isArray(dados.cidades))       tabelaCidades = dados.cidades;
      if (Array.isArray(dados.usuarios)) {
        usuariosCache = dados.usuarios;
        localStorage.setItem('venko_usuarios_cache', JSON.stringify(usuariosCache));
      }
      if (Array.isArray(dados.faltas))        mesclarFaltas(dados.faltas);
      if (Array.isArray(dados.adiantamentos)) mesclarAdiantamentos(dados.adiantamentos);
      if (Array.isArray(dados.metas))         metas = dados.metas;

      return true;
    } catch (e) {
      clearTimeout(timeout);
      return false;
    }
  }

  function getGrupoCidade(cidade) {
    const c = normalizar(cidade);
    if (!c) return null;
    const found = tabelaCidades.find(row => normalizar(row.CIDADE) === c);
    return found ? normalizar(found.GRUPO) : null;
  }

  // Converte um valor de célula ("R$ 79,90", "79.90", 79.9...) em número.
  function normalizarValor(v) {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).replace(/[^\d,.\-]/g,'').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function formatarValor(n) {
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  // Busca o preço de um serviço (TIPO/OPCAO/GRUPO) numa coluna específica
  // da tabela nova. Aceita GRUPO = "TODOS" na planilha como coringa
  // (usado por CONTROLE, POS e TV).
  function getPrecoServico(tipo, opcao, grupo, coluna) {
    const row = tabelaPrecos.find(r =>
      normalizar(r.TIPO)  === tipo &&
      normalizar(r.OPCAO) === normalizar(opcao) &&
      (normalizar(r.GRUPO) === grupo || normalizar(r.GRUPO) === 'TODOS')
    );
    if (!row) return null;
    return normalizarValor(row[coluna]);
  }

  function buscarPreco() {
    const cidade   = normalizar(document.getElementById('cidade').value);
    const banda    = normalizar(document.getElementById('plano_banda').value);
    const controle = normalizar(document.getElementById('plano_controle').value);
    const pos      = normalizar(document.getElementById('plano_pos').value);
    const tv       = normalizar(document.getElementById('plano_tv').value);
    const fixo     = normalizar(document.getElementById('plano_fixo').value);
    const meshQtd  = parseInt(document.getElementById('plano_mesh').value) || 0;
    const meshValor = meshQtd * 15;

    const statusEl = document.getElementById('preco-status');

    const temProduto = banda || controle || pos || tv || fixo;
    if (!temProduto || !cidade) {
      statusEl.className = 'preco-status';
      limparAutoPreenchimento();
      return;
    }

    const grupo = getGrupoCidade(cidade);
    if (!grupo) {
      statusEl.className = 'preco-status show pendente';
      statusEl.innerHTML = `⚠️ Cidade "<strong>${cidade}</strong>" não encontrada na tabela — preencha o valor manualmente.`;
      limparAutoPreenchimento();
      return;
    }

    const temMovel = !!(controle || pos);   // Controle OU Pós contratado
    const temBanda = !!banda;
    const temTv    = !!tv;

    let total = 0, algumEncontrado = false, algumFaltando = false;

    // ── BANDA LARGA ──
    // TV sozinho não desconta a banda; só desconta se tiver Controle/Pós junto.
    if (temBanda) {
      const coluna = (temMovel && temTv) ? 'VALOR_COM_MOVEL_E_TV'
                   : temMovel             ? 'VALOR_COM_MOVEL'
                   :                        'VALOR_SOZINHO';
      const v = getPrecoServico('BANDA_LARGA', banda, grupo, coluna);
      if (v !== null) { total += v; algumEncontrado = true; } else algumFaltando = true;
    }

    // ── CONTROLE / PÓS ── (preço fixo, não varia por combinação)
    if (controle) {
      const v = getPrecoServico('CONTROLE', controle, grupo, 'VALOR_SOZINHO');
      if (v !== null) { total += v; algumEncontrado = true; } else algumFaltando = true;
    }
    if (pos) {
      const v = getPrecoServico('POS', pos, grupo, 'VALOR_SOZINHO');
      if (v !== null) { total += v; algumEncontrado = true; } else algumFaltando = true;
    }

    // ── TV ──
    // Desconta se tiver Banda OU Controle/Pós; desconta mais se tiver os dois.
    if (temTv) {
      const coluna = (temBanda && temMovel) ? 'VALOR_COM_MOVEL_E_TV'
                   : (temBanda || temMovel) ? 'VALOR_COM_MOVEL'
                   :                          'VALOR_SOZINHO';
      const v = getPrecoServico('TV', tv, grupo, coluna);
      if (v !== null) { total += v; algumEncontrado = true; } else algumFaltando = true;
    }

    // ── FIXO ──
    // Desconta se tiver Controle/Pós OU TV; desconta mais se tiver os dois
    // (ex.: FIXO BRASIL cai de R$35 pra R$5 só quando tem Móvel + TV juntos).
    if (fixo) {
      const coluna = (temMovel && temTv) ? 'VALOR_COM_MOVEL_E_TV'
                   : temTv                ? 'VALOR_COM_TV'
                   : temMovel             ? 'VALOR_COM_MOVEL'
                   :                        'VALOR_SOZINHO';
      const v = getPrecoServico('FIXO', fixo, grupo, coluna);
      if (v !== null) { total += v; algumEncontrado = true; } else algumFaltando = true;
    }

    // ── MESH ── (serviço adicional, preço fixo de R$15,00 por unidade)
    if (meshQtd > 0) {
      total += meshValor;
      algumEncontrado = true;
    }

    if (!algumEncontrado) {
      statusEl.className = 'preco-status show pendente';
      statusEl.innerHTML = `⚠️ Nenhum preço encontrado para o grupo <strong>${grupo}</strong> — preencha manualmente.`;
      limparAutoPreenchimento();
      return;
    }

    if (!camposAutoPreenchidos.has('mensalidade_manual')) {
      document.getElementById('mensalidade').value = formatarValor(total);
      document.getElementById('mensalidade').classList.add('auto-preenchido');
      camposAutoPreenchidos.add('mensalidade');
    }

    const meshTexto = meshQtd > 0 ? ` + Mesh ${meshQtd}x (R$ ${meshValor.toFixed(2).replace('.', ',')})` : '';
    statusEl.className = algumFaltando ? 'preco-status show pendente' : 'preco-status show ok';
    statusEl.innerHTML = algumFaltando
      ? `⚠️ Preço calculado parcialmente (grupo <strong>${grupo}</strong>)${meshTexto} — algum serviço não encontrado na tabela.`
      : `✅ Preço calculado automaticamente — grupo <strong>${grupo}</strong>${meshTexto}. Edite os campos se precisar ajustar.`;

    atualizarProgresso();
  }

  function limparAutoPreenchimento() {
    if (camposAutoPreenchidos.has('mensalidade')) {
      document.getElementById('mensalidade').value = '';
      document.getElementById('mensalidade').classList.remove('auto-preenchido');
      camposAutoPreenchidos.delete('mensalidade');
    }
  }

  function marcarManual(campo) {
    document.getElementById(campo).classList.remove('auto-preenchido');
    camposAutoPreenchidos.add(campo + '_manual');
    camposAutoPreenchidos.delete(campo);
  }

  // ─────────────────────────────────────────────────────────────
  // CORREÇÃO: antes esta função chamava normalizar() a cada tecla,
  // que faz .trim() e apagava o espaço digitado no final da string
  // (ex.: "SÃO " virava "SAO" instantaneamente, grudando a próxima
  // palavra: "SAOPAULO"). Agora só forçamos maiúsculas ao digitar;
  // a normalização (remover acento/trim) continua acontecendo só
  // na hora de comparar com a tabela, dentro de buscarPreco().
  // ─────────────────────────────────────────────────────────────
  let cidadeTimer;
  function onCidadeInput() {
    const el = document.getElementById('cidade');
    const pos = el.selectionStart;
    el.value = el.value.toUpperCase();
    try { el.setSelectionRange(pos, pos); } catch(e) {}
    atualizarProgresso();
    clearTimeout(cidadeTimer);
    cidadeTimer = setTimeout(() => buscarPreco(), 400);
  }

  // ── PILLS ──────────────────────────────────────────────────────────────────
  function selecionarPlano(campoId, valor, btnEl) {
    const pillsContainer = btnEl.closest('.plano-pills');
    const input = document.getElementById(campoId);
    if (input.value === valor) {
      pillsContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('ativo'));
      input.value = '';
    } else {
      pillsContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('ativo'));
      btnEl.classList.add('ativo');
      input.value = valor;
    }
    camposAutoPreenchidos.delete('mensalidade_manual');
    atualizarProgresso();
    buscarPreco();
  }

  // Mesh usa seleção própria (quantidade, não texto de plano) mas segue o
  // mesmo padrão visual/comportamento de toggle das outras pills.
  function selecionarMesh(qtd, btnEl) {
    const pillsContainer = btnEl.closest('.plano-pills');
    const input = document.getElementById('plano_mesh');
    if (input.value === qtd) {
      pillsContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('ativo'));
      input.value = '';
    } else {
      pillsContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('ativo'));
      btnEl.classList.add('ativo');
      input.value = qtd;
    }
    camposAutoPreenchidos.delete('mensalidade_manual');
    atualizarProgresso();
    buscarPreco();
  }

  function restaurarPill(campoId, pillsId) {
    const valor = document.getElementById(campoId).value;
    if (!valor) return;
    document.getElementById(pillsId).querySelectorAll('.pill-btn').forEach(b => {
      if (normalizar(b.textContent) === normalizar(valor)) b.classList.add('ativo');
    });
  }

  function restaurarMesh() {
    const valor = document.getElementById('plano_mesh').value;
    if (!valor) return;
    document.getElementById('pills-mesh').querySelectorAll('.pill-btn').forEach(b => {
      if (b.dataset.val === String(valor)) b.classList.add('ativo');
    });
  }

  // ── ESTADO GLOBAL ──────────────────────────────────────────────────────────
  let fichas = JSON.parse(localStorage.getItem('fichas') || '[]');
  let fichaAtual = null;
  let filtroMinhas = 'todos';
  let filtroTodas  = 'todos';
  let checkinCoords = null;

  // ── FALTAS / ADIANTAMENTOS ───────────────────────────────────────────────
  let faltas = JSON.parse(localStorage.getItem('venko_faltas') || '[]');
  let adiantamentos = JSON.parse(localStorage.getItem('venko_adiantamentos') || '[]');
  let filaFaltas = JSON.parse(localStorage.getItem('venko_fila_faltas') || '[]');
  let filaAdiantamentos = JSON.parse(localStorage.getItem('venko_fila_adiantamentos') || '[]');

  // ── METAS ─────────────────────────────────────────────────────────────────
  let metas = [];

  function init() {
    if (!checkAuth()) return;
    document.getElementById('user-name').textContent = session.name;
    const avatar = document.getElementById('user-avatar');
    const badge  = document.getElementById('role-badge');
    avatar.textContent = session.name.charAt(0).toUpperCase();
    if (session.role === 'admin') {
      avatar.className = 'avatar avatar-admin';
      badge.textContent = 'Admin';
      badge.className = 'role-badge admin';
    } else {
      avatar.className = 'avatar avatar-vendor';
      badge.textContent = 'Vendedor';
      badge.className = 'role-badge vendor';
    }
    document.querySelectorAll('.admin-only').forEach(el => {
      const isMenuItem = el.classList.contains('mais-menu-item');
      el.style.display = session.role === 'admin' ? (isMenuItem ? 'flex' : 'block') : 'none';
    });
    if (session.role === 'admin') preencherSelectsVendedor();
    document.getElementById('vendedor').value = session.name;

    const statusSel = document.getElementById('status');
    if (session.role !== 'admin') {
      statusSel.value = 'Pendente';
      statusSel.disabled = true;
      statusSel.title = 'Apenas administradores podem alterar o status.';
    }

    atualizarProgresso();
    atualizarBadgeFila();

    document.getElementById('cpf').addEventListener('input', function() {
      let v = this.value.replace(/\D/g,'').slice(0,11);
      v = v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
      this.value = v;
    });
    document.getElementById('celular').addEventListener('input', function() {
      let v = this.value.replace(/\D/g,'').slice(0,11);
      v = v.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2');
      this.value = v;
    });
    document.getElementById('sms').addEventListener('input', function() {
      let v = this.value.replace(/\D/g,'').slice(0,11);
      v = v.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2');
      this.value = v;
    });

    atualizarContadores();
    renderDashboard();
    renderMetas();
    renderFaltasAdiantamentos();
    atualizarMiniResumo();

    // Uma única chamada ao Sheets carrega fichas, preços, cidades,
    // usuários, faltas, adiantamentos e metas — no lugar das 7
    // chamadas separadas que existiam antes.
    carregarBootstrap().then(ok => {
      renderTabelaMinhas();
      renderTabelaTodas();
      renderDashboard();
      renderMetas();
      renderFaltasAdiantamentos();
      atualizarMiniResumo();
      if (session.role === 'admin') preencherSelectsVendedor();
      if (document.getElementById('page-usuarios')?.classList.contains('active')) renderUsuarios();
    });

    // Tenta reenviar fila automaticamente ao carregar
    if (filaReenvio.length > 0) {
      setTimeout(() => reenviarFila(), 3000);
    }
  }

  // Usada pelos botões de atalho (Fatura / Visita) e por qualquer
  // lugar que precise pular direto pra uma aba específica.
  function irParaAba(tab) {
    mudarAba(tab);
  }

  function mudarAba(aba) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-' + aba);
    if (pageEl) pageEl.classList.add('active');

    document.querySelectorAll('.bn-item[data-tab]').forEach(b => b.classList.remove('active'));
    const btnMais = document.getElementById('bn-mais');
    const bnBtn = document.querySelector('.bn-item[data-tab="' + aba + '"]');
    if (bnBtn) { bnBtn.classList.add('active'); btnMais?.classList.remove('active'); }
    else { btnMais?.classList.add('active'); }

    if (aba === 'historico')  renderTabelaMinhas();
    if (aba === 'dashboard')  { renderDashboard(); renderMetas(); }
    if (aba === 'faltas')     renderFaltasAdiantamentos();
    if (aba === 'todas')      renderTabelaTodas();
    if (aba === 'usuarios')   renderUsuarios();
    if (aba === 'logins')     renderLogins();

    window.scrollTo({top:0, behavior:'smooth'});
  }

  function abrirMaisMenu() {
    document.getElementById('modal-mais-overlay').classList.add('show');
  }
  function fecharMaisMenu() {
    document.getElementById('modal-mais-overlay').classList.remove('show');
  }
  function mudarAbaMais(tab) {
    fecharMaisMenu();
    mudarAba(tab);
  }

  function selecionarHP(val) {
    const campo = document.getElementById('criar_hp');
    if (campo.value === val) {
      campo.value = '';
      document.getElementById('hp-sim').className = 'hp-btn';
      document.getElementById('hp-nao').className = 'hp-btn';
    } else {
      campo.value = val;
      document.getElementById('hp-sim').className = 'hp-btn' + (val === 'Sim' ? ' ativo-sim' : '');
      document.getElementById('hp-nao').className = 'hp-btn' + (val === 'Não' ? ' ativo-nao' : '');
    }
  }

  function getMovelTexto() {
    const c = document.getElementById('plano_controle').value.trim();
    const p = document.getElementById('plano_pos').value.trim();
    const parts = [];
    if (c) parts.push('CONTROLE: ' + c);
    if (p) parts.push('PÓS: ' + p);
    return parts.join(' / ') || '';
  }

  let cepTimer;
  function onCepInput() {
    let v = document.getElementById('cep').value.replace(/\D/g,'').slice(0,8);
    v = v.replace(/(\d{5})(\d)/,'$1-$2');
    document.getElementById('cep').value = v;
    atualizarProgresso();
    clearTimeout(cepTimer);
    if (v.replace('-','').length === 8)
      cepTimer = setTimeout(() => buscarCep(v.replace('-','')), 600);
  }

  async function buscarCep(cep) {
    const st = document.getElementById('cep-status');
    st.className = 'cep-status show loading'; st.textContent = '⏳ Buscando...';
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) { st.className = 'cep-status show erro'; st.textContent = '❌ CEP não encontrado'; return; }
      document.getElementById('rua').value    = d.logradouro || '';
      document.getElementById('bairro').value = d.bairro || '';
      document.getElementById('cidade').value = normalizar(d.localidade || '');
      st.className = 'cep-status show ok'; st.textContent = '✅ Endereço preenchido!';
      atualizarProgresso();
      setTimeout(() => { st.className = 'cep-status'; buscarPreco(); }, 400);
    } catch(e) { st.className = 'cep-status show erro'; st.textContent = '❌ Erro ao buscar CEP'; }
  }

  function limparCampo(id) {
    document.getElementById(id).value = '';
    document.getElementById(id).focus();
    atualizarProgresso();
  }

  const CAMPOS_PROG = ['vendedor','nome','celular','cep','rua','mensalidade'];
  function atualizarProgresso() {
    const total = CAMPOS_PROG.length;
    const preenchidos = CAMPOS_PROG.filter(id => document.getElementById(id)?.value.trim()).length;
    const pct = Math.round((preenchidos / total) * 100);
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('pct-label').textContent = pct + '%';
  }

  function mascararData(el) {
    let v = el.value.replace(/\D/g,'').slice(0,8);
    if (v.length >= 5) v = v.slice(0,2)+'/'+v.slice(2,4)+'/'+v.slice(4);
    else if (v.length >= 3) v = v.slice(0,2)+'/'+v.slice(2);
    el.value = v;
  }

  function fazerCheckin() {
    const btn = document.getElementById('btn-checkin');
    if (!navigator.geolocation) { showToast('❌ Geolocalização não suportada','error'); return; }
    btn.innerHTML = '⏳ Obtendo localização...'; btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude.toFixed(7);
        const lng = pos.coords.longitude.toFixed(7);
        checkinCoords = { lat, lng };
        const mapUrl = `https://maps.google.com/maps?q=${lat},${lng}&z=17`;
        btn.innerHTML = `✅ Check-in: ${lat}, ${lng}`;
        btn.disabled = false;
        btn.style.background = 'linear-gradient(135deg,#16a34a,#22c55e)';
        showToast('📍 Localização capturada!');
        btn.onclick = () => window.open(mapUrl, '_blank');
      },
      err => {
        btn.innerHTML = '📍 Check-in — Localização do Cliente';
        btn.onclick = fazerCheckin; btn.disabled = false;
        const msgs = { 1:'❌ Permissão negada.', 2:'❌ Posição indisponível.', 3:'❌ Tempo esgotado.' };
        showToast(msgs[err.code] || '❌ Erro de localização.','error');
      },
      { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
    );
  }

  function vl(id) { return document.getElementById(id)?.value.trim() || ''; }
  function fmtData(d) { return (d && d !== '—') ? d : '—'; }

  function setSyncStatus(tipo, msg) {
    const el = document.getElementById('sync-status');
    el.className = 'sync-status show ' + tipo; el.innerHTML = msg;
  }
  function hideSyncStatus() { document.getElementById('sync-status').classList.remove('show'); }

  function gerarTexto() {
    const nascStr    = document.getElementById('nascimento').value;
    const movelTexto = getMovelTexto();
    const statusFicha = session.role === 'admin' ? vl('status') : 'Pendente';

    // ─────────────────────────────────────────────────────────
    // CORREÇÃO: campos de texto livre agora passam por up()
    // (maiúsculas) para garantir que o valor REAL salvo em
    // fichaAtual — usado no texto do WhatsApp, no envio ao
    // Google Sheets e na exportação Excel — fique em maiúsculo,
    // e não só visualmente via CSS text-transform.
    // 'status' e 'criar_hp' ficam de fora porque são valores
    // fixos de select/botão usados em comparações (f.status===
    // 'Concluída', classes de cor, filtros, dashboard etc.) —
    // maiusculá-los quebraria essas comparações.
    // ─────────────────────────────────────────────────────────
    fichaAtual = {
      id: Date.now(),
      data_cadastro: new Date().toLocaleDateString('pt-BR'),
      username_vendedor: session.username,
      vendedor: up(vl('vendedor')), status: statusFicha,
      criar_hp: document.getElementById('criar_hp')?.value || '',
      nome: up(vl('nome')), cpf: vl('cpf'), rg: up(vl('rg')),
      nascimento: fmtData(nascStr), mae: up(vl('mae')),
      celular: vl('celular'), sms: vl('sms'), email: up(vl('email')),
      rua: up(vl('rua')), numero: up(vl('numero')), complemento: up(vl('complemento')),
      bairro: up(vl('bairro')), cidade: up(vl('cidade')), cep: vl('cep'),
      plano_banda: vl('plano_banda'), plano_mesh: vl('plano_mesh'), plano_controle: vl('plano_controle'),
      plano_pos: vl('plano_pos'), portabilidade: up(vl('portabilidade')),
      plano_movel: up(movelTexto), plano_tv: vl('plano_tv'), plano_fixo: vl('plano_fixo'),
      mensalidade: vl('mensalidade'), debito: vl('debito'), taxa: up(vl('taxa')),
      vencimento: up(vl('vencimento')), periodo: up(vl('periodo')), obs: up(vl('obs')),
      checkin_lat: checkinCoords?.lat || '',
      checkin_lng: checkinCoords?.lng || '',
      checkin_url: checkinCoords ? `https://www.google.com/maps?q=${checkinCoords.lat},${checkinCoords.lng}` : ''
    };

    const servicosAtivos = [
      { label:'🌐 Banda Larga', val: fichaAtual.plano_banda },
      { label:'🔀 Mesh',        val: fichaAtual.plano_mesh ? fichaAtual.plano_mesh + ' UN' : '' },
      { label:'📱 Controle',    val: fichaAtual.plano_controle },
      { label:'📱 Pós',         val: fichaAtual.plano_pos },
      { label:'📺 TV',          val: fichaAtual.plano_tv },
      { label:'☎️ Fixo',        val: fichaAtual.plano_fixo },
    ].filter(s => s.val && s.val !== '—');
    const servicosLinhas = servicosAtivos.length
      ? servicosAtivos.map(s => `${s.label}: ${s.val}`).join('\n') : '—';

    const checkinLine = checkinCoords ? `\n📍 Check-in: https://www.google.com/maps?q=${checkinCoords.lat},${checkinCoords.lng}` : '';
    const portabLine  = fichaAtual.portabilidade ? `\nPortabilidade: ${fichaAtual.portabilidade}` : '';
    const smsLine      = fichaAtual.sms ? `\nSMS: ${fichaAtual.sms}` : '';

    const txt =
`FICHA CADASTRAL - CARRERA TELECOM
Vendedor: ${fichaAtual.vendedor}
Status: ${fichaAtual.status}
Criar HP: ${fichaAtual.criar_hp || '—'}

DADOS PESSOAIS
Nome: ${fichaAtual.nome}
CPF: ${fichaAtual.cpf}
RG: ${fichaAtual.rg}
Data de Nascimento: ${fichaAtual.nascimento}
Nome da Mae: ${fichaAtual.mae}
WhatsApp: ${fichaAtual.celular}${smsLine}
E-mail: ${fichaAtual.email}

ENDERECO DE INSTALACAO
📍 Rua: ${fichaAtual.rua}
Numero: ${fichaAtual.numero}
Complemento: ${fichaAtual.complemento}
Bairro: ${fichaAtual.bairro}
Cidade: ${fichaAtual.cidade}
CEP: ${fichaAtual.cep}${checkinLine}

PLANO CONTRATADO
${servicosLinhas}${portabLine}
Valor Total: ${fichaAtual.mensalidade}
Valor Promocional: ${fichaAtual.debito}
Taxa de Instalacao: ${fichaAtual.taxa}
Melhor Vencimento: ${fichaAtual.vencimento}
Periodo de Instalacao: ${fichaAtual.periodo}${fichaAtual.obs ? '\n\nOBSERVAÇÕES\n' + fichaAtual.obs : ''}`;

    document.getElementById('texto-gerado').textContent = txt;
    document.getElementById('hora-preview').textContent =
      new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    hideSyncStatus();
    const p = document.getElementById('preview');
    p.classList.add('show');
    p.scrollIntoView({behavior:'smooth', block:'start'});
  }

  async function enviarFicha() {
    const btn = document.getElementById('btn-enviar');
    gerarTexto();
    if (!fichaAtual) return;

    // Salva localmente primeiro (garantia)
    if (!fichas.find(f => f.id === fichaAtual.id)) {
      fichas.push(fichaAtual);
      salvarFichas();
    }

    btn.innerHTML = '⏳ Enviando...';
    btn.disabled = true;
    setSyncStatus('loading', '⏳ Enviando para o Google Sheets...');

    const ok = await enviarParaSheets(fichaAtual);

    if (ok) {
      // Remove da fila de pendentes se estava lá
      filaReenvio = filaReenvio.filter(f => String(f.id) !== String(fichaAtual.id));
      salvarFila();
      btn.innerHTML = '✅ Enviado!';
      setSyncStatus('ok', '✅ Ficha enviada para o Google Sheets!');
      showToast('✅ Ficha de ' + fichaAtual.nome + ' enviada!');
      atualizarMiniResumo();
      if (typeof window.limparRascunho === 'function') window.limparRascunho();
    } else {
      // Adiciona à fila de reenvio
      if (!filaReenvio.find(f => String(f.id) === String(fichaAtual.id))) {
        filaReenvio.push(fichaAtual);
        salvarFila();
      }
      setSyncStatus('erro',
        '⚠️ Salvo localmente. Falha ao enviar ao Sheets. ' +
        '<button onclick="reenviarFila()" style="background:none;border:none;color:#991b1b;font-weight:700;cursor:pointer;text-decoration:underline;padding:0;font-family:inherit">Tentar reenviar</button>'
      );
      showToast('⚠️ Ficha salva localmente — sem conexão com o Sheets.', 'warning', 5000);
    }

    setTimeout(() => { btn.innerHTML = '📤 ENVIAR'; btn.disabled = false; }, 3000);
    setTimeout(() => hideSyncStatus(), 8000);
  }

  function copiarTexto() {
    const texto = document.getElementById('texto-gerado').textContent;
    const b = document.getElementById('btn-copiar');
    const done = () => {
      b.textContent = '✅ Copiado!'; b.classList.add('copiado');
      setTimeout(() => { b.textContent = '📋 Copiar texto'; b.classList.remove('copiado'); }, 2500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(texto).then(done).catch(() => copiarFallback(texto, b));
    } else copiarFallback(texto, b);
  }
  function copiarFallback(texto, btn) {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0,99999);
    try { document.execCommand('copy'); btn.textContent = '✅ Copiado!'; btn.classList.add('copiado'); setTimeout(() => { btn.textContent='📋 Copiar texto'; btn.classList.remove('copiado'); },2500); }
    catch(e) { btn.textContent = '👆 Segure pra copiar'; setTimeout(() => btn.textContent='📋 Copiar texto',3000); }
    document.body.removeChild(ta);
  }

  function limpar() {
    document.querySelectorAll('#page-formulario input, #page-formulario select, #page-formulario textarea')
      .forEach(el => el.value = '');
    document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('ativo'));
    ['plano_banda','plano_mesh','plano_controle','plano_pos','plano_tv','plano_fixo'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    if (session.role === 'admin') {
      document.getElementById('status').value = 'Agendada';
    } else {
      document.getElementById('status').value = 'Pendente';
    }
    document.getElementById('vendedor').value = session.name;
    document.getElementById('preview').classList.remove('show');
    document.getElementById('btn-checkin').innerHTML = '📍 Check-in — Localização do Cliente';
    document.getElementById('btn-checkin').disabled = false;
    document.getElementById('btn-checkin').style.background = '';
    document.getElementById('btn-checkin').onclick = fazerCheckin;
    document.getElementById('mensalidade').classList.remove('auto-preenchido');
    document.getElementById('preco-status').className = 'preco-status';
    hideSyncStatus();
    document.getElementById('cep-status').className = 'cep-status';
    document.getElementById('criar_hp').value = '';
    document.getElementById('hp-sim').className = 'hp-btn';
    document.getElementById('hp-nao').className = 'hp-btn';
    camposAutoPreenchidos.clear();
    fichaAtual = null; checkinCoords = null;
    atualizarProgresso();
    if (typeof window.limparRascunho === 'function') window.limparRascunho();
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function salvarFichas() {
    localStorage.setItem('fichas', JSON.stringify(fichas));
    atualizarContadores();
    atualizarMiniResumo();
  }

  // ─────────────────────────────────────────────────────────────
  // CORREÇÃO: antes esta função só ADICIONAVA/ATUALIZAVA fichas
  // vindas do Sheets, nunca removia nada localmente — por isso
  // uma ficha excluída pelo admin continuava aparecendo pro
  // vendedor depois de sincronizar. Agora, qualquer ficha local
  // que não veio na lista remota E não está na fila de reenvio
  // (ou seja, já foi sincronizada em algum momento e não existe
  // mais na planilha) é removida do localStorage também.
  // ─────────────────────────────────────────────────────────────
  function mesclarFichas(remotas) {
    const remotoIds    = new Set(remotas.map(f => String(f.id)));
    const pendentesIds = new Set(filaReenvio.map(f => String(f.id)));

    const mapa = new Map();
    fichas.forEach(f => {
      const idStr = String(f.id);
      // mantém a ficha local só se ela ainda existe na planilha
      // ou se ainda está pendente de envio (nunca chegou lá)
      if (remotoIds.has(idStr) || pendentesIds.has(idStr)) {
        mapa.set(idStr, f);
      }
      // caso contrário: foi excluída na planilha -> descarta local também
    });

    remotas.forEach(f => {
      const idStr = String(f.id);
      const local = mapa.get(idStr);
      mapa.set(idStr, { ...local, ...f, id: local ? local.id : (Number(f.id) || f.id) });
    });

    fichas = Array.from(mapa.values());
    salvarFichas();
  }

  async function atualizarDoSheets(manual) {
    const btn   = document.getElementById('btn-atualizar');
    const icone = document.getElementById('icone-atualizar');
    const texto = document.getElementById('texto-atualizar');
    if (btn.disabled) return;
    btn.disabled = true;
    icone.classList.add('icone-girando');
    if (manual) texto.textContent = 'Atualizando...';
    try {
      // Bootstrap único: fichas + preços + cidades + usuários + faltas + adiantamentos + metas
      const ok = await carregarBootstrap();

      if (ok) {
        renderTabelaMinhas();
        renderTabelaTodas();
        renderDashboard();
        renderMetas();
        renderFaltasAdiantamentos();
        atualizarMiniResumo();
        if (session.role === 'admin') preencherSelectsVendedor();
        if (document.getElementById('page-usuarios')?.classList.contains('active')) renderUsuarios();
        if (manual) showToast('✅ Dados atualizados!');
      } else if (manual) {
        showToast('⚠️ Não foi possível atualizar agora.', 'warning');
      }

      // Aproveita para tentar reenviar filas pendentes
      if (filaReenvio.length > 0) reenviarFila();
      if (filaFaltas.length > 0) reenviarFilaFaltas();
      if (filaAdiantamentos.length > 0) reenviarFilaAdiantamentos();
    } catch (err) {
      if (manual) showToast('⚠️ Falha ao buscar do Google Sheets.', 'warning');
    } finally {
      btn.disabled = false;
      icone.classList.remove('icone-girando');
      texto.textContent = 'Atualizar';
    }
  }

  function atualizarContadores() {
    const minhas = fichas.filter(f => session.role==='admin' || f.username_vendedor===session.username);
    document.getElementById('badge-minhas').textContent = minhas.length;
    document.getElementById('badge-todas').textContent  = fichas.length;
  }

  function filtrar(status, ctx, btn) {
    if (ctx === 'minhas') { filtroMinhas = status; renderTabelaMinhas(); }
    else { filtroTodas = status; renderTabelaTodas(); }
    btn.closest('.filtros').querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('ativo'));
    btn.classList.add('ativo');
  }

  function renderTabelaMinhas() {
    const busca = (document.getElementById('busca-minhas')?.value||'').toLowerCase();
    let lista = fichas.filter(f => session.role==='admin' || f.username_vendedor===session.username);
    if (filtroMinhas !== 'todos') lista = lista.filter(f => f.status === filtroMinhas);
    if (busca) lista = lista.filter(f =>
      (f.nome||'').toLowerCase().includes(busca) ||
      (f.cpf||'').replace(/\D/g,'').includes(busca.replace(/\D/g,''))
    );
    document.getElementById('badge-minhas').textContent = lista.length;
    renderTabela(lista, 'tabela-minhas', false);
  }

  function renderTabelaTodas() {
    const busca = (document.getElementById('busca-todas')?.value||'').toLowerCase();
    let lista = [...fichas];
    if (filtroTodas !== 'todos') lista = lista.filter(f => f.status === filtroTodas);
    if (busca) lista = lista.filter(f =>
      (f.nome||'').toLowerCase().includes(busca) ||
      (f.cpf||'').replace(/\D/g,'').includes(busca.replace(/\D/g,'')) ||
      (f.vendedor||'').toLowerCase().includes(busca)
    );
    document.getElementById('badge-todas').textContent = fichas.length;
    renderTabela(lista, 'tabela-todas', session.role==='admin');
  }

  function renderTabela(lista, containerId, isAdmin) {
    const wrap = document.getElementById(containerId);
    if (fichas.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>Nenhuma ficha salva ainda.</p></div>`;
      return;
    }
    if (lista.length === 0) {
      wrap.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>Nenhuma ficha encontrada.</p></div>`;
      return;
    }
    // Apenas administradores podem excluir — a exclusão é
    // definitiva e remove a linha direto da planilha do Sheets.
    const podeExcluir = session.role === 'admin';
    const rows = lista.slice().reverse().map((f, i) => {
      const localCell = f.checkin_url ? `<a href="${f.checkin_url}" target="_blank">📍 Ver</a>` : '<span style="color:#c0c8d0">—</span>';
      const movelCell = [
        f.plano_controle ? '<span style="color:#1d4ed8">C:</span> '+f.plano_controle : '',
        f.plano_pos ? '<span style="color:#7e22ce">P:</span> '+f.plano_pos : '',
        f.portabilidade ? '<span style="color:#000000">↔</span> '+f.portabilidade : ''
      ].filter(Boolean).join('<br>') || '—';

      const statusCell = isAdmin
        ? `<select class="status-select" onchange="alterarStatus(${f.id},this.value)">
            ${['Agendada','Concluída','Pendente','Cancelada'].map(s =>
              `<option value="${s}"${f.status===s?' selected':''}>${s}</option>`
            ).join('')}
           </select>`
        : (() => {
            const cls = {Agendada:'status-agendada',Concluída:'status-concluida',Cancelada:'status-cancelada',Pendente:'status-pendente'}[f.status]||'';
            return cls ? `<span class="status-pill ${cls}">${f.status}</span>` : '—';
          })();

      return `<tr>
        <td>${lista.length - i}</td>
        <td class="td-nome">${f.nome}</td>
        ${isAdmin ? `<td>${f.vendedor||'—'}</td>` : ''}
        <td>${f.celular}</td>
        <td>${f.cidade}</td>
        <td class="td-plano">${f.plano_banda||'—'}${f.plano_mesh ? ' + Mesh '+f.plano_mesh : ''}</td>
        <td class="td-plano">${movelCell}</td>
        <td class="td-plano">${f.plano_tv||'—'}</td>
        <td class="td-valor">${f.mensalidade}</td>
        <td>${f.periodo||'—'}</td>
        <td>${statusCell}</td>
        <td class="td-local">${localCell}</td>
        <td>${f.data_cadastro}</td>
        <td style="white-space:nowrap">
          <button class="btn-regerar" onclick="reGerarFicha(${f.id})" title="Editar">↩</button>
          ${podeExcluir ? `<button class="btn-del" onclick="deletar(${f.id})" title="Excluir da planilha">✕</button>` : ''}
        </td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<div class="tabela-wrap"><table>
      <thead><tr>
        <th>#</th><th>Nome</th>${isAdmin ? '<th>Vendedor</th>' : ''}
        <th>Celular</th><th>Cidade</th><th>🌐 Banda</th><th>📱 Móvel</th>
        <th>📺 TV</th><th>Valor</th><th>Instalação</th>
        <th>Status</th><th>Local</th><th>Data</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  function alterarStatus(id, novoStatus) {
    if (session.role !== 'admin') { showToast('⚠️ Apenas administradores podem alterar o status.', 'warning'); return; }
    const idx = fichas.findIndex(f => f.id === id);
    if (idx < 0) return;
    fichas[idx].status = novoStatus;
    salvarFichas();
    showToast(`✅ Status atualizado: ${novoStatus}`);
    renderDashboard();
  }

  // ─────────────────────────────────────────────────────────────
  // EXCLUSÃO DEFINITIVA — remove a linha na planilha do Google
  // Sheets (via action=deletar no Apps Script) e, em caso de
  // sucesso, remove também do localStorage deste dispositivo.
  // Como o próximo sync (atualizarDoSheets -> mesclarFichas) não
  // vai mais encontrar essa ficha na planilha, ela desaparece
  // automaticamente de "Minhas Vendas" e "Desempenho" para o
  // vendedor também, sem que ele precise fazer nada.
  // ─────────────────────────────────────────────────────────────
  async function deletar(id) {
    if (session.role !== 'admin') {
      showToast('⚠️ Apenas administradores podem excluir fichas.', 'warning');
      return;
    }
    if (!confirm('Excluir esta ficha da planilha para TODOS os usuários? Esta ação não pode ser desfeita.')) return;

    showToast('🗑 Excluindo da planilha...', 'info', 2500);

    try {
      const resp = await fetch(SHEETS_URL + '?action=deletar&id=' + encodeURIComponent(id), { cache: 'no-store' });
      const dados = await resp.json();

      if (dados.status === 'ok') {
        fichas = fichas.filter(f => String(f.id) !== String(id));
        salvarFichas();
        renderTabelaMinhas();
        renderTabelaTodas();
        renderDashboard();
        showToast('🗑 Ficha excluída da planilha com sucesso!');
      } else {
        showToast('❌ ' + (dados.msg || 'Não foi possível excluir a ficha.'), 'error');
      }
    } catch (err) {
      showToast('❌ Falha de conexão ao excluir. Tente novamente.', 'error');
    }
  }

  function reGerarFicha(id) {
    const f = fichas.find(x => x.id === id);
    if (!f) return;
    fichaAtual = f;
    checkinCoords = f.checkin_lat ? { lat: f.checkin_lat, lng: f.checkin_lng } : null;
    const map = ['vendedor','status','nome','cpf','rg','celular','sms','email','mae','rua','numero','complemento','bairro','cidade','cep','plano_banda','plano_mesh','plano_controle','plano_pos','portabilidade','plano_tv','plano_fixo','mensalidade','debito','taxa','vencimento','periodo','obs'];
    map.forEach(k => {
      const el = document.getElementById(k);
      if (!el) return;
      if (k === 'status' && session.role !== 'admin') return;
      el.value = f[k]||'';
    });
    document.getElementById('criar_hp').value = f.criar_hp||'';
    document.getElementById('hp-sim').className = 'hp-btn' + (f.criar_hp==='Sim' ? ' ativo-sim' : '');
    document.getElementById('hp-nao').className = 'hp-btn' + (f.criar_hp==='Não' ? ' ativo-nao' : '');
    restaurarPill('plano_banda',    'pills-banda');
    restaurarMesh();
    restaurarPill('plano_controle', 'pills-controle');
    restaurarPill('plano_pos',      'pills-pos');
    restaurarPill('plano_tv',       'pills-tv');
    restaurarPill('plano_fixo',     'pills-fixo');
    mudarAba('formulario');
    setTimeout(() => gerarTexto(), 100);
  }

  // ══════════════════════════════════════════════════════════════
  // FILTRO DE PERÍODO DO DASHBOARD
  // ══════════════════════════════════════════════════════════════
  let filtroPeriodo = 'total';           // 'hoje' | '7dias' | 'mes' | 'total' | 'custom'
  let periodoCustomDe  = null;           // Date (00:00) quando filtroPeriodo === 'custom'
  let periodoCustomAte = null;           // Date (23:59:59) quando filtroPeriodo === 'custom'

  // data_cadastro é salvo como "DD/MM/AAAA" (toLocaleDateString('pt-BR')).
  //
  // CORREÇÃO: o Apps Script (Code.gs) foi atualizado para usar
  // getDisplayValues() ao ler as abas Fichas/FALTAS/ADIANTAMENTOS,
  // então data_cadastro deve chegar sempre como texto "DD/MM/AAAA".
  // Esta função foi deixada tolerante mesmo assim, como rede de
  // segurança: se algum dia a planilha (ou uma versão antiga do
  // Apps Script) devolver a data serializada em ISO
  // ("2026-07-24T03:00:00.000Z", por causa de Date virando string
  // no JSON.stringify), o filtro de período do dashboard (Hoje /
  // 7 dias / Este mês / Personalizado) continua funcionando em vez
  // de simplesmente não encontrar nenhuma ficha e cair sempre no
  // "Total".
  function parseDataCadastro(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (!s) return null;

    // Formato ISO (ex: "2026-07-24T03:00:00.000Z" ou "2026-07-24")
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      if (isNaN(d.getTime())) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    }

    // Formato esperado DD/MM/AAAA
    const p = s.split('/');
    if (p.length !== 3) return null;
    const d = parseInt(p[0], 10), m = parseInt(p[1], 10), y = parseInt(p[2], 10);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  function inicioDoDia(date) {
    const d = new Date(date);
    d.setHours(0,0,0,0);
    return d;
  }
  function fimDoDia(date) {
    const d = new Date(date);
    d.setHours(23,59,59,999);
    return d;
  }

  // Retorna { inicio, fim } (ambos Date, inclusivos) para o período
  // atualmente selecionado no dashboard, ou null para "total" (sem filtro).
  function getRangePeriodoAtual() {
    const hoje = new Date();
    if (filtroPeriodo === 'hoje') {
      return { inicio: inicioDoDia(hoje), fim: fimDoDia(hoje) };
    }
    if (filtroPeriodo === '7dias') {
      const inicio = inicioDoDia(new Date(hoje.getTime() - 6*24*60*60*1000)); // hoje + 6 dias atrás = 7 dias
      return { inicio, fim: fimDoDia(hoje) };
    }
    if (filtroPeriodo === 'mes') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0,0,0,0);
      return { inicio, fim: fimDoDia(hoje) };
    }
    if (filtroPeriodo === 'custom' && periodoCustomDe && periodoCustomAte) {
      return { inicio: inicioDoDia(periodoCustomDe), fim: fimDoDia(periodoCustomAte) };
    }
    return null; // total
  }

  // Dado um range { inicio, fim }, devolve o range imediatamente anterior
  // com a MESMA duração — usado para calcular a comparação (↑/↓ vs período anterior).
  function getRangeAnterior(range) {
    const duracaoMs = range.fim.getTime() - range.inicio.getTime();
    const fimAnterior = new Date(range.inicio.getTime() - 1); // 1ms antes do início atual
    const inicioAnterior = new Date(fimAnterior.getTime() - duracaoMs);
    return { inicio: inicioAnterior, fim: fimAnterior };
  }

  function filtrarFichasPorRange(lista, range) {
    if (!range) return lista; // 'total' -> sem filtro
    return lista.filter(f => {
      const d = parseDataCadastro(f.data_cadastro);
      if (!d) return false;
      return d >= range.inicio && d <= range.fim;
    });
  }

  function selecionarPeriodo(periodo) {
    filtroPeriodo = periodo;
    document.querySelectorAll('.periodo-btn').forEach(b => b.classList.toggle('ativo', b.dataset.periodo === periodo));
    document.getElementById('periodo-custom').classList.toggle('show', periodo === 'custom');
    if (periodo !== 'custom') {
      renderDashboard();
    } else if (periodoCustomDe && periodoCustomAte) {
      renderDashboard();
    }
  }

  function parseDataBR(str) {
    const p = String(str||'').split('/');
    if (p.length !== 3) return null;
    const d = parseInt(p[0],10), m = parseInt(p[1],10), y = parseInt(p[2],10);
    if (!d || !m || !y) return null;
    return new Date(y, m-1, d);
  }

  function aplicarPeriodoCustom() {
    const de  = parseDataBR(document.getElementById('periodo-de').value);
    const ate = parseDataBR(document.getElementById('periodo-ate').value);
    if (!de || !ate) { showToast('⚠️ Informe as duas datas (DD/MM/AAAA)','warning'); return; }
    if (de > ate) { showToast('⚠️ A data inicial deve ser antes da final','warning'); return; }
    periodoCustomDe = de;
    periodoCustomAte = ate;
    renderDashboard();
  }

  function formatarDataCurta(d) {
    return d.toLocaleDateString('pt-BR');
  }

  function atualizarLabelPeriodo(range) {
    const el = document.getElementById('periodo-label-atual');
    if (!el) return;
    if (!range) { el.textContent = '📊 Mostrando: todo o histórico'; return; }
    el.textContent = `📊 Mostrando: ${formatarDataCurta(range.inicio)} até ${formatarDataCurta(range.fim)}`;
  }

  // Monta o HTML de tendência (↑/↓/=) comparando valor atual vs anterior.
  // Se não há período de comparação (filtro = total) ou o anterior é 0
  // e o atual também é 0, não mostra nada.
  function trendHtml(atual, anterior, temComparacao) {
    if (!temComparacao) return '';
    if (anterior === 0) {
      if (atual === 0) return '';
      return `<div class="kpi-trend up">↑ novo (sem base no período anterior)</div>`;
    }
    const variacao = ((atual - anterior) / anterior) * 100;
    const arred = Math.round(variacao);
    if (arred === 0) return `<div class="kpi-trend flat">— igual ao período anterior</div>`;
    const cls = arred > 0 ? 'up' : 'down';
    const seta = arred > 0 ? '↑' : '↓';
    return `<div class="kpi-trend ${cls}">${seta} ${Math.abs(arred)}% vs período anterior</div>`;
  }

  function renderDashboard() {
    const minhasTodas = fichas.filter(f =>
      session.role==='admin' || f.username_vendedor===session.username
    );

    const range = getRangePeriodoAtual();
    const temComparacao = !!range; // só compara quando há um período definido (não em "Total")
    const minhas = filtrarFichasPorRange(minhasTodas, range);

    let minhasAnterior = [];
    if (temComparacao) {
      const rangeAnterior = getRangeAnterior(range);
      minhasAnterior = filtrarFichasPorRange(minhasTodas, rangeAnterior);
    }

    atualizarLabelPeriodo(range);

    document.getElementById('dash-sub').textContent =
      session.role === 'admin'
        ? `Visão geral de toda a equipe — ${minhas.length} ficha(s) no período`
        : `Olá, ${session.name.split(' ')[0]}! Aqui está seu resumo.`;

    const total      = minhas.length;
    const concluidas = minhas.filter(f => f.status==='Concluída').length;
    const agendadas  = minhas.filter(f => f.status==='Agendada').length;
    const canceladas = minhas.filter(f => f.status==='Cancelada').length;
    const pendentes  = minhas.filter(f => f.status==='Pendente').length;

    const totalAnt      = minhasAnterior.length;
    const concluidasAnt = minhasAnterior.filter(f => f.status==='Concluída').length;
    const agendadasAnt  = minhasAnterior.filter(f => f.status==='Agendada').length;
    const canceladasAnt = minhasAnterior.filter(f => f.status==='Cancelada').length;
    const pendentesAnt  = minhasAnterior.filter(f => f.status==='Pendente').length;

    const somarValor = (lista) => lista.reduce((sum, f) => {
      const valor = parseFloat(String(f.mensalidade || '0').replace(/[^\d.,]/g, '').replace(',','.'));
      return sum + (isNaN(valor) ? 0 : valor);
    }, 0);

    const valorTotal = somarValor(minhas);
    const valorConcluido = somarValor(minhas.filter(f => f.status==='Concluída'));
    const valorTotalAnt = somarValor(minhasAnterior);
    const valorConcluidoAnt = somarValor(minhasAnterior.filter(f => f.status==='Concluída'));

    const formatarMoeda = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    document.getElementById('kpis-vendedor').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Total</div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-sub">fichas cadastradas</div>
        ${trendHtml(total, totalAnt, temComparacao)}
      </div>
      <div class="kpi-card rosa">
        <div class="kpi-label">💰 Valor Total</div>
        <div class="kpi-value" style="font-size:1.3rem;">${formatarMoeda(valorTotal)}</div>
        <div class="kpi-sub">todas as vendas</div>
        ${trendHtml(valorTotal, valorTotalAnt, temComparacao)}
      </div>
      <div class="kpi-card verde">
        <div class="kpi-label">✅ Valor Concluído</div>
        <div class="kpi-value" style="font-size:1.3rem;">${formatarMoeda(valorConcluido)}</div>
        <div class="kpi-sub">${concluidas} fichas concluídas</div>
        ${trendHtml(valorConcluido, valorConcluidoAnt, temComparacao)}
      </div>
      <div class="kpi-card verde">
        <div class="kpi-label">Concluídas</div>
        <div class="kpi-value">${concluidas}</div>
        <div class="kpi-sub">${total ? Math.round(concluidas/total*100) : 0}% do total</div>
        ${trendHtml(concluidas, concluidasAnt, temComparacao)}
      </div>
      <div class="kpi-card laranja">
        <div class="kpi-label">Agendadas</div>
        <div class="kpi-value">${agendadas}</div>
        <div class="kpi-sub">aguardando instalação</div>
        ${trendHtml(agendadas, agendadasAnt, temComparacao)}
      </div>
      <div class="kpi-card azul">
        <div class="kpi-label">Pendentes</div>
        <div class="kpi-value">${pendentes}</div>
        <div class="kpi-sub">em análise</div>
        ${trendHtml(pendentes, pendentesAnt, temComparacao)}
      </div>
      <div class="kpi-card vermelho">
        <div class="kpi-label">Canceladas</div>
        <div class="kpi-value">${canceladas}</div>
        <div class="kpi-sub">não efetivadas</div>
        ${trendHtml(canceladas, canceladasAnt, temComparacao)}
      </div>
    `;

    const statusData = [
      { label:'Concluídas', count: concluidas, color:'#16a34a' },
      { label:'Agendadas',  count: agendadas,  color:'#e67e22' },
      { label:'Pendentes',  count: pendentes,  color:'#2563eb' },
      { label:'Canceladas', count: canceladas, color:'#ef4444' },
    ];
    const maxStatus = Math.max(...statusData.map(d=>d.count), 1);
    document.getElementById('bars-status').innerHTML = statusData.map(d => `
      <div class="bar-wrap">
        <div class="bar-label">${d.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${d.count/maxStatus*100}%;background:${d.color}"></div></div>
        <div class="bar-val">${d.count}</div>
      </div>`).join('');

    const prodCount = {};
    minhas.forEach(f => {
      ['plano_banda','plano_controle','plano_pos','plano_tv','plano_fixo'].forEach(k => {
        if (f[k]) { prodCount[f[k]] = (prodCount[f[k]]||0) + 1; }
      });
      if (f.plano_mesh) { prodCount['Mesh ' + f.plano_mesh] = (prodCount['Mesh ' + f.plano_mesh]||0) + 1; }
    });
    const prods = Object.entries(prodCount).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const maxProd = prods.length ? prods[0][1] : 1;
    document.getElementById('bars-produtos').innerHTML = prods.length
      ? prods.map(([nome, cnt]) => `
        <div class="bar-wrap">
          <div class="bar-label">${nome}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${cnt/maxProd*100}%"></div></div>
          <div class="bar-val">${cnt}</div>
        </div>`).join('')
      : '<p style="color:var(--muted);font-size:.82rem;text-align:center;padding:20px 0">Nenhum produto registrado ainda.</p>';

    if (session.role === 'admin') renderRankingAdmin(minhas);
    renderDashboardFaltasAdiantamentos();
  }

  function renderRankingAdmin(minhasNoPeriodo) {
    const porVendedor = {};
    minhasNoPeriodo.forEach(f => {
      const key = f.username_vendedor || f.vendedor || '?';
      if (!porVendedor[key]) porVendedor[key] = { name: f.vendedor||key, total:0, concluidas:0 };
      porVendedor[key].total++;
      if (f.status === 'Concluída') porVendedor[key].concluidas++;
    });
    const ranking = Object.values(porVendedor).sort((a,b) => b.total - a.total);
    const posClasses = ['gold','silver','bronze'];
    const posEmojis  = ['🥇','🥈','🥉'];
    const existing = document.getElementById('ranking-admin');
    const section = existing || document.createElement('div');
    section.id = 'ranking-admin';
    section.className = 'dash-section';
    if (!ranking.length) {
      section.innerHTML = `<h3>🏆 Ranking da Equipe</h3><p style="color:var(--muted);font-size:.82rem;text-align:center;padding:20px 0">Nenhuma ficha no período selecionado.</p>`;
    } else {
      section.innerHTML = `
        <h3>🏆 Ranking da Equipe</h3>
        <div class="rank-list">
          ${ranking.map((v, i) => `
            <div class="rank-item">
              <div class="rank-pos ${posClasses[i]||'other'}">${posEmojis[i]||i+1}</div>
              <div class="rank-name">${v.name}</div>
              <div class="rank-meta">${v.concluidas} concluída(s)</div>
              <div class="rank-val">${v.total} fichas</div>
            </div>`).join('')}
        </div>`;
    }
    if (!existing) document.getElementById('page-dashboard').insertBefore(section, document.querySelector('#page-dashboard .dash-divider'));
  }

  function renderUsuarios() {
    const users = getAllUsers();
    const grid = document.getElementById('usuarios-grid');
    if (!users.length) {
      grid.innerHTML = `<div class="empty-state"><div class="icon">👥</div><p>Carregando usuários da planilha...</p></div>`;
      return;
    }
    grid.innerHTML = users.map(u => {
      const fichasU = fichas.filter(f => f.username_vendedor === u.username);
      const avatarBg = u.role === 'admin' ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'linear-gradient(135deg,#000000,#D4AF37)';
      return `
        <div class="user-card">
          <div class="user-card-top">
            <div class="user-card-avatar" style="background:${avatarBg}">${(u.name||u.username).charAt(0).toUpperCase()}</div>
            <div>
              <div class="user-card-name">${u.name||u.username}</div>
              <div class="user-card-user">@${u.username}</div>
            </div>
          </div>
          <span class="role-badge ${u.role}" style="align-self:flex-start">${u.role === 'admin' ? 'Administrador' : 'Vendedor'}</span>
          <div class="user-card-stats">
            <div class="user-stat"><div class="user-stat-val">${fichasU.length}</div><div class="user-stat-lbl">Fichas</div></div>
            <div class="user-stat"><div class="user-stat-val">${fichasU.filter(f=>f.status==='Concluída').length}</div><div class="user-stat-lbl">Concluídas</div></div>
          </div>
          <button class="btn-del-user" onclick="removerUsuario('${u.username}')">🗑 Remover</button>
        </div>`;
    }).join('');
  }

  async function adicionarUsuario() {
    const name     = document.getElementById('new-name').value.trim();
    const username = document.getElementById('new-user').value.trim().toLowerCase();
    const password = document.getElementById('new-pass').value;
    const role     = document.getElementById('new-role').value;
    if (!name || !username || !password) { showToast('⚠️ Preencha todos os campos','warning'); return; }
    if (getAllUsers().some(u => u.username === username)) { showToast('⚠️ Usuário já existe','warning'); return; }

    const btn = document.querySelector('.btn-add-user');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      const url = SHEETS_URL + '?action=addUsuario'
        + '&username=' + encodeURIComponent(username)
        + '&password=' + encodeURIComponent(password)
        + '&name=' + encodeURIComponent(name)
        + '&role=' + encodeURIComponent(role);
      const resp = await fetch(url, { cache: 'no-store' });
      const dados = await resp.json();

      if (dados.status === 'ok') {
        ['new-name','new-user','new-pass'].forEach(id => document.getElementById(id).value = '');
        showToast('✅ Usuário ' + name + ' adicionado na planilha!');
        await carregarUsuarios();
        renderUsuarios();
        preencherSelectsVendedor();
      } else {
        showToast('❌ ' + (dados.msg || 'Não foi possível criar o usuário.'), 'error');
      }
    } catch (e) {
      showToast('❌ Falha de conexão ao criar usuário.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '➕ Adicionar Usuário'; }
    }
  }

  async function removerUsuario(username) {
    if (!confirm(`Remover o usuário @${username} da planilha? Esta ação não pode ser desfeita.`)) return;
    try {
      const resp = await fetch(SHEETS_URL + '?action=deletarUsuario&username=' + encodeURIComponent(username), { cache: 'no-store' });
      const dados = await resp.json();
      if (dados.status === 'ok') {
        showToast('🗑 Usuário removido da planilha');
        await carregarUsuarios();
        renderUsuarios();
        preencherSelectsVendedor();
      } else {
        showToast('❌ ' + (dados.msg || 'Não foi possível remover.'), 'error');
      }
    } catch (e) {
      showToast('❌ Falha de conexão ao remover usuário.', 'error');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // LOGINS — tela admin-only com local/horário de login da equipe.
  // Busca sob demanda (não vem no bootstrap) e o servidor confere
  // se quem está pedindo é admin de verdade — ver handleListarLogins
  // no Code.gs. Se um vendedor tentar acessar direto pela URL, o
  // servidor devolve lista vazia mesmo assim.
  // ══════════════════════════════════════════════════════════════
  async function renderLogins() {
    const container = document.getElementById('tabela-logins');
    const badge = document.getElementById('badge-logins');
    if (!container) return;

    if (session.role !== 'admin') {
      container.innerHTML = `<div class="empty-state"><div class="icon">🔒</div><p>Acesso restrito.</p></div>`;
      return;
    }

    container.innerHTML = `<div class="empty-state"><div class="icon">📍</div><p>Carregando...</p></div>`;

    try {
      const url = SHEETS_URL + '?action=logins&username=' + encodeURIComponent(session.username);
      const resp = await fetch(url, { cache: 'no-store' });
      const dados = await resp.json();

      if (dados.status !== 'ok' || !Array.isArray(dados.logins)) {
        container.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${dados.msg || 'Não foi possível carregar.'}</p></div>`;
        return;
      }

      const logins = dados.logins;
      if (badge) badge.textContent = logins.length;

      if (!logins.length) {
        container.innerHTML = `<div class="empty-state"><div class="icon">📍</div><p>Nenhum login com localização registrado ainda.</p></div>`;
        return;
      }

      container.innerHTML = `<div class="tabela-wrap"><table>
          <thead>
            <tr><th>Vendedor</th><th>Usuário</th><th>Data/Hora</th><th>Local</th></tr>
          </thead>
          <tbody>
            ${logins.map(l => {
              const mapUrl = `https://maps.google.com/maps?q=${l.lat},${l.lng}&z=16`;
              return `
                <tr>
                  <td>${l.vendedor || '—'}</td>
                  <td>@${l.username || '—'}</td>
                  <td>${l.data_hora || '—'}</td>
                  <td><a href="${mapUrl}" target="_blank" rel="noopener">🗺 Ver no mapa</a></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table></div>`;
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="icon">❌</div><p>Falha de conexão ao carregar os logins.</p></div>`;
    }
  }

  function exportarExcel(ctx) {
    const lista = ctx === 'todas' ? fichas
      : fichas.filter(f => session.role==='admin' || f.username_vendedor===session.username);
    if (!lista.length) { showToast('⚠️ Nenhuma ficha para exportar','warning'); return; }
    const cols = ['data_cadastro','vendedor','status','criar_hp','nome','cpf','rg','nascimento','mae','celular','sms','email',
      'rua','numero','complemento','bairro','cidade','cep',
      'plano_banda','plano_mesh','plano_controle','plano_pos','portabilidade','plano_tv','plano_fixo',
      'mensalidade','debito','taxa','vencimento','periodo','obs','checkin_url'];
    const headers = ['Data','Vendedor','Status','Criar HP','Nome','CPF','RG','Nascimento','Mãe','WhatsApp','SMS','E-mail',
      'Rua','Número','Complemento','Bairro','Cidade','CEP',
      'Banda Larga','Mesh','Controle','Pós','Portabilidade','TV','Fixo',
      'Valor Total','Val. Promocional','Taxa Inst.','Vencimento','Período','Observações','Localização'];
    const data = [headers, ...lista.map(f => cols.map(c => f[c]||''))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fichas');
    XLSX.writeFile(wb, `carrera_${ctx}_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('📥 Excel baixado!');
  }

  // ══════════════════════════════════════════════════════════════
  // FALTAS / ADIANTAMENTOS
  // ══════════════════════════════════════════════════════════════
  function preencherSelectsVendedor() {
    const users = getAllUsers();
    const opts = users.map(u => `<option value="${u.username}">${u.name}</option>`).join('');
    const selF = document.getElementById('falta-vendedor');
    const selA = document.getElementById('adiant-vendedor');
    if (selF) selF.innerHTML = opts;
    if (selA) selA.innerHTML = opts;
  }
  function getVendedorSelecionado(selectId) {
    const sel = document.getElementById(selectId);
    const username = sel ? sel.value : session.username;
    const users = getAllUsers();
    const user = users.find(u => u.username === username);
    return { username: username || session.username, nome: user ? user.name : session.name };
  }

  function salvarFaltasLocal() { localStorage.setItem('venko_faltas', JSON.stringify(faltas)); }
  function salvarAdiantamentosLocal() { localStorage.setItem('venko_adiantamentos', JSON.stringify(adiantamentos)); }
  function salvarFilaFaltas() { localStorage.setItem('venko_fila_faltas', JSON.stringify(filaFaltas)); }
  function salvarFilaAdiantamentos() { localStorage.setItem('venko_fila_adiantamentos', JSON.stringify(filaAdiantamentos)); }

  // CORREÇÃO: GET (querystring) → POST (body) — mesmo motivo do
  // enviarParaSheets acima (URLs longas podiam falhar em sinal fraco).
  async function enviarRegistroSheets(action, registro) {
    const params = new URLSearchParams();
    params.append('action', action);
    Object.entries(registro).forEach(([k, v]) => params.append(k, v || ''));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeout);
      const dados = await resp.json();
      return !!(dados && dados.status === 'ok');
    } catch (err) {
      clearTimeout(timeout);
      return false;
    }
  }

  function adicionarFalta() {
    if (session.role !== 'admin') { showToast('⚠️ Apenas administradores podem registrar faltas.', 'warning'); return; }
    const data   = vl('falta-data');
    const motivo = up(vl('falta-motivo'));
    if (!data) { showToast('⚠️ Informe a data da falta', 'warning'); return; }
    const alvo = getVendedorSelecionado('falta-vendedor');
    const registro = {
      id: Date.now(),
      data_registro: new Date().toLocaleDateString('pt-BR'),
      username: alvo.username,
      vendedor: up(alvo.nome),
      data, motivo
    };
    faltas.push(registro);
    salvarFaltasLocal();
    document.getElementById('falta-data').value = '';
    document.getElementById('falta-motivo').value = '';
    renderFaltasAdiantamentos();
    renderDashboardFaltasAdiantamentos();
    showToast('✅ Falta registrada!');
    enviarRegistroSheets('addFalta', registro).then(ok => {
      if (!ok && !filaFaltas.find(f => String(f.id) === String(registro.id))) {
        filaFaltas.push(registro); salvarFilaFaltas();
        showToast('⚠️ Falta salva localmente — sem conexão com o Sheets.', 'warning');
      }
    });
  }

  function adicionarAdiantamento() {
    if (session.role !== 'admin') { showToast('⚠️ Apenas administradores podem registrar adiantamentos.', 'warning'); return; }
    const data  = vl('adiant-data');
    const valor = vl('adiant-valor');
    const obs   = up(vl('adiant-obs'));
    if (!data || !valor) { showToast('⚠️ Informe a data e o valor', 'warning'); return; }
    const alvo = getVendedorSelecionado('adiant-vendedor');
    const registro = {
      id: Date.now(),
      data_registro: new Date().toLocaleDateString('pt-BR'),
      username: alvo.username,
      vendedor: up(alvo.nome),
      data, valor, obs
    };
    adiantamentos.push(registro);
    salvarAdiantamentosLocal();
    document.getElementById('adiant-data').value = '';
    document.getElementById('adiant-valor').value = '';
    document.getElementById('adiant-obs').value = '';
    renderFaltasAdiantamentos();
    renderDashboardFaltasAdiantamentos();
    showToast('✅ Adiantamento registrado!');
    enviarRegistroSheets('addAdiantamento', registro).then(ok => {
      if (!ok && !filaAdiantamentos.find(f => String(f.id) === String(registro.id))) {
        filaAdiantamentos.push(registro); salvarFilaAdiantamentos();
        showToast('⚠️ Adiantamento salvo localmente — sem conexão com o Sheets.', 'warning');
      }
    });
  }

  async function reenviarFilaFaltas() {
    if (!filaFaltas.length) return;
    const nova = [];
    for (const r of filaFaltas) { const ok = await enviarRegistroSheets('addFalta', r); if (!ok) nova.push(r); }
    filaFaltas = nova; salvarFilaFaltas();
  }
  async function reenviarFilaAdiantamentos() {
    if (!filaAdiantamentos.length) return;
    const nova = [];
    for (const r of filaAdiantamentos) { const ok = await enviarRegistroSheets('addAdiantamento', r); if (!ok) nova.push(r); }
    filaAdiantamentos = nova; salvarFilaAdiantamentos();
  }

  function mesclarFaltas(remotas) {
    const remotoIds = new Set(remotas.map(f => String(f.id)));
    const pendentesIds = new Set(filaFaltas.map(f => String(f.id)));
    const mapa = new Map();
    faltas.forEach(f => { if (remotoIds.has(String(f.id)) || pendentesIds.has(String(f.id))) mapa.set(String(f.id), f); });
    remotas.forEach(f => mapa.set(String(f.id), { ...mapa.get(String(f.id)), ...f }));
    faltas = Array.from(mapa.values());
    salvarFaltasLocal();
  }
  function mesclarAdiantamentos(remotas) {
    const remotoIds = new Set(remotas.map(f => String(f.id)));
    const pendentesIds = new Set(filaAdiantamentos.map(f => String(f.id)));
    const mapa = new Map();
    adiantamentos.forEach(f => { if (remotoIds.has(String(f.id)) || pendentesIds.has(String(f.id))) mapa.set(String(f.id), f); });
    remotas.forEach(f => mapa.set(String(f.id), { ...mapa.get(String(f.id)), ...f }));
    adiantamentos = Array.from(mapa.values());
    salvarAdiantamentosLocal();
  }

  // (atualizarFaltasAdiantamentosDoSheets removida — faltas e
  // adiantamentos agora chegam junto no bootstrap único)

  async function deletarFalta(id) {
    if (session.role !== 'admin') { showToast('⚠️ Apenas administradores podem excluir.', 'warning'); return; }
    if (!confirm('Excluir este registro de falta?')) return;
    try {
      const resp = await fetch(SHEETS_URL + '?action=deletarFalta&id=' + encodeURIComponent(id), { cache: 'no-store' });
      const dados = await resp.json();
      if (dados.status === 'ok') {
        faltas = faltas.filter(f => String(f.id) !== String(id));
        salvarFaltasLocal(); renderFaltasAdiantamentos(); renderDashboardFaltasAdiantamentos();
        showToast('🗑 Falta excluída!');
      } else { showToast('❌ Não foi possível excluir.', 'error'); }
    } catch (e) { showToast('❌ Falha de conexão ao excluir.', 'error'); }
  }
  async function deletarAdiantamento(id) {
    if (session.role !== 'admin') { showToast('⚠️ Apenas administradores podem excluir.', 'warning'); return; }
    if (!confirm('Excluir este registro de adiantamento?')) return;
    try {
      const resp = await fetch(SHEETS_URL + '?action=deletarAdiantamento&id=' + encodeURIComponent(id), { cache: 'no-store' });
      const dados = await resp.json();
      if (dados.status === 'ok') {
        adiantamentos = adiantamentos.filter(f => String(f.id) !== String(id));
        salvarAdiantamentosLocal(); renderFaltasAdiantamentos(); renderDashboardFaltasAdiantamentos();
        showToast('🗑 Adiantamento excluído!');
      } else { showToast('❌ Não foi possível excluir.', 'error'); }
    } catch (e) { showToast('❌ Falha de conexão ao excluir.', 'error'); }
  }

  function renderFaltasAdiantamentos() {
    document.getElementById('faltas-sub').textContent = session.role === 'admin'
      ? 'Registre e acompanhe faltas e adiantamentos de toda a equipe'
      : `Acompanhe aqui suas faltas e adiantamentos registrados pelo administrador, ${session.name.split(' ')[0]}.`;

    const minhasFaltas = faltas.filter(f => session.role==='admin' || f.username===session.username);
    const meusAdiant    = adiantamentos.filter(f => session.role==='admin' || f.username===session.username);
    const podeExcluir = session.role === 'admin';

    document.getElementById('badge-faltas').textContent = minhasFaltas.length;
    document.getElementById('badge-adiant').textContent = meusAdiant.length;

    const wrapF = document.getElementById('tabela-faltas');
    if (!minhasFaltas.length) {
      wrapF.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>Nenhuma falta registrada.</p></div>`;
    } else {
      const rows = minhasFaltas.slice().reverse().map(f => `<tr>
        <td>${f.data}</td>
        ${session.role==='admin' ? `<td>${f.vendedor}</td>` : ''}
        <td>${f.motivo || '—'}</td>
        <td>${f.data_registro}</td>
        ${podeExcluir ? `<td><button class="btn-del" onclick="deletarFalta(${f.id})" title="Excluir">✕</button></td>` : ''}
      </tr>`).join('');
      wrapF.innerHTML = `<div class="tabela-wrap"><table>
        <thead><tr><th>Data</th>${session.role==='admin'?'<th>Vendedor</th>':''}<th>Motivo</th><th>Registrado em</th>${podeExcluir?'<th></th>':''}</tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }

    const wrapA = document.getElementById('tabela-adiantamentos');
    if (!meusAdiant.length) {
      wrapA.innerHTML = `<div class="empty-state"><div class="icon">💵</div><p>Nenhum adiantamento registrado.</p></div>`;
    } else {
      const rows = meusAdiant.slice().reverse().map(f => `<tr>
        <td>${f.data}</td>
        ${session.role==='admin' ? `<td>${f.vendedor}</td>` : ''}
        <td class="td-valor">${f.valor}</td>
        <td>${f.obs || '—'}</td>
        <td>${f.data_registro}</td>
        ${podeExcluir ? `<td><button class="btn-del" onclick="deletarAdiantamento(${f.id})" title="Excluir">✕</button></td>` : ''}
      </tr>`).join('');
      wrapA.innerHTML = `<div class="tabela-wrap"><table>
        <thead><tr><th>Data</th>${session.role==='admin'?'<th>Vendedor</th>':''}<th>Valor</th><th>Obs.</th><th>Registrado em</th>${podeExcluir?'<th></th>':''}</tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }
  }

  // Segundo dashboard: resumo de faltas/adiantamentos dentro da aba Desempenho
  function renderDashboardFaltasAdiantamentos() {
    const minhasFaltas = faltas.filter(f => session.role==='admin' || f.username===session.username);
    const meusAdiant    = adiantamentos.filter(f => session.role==='admin' || f.username===session.username);
    const totalAdiant = meusAdiant.reduce((sum, f) => {
      const v = parseFloat(String(f.valor||'0').replace(/[^\d.,]/g,'').replace(',','.'));
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
    const formatarMoeda = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1, anoAtual = hoje.getFullYear();
    const faltasMes = minhasFaltas.filter(f => {
      const p = (f.data||'').split('/');
      return p.length === 3 && parseInt(p[1]) === mesAtual && parseInt(p[2]) === anoAtual;
    }).length;

    const existing = document.getElementById('kpis-faltas-resumo');
    const section = existing || document.createElement('div');
    section.id = 'kpis-faltas-resumo';
    section.className = 'dash-section';
    section.innerHTML = `
      <h3>📆 Faltas &amp; Adiantamentos</h3>
      <div class="dash-grid">
        <div class="kpi-card laranja">
          <div class="kpi-label">Faltas este mês</div>
          <div class="kpi-value">${faltasMes}</div>
          <div class="kpi-sub">${minhasFaltas.length} no total</div>
        </div>
        <div class="kpi-card vermelho">
          <div class="kpi-label">💵 Adiantamentos</div>
          <div class="kpi-value" style="font-size:1.3rem;">${formatarMoeda(totalAdiant)}</div>
          <div class="kpi-sub">${meusAdiant.length} registro(s)</div>
        </div>
      </div>`;
    if (!existing) document.getElementById('page-dashboard').insertBefore(section, document.querySelector('#page-dashboard .dash-divider'));
  }

  // ══════════════════════════════════════════════════════════════
  // METAS
  // ══════════════════════════════════════════════════════════════
  function normalizarMoedaNum(v) {
    const n = parseFloat(String(v || '0').replace(/[^\d.,\-]/g,'').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  function formatarMoedaMetas(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  }

  // (carregarMetas removida — metas agora chegam junto no bootstrap único)

  function getMinhaMeta() {
    // tenta casar pelo nome de exibição (como está na planilha META),
    // com fallback pro username, caso a coluna VENDEDOR use o login.
    return metas.find(m => {
      const v = m.vendedor || m.VENDEDOR || '';
      return normalizar(v) === normalizar(session.name) || normalizar(v) === normalizar(session.username);
    });
  }

  function renderMetas() {
    document.getElementById('metas-sub').textContent = session.role === 'admin'
      ? 'Acompanhamento de metas de toda a equipe'
      : `Acompanhe sua meta de receita, ${session.name.split(' ')[0]}.`;

    const minha = getMinhaMeta();
    const kpisWrap = document.getElementById('kpis-metas');

    if (!minha) {
      kpisWrap.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">🎯</div><p>Nenhuma meta cadastrada ainda${session.role==='admin' ? '' : ' pro seu usuário'}.</p></div>`;
    } else {
      const meta        = normalizarMoedaNum(minha.meta_receita ?? minha['META RECEITA'] ?? minha.META_RECEITA);
      const atingimento = normalizarMoedaNum(minha.atingimento ?? minha.ATINGIMENTO);
      const diasTrab    = parseInt(minha.dias_trabalhados ?? minha['DIAS TRABALHADOS'] ?? minha.DIAS_TRABALHADOS ?? 0, 10) || 0;
      const diasUteis   = parseInt(minha.dias_uteis ?? minha['DIAS UTEIS'] ?? minha.DIAS_UTEIS ?? 0, 10) || 0;
      const projecao    = normalizarMoedaNum(minha.projecao ?? minha.PROJECAO);
      const pct         = meta > 0 ? Math.round((atingimento / meta) * 100) : 0;
      const pctProj     = meta > 0 ? Math.round((projecao / meta) * 100) : 0;

      // ── RITMO DA META: quanto falta vender por dia útil restante ──
      const diasRestantes = diasUteis - diasTrab;
      const faltaVender = meta - atingimento;
      let ritmoHtml;
      if (faltaVender <= 0) {
        ritmoHtml = `
          <div class="kpi-card verde">
            <div class="kpi-label">🚀 Ritmo da Meta</div>
            <div class="kpi-value" style="font-size:1.3rem;">Meta batida! 🎉</div>
            <div class="kpi-sub">você já atingiu ou superou a meta</div>
          </div>`;
      } else if (diasRestantes <= 0) {
        ritmoHtml = `
          <div class="kpi-card vermelho">
            <div class="kpi-label">🚀 Ritmo da Meta</div>
            <div class="kpi-value" style="font-size:1.3rem;">${formatarMoedaMetas(faltaVender)}</div>
            <div class="kpi-sub">sem dias úteis restantes no período — falta bater</div>
          </div>`;
      } else {
        const necessarioPorDia = faltaVender / diasRestantes;
        ritmoHtml = `
          <div class="kpi-card roxo">
            <div class="kpi-label">🚀 Ritmo da Meta</div>
            <div class="kpi-value" style="font-size:1.3rem;">${formatarMoedaMetas(necessarioPorDia)}</div>
            <div class="kpi-sub">por dia útil, nos ${diasRestantes} dia(s) restante(s)</div>
          </div>`;
      }

      kpisWrap.innerHTML = `
        <div class="kpi-card roxo">
          <div class="kpi-label">🎯 Meta de Receita</div>
          <div class="kpi-value" style="font-size:1.3rem;">${formatarMoedaMetas(meta)}</div>
          <div class="kpi-sub">meta do período</div>
        </div>
        <div class="kpi-card verde">
          <div class="kpi-label">✅ Atingimento</div>
          <div class="kpi-value" style="font-size:1.3rem;">${formatarMoedaMetas(atingimento)}</div>
          <div class="kpi-sub">${pct}% da meta</div>
        </div>
        <div class="kpi-card azul">
          <div class="kpi-label">📈 Projeção</div>
          <div class="kpi-value" style="font-size:1.3rem;">${formatarMoedaMetas(projecao)}</div>
          <div class="kpi-sub">${pctProj}% da meta projetado</div>
        </div>
        <div class="kpi-card laranja">
          <div class="kpi-label">📅 Dias Trabalhados</div>
          <div class="kpi-value">${diasTrab}/${diasUteis}</div>
          <div class="kpi-sub">dias úteis no período</div>
        </div>
        ${ritmoHtml}
        <div style="grid-column:1/-1;background:var(--white);padding:18px 20px;border-radius:var(--radius);box-shadow:var(--shadow);">
          <div class="bar-wrap" style="margin-bottom:0;">
            <div class="bar-label">Meta</div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.min(pct,100)}%;background:${pct>=100?'#16a34a':'var(--grad)'}"></div></div>
            <div class="bar-val">${pct}%</div>
          </div>
        </div>
      `;
    }

    if (session.role === 'admin') {
      document.getElementById('badge-metas').textContent = metas.length;
      const wrap = document.getElementById('tabela-metas');
      if (!metas.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="icon">🎯</div><p>Nenhuma meta cadastrada na planilha.</p></div>`;
        return;
      }
      const rows = metas.map(m => {
        const nome        = m.vendedor || m.VENDEDOR || '—';
        const meta        = normalizarMoedaNum(m.meta_receita ?? m['META RECEITA'] ?? m.META_RECEITA);
        const atingimento = normalizarMoedaNum(m.atingimento ?? m.ATINGIMENTO);
        const diasTrab    = parseInt(m.dias_trabalhados ?? m['DIAS TRABALHADOS'] ?? m.DIAS_TRABALHADOS ?? 0, 10) || 0;
        const diasUteis   = parseInt(m.dias_uteis ?? m['DIAS UTEIS'] ?? m.DIAS_UTEIS ?? 0, 10) || 0;
        const projecao    = normalizarMoedaNum(m.projecao ?? m.PROJECAO);
        const pct         = meta > 0 ? Math.round((atingimento / meta) * 100) : 0;
        const diasRestantes = diasUteis - diasTrab;
        const faltaVender = meta - atingimento;
        const ritmo = faltaVender <= 0 ? '✅ Batida'
          : diasRestantes <= 0 ? '⚠️ Sem dias'
          : formatarMoedaMetas(faltaVender / diasRestantes) + '/dia';
        return `<tr>
          <td class="td-nome">${nome}</td>
          <td class="td-valor">${formatarMoedaMetas(meta)}</td>
          <td class="td-valor">${formatarMoedaMetas(atingimento)}</td>
          <td>${pct}%</td>
          <td>${diasTrab}/${diasUteis}</td>
          <td class="td-valor">${formatarMoedaMetas(projecao)}</td>
          <td class="td-valor">${ritmo}</td>
        </tr>`;
      }).join('');
      wrap.innerHTML = `<div class="tabela-wrap"><table>
        <thead><tr><th>Vendedor</th><th>Meta</th><th>Atingimento</th><th>%</th><th>Dias</th><th>Projeção</th><th>Ritmo/dia</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    }

    atualizarMiniResumo();
  }

  // ══════════════════════════════════════════════════════════════
  // MINI-RESUMO — cards clicáveis no topo da Nova Ficha, dão uma
  // prévia do Desempenho/Metas sem precisar trocar de aba.
  // ══════════════════════════════════════════════════════════════
  function atualizarMiniResumo() {
    if (!session) return;
    const minha = getMinhaMeta();
    const elMeta = document.getElementById('mini-meta-pct');
    if (elMeta) {
      if (minha) {
        const meta = normalizarMoedaNum(minha.meta_receita ?? minha['META RECEITA'] ?? minha.META_RECEITA);
        const atingimento = normalizarMoedaNum(minha.atingimento ?? minha.ATINGIMENTO);
        const pct = meta > 0 ? Math.round((atingimento / meta) * 100) : 0;
        elMeta.textContent = pct + '%';
      } else {
        elMeta.textContent = '—';
      }
    }

    const minhas = fichas.filter(f => session.role==='admin' || f.username_vendedor===session.username);
    const elConcluidas = document.getElementById('mini-concluidas');
    if (elConcluidas) elConcluidas.textContent = minhas.filter(f => f.status==='Concluída').length;

    const elSemana = document.getElementById('mini-fichas-semana');
    if (elSemana) {
      const seteDiasAtras = Date.now() - 7*24*60*60*1000;
      const naSemana = minhas.filter(f => (Number(f.id)||0) >= seteDiasAtras).length;
      elSemana.textContent = naSemana;
    }
  }

  init();
