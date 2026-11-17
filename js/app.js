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
      const dados = await apiPost('usuarios');
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
    // Invalida o token no servidor (sem esperar a resposta).
    try {
      const p = new URLSearchParams({ action: 'logout', token: session?.token || '' });
      fetch(SHEETS_URL, { method: 'POST', body: p, keepalive: true, cache: 'no-store' }).catch(() => {});
    } catch (e) {}
    sessionStorage.removeItem('venko_session');
    window.location.href = 'login.html';
  }

  // Token expirou (6h parado) ou foi invalidado: volta para o login.
  // Fichas pendentes de envio continuam guardadas no aparelho e são
  // reenviadas depois do novo login.
  let sessaoExpiradaAvisada = false;
  function tratarSessaoExpirada() {
    if (sessaoExpiradaAvisada) return;
    sessaoExpiradaAvisada = true;
    sessionStorage.removeItem('venko_session');
    alert('Sua sessão expirou. Faça login novamente. (Fichas ainda não enviadas continuam salvas neste aparelho.)');
    window.location.href = 'login.html';
  }

  // Chamada ao Apps Script por POST, já com o token da sessão.
  // (Antes várias ações iam por GET, com dados e senhas na URL.)
  async function apiPost(acao, dados = {}, timeoutMs = 15000) {
    const params = new URLSearchParams();
    params.append('action', acao);
    params.append('token', session?.token || '');
    params.append('username', session?.username || '');
    params.append('editor_username', session?.username || '');
    Object.entries(dados).forEach(([k, v]) => params.append(k, v ?? ''));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
        cache: 'no-store'
      });
      const resposta = await resp.json();
      if (resposta && resposta.erro === 'AUTH') tratarSessaoExpirada();
      return resposta;
    } finally {
      clearTimeout(timeout);
    }
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
  //
  // CORREÇÃO (fila): 2 tentativas na hora e timeout de 25s (Apps Script
  // com cold start passava de 15s e a ficha era dada como falha mesmo
  // chegando na planilha). Reenvio é seguro: o Code.gs trata ficha
  // repetida como "success". A mensagem de erro do servidor fica em
  // ultimoErroEnvio para aparecer na tela.
  let ultimoErroEnvio = '';

  async function enviarParaSheets(ficha) {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const params = new URLSearchParams();
      Object.entries(ficha).forEach(([k, v]) => params.append(k, v || ''));
      params.append('token', session?.token || '');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
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
        if (dados && dados.erro === 'AUTH') { tratarSessaoExpirada(); return false; }
        // success:true cobre inserção nova E reenvio de duplicata (já estava salva) —
        // ambos os casos significam "está garantido na planilha".
        if (dados && dados.success) { ultimoErroEnvio = ''; return true; }
        // O servidor respondeu mas recusou: tentar de novo agora não resolve.
        ultimoErroEnvio = (dados && (dados.msg || dados.erro)) || 'Resposta inesperada do servidor.';
        return false;
      } catch (err) {
        clearTimeout(timeout);
        // Rede falhou (timeout, sem sinal, CORS bloqueado etc.): tenta mais
        // uma vez; se falhar de novo a ficha fica na fila de reenvio
        // automático (já salva localmente em enviarFicha).
        ultimoErroEnvio = 'Falha de conexão.';
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // Reenviar todas as fichas da fila.
  // CORREÇÃO: antes terminava com "filaReenvio = novaFila". Se uma ficha
  // nova entrasse na fila DURANTE o loop (ou duas execuções rodassem
  // juntas: init + Atualizar + botão), ela era apagada da fila — e como
  // mesclarFichas descarta fichas locais que não estão na planilha nem
  // na fila, ela sumia do aparelho. Agora: só uma execução por vez
  // (trava) e, no fim, saem da fila APENAS os ids realmente enviados.
  // ─────────────────────────────────────────────────────────────
  let reenviandoFila = false;

  async function reenviarFila(manual) {
    if (reenviandoFila) return;
    if (!filaReenvio.length) { if (manual === true) showToast('Nenhuma ficha pendente.', 'info'); return; }
    if (!session?.token) return;

    reenviandoFila = true;
    const enviados = new Set();
    const mostrar = (manual === true);
    if (mostrar) setSyncStatus('loading', `⏳ Reenviando ${filaReenvio.length} ficha(s) pendente(s)...`);

    try {
      for (const ficha of filaReenvio.slice()) {
        // O servidor grava a ficha em nome de QUEM ESTÁ LOGADO (pelo token).
        // Se a fila tiver ficha de outro vendedor (mesmo aparelho, outro
        // login), enviar agora a registraria no nome errado — então ela
        // espera o dono entrar neste aparelho.
        if (ficha.username_vendedor && session.username &&
            String(ficha.username_vendedor).toLowerCase() !== String(session.username).toLowerCase()) continue;

        const ok = await enviarParaSheets(ficha);
        if (ok) enviados.add(String(ficha.id));
        else if (sessaoExpiradaAvisada) break;   // sessão caiu: para e deixa o login refazer
      }
    } finally {
      filaReenvio = filaReenvio.filter(f => !enviados.has(String(f.id)));
      salvarFila();
      reenviandoFila = false;
    }

    if (enviados.size) showToast(`✅ ${enviados.size} ficha(s) enviada(s)!`);
    if (mostrar || enviados.size) {
      if (!filaReenvio.length) {
        setSyncStatus('ok', `✅ ${enviados.size} ficha(s) reenviada(s) com sucesso!`);
      } else {
        const motivo = ultimoErroEnvio ? ` (${ultimoErroEnvio})` : '';
        setSyncStatus('erro', `⚠️ ${enviados.size} enviada(s). ${filaReenvio.length} ainda com falha${motivo}. Nova tentativa automática em instantes.`);
      }
      setTimeout(() => hideSyncStatus(), 8000);
    }
  }

  // Alias para compatibilidade
  async function reenviarPendentes() { return reenviarFila(true); }

  // ══════════════════════════════════════════════════════════════
  // SISTEMA DE PREÇOS AUTOMÁTICO (NOVA LÓGICA — por serviço)
  // ══════════════════════════════════════════════════════════════
  // Preços e cidades ficam guardados no aparelho (localStorage) para o app
  // calcular Receita / Valor do Plano mesmo sem internet. São atualizados a
  // cada bootstrap bem-sucedido.
  function lerCacheLocal_(chave) {
    try { const v = JSON.parse(localStorage.getItem(chave) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function salvarCacheLocal_(chave, lista) {
    try { localStorage.setItem(chave, JSON.stringify(lista)); } catch (e) { /* sem espaço: segue sem cache */ }
  }
  let tabelaPrecos  = lerCacheLocal_('venko_precos_cache');
  let tabelaCidades = lerCacheLocal_('venko_cidades_cache');
  let camposAutoPreenchidos = new Set();
  // Detalhamento do último cálculo de preço: [rótulo, valor, soValorDoPlano?]
  // Alimenta a tela de Revisão (mostra de onde vem cada valor).
  let detalhePreco = [];

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
      const params = new URLSearchParams({ action: 'bootstrap', token: session.token || '', username: session.username });
      const resp = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeout);
      const dados = await resp.json();
      if (dados && dados.erro === 'AUTH') { tratarSessaoExpirada(); return false; }
      if (dados.status !== 'ok') return false;

      if (Array.isArray(dados.fichas))        mesclarFichas(dados.fichas);
      if (Array.isArray(dados.precos) && dados.precos.length) {
        tabelaPrecos = dados.precos;
        salvarCacheLocal_('venko_precos_cache', tabelaPrecos);
      }
      if (Array.isArray(dados.cidades) && dados.cidades.length) {
        tabelaCidades = dados.cidades;
        salvarCacheLocal_('venko_cidades_cache', tabelaCidades);
      }
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

  // Desconto promocional de 6 meses (R$) de um serviço, lido da coluna
  // "DESCONTO 6 MESES" da aba Precos. O app.js recebe o cabeçalho em
  // maiúsculas; procuramos a coluna pelo prefixo "DESCONTO" para aguentar
  // pequenas mudanças no nome. Vazio/0/sem coluna = sem desconto (0).
  function getDescontoServico(tipo, opcao, grupo) {
    const row = tabelaPrecos.find(r =>
      normalizar(r.TIPO)  === tipo &&
      normalizar(r.OPCAO) === normalizar(opcao) &&
      (normalizar(r.GRUPO) === grupo || normalizar(r.GRUPO) === 'TODOS')
    );
    if (!row) return 0;
    const chave = Object.keys(row).find(k => normalizar(k).startsWith('DESCONTO'));
    if (!chave) return 0;
    const n = normalizarValor(row[chave]);
    return n && n > 0 ? n : 0;
  }

  // ══════════════════════════════════════════════════════════════
  // PROMOÇÃO BLACK FRIDAY 1 — combo de preço fechado.
  // Vale só para cidades cujo GRUPO (aba CIDADES) esteja em `grupos`.
  // Banda 600MB + Pós 60GB = R$ 99,90 (entra na Receita e no Valor do Plano).
  // ══════════════════════════════════════════════════════════════
  const PROMO_BF1 = { id: 'BF1', nome: 'BLACK FRIDAY 1', grupos: ['MD', 'MD2'], banda: '600MB', pos: '60GB', valor: 99.90 };

  // Mostra/esconde o botão conforme o grupo da cidade e desliga a promoção
  // se ela deixou de valer. Retorna true quando a promoção está ativa.
  function sincronizarPromoBF1(grupo, banda, pos) {
    const input = document.getElementById('plano_promo');
    const row   = document.getElementById('row-bf1');
    const btn   = document.getElementById('btn-bf1');
    const disponivel = !!grupo && PROMO_BF1.grupos.includes(grupo);
    if (row) row.style.display = disponivel ? '' : 'none';
    let ativa = !!input && input.value === PROMO_BF1.id;
    if (ativa && !(disponivel && banda === normalizar(PROMO_BF1.banda) && pos === normalizar(PROMO_BF1.pos))) {
      input.value = '';
      ativa = false;
    }
    if (btn) btn.classList.toggle('ativo', ativa);
    return ativa;
  }

  function selecionarPromoBF1() {
    const input = document.getElementById('plano_promo');
    const ativando = input.value !== PROMO_BF1.id;
    const marcar = (pillsId, valor) => {
      document.getElementById(pillsId).querySelectorAll('.pill-btn').forEach(b => {
        b.classList.toggle('ativo', !!valor && b.textContent.replace(/\s/g, '') === valor);
      });
    };
    document.getElementById('plano_controle').value = '';
    marcar('pills-controle', '');
    if (ativando) {
      document.getElementById('plano_banda').value = PROMO_BF1.banda;
      document.getElementById('plano_pos').value   = PROMO_BF1.pos;
      input.value = PROMO_BF1.id;
      marcar('pills-banda', PROMO_BF1.banda);
      marcar('pills-pos',   PROMO_BF1.pos);
    } else {
      document.getElementById('plano_banda').value = '';
      document.getElementById('plano_pos').value   = '';
      input.value = '';
      marcar('pills-banda', '');
      marcar('pills-pos',   '');
    }
    camposAutoPreenchidos.delete('mensalidade_manual');
    camposAutoPreenchidos.delete('debito_manual');
    camposAutoPreenchidos.delete('valor_promocional_manual');
    atualizarProgresso();
    buscarPreco();
  }

  // ══════════════════════════════════════════════════════════════
  // CÁLCULO DE PREÇOS:
  //   • Receita (campo "mensalidade") = Banda Larga + Controle + Pós
  //                                      + Dep. Pago + TV + Fixo
  //   • Valor do Plano (campo "debito") = Receita + Mesh + Ponto Adicional
  //   • Dep. Pago soma R$ 55,00 por unidade à Receita (e, por
  //     consequência, também ao Valor do Plano).
  //   • Ponto Adicional (dentro de TV) soma R$ 69,90 por unidade
  //     SÓ ao Valor do Plano — igual ao Mesh, não entra na Receita.
  //   • Dep. Grátis é só um campo de quantidade — não entra em nenhum
  //     cálculo de valor.
  //   • Valor Promocional (campo "valor_promocional") = Valor do Plano
  //     − soma dos "DESCONTO 6 MESES" das linhas escolhidas na tabela.
  //     Só aparece se houver desconto; não entra em Receita nem em
  //     Valor do Plano e continua só no texto copiado / Revisão.
  //   • Receita, Valor do Plano e Valor 6 Meses são SOMENTE LEITURA
  //     no formulário: só a tabela de preços preenche esses campos.
  // ══════════════════════════════════════════════════════════════
  function buscarPreco() {
    const cidade   = normalizar(document.getElementById('cidade').value);
    const banda    = normalizar(document.getElementById('plano_banda').value);
    const controle = normalizar(document.getElementById('plano_controle').value);
    const pos      = normalizar(document.getElementById('plano_pos').value);
    const tv       = normalizar(document.getElementById('plano_tv').value);
    const fixo     = normalizar(document.getElementById('plano_fixo').value);
    const meshQtd  = parseInt(document.getElementById('plano_mesh').value) || 0;
    const meshValor = meshQtd * 15;
    const depPagoQtd = parseInt(document.getElementById('dep_pago').value) || 0;
    const depPagoValor = depPagoQtd * 55;
    const pontoAdicionalQtd = parseInt(document.getElementById('ponto_adicional').value) || 0;
    const pontoAdicionalValor = pontoAdicionalQtd * 69.90;

    const statusEl = document.getElementById('preco-status');

    // Promoção BLACK FRIDAY 1: mostra/esconde o botão e confere se ainda vale.
    const bf1 = sincronizarPromoBF1(getGrupoCidade(cidade), banda, pos);

    const temProduto = banda || controle || pos || tv || fixo;
    if (!temProduto || !cidade) {
      statusEl.className = 'preco-status';
      limparAutoPreenchimento();
      return;
    }

    const grupo = getGrupoCidade(cidade);
    if (!grupo) {
      statusEl.className = 'preco-status show pendente';
      statusEl.innerHTML = `⚠️ Cidade "<strong>${cidade}</strong>" não encontrada na tabela — valores não calculados. Confira a cidade.`;
      limparAutoPreenchimento();
      return;
    }

    const temMovel = !!(controle || pos);   // Controle OU Pós contratado
    const temBanda = !!banda;
    const temTv    = !!tv;

    // totalPlano = tudo que compõe a Receita (sem Mesh).
    let totalPlano = 0, algumEncontrado = false, algumFaltando = false;

    // Guarda cada parcela para mostrar o detalhamento na Revisão.
    detalhePreco = [];
    let descontoTotal = 0;
    const descontar = (tipo, opcao) => { descontoTotal += getDescontoServico(tipo, opcao, grupo); };
    const somar = (rotulo, v) => {
      if (v !== null) { totalPlano += v; algumEncontrado = true; detalhePreco.push([rotulo, v]); }
      else algumFaltando = true;
    };

    // ── PROMO BLACK FRIDAY 1 ── substitui o preço de Banda 600MB + Pós 60GB.
    if (bf1) somar('BLACK FRIDAY 1 (Banda 600MB + Pós 60GB)', PROMO_BF1.valor);

    // ── BANDA LARGA ──
    // TV sozinho não desconta a banda; só desconta se tiver Controle/Pós junto.
    if (temBanda && !bf1) {
      const coluna = (temMovel && temTv) ? 'VALOR_COM_MOVEL_E_TV'
                   : temMovel             ? 'VALOR_COM_MOVEL'
                   :                        'VALOR_SOZINHO';
      const v = getPrecoServico('BANDA_LARGA', banda, grupo, coluna);
      somar('Banda Larga ' + banda, v);
      descontar('BANDA_LARGA', banda);
    }

    // ── CONTROLE / PÓS ── (preço fixo, não varia por combinação)
    if (controle) {
      const v = getPrecoServico('CONTROLE', controle, grupo, 'VALOR_SOZINHO');
      somar('Controle ' + controle, v);
      descontar('CONTROLE', controle);
    }
    if (pos && !bf1) {
      const v = getPrecoServico('POS', pos, grupo, 'VALOR_SOZINHO');
      somar('Pós ' + pos, v);
      descontar('POS', pos);
    }

    // ── TV ──
    // Desconta se tiver Banda OU Controle/Pós; desconta mais se tiver os dois.
    if (temTv) {
      const coluna = (temBanda && temMovel) ? 'VALOR_COM_MOVEL_E_TV'
                   : (temBanda || temMovel) ? 'VALOR_COM_MOVEL'
                   :                          'VALOR_SOZINHO';
      const v = getPrecoServico('TV', tv, grupo, coluna);
      somar('TV ' + tv, v);
      descontar('TV', tv);
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
      somar('Fixo ' + fixo, v);
      descontar('FIXO', fixo);
    }

    // ── DEP. PAGO ── (serviço adicional, preço fixo de R$55,00 por unidade,
    // entra na Receita — diferente do Mesh, que só entra no Valor do Plano)
    if (depPagoQtd > 0) {
      totalPlano += depPagoValor;
      algumEncontrado = true;
      detalhePreco.push(['Dep. Pago ' + depPagoQtd + 'x', depPagoValor]);
    }

    if (!algumEncontrado) {
      statusEl.className = 'preco-status show pendente';
      statusEl.innerHTML = `⚠️ Nenhum preço encontrado para o grupo <strong>${grupo}</strong> — valores não calculados.`;
      limparAutoPreenchimento();
      return;
    }

    // ── MESH + PONTO ADICIONAL ── (ambos entram só no Valor do Plano,
    // que é Receita + Mesh + Ponto Adicional. A Receita em si
    // (Banda + Controle + Pós + Dep. Pago + TV + Fixo) NÃO leva nenhum dos dois.
    const totalValorPlano = totalPlano + meshValor + pontoAdicionalValor;
    if (meshQtd > 0)           detalhePreco.push(['Mesh ' + meshQtd + 'x', meshValor, true]);
    if (pontoAdicionalQtd > 0) detalhePreco.push(['Ponto adicional ' + pontoAdicionalQtd + 'x', pontoAdicionalValor, true]);

    if (!camposAutoPreenchidos.has('mensalidade_manual')) {
      document.getElementById('mensalidade').value = formatarValor(totalPlano);
      document.getElementById('mensalidade').classList.add('auto-preenchido');
      camposAutoPreenchidos.add('mensalidade');
    }

    if (!camposAutoPreenchidos.has('debito_manual')) {
      document.getElementById('debito').value = formatarValor(totalValorPlano);
      document.getElementById('debito').classList.add('auto-preenchido');
      camposAutoPreenchidos.add('debito');
    }

    // ── VALOR PROMOCIONAL (6 meses) ── Valor do Plano − descontos da tabela.
    const campoPromo = document.getElementById('valor_promocional');
    if (!camposAutoPreenchidos.has('valor_promocional_manual')) {
      if (descontoTotal > 0 || bf1) {
        const baseEditada = normalizarValor(document.getElementById('debito').value);
        const base = baseEditada !== null ? baseEditada : totalValorPlano;
        campoPromo.value = formatarValor(Math.max(0, base - descontoTotal));
        campoPromo.classList.add('auto-preenchido');
        camposAutoPreenchidos.add('valor_promocional');
      } else {
        limparPromoAuto();
      }
    }
    // Diagnóstico: se a tabela carregada no app não tem a coluna de desconto
    // (ex.: dados antigos em memória), avisa em vez de falhar em silêncio.
    const temColunaDesconto = tabelaPrecos.some(r => Object.keys(r).some(k => normalizar(k).startsWith('DESCONTO')));
    const descTexto = descontoTotal > 0
      ? ` Desconto de 6 meses: R$ ${descontoTotal.toFixed(2).replace('.', ',')}.`
      : (!temColunaDesconto ? ' ⚠️ A tabela carregada não tem a coluna "DESCONTO 6 MESES" — toque em 🔄 Atualizar.' : '');

    const meshTexto = meshQtd > 0 ? ` + Mesh ${meshQtd}x (R$ ${meshValor.toFixed(2).replace('.', ',')})` : '';
    const depTexto  = depPagoQtd > 0 ? ` + Dep. Pago ${depPagoQtd}x (R$ ${depPagoValor.toFixed(2).replace('.', ',')})` : '';
    const pontoTexto = pontoAdicionalQtd > 0 ? ` + Ponto Adicional ${pontoAdicionalQtd}x (R$ ${pontoAdicionalValor.toFixed(2).replace('.', ',')})` : '';
    statusEl.className = algumFaltando ? 'preco-status show pendente' : 'preco-status show ok';
    statusEl.innerHTML = algumFaltando
      ? `⚠️ Preço calculado parcialmente (grupo <strong>${grupo}</strong>)${depTexto}${meshTexto}${pontoTexto} — algum serviço não encontrado na tabela.${descTexto}`
      : `✅ Preço calculado automaticamente — grupo <strong>${grupo}</strong>${depTexto}${meshTexto}${pontoTexto}.${descTexto}`;

    atualizarProgresso();
  }

  // Receita, Valor do Plano e Valor 6 Meses não são mais editáveis:
  // quando não há cálculo possível, os campos são sempre esvaziados.
  function limparPromoAuto() {
    const el = document.getElementById('valor_promocional');
    el.value = '';
    el.classList.remove('auto-preenchido');
    camposAutoPreenchidos.delete('valor_promocional');
  }

  function limparAutoPreenchimento() {
    detalhePreco = [];
    limparPromoAuto();
    ['mensalidade', 'debito'].forEach(id => {
      const el = document.getElementById(id);
      el.value = '';
      el.classList.remove('auto-preenchido');
      camposAutoPreenchidos.delete(id);
    });
  }

  function marcarManual(campo) {
    document.getElementById(campo).classList.remove('auto-preenchido');
    camposAutoPreenchidos.add(campo + '_manual');
    camposAutoPreenchidos.delete(campo);
  }

  // Chamada pelo oninput de Dep. Pago e de Ponto Adicional (TV). Editar
  // a quantidade deve voltar a permitir o auto-preenchimento de Valor
  // do Plano / Receita (mesmo comportamento que trocar uma pill de
  // plano já dispara).
  function onDepChange() {
    camposAutoPreenchidos.delete('mensalidade_manual');
    camposAutoPreenchidos.delete('debito_manual');
    camposAutoPreenchidos.delete('valor_promocional_manual');
    atualizarProgresso();
    buscarPreco();
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
    camposAutoPreenchidos.delete('debito_manual');
    camposAutoPreenchidos.delete('valor_promocional_manual');
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
    camposAutoPreenchidos.delete('valor_promocional_manual');
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

    // Data de Instalação: só administradores editam (vendedor apenas visualiza).
    const dataInstEl = document.getElementById('data_instalacao');
    if (dataInstEl && session.role !== 'admin') {
      dataInstEl.disabled = true;
      dataInstEl.placeholder = 'Definida pelo admin';
      dataInstEl.title = 'Apenas administradores podem definir a data de instalação.';
    }

    atualizarProgresso();
    atualizarBadgeFila();
    irParaEtapa(1);

    // Some com o destaque vermelho (campo-invalido) assim que o
    // vendedor começa a corrigir o campo, sem esperar avançar de etapa.
    document.getElementById('page-formulario')?.addEventListener('input', (e) => {
      if (e.target && e.target.classList) e.target.classList.remove('campo-invalido');
    });

    document.getElementById('cpf').addEventListener('input', function() {
      let v = this.value.replace(/\D/g,'').slice(0,11);
      v = v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
      this.value = v;
      avisarCPFDuplicado();
    });
    // Máscara do CNPJ — mesmo padrão do CPF acima (00.000.000/0000-00).
    document.getElementById('cnpj').addEventListener('input', function() {
      let v = this.value.replace(/\D/g,'').slice(0,14);
      v = v.replace(/^(\d{2})(\d)/,'$1.$2')
           .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
           .replace(/\.(\d{3})(\d)/,'.$1/$2')
           .replace(/(\d{4})(\d)/,'$1-$2');
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
      // AVISO: se o servidor não respondeu, a lista mostrada vem do
      // aparelho e pode estar desatualizada — antes isso era silencioso.
      if (!ok) showToast('Não foi possível carregar os dados do servidor — a lista pode estar desatualizada.', 'warning', 6000);
      renderTabelaMinhas();
      renderTabelaTodas();
      renderDashboard();
      renderMetas();
      renderFaltasAdiantamentos();
      atualizarMiniResumo();
      if (session.role === 'admin') preencherSelectsVendedor();
      if (document.getElementById('page-usuarios')?.classList.contains('active')) renderUsuarios();
    });

    // (O reenvio automático das filas agora é feito por
    // tentarReenvioAutomatico(), definida no fim do arquivo — roda ao
    // abrir, a cada 30s, ao voltar a internet e ao reabrir o app.)
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
    if (aba === 'agenda')     renderAgenda();
    if (aba === 'painel')     renderPainel();

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
    avisarCPFDuplicado(); // mantém o aviso de CPF repetido em dia (some ao limpar/trocar ficha)
    // A barra de % antiga foi substituída pelo indicador de etapas do
    // wizard — os elementos abaixo podem não existir mais no HTML.
    // Mantido com checagem defensiva caso voltem a existir no futuro.
    const total = CAMPOS_PROG.length;
    const preenchidos = CAMPOS_PROG.filter(id => document.getElementById(id)?.value.trim()).length;
    const pct = Math.round((preenchidos / total) * 100);
    const fill  = document.getElementById('progress-fill');
    const label = document.getElementById('pct-label');
    if (fill)  fill.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
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
    // 'Instalada', classes de cor, filtros, dashboard etc.) —
    // maiusculá-los quebraria essas comparações.
    // ─────────────────────────────────────────────────────────
    // Em modo de edição (admin corrigindo uma ficha existente), o id,
    // a data de cadastro original e o vendedor "dono" da venda (para
    // efeito de "Minhas Vendas") são preservados — só o CONTEÚDO muda.
    // data_edicao/editado_por registram quem editou e quando (colunas
    // novas no fim da aba Fichas — ver Code.gs).
    fichaAtual = {
      id: modoEdicao ? idEmEdicao : Date.now(),
      data_cadastro: modoEdicao ? (fichaEditOriginal?.data_cadastro || new Date().toLocaleDateString('pt-BR')) : new Date().toLocaleDateString('pt-BR'),
      username_vendedor: modoEdicao ? (fichaEditOriginal?.username_vendedor || session.username) : session.username,
      vendedor: up(vl('vendedor')), status: statusFicha,
      criar_hp: document.getElementById('criar_hp')?.value || '',
      data_instalacao: vl('data_instalacao'),
      nome: up(vl('nome')), cpf: vl('cpf'), cnpj: vl('cnpj'),
      nascimento: fmtData(nascStr), mae: up(vl('mae')),
      celular: vl('celular'), sms: vl('sms'), email: up(vl('email')),
      rua: up(vl('rua')), numero: up(vl('numero')), complemento: up(vl('complemento')),
      bairro: up(vl('bairro')), cidade: up(vl('cidade')), cep: vl('cep'),
      plano_banda: vl('plano_banda'), plano_mesh: vl('plano_mesh'), plano_controle: vl('plano_controle'),
      plano_pos: vl('plano_pos'), dep_gratis: vl('dep_gratis'), dep_pago: vl('dep_pago'),
      portabilidade: up(vl('portabilidade')),
      plano_movel: up(movelTexto), plano_tv: vl('plano_tv'), ponto_adicional: vl('ponto_adicional'), plano_fixo: vl('plano_fixo'),
      mensalidade: vl('mensalidade'), debito: vl('debito'),
      data_edicao: modoEdicao ? (new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})) : (fichaEditOriginal?.data_edicao || ''),
      editado_por: modoEdicao ? up(session.name) : (fichaEditOriginal?.editado_por || ''),
      periodo: up(vl('periodo')), obs: up(vl('obs')),
      checkin_lat: checkinCoords?.lat || '',
      checkin_lng: checkinCoords?.lng || '',
      checkin_url: checkinCoords ? `https://www.google.com/maps?q=${checkinCoords.lat},${checkinCoords.lng}` : ''
    };

    // Valor Promocional: propositalmente FORA de fichaAtual — não vai para
    // Sheets, localStorage, fila de reenvio nem Excel. Só entra no texto.
    const instLine   = fichaAtual.data_instalacao ? `\nData de Instalacao: ${fichaAtual.data_instalacao}` : '';
    const valorPromo = up(vl('valor_promocional'));
    const promoLine  = valorPromo ? `\nValor 6 Meses: ${valorPromo}` : '';

    const servicosAtivos = [
      { label:'🌐 Banda Larga', val: fichaAtual.plano_banda },
      { label:'🔀 Mesh',        val: fichaAtual.plano_mesh ? fichaAtual.plano_mesh + ' UN' : '' },
      { label:'📱 Controle',    val: fichaAtual.plano_controle },
      { label:'📱 Pós',         val: fichaAtual.plano_pos },
      { label:'🆓 Dep. Grátis', val: fichaAtual.dep_gratis ? fichaAtual.dep_gratis + ' UN' : '' },
      { label:'💰 Dep. Pago',   val: fichaAtual.dep_pago ? fichaAtual.dep_pago + ' UN' : '' },
      { label:'📺 TV',          val: fichaAtual.plano_tv },
      { label:'➕ Ponto Adicional', val: fichaAtual.ponto_adicional ? fichaAtual.ponto_adicional + ' UN' : '' },
      { label:'☎️ Fixo',        val: fichaAtual.plano_fixo },
    ].filter(s => s.val && s.val !== '—');
    const servicosLinhas = servicosAtivos.length
      ? servicosAtivos.map(s => `${s.label}: ${s.val}`).join('\n') : '—';

    // Promoção BLACK FRIDAY 1: só aparece no texto copiado (não vai ao Sheets).
    const promoBfLine = vl('plano_promo') ? '\n🔥 Promoção: BLACK FRIDAY 1' : '';

    const checkinLine = checkinCoords ? `\n📍 Check-in: https://www.google.com/maps?q=${checkinCoords.lat},${checkinCoords.lng}` : '';
    const portabLine  = fichaAtual.portabilidade ? `\nPortabilidade: ${fichaAtual.portabilidade}` : '';
    const smsLine      = fichaAtual.sms ? `\nSMS: ${fichaAtual.sms}` : '';
    // CNPJ só aparece no texto quando preenchido — a maioria das
    // fichas é pessoa física e não deve carregar uma linha vazia.
    const cnpjLine     = fichaAtual.cnpj ? `\nCNPJ: ${fichaAtual.cnpj}` : '';

    const txt =
`FICHA CADASTRAL VENKO
Status: ${fichaAtual.status}
Criar HP: ${fichaAtual.criar_hp || '—'}${instLine}

DADOS PESSOAIS
Nome: ${fichaAtual.nome}
CPF: ${fichaAtual.cpf}${cnpjLine}
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
${servicosLinhas}${promoBfLine}${portabLine}
Receita: ${fichaAtual.mensalidade}
Valor do Plano: ${fichaAtual.debito}${promoLine}
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
    if (modoEdicao) { await salvarEdicaoFicha(); return; }
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
      // Adiciona à fila de reenvio (reenviada automaticamente em seguida)
      if (!filaReenvio.find(f => String(f.id) === String(fichaAtual.id))) {
        filaReenvio.push(fichaAtual);
        salvarFila();
      }
      setSyncStatus('erro',
        '⚠️ Salva no aparelho. Falha ao enviar ao Sheets' + (ultimoErroEnvio ? ' (' + ultimoErroEnvio + ')' : '') + ' — será reenviada automaticamente. ' +
        '<button onclick="reenviarFila(true)" style="background:none;border:none;color:#991b1b;font-weight:700;cursor:pointer;text-decoration:underline;padding:0;font-family:inherit">Reenviar agora</button>'
      );
      showToast('⚠️ Ficha salva — será reenviada automaticamente.', 'warning', 5000);
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
    // Sai do modo edição (se estava ativo) antes de limpar os campos —
    // evita que dados de uma ficha antiga fiquem "soltos" no formulário
    // e sejam enviados sem querer como ficha nova.
    modoEdicao = false;
    idEmEdicao = null;
    fichaEditOriginal = null;
    removerBannerEdicao();
    const btnEnviarEl = document.getElementById('btn-enviar');
    if (btnEnviarEl) { btnEnviarEl.innerHTML = '📤 ENVIAR'; btnEnviarEl.disabled = false; }

    document.querySelectorAll('#page-formulario input, #page-formulario select, #page-formulario textarea')
      .forEach(el => el.value = '');
    document.querySelectorAll('#page-formulario .campo-invalido').forEach(el => el.classList.remove('campo-invalido'));
    const cpfMsg = document.getElementById('cpf-msg');
    if (cpfMsg) cpfMsg.style.display = 'none';
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
    document.getElementById('btn-checkin').style.display = '';
    document.getElementById('btn-checkin').onclick = fazerCheckin;
    document.getElementById('mensalidade').classList.remove('auto-preenchido');
    document.getElementById('debito').classList.remove('auto-preenchido');
    document.getElementById('preco-status').className = 'preco-status';
    hideSyncStatus();
    document.getElementById('cep-status').className = 'cep-status';
    document.getElementById('criar_hp').value = '';
    document.getElementById('hp-sim').className = 'hp-btn';
    document.getElementById('hp-nao').className = 'hp-btn';
    camposAutoPreenchidos.clear();
    sincronizarPromoBF1(null, '', '');
    detalhePreco = [];
    fichaAtual = null; checkinCoords = null;
    atualizarProgresso();
    irParaEtapa(1);
    if (typeof window.limparRascunho === 'function') window.limparRascunho();
    if (typeof window.atualizarBarraPlano === 'function') window.atualizarBarraPlano();
    window.scrollTo({top:0, behavior:'smooth'});
  }

  // ══════════════════════════════════════════════════════════════
  // LIMPAR FICHA — botão 🗑 ao lado do indicador de etapas, visível
  // em QUALQUER etapa do preenchimento. Só um wrapper com confirmação
  // em cima de limpar(), que já cuida de zerar tudo (campos, pills,
  // modo edição, rascunho) e voltar pra etapa 1.
  //
  // A confirmação só aparece se houver algo digitado — limpar uma
  // ficha já vazia não precisa perguntar nada.
  // ══════════════════════════════════════════════════════════════
  function limparFichaGeral() {
    const temDados = ['nome','cpf','cnpj','celular','rua','mensalidade','obs'].some(id => vl(id));
    if (temDados && !confirm('Limpar todos os campos desta ficha? Os dados não enviados serão perdidos.')) return;
    limpar();
    showToast('🗑 Ficha limpa', 'info');
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
  //
  // STATUS: fichas antigas que ainda estejam como "Concluída" (na
  // planilha ou guardadas no aparelho) são mostradas como "Instalada".
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
      const statusNorm = (f.status === 'Concluída') ? 'Instalada' : f.status;
      mapa.set(idStr, { ...local, ...f, status: statusNorm, id: local ? local.id : (Number(f.id) || f.id) });
    });

    fichas = Array.from(mapa.values());
    fichas.forEach(f => { if (f.status === 'Concluída') f.status = 'Instalada'; });
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

  // ─────────────────────────────────────────────────────────────
  // CORREÇÃO DA BUSCA: antes, ao digitar um NOME (ex.: "mateus"),
  // a versão "só números" da busca ficava vazia (""), e
  // "qualquer texto".includes("") é sempre true — então o filtro
  // de CPF/CNPJ deixava passar TODAS as fichas e a busca por nome
  // parecia não funcionar. Agora CPF/CNPJ só entram na comparação
  // quando a busca tem pelo menos um dígito.
  // ─────────────────────────────────────────────────────────────
  function renderTabelaMinhas() {
    const busca = (document.getElementById('busca-minhas')?.value||'').toLowerCase().trim();
    const buscaNum = busca.replace(/\D/g,'');
    let lista = fichas.filter(f => session.role==='admin' || f.username_vendedor===session.username);
    if (filtroMinhas !== 'todos') lista = lista.filter(f => f.status === filtroMinhas);
    if (busca) lista = lista.filter(f =>
      (f.nome||'').toLowerCase().includes(busca) ||
      (buscaNum && (f.cpf||'').replace(/\D/g,'').includes(buscaNum)) ||
      (buscaNum && (f.cnpj||'').replace(/\D/g,'').includes(buscaNum))
    );
    document.getElementById('badge-minhas').textContent = lista.length;
    renderTabela(lista, 'tabela-minhas', false);
  }

  function renderTabelaTodas() {
    const busca = (document.getElementById('busca-todas')?.value||'').toLowerCase().trim();
    const buscaNum = busca.replace(/\D/g,'');
    let lista = [...fichas];
    if (filtroTodas !== 'todos') lista = lista.filter(f => f.status === filtroTodas);
    if (busca) lista = lista.filter(f =>
      (f.nome||'').toLowerCase().includes(busca) ||
      (buscaNum && (f.cpf||'').replace(/\D/g,'').includes(buscaNum)) ||
      (buscaNum && (f.cnpj||'').replace(/\D/g,'').includes(buscaNum)) ||
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
    // ORDEM: sempre da ficha mais nova para a mais antiga, pelo id
    // (que é a data/hora do cadastro). Antes a ordem dependia da ordem
    // em que as fichas foram parar no aparelho e podia ficar embaralhada.
    const rows = lista.slice().sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)).map((f, i) => {
      const localCell = f.checkin_url ? `<a href="${f.checkin_url}" target="_blank">📍 Ver</a>` : '<span style="color:#c0c8d0">—</span>';
      const movelCell = [
        f.plano_controle ? '<span style="color:#1d4ed8">C:</span> '+f.plano_controle : '',
        f.plano_pos ? '<span style="color:#7e22ce">P:</span> '+f.plano_pos : '',
        f.portabilidade ? '<span style="color:#000000">↔</span> '+f.portabilidade : ''
      ].filter(Boolean).join('<br>') || '—';

      const statusCell = isAdmin
        ? `<select class="status-select" onchange="alterarStatus(${f.id},this.value,this)">
            ${['Agendada','Instalada','Pendente','Cancelada'].map(s =>
              `<option value="${s}"${f.status===s?' selected':''}>${s}</option>`
            ).join('')}
           </select>`
        : (() => {
            const cls = {Agendada:'status-agendada',Instalada:'status-concluida',Cancelada:'status-cancelada',Pendente:'status-pendente'}[f.status]||'';
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
        <td>${isAdmin
          ? `<input type="text" class="input-data-inst" value="${f.data_instalacao || ''}" placeholder="DD/MM/AAAA" maxlength="10" inputmode="numeric"
               oninput="mascararData(this)" onchange="salvarDataInstalacao(${f.id}, this)"
               onkeydown="if(event.key==='Enter'){this.blur();}" aria-label="Data de instalação de ${(f.nome || '').replace(/"/g,'')}">
             ${f.periodo ? `<div style="font-size:.7rem;color:var(--muted);margin-top:2px;">${f.periodo}</div>` : ''}`
          : ([f.data_instalacao, f.periodo].filter(Boolean).join(' • ') || '—')}</td>
        <td>${statusCell}</td>
        <td class="td-local">${localCell}</td>
        <td>${f.data_cadastro}</td>
        <td style="white-space:nowrap">
          ${isAdmin
            ? `<button class="btn-regerar" onclick="editarFichaAdmin(${f.id})" title="Editar ficha (salva na mesma linha da planilha)">✏️</button>
               ${podeExcluir ? `<button class="btn-del" onclick="deletar(${f.id})" title="Excluir da planilha">✕</button>` : ''}`
            : `<button class="btn-regerar" onclick="reGerarFicha(${f.id})" title="Reenviar / duplicar ficha">↩</button>`
          }
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

  // Antes o status só mudava no aparelho (e voltava ao valor antigo no
  // próximo "Atualizar"). Agora grava na planilha (action=atualizarStatus
  // no Code.gs — só a coluna STATUS daquela linha). Se falhar, o seletor
  // volta ao status anterior.
  async function alterarStatus(id, novoStatus, selectEl) {
    if (session.role !== 'admin') { showToast('⚠️ Apenas administradores podem alterar o status.', 'warning'); return; }
    const idx = fichas.findIndex(f => String(f.id) === String(id));
    if (idx < 0) return;
    const anterior = fichas[idx].status;
    if (novoStatus === anterior) return;

    if (selectEl) selectEl.disabled = true;

    try {
      const params = new URLSearchParams();
      params.append('action', 'atualizarStatus');
      params.append('editor_username', session.username);
      params.append('id', String(id));
      params.append('novo_status', novoStatus);
      params.append('token', session.token || '');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeout);
      const dados = await resp.json();

      if (dados && dados.status === 'ok') {
        fichas[idx].status = novoStatus;
        salvarFichas();
        showToast(`✅ Status atualizado: ${novoStatus}`);
        renderDashboard();
      } else {
        throw new Error((dados && dados.msg) || 'Não foi possível salvar o status.');
      }
    } catch (err) {
      if (selectEl) selectEl.value = anterior;
      showToast('❌ ' + (err.message || 'Falha de conexão ao salvar o status.'), 'error', 4500);
    } finally {
      if (selectEl) selectEl.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DATA DE INSTALAÇÃO direto na lista (só admin) — grava APENAS a
  // coluna DATA_INSTALACAO daquela linha na planilha (action=
  // atualizarDataInstalacao no Code.gs): não abre o formulário e não
  // cria linha nova. Salva ao sair do campo ou ao apertar Enter.
  // Campo vazio apaga a data.
  // ─────────────────────────────────────────────────────────────
  async function salvarDataInstalacao(id, el) {
    if (session.role !== 'admin') { showToast('⚠️ Apenas administradores podem definir a data de instalação.', 'warning'); return; }

    const idx = fichas.findIndex(f => String(f.id) === String(id));
    if (idx < 0) return;
    const anterior = fichas[idx].data_instalacao || '';
    const novo = el.value.trim();
    if (novo === anterior) return;

    if (novo && (novo.length !== 10 || !parseDataBR(novo))) {
      showToast('⚠️ Data inválida — use DD/MM/AAAA', 'warning');
      el.value = anterior;
      return;
    }

    el.disabled = true;
    el.classList.remove('salvo', 'erro');

    try {
      const params = new URLSearchParams();
      params.append('action', 'atualizarDataInstalacao');
      params.append('editor_username', session.username);
      params.append('id', String(id));
      params.append('data_instalacao', novo);
      params.append('token', session.token || '');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeout);
      const dados = await resp.json();

      if (dados && dados.status === 'ok') {
        fichas[idx].data_instalacao = novo;
        salvarFichas();
        el.classList.add('salvo');
        setTimeout(() => el.classList.remove('salvo'), 2500);
        showToast(novo ? '📅 Data de instalação salva!' : '📅 Data de instalação removida.');
        if (document.getElementById('page-agenda')?.classList.contains('active')) renderAgenda();
      } else {
        throw new Error((dados && dados.msg) || 'Não foi possível salvar.');
      }
    } catch (err) {
      el.value = anterior;
      el.classList.add('erro');
      setTimeout(() => el.classList.remove('erro'), 3000);
      showToast('❌ ' + (err.message || 'Falha de conexão ao salvar a data.'), 'error', 4500);
    } finally {
      el.disabled = false;
    }
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
      const dados = await apiPost('deletar', { id });

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
    // Garante que não sobrou modo edição ligado de uma ação anterior —
    // este fluxo é o antigo "reenviar/duplicar", não uma edição real.
    modoEdicao = false; idEmEdicao = null; fichaEditOriginal = null;
    removerBannerEdicao();
    const btnCk = document.getElementById('btn-checkin');
    if (btnCk) btnCk.style.display = '';
    fichaAtual = f;
    checkinCoords = f.checkin_lat ? { lat: f.checkin_lat, lng: f.checkin_lng } : null;
    const map = ['vendedor','status','data_instalacao','nome','cpf','cnpj','celular','sms','email','mae','rua','numero','complemento','bairro','cidade','cep','plano_banda','plano_mesh','plano_controle','plano_pos','dep_gratis','dep_pago','portabilidade','plano_tv','ponto_adicional','plano_fixo','mensalidade','debito','periodo','obs'];
    map.forEach(k => {
      const el = document.getElementById(k);
      if (!el) return;
      if ((k === 'status' || k === 'data_instalacao') && session.role !== 'admin') return;
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
    irParaEtapa(1);
    if (typeof window.atualizarBarraPlano === 'function') window.atualizarBarraPlano();
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
    document.querySelectorAll('.periodo-custom').forEach(el => el.classList.toggle('show', periodo === 'custom'));
    if (periodo !== 'custom' || (periodoCustomDe && periodoCustomAte)) {
      renderDashboard();
      if (document.getElementById('page-painel')?.classList.contains('active')) renderPainel();
    }
  }


  // ─────────────────────────────────────────────────────────────
  // AGENDA DE INSTALAÇÕES — fichas "Agendada" agrupadas por dia e
  // período. Admin vê todas e muda a data direto na linha (usa o
  // mesmo salvarDataInstalacao da lista); vendedor vê só as dele,
  // sem editar. Fichas Agendadas sem data aparecem no topo.
  // ─────────────────────────────────────────────────────────────
  const AGENDA_PERIODOS = ['08:00-12:00', '12:00-15:00', '15:00-18:00', 'INTEGRAL'];

  function agEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function agCard(f, isAdmin) {
    const onde = [f.rua && (f.rua + (f.numero ? ', ' + f.numero : '')), f.bairro, f.cidade].filter(Boolean).join(' • ');
    const sub  = [onde, isAdmin ? f.vendedor : '', f.celular].filter(Boolean).join(' — ');
    const campo = isAdmin
      ? `<input type="text" class="input-data-inst" value="${agEsc(f.data_instalacao)}" placeholder="DD/MM/AAAA" maxlength="10" inputmode="numeric"
           oninput="mascararData(this)" onchange="salvarDataInstalacao(${Number(f.id) || `'${agEsc(f.id)}'`}, this)"
           onkeydown="if(event.key==='Enter'){this.blur();}" aria-label="Data de instalação de ${agEsc(f.nome)}">`
      : '';
    return `<div class="ag-card">
      <div class="ag-info"><div class="ag-nome">${agEsc(f.nome)}</div><div class="ag-sub">${agEsc(sub)}</div></div>
      <div class="ag-acoes">${campo}</div>
    </div>`;
  }

  function renderAgenda() {
    const box = document.getElementById('agenda-lista');
    if (!box) return;
    const isAdmin = session.role === 'admin';
    const lista = fichas.filter(f => f.status === 'Agendada');
    document.getElementById('badge-agenda').textContent = lista.length;

    if (!lista.length) { box.innerHTML = '<div class="ag-vazio">Nenhuma instalação agendada.</div>'; return; }

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
    const semData = [], porDia = new Map();

    lista.forEach(f => {
      const d = parseDataBR(f.data_instalacao);
      if (!d) { semData.push(f); return; }
      const k = d.getTime();
      if (!porDia.has(k)) porDia.set(k, { d, fichas: [] });
      porDia.get(k).fichas.push(f);
    });

    let html = '';
    if (semData.length) {
      html += `<div class="ag-dia">⚠️ Sem data <span class="ag-tag">${semData.length}</span></div>`;
      html += semData.map(f => agCard(f, isAdmin)).join('');
    }

    Array.from(porDia.values()).sort((x, y) => x.d - y.d).forEach(({ d, fichas: fs }) => {
      const dow = d.toLocaleDateString('pt-BR', { weekday: 'long' });
      let tag = '';
      if (d.getTime() === hoje.getTime()) tag = '<span class="ag-tag hoje">Hoje</span>';
      else if (d.getTime() === amanha.getTime()) tag = '<span class="ag-tag">Amanhã</span>';
      else if (d < hoje) tag = '<span class="ag-tag atraso">Atrasada</span>';
      html += `<div class="ag-dia">${agEsc(d.toLocaleDateString('pt-BR'))} <small>${agEsc(dow)} • ${fs.length} instalação(ões)</small> ${tag}</div>`;

      const grupos = AGENDA_PERIODOS.map(p => [p, fs.filter(f => f.periodo === p)]);
      const outros = fs.filter(f => !AGENDA_PERIODOS.includes(f.periodo));
      if (outros.length) grupos.push(['Sem período definido', outros]);
      grupos.forEach(([p, arr]) => {
        if (!arr.length) return;
        html += `<div class="ag-periodo">${agEsc(p === 'INTEGRAL' ? 'Integral' : p)} (${arr.length})</div>` + arr.map(f => agCard(f, isAdmin)).join('');
      });
    });

    box.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════════════
  // PAINEL GERENCIAL (admin) — visão profissional da operação.
  // Usa o MESMO filtro de período do Desempenho (filtroPeriodo e
  // datas personalizadas): mudar em um muda no outro. Só lê dados
  // que o app já tem; não grava nada.
  // ══════════════════════════════════════════════════════════════
  const PAINEL_DIAS_PENDENTE_ALERTA = 7;   // pendente há mais de N dias entra nos alertas
  const PAINEL_DIAS_CANCELADA_RECENTE = 7; // cancelada nos últimos N dias entra nos alertas

  function pnMoeda(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); }
  function pnRec(f) { return normalizarMoedaNum(f.mensalidade); }
  function pnSoma(lista) { return lista.reduce((s, f) => s + pnRec(f), 0); }
  function pnPct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
  function pnBarras(itens, cor) {
    const max = Math.max(...itens.map(i => i.valor), 1);
    return itens.map(i => `
      <div class="bar-wrap">
        <div class="bar-label" title="${agEsc(i.rotulo)}">${agEsc(i.rotulo)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(i.valor / max) * 100}%;background:${i.cor || cor || 'var(--grad)'}"></div></div>
        <div class="bar-val">${agEsc(i.texto != null ? i.texto : i.valor)}</div>
      </div>`).join('');
  }

  let painelVendedor = '';   // '' = equipe toda; senão, username do vendedor escolhido

  function painelTrocarVendedor(username) {
    painelVendedor = username || '';
    renderPainel();
  }

  function painelFichaDoVendedor(f, u, nome) {
    return String(f.username_vendedor || '').toLowerCase() === u ||
           (nome && normalizar(f.vendedor) === nome);
  }

  function selecionarPeriodoPainel(periodo) { selecionarPeriodo(periodo); }

  function aplicarPeriodoCustomPainel() {
    const de  = parseDataBR(document.getElementById('painel-de').value);
    const ate = parseDataBR(document.getElementById('painel-ate').value);
    if (!de || !ate) { showToast('⚠️ Informe as duas datas (DD/MM/AAAA)', 'warning'); return; }
    if (de > ate) { showToast('⚠️ A data inicial deve ser antes da final', 'warning'); return; }
    periodoCustomDe = de;
    periodoCustomAte = ate;
    // mantém o Desempenho em sincronia
    const d1 = document.getElementById('periodo-de'), d2 = document.getElementById('periodo-ate');
    if (d1) d1.value = document.getElementById('painel-de').value;
    if (d2) d2.value = document.getElementById('painel-ate').value;
    renderDashboard();
    renderPainel();
  }

  function renderPainel() {
    const root = document.getElementById('painel-conteudo');
    if (!root || !session || session.role !== 'admin') return;

    // Seletor de vendedor (equipe toda ou individual)
    const usuarios = getAllUsers().filter(u => u && u.username);
    const wrapSel = document.getElementById('painel-vendedor-wrap');
    if (wrapSel) {
      wrapSel.innerHTML = `<label for="painel-vendedor">Vendedor</label>
        <select id="painel-vendedor" onchange="painelTrocarVendedor(this.value)">
          <option value="">👥 Equipe toda</option>
          ${usuarios.map(u => `<option value="${agEsc(u.username)}" ${u.username === painelVendedor ? 'selected' : ''}>${agEsc(u.name || u.username)}</option>`).join('')}
        </select>`;
    }
    const uSel = usuarios.find(u => u.username === painelVendedor);
    if (painelVendedor && !uSel) painelVendedor = '';
    const selUser = painelVendedor ? painelVendedor.toLowerCase() : '';
    const selNome = uSel ? normalizar(uSel.name) : '';
    const individual = !!selUser;
    const nomeSel = uSel ? (uSel.name || uSel.username) : '';

    const range = getRangePeriodoAtual();
    const todasEquipe = fichas;
    const todas = individual ? fichas.filter(f => painelFichaDoVendedor(f, selUser, selNome)) : fichas;
    const lista = filtrarFichasPorRange(todas, range);
    const anterior = range ? filtrarFichasPorRange(todas, getRangeAnterior(range)) : [];
    const comp = !!range;

    const lblEl = document.getElementById('painel-label');
    if (lblEl) lblEl.textContent = range
      ? `📊 Mostrando: ${formatarDataCurta(range.inicio)} até ${formatarDataCurta(range.fim)}`
      : '📊 Mostrando: todo o histórico';

    const por = (arr, st) => arr.filter(f => f.status === st);
    const inst = por(lista, 'Instalada'), agen = por(lista, 'Agendada'), pend = por(lista, 'Pendente'), canc = por(lista, 'Cancelada');
    const instA = por(anterior, 'Instalada'), cancA = por(anterior, 'Cancelada');
    const recInst = pnSoma(inst), recAnd = pnSoma(agen) + pnSoma(pend);
    const recInstA = pnSoma(instA);
    const ticket = lista.length ? pnSoma(lista) / lista.length : 0;
    const ticketA = anterior.length ? pnSoma(anterior) / anterior.length : 0;
    const conv = pnPct(inst.length, lista.length);
    const convA = pnPct(instA.length, anterior.length);
    const taxaCanc = pnPct(canc.length, lista.length);

    // Meta da equipe (planilha META — mês corrente, não depende do filtro)
    let metaEq = 0, atingEq = 0, projEq = 0, diasU = 0, diasT = 0;
    const metasUsadas = individual
      ? metas.filter(m => { const v = normalizar(m.vendedor || m.VENDEDOR || ''); return v === selNome || v === normalizar(selUser); })
      : metas;
    metasUsadas.forEach(m => {
      // A planilha META tem uma linha "TOTAL" que já soma os vendedores —
      // ignorar aqui para não contar tudo em dobro.
      if (/^TOTAL/.test(normalizar(m.vendedor || m.VENDEDOR || ''))) return;
      metaEq  += normalizarMoedaNum(m.meta_receita ?? m['META RECEITA'] ?? m.META_RECEITA);
      atingEq += normalizarMoedaNum(m.atingimento ?? m.ATINGIMENTO);
      projEq  += normalizarMoedaNum(m.projecao ?? m.PROJECAO);
      diasU = Math.max(diasU, parseInt(m.dias_uteis ?? m['DIAS UTEIS'] ?? m.DIAS_UTEIS ?? 0, 10) || 0);
      diasT = Math.max(diasT, parseInt(m.dias_trabalhados ?? m['DIAS TRABALHADOS'] ?? m.DIAS_TRABALHADOS ?? 0, 10) || 0);
    });

    let html = '';

    // 1) CARTÕES
    html += `<div class="dash-grid">
      <div class="kpi-card verde"><div class="kpi-label">✅ Receita Instalada</div>
        <div class="kpi-value" style="font-size:1.3rem;">${pnMoeda(recInst)}</div>
        <div class="kpi-sub">${inst.length} instalada(s) no período</div>${trendHtml(recInst, recInstA, comp)}</div>
      <div class="kpi-card azul"><div class="kpi-label">⏳ Receita em Andamento</div>
        <div class="kpi-value" style="font-size:1.3rem;">${pnMoeda(recAnd)}</div>
        <div class="kpi-sub">${pend.length} pendente(s) + ${agen.length} agendada(s)</div></div>
      <div class="kpi-card"><div class="kpi-label">🧾 Vendas</div>
        <div class="kpi-value">${lista.length}</div>
        <div class="kpi-sub">fichas no período</div>${trendHtml(lista.length, anterior.length, comp)}</div>
      <div class="kpi-card rosa"><div class="kpi-label">🎫 Ticket Médio</div>
        <div class="kpi-value" style="font-size:1.3rem;">${pnMoeda(ticket)}</div>
        <div class="kpi-sub">receita por venda</div>${trendHtml(ticket, ticketA, comp)}</div>
      <div class="kpi-card verde"><div class="kpi-label">🔁 Conversão</div>
        <div class="kpi-value">${conv}%</div>
        <div class="kpi-sub">instaladas ÷ vendas</div>${trendHtml(conv, convA, comp)}</div>
      <div class="kpi-card vermelho"><div class="kpi-label">🚫 Cancelamento</div>
        <div class="kpi-value">${taxaCanc}%</div>
        <div class="kpi-sub">${canc.length} cancelada(s)</div>${trendHtml(canc.length, cancA.length, comp)}</div>
    </div>`;

    // Meta da equipe
    if (metaEq > 0) {
      const p1 = pnPct(atingEq, metaEq), p2 = pnPct(atingEq + recAndMes_(todas), metaEq);
      html += `<div class="pn-box"><h3>🎯 ${individual ? 'Meta de ' + agEsc(nomeSel) : 'Meta da Equipe'} <small>(mês, planilha META)</small></h3>
        <div class="pn-meta-linha"><span>Atingimento <b>${pnMoeda(atingEq)}</b> de <b>${pnMoeda(metaEq)}</b></span><b>${p1}%</b></div>
        <div class="bar-track" style="height:14px;"><div class="bar-fill" style="width:${Math.min(p1,100)}%;background:${p1>=100?'#16a34a':'var(--grad)'}"></div></div>
        <div class="pn-meta-sub">Projeção da planilha: <b>${pnMoeda(projEq)}</b> (${pnPct(projEq, metaEq)}%) · Dias úteis: ${diasT}/${diasU} · Com pendentes + agendadas do mês: <b>${pnMoeda(atingEq + recAndMes_(todas))}</b> (${p2}%)</div>
      </div>`;
    }

    // 2) FUNIL
    const stat = [
      ['Pendentes', pend, '#2563eb'], ['Agendadas', agen, '#e67e22'], ['Instaladas', inst, '#16a34a'], ['Canceladas', canc, '#ef4444']
    ];
    html += `<div class="pn-box"><h3>🔽 Funil por Status</h3>` +
      pnBarras(stat.map(([r, arr, cor]) => ({ rotulo: r, valor: arr.length, cor, texto: `${arr.length} · ${pnMoeda(pnSoma(arr))}` }))) +
      `</div>`;

    // 3) RANKING DE VENDEDORES
    const mapaV = new Map();
    filtrarFichasPorRange(todasEquipe, range).forEach(f => {
      const nome = f.vendedor || f.username_vendedor || '—';
      if (!mapaV.has(nome)) mapaV.set(nome, { nome, vendas: 0, inst: 0, canc: 0, recInst: 0, recTotal: 0 });
      const o = mapaV.get(nome);
      o.vendas++; o.recTotal += pnRec(f);
      if (f.status === 'Instalada') { o.inst++; o.recInst += pnRec(f); }
      if (f.status === 'Cancelada') o.canc++;
    });
    const rank = Array.from(mapaV.values()).sort((a, b) => b.recInst - a.recInst || b.recTotal - a.recTotal);
    const metaDe = (nome) => {
      const m = metas.find(x => normalizar(x.vendedor || x.VENDEDOR || '') === normalizar(nome));
      return m ? normalizarMoedaNum(m.meta_receita ?? m['META RECEITA'] ?? m.META_RECEITA) : 0;
    };
    html += `<div class="pn-box"><h3>🏆 ${individual ? 'Posição na Equipe' : 'Ranking de Vendedores'}</h3>`;
    if (!rank.length) html += `<div class="ag-vazio">Sem vendas no período.</div>`;
    else html += `<div class="tabela-wrap"><table>
      <thead><tr><th>#</th><th>Vendedor</th><th>Vendas</th><th>Instaladas</th><th>Receita Inst.</th><th>Receita Total</th><th>Conv.</th><th>Canc.</th></tr></thead>
      <tbody>${rank.map((r, i) => `<tr ${individual && normalizar(r.nome) === selNome ? 'style="background:#fffbeb;font-weight:700;"' : ''}>
        <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
        <td class="td-nome">${agEsc(r.nome)}</td><td>${r.vendas}</td><td>${r.inst}</td>
        <td class="td-valor">${pnMoeda(r.recInst)}</td><td class="td-valor">${pnMoeda(r.recTotal)}</td>
        <td>${pnPct(r.inst, r.vendas)}%</td><td>${pnPct(r.canc, r.vendas)}%</td></tr>`).join('')}</tbody></table></div>`;
    html += `</div>`;

    // 4) EVOLUÇÃO DIÁRIA
    const diasMap = new Map();
    let ini, fim;
    if (range) { ini = range.inicio; fim = range.fim; }
    else {
      fim = fimDoDia(new Date()); ini = inicioDoDia(new Date(fim.getTime() - 29 * 86400000));
    }
    const nDias = Math.min(Math.round((inicioDoDia(fim) - inicioDoDia(ini)) / 86400000) + 1, 62);
    const iniEf = inicioDoDia(new Date(fim.getTime() - (nDias - 1) * 86400000));
    for (let i = 0; i < nDias; i++) { const d = new Date(iniEf.getTime() + i * 86400000); diasMap.set(inicioDoDia(d).getTime(), { d, rec: 0, qtd: 0 }); }
    lista.forEach(f => {
      const d = parseDataCadastro(f.data_cadastro); if (!d) return;
      const o = diasMap.get(inicioDoDia(d).getTime()); if (!o) return;
      o.rec += pnRec(f); o.qtd++;
    });
    const dias = Array.from(diasMap.values());
    const maxRec = Math.max(...dias.map(x => x.rec), 1);
    const media = dias.length ? dias.reduce((s, x) => s + x.rec, 0) / dias.length : 0;
    const metaDia = (filtroPeriodo === 'mes' && metaEq > 0 && diasU > 0) ? metaEq / diasU : 0;
    const escala = Math.max(maxRec, metaDia, 1);
    html += `<div class="pn-box"><h3>📈 Evolução Diária <small>(receita vendida por dia${range ? '' : ' · últimos 30 dias'})</small></h3>
      <div class="pn-chart">
        ${media > 0 ? `<div class="pn-linha media" style="bottom:${(media / escala) * 100}%"><span>média ${pnMoeda(media)}</span></div>` : ''}
        ${metaDia > 0 ? `<div class="pn-linha meta" style="bottom:${(metaDia / escala) * 100}%"><span>ritmo da meta $
