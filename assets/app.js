(function () {
  'use strict';

  var PAGINA = 24; // cards rendered per batch ("carregar mais")

  var data = window.__PROPERTYHUNT__ || { imoveis: [], total: 0 };
  var todos = data.imoveis || [];
  var ROTULOS = data.tipos || {
    casa: 'Casa', apartamento: 'Apartamento', terreno: 'Terreno',
    comercial: 'Comercial/Sala', rural: 'Rural/Chácara', outros: 'Outros'
  };
  var ORDEM_TIPOS = ['casa', 'apartamento', 'terreno', 'comercial', 'rural', 'outros'];

  var $ = function (id) { return document.getElementById(id); };
  var brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var SVG_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  var SVG_SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

  // Defaults: Venda (radio checked in HTML), tipo Casa, "Menor preço" (select), only available
  var TIPOS_PADRAO = { casa: true };
  var ORDEM_PADRAO = 'preco-asc';
  var estado = { tipos: copiar(TIPOS_PADRAO), filtrados: [], mostrados: 0 };
  function copiar(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  var ROTULO_SITUACAO = { vendido: 'Vendido', alugado: 'Alugado', reservado: 'Reservado', indisponivel: 'Indisponível' };
  function indisponivel(i) { return !!i.situacao && i.situacao !== 'disponivel'; }
  function rotuloSituacao(i) {
    if (i.situacao === 'possivel') return i.transacao === 'aluguel' ? 'Possivelmente alugado' : 'Possivelmente vendido';
    return ROTULO_SITUACAO[i.situacao] || '';
  }
  var dataBR = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  function quando(iso) { var d = iso ? new Date(iso) : null; return d && !isNaN(d) ? dataBR.format(d) : ''; }

  /** Available first; then price (sob consulta last) or recency; tie → most recent. */
  function comparador(ordem) {
    return function (a, b) {
      var ia = indisponivel(a) ? 1 : 0, ib = indisponivel(b) ? 1 : 0;
      if (ia !== ib) return ia - ib;
      if (ordem !== 'recentes') {
        var pa = a.preco > 0 ? a.preco : null, pb = b.preco > 0 ? b.preco : null;
        if (pa === null && pb !== null) return 1;
        if (pb === null && pa !== null) return -1;
        if (pa !== pb && pa !== null) return ordem === 'preco-desc' ? pb - pa : pa - pb;
      }
      var da = a.primeiroVisto || '', db = b.primeiroVisto || '';
      return da < db ? 1 : da > db ? -1 : 0;
    };
  }

  function normalizar(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function seguro(url) { return /^(https?:\/\/|img\/[\w.\/-]+$)/i.test(url || '') ? url : null; }
  function unicos(campo) {
    var s = {};
    todos.forEach(function (i) { if (i[campo]) s[i[campo]] = true; });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }
  function preencher(select, valores) {
    valores.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      select.appendChild(o);
    });
  }
  function transacaoAtual() {
    var m = document.querySelector('input[name="transacao"]:checked');
    return m ? m.value : '';
  }

  todos.forEach(function (i) {
    if (!i.tipo) i.tipo = 'outros';
    i._busca = normalizar([i.titulo, i.bairro, i.cidade, i.endereco, i.source, ROTULOS[i.tipo]].join(' '));
  });

  preencher($('f-cidade'), unicos('cidade'));

  // ── Tipo chips (multi-select) ──────────────────────────────
  var chipsBox = $('f-tipos');
  function criarChip(valor, rotulo) {
    var b = el('button', 'chip');
    b.type = 'button';
    b.dataset.tipo = valor;
    b.setAttribute('aria-pressed', 'false');
    b.appendChild(el('span', null, rotulo));
    b.appendChild(el('span', 'n', ''));
    b.addEventListener('click', function () {
      if (!valor) { estado.tipos = {}; }
      else if (estado.tipos[valor]) { delete estado.tipos[valor]; }
      else { estado.tipos[valor] = true; }
      aplicar();
    });
    chipsBox.appendChild(b);
  }
  criarChip('', 'Todos os tipos');
  ORDEM_TIPOS.forEach(function (t) { criarChip(t, ROTULOS[t] || t); });

  function atualizarChips(base) {
    var cont = {};
    base.forEach(function (i) { cont[i.tipo] = (cont[i.tipo] || 0) + 1; });
    var algum = Object.keys(estado.tipos).length > 0;
    Array.prototype.forEach.call(chipsBox.children, function (b) {
      var t = b.dataset.tipo;
      b.setAttribute('aria-pressed', String(t ? !!estado.tipos[t] : !algum));
      b.querySelector('.n').textContent = t ? (cont[t] || 0) : base.length;
      b.hidden = !!t && !cont[t] && !estado.tipos[t];
    });
  }

  // ── Cards ──────────────────────────────────────────────────
  var SVG_ZAP = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>';
  var SVG_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/></svg>';
  var AGENCIAS = data.agencias || {};
  var SVG_TEL = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>';
  var SVG_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var SVG_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6"/></svg>';
  var SVG_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6"/></svg>';
  var SVG_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>';
  var SVG_MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 2-10 7L2 6"/></svg>';
  function nomeAgencia(i) { var a = AGENCIAS[i.source]; return (a && a.nome) || i.source; }
  function mensagemAgencia(i, url) {
    return 'Olá! Vi este imóvel no PropertyHunt e gostaria de mais informações: ' +
      (i.codigo ? 'Cód. ' + i.codigo + ' – ' : '') + i.titulo + ' ' + url;
  }
  function formatBR(digits) {
    var d = String(digits || '').replace(/\D/g, '');
    if (d.indexOf('55') === 0 && d.length >= 12) d = d.slice(2);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return digits || '';
  }
  function copiarTexto(texto, btn) {
    function ok() {
      var prev = btn.getAttribute('aria-label') || 'Copiar';
      btn.classList.add('copiado');
      btn.setAttribute('aria-label', 'Copiado!');
      btn.title = 'Copiado!';
      setTimeout(function () {
        btn.classList.remove('copiado');
        btn.setAttribute('aria-label', prev);
        btn.title = prev;
      }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok).catch(function () {
        try {
          var ta = document.createElement('textarea');
          ta.value = texto; ta.setAttribute('readonly', '');
          ta.style.position = 'fixed'; ta.style.left = '-9999px';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta); ok();
        } catch (e) {}
      });
    } else {
      try {
        var ta = document.createElement('textarea');
        ta.value = texto; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); ok();
      } catch (e) {}
    }
  }
  /** One row per contact: icon + number (link) on one line + copy button. */
  function contatosAgencia(i, url) {
    var a = AGENCIAS[i.source];
    if (!a) return null;
    var box = el('div', 'contatos-nums');
    var nome = nomeAgencia(i);
    function linha(cls, svg, texto, href, rotulo, novaAba) {
      var row = el('div', 'num-linha ' + cls);
      var ic = el('span', 'num-icone'); ic.innerHTML = svg; row.appendChild(ic);
      var lk = el('a', 'num-valor', texto);
      lk.href = href; lk.title = rotulo; lk.setAttribute('aria-label', rotulo + ': ' + texto);
      if (novaAba) { lk.target = '_blank'; lk.rel = 'noopener noreferrer'; }
      row.appendChild(lk);
      var cp = el('button', 'btn-copiar');
      cp.type = 'button'; cp.innerHTML = SVG_COPY;
      cp.setAttribute('aria-label', 'Copiar ' + texto); cp.title = 'Copiar ' + texto;
      cp.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); copiarTexto(texto, cp); });
      row.appendChild(cp);
      box.appendChild(row);
    }
    var d = function (v) { return String(v || '').replace(/\D/g, ''); };
    if (a.telefone) linha('num-tel', SVG_TEL, formatBR(a.telefone), 'tel:' + a.telefone, 'Ligar para ' + nome, false);
    if (a.whatsapp && d(a.whatsapp) !== d(a.telefone))
      linha('num-zap', SVG_ZAP, formatBR(a.whatsapp), 'https://wa.me/' + a.whatsapp + '?text=' + encodeURIComponent(mensagemAgencia(i, url)), 'WhatsApp da ' + nome, true);
    if (a.email) linha('num-mail', SVG_MAIL, a.email, 'mailto:' + a.email + '?subject=' + encodeURIComponent('Interesse no imóvel' + (i.codigo ? ' Cód. ' + i.codigo : '')) + '&body=' + encodeURIComponent(mensagemAgencia(i, url)), 'E-mail para ' + nome, false);
    return box.childNodes.length ? box : null;
  }

  var podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  /** Texto da mensagem: título, preço e link do anúncio original. */
  function textoCompartilhar(i, url, precoTxt) {
    return i.titulo + (i.codigo ? ' (Cód. ' + i.codigo + ')' : '') + '\n' + precoTxt + (i.bairro ? ' · ' + i.bairro : '') + '\n' + url;
  }

  function linkWhatsApp(i, url, precoTxt) {
    return 'https://wa.me/?text=' + encodeURIComponent(textoCompartilhar(i, url, precoTxt));
  }

  function acoesCompartilhar(i, url, precoTxt) {
    var box = el('div', 'acoes');
    var zap = el('a', 'btn-zap');
    zap.href = linkWhatsApp(i, url, precoTxt);
    zap.target = '_blank';
    zap.rel = 'noopener noreferrer';
    zap.setAttribute('aria-label', 'Compartilhar no WhatsApp: ' + i.titulo);
    zap.innerHTML = SVG_ZAP;
    zap.appendChild(el('span', null, 'Compartilhar'));
    zap.title = 'Compartilhar no WhatsApp';
    box.appendChild(zap);

    // Web Share API (celular): menu nativo de compartilhamento como alternativa
    if (podeCompartilhar) {
      var sh = el('button', 'btn-share');
      sh.type = 'button';
      sh.setAttribute('aria-label', 'Mais opções de compartilhamento');
      sh.title = 'Compartilhar';
      sh.innerHTML = SVG_SHARE;
      sh.addEventListener('click', function () {
        navigator.share({ title: i.titulo, text: i.titulo + (i.codigo ? ' (Cód. ' + i.codigo + ')' : '') + ' — ' + precoTxt, url: url }).catch(function () {});
      });
      box.appendChild(sh);
    }
    return box;
  }


  function imagensDo(i) {
    if (window.__PH_GAL__ && window.__PH_GAL__[i.id] && window.__PH_GAL__[i.id].length)
      return window.__PH_GAL__[i.id];
    if (Array.isArray(i.imagens) && i.imagens.length) return i.imagens;
    var cover = seguro(i.imagem);
    return cover ? [cover] : [];
  }

  /** Broken photo → hide img and show the "Sem foto" placeholder instead of the browser's broken icon. */
  function fotoFalhou(im) {
    im.classList.add('carregada', 'falhou');
    var slide = im.parentNode;
    if (slide && !slide.querySelector('.sem-foto')) slide.appendChild(el('span', 'sem-foto', 'Foto indisponível'));
  }

  var shardsCarregando = {};
  /** Loads data/g/<k>.js (script tag → works on file://) then calls cb. */
  function carregarGaleria(i, cb) {
    if (window.__PH_GAL__ && window.__PH_GAL__[i.id]) return cb();
    var k = String(i.id || 'x').charAt(0).toLowerCase();
    var fila = shardsCarregando[k];
    if (fila === true) return cb();
    if (fila) { fila.push(cb); return; }
    fila = shardsCarregando[k] = [cb];
    var sc = document.createElement('script');
    sc.src = 'data/g/' + k + '.js';
    function fim() { shardsCarregando[k] = true; fila.forEach(function (f) { f(); }); }
    sc.onload = fim; sc.onerror = fim;
    document.head.appendChild(sc);
  }

  /** Cover only + arrows/counter; full gallery loaded on first interaction. */
  function montarCapa(i, fotosWrap) {
    var n = i.nImg;
    var cover = seguro(i.imagem);
    var track = el('div', 'car-track');
    var slide = el('div', 'car-slide ativo');
    if (cover) {
      var im = el('img');
      im.alt = i.titulo; im.decoding = 'async'; im.referrerPolicy = 'no-referrer'; im.loading = 'lazy';
      im.onload = function () { im.classList.add('carregada'); fotosWrap.classList.add('ok'); };
      im.onerror = function () { fotoFalhou(im); fotosWrap.classList.add('ok'); };
      im.src = cover;
      slide.appendChild(im);
    } else fotosWrap.classList.add('ok');
    track.appendChild(slide);
    fotosWrap.appendChild(track);
    var prev = el('button', 'car-btn car-prev'); prev.type = 'button'; prev.innerHTML = SVG_PREV; prev.setAttribute('aria-label', 'Foto anterior');
    var next = el('button', 'car-btn car-next'); next.type = 'button'; next.innerHTML = SVG_NEXT; next.setAttribute('aria-label', 'Próxima foto');
    var cont = el('span', 'car-contador', '1/' + n);
    fotosWrap.appendChild(prev); fotosWrap.appendChild(next); fotosWrap.appendChild(cont);
    function expandir(acao) {
      carregarGaleria(i, function () {
        var total = imagensDo(i).length;
        while (fotosWrap.firstChild && !fotosWrap.firstChild.classList.contains('etiquetas')) fotosWrap.removeChild(fotosWrap.firstChild);
        Array.prototype.slice.call(fotosWrap.querySelectorAll('.car-track,.car-btn,.car-contador')).forEach(function (x) { x.remove(); });
        var etq = fotosWrap.querySelector('.etiquetas');
        var novo = el('div'); // build into temp then move before etiquetas
        montarCarrossel(i, novo, acao === 'next' ? 1 : acao === 'prev' ? total - 1 : 0);
        while (novo.firstChild) fotosWrap.insertBefore(novo.firstChild, etq);
        if (acao === 'lb') abrirLightbox(i, 0);
      });
    }
    prev.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); expandir('prev'); });
    next.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); expandir('next'); });
    var sx = 0;
    track.addEventListener('touchstart', function (ev) { sx = ev.changedTouches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', function (ev) { var dx = ev.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) expandir(dx < 0 ? 'next' : 'prev'); }, { passive: true });
    fotosWrap.addEventListener('click', function (ev) {
      if (ev.target.closest('.car-btn') || fotosWrap.querySelector('.car-slide:nth-child(2)')) return;
      ev.preventDefault(); ev.stopPropagation(); expandir('lb');
    });
  }

  // Desktop navigation: keyboard arrows, mouse drag, trackpad horizontal swipe
  function ligarNavegacaoFoto(foto) {
    function ir(dir) {
      var btn = foto.querySelector(dir > 0 ? '.car-next' : '.car-prev');
      if (btn) { btn.click(); return true; }
      return false;
    }
    foto.tabIndex = 0;
    foto.setAttribute('role', 'group');
    foto.setAttribute('aria-label', 'Fotos do imóvel (use as setas para navegar)');
    foto.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        if (ir(ev.key === 'ArrowRight' ? 1 : -1)) ev.preventDefault();
      }
    });
    var px = null, arrastou = false;
    foto.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType !== 'mouse' || ev.button !== 0 || ev.target.closest('.car-btn')) return;
      px = ev.clientX; arrastou = false;
    });
    foto.addEventListener('pointerup', function (ev) {
      if (px === null) return;
      var dx = ev.clientX - px; px = null;
      if (Math.abs(dx) > 40) { ir(dx < 0 ? 1 : -1); arrastou = true; setTimeout(function () { arrastou = false; }, 400); }
    });
    foto.addEventListener('click', function (ev) {
      if (arrastou) { arrastou = false; ev.preventDefault(); ev.stopPropagation(); }
    }, true);
    foto.addEventListener('dragstart', function (ev) { ev.preventDefault(); });
    var acc = 0, bloqueio = 0;
    foto.addEventListener('wheel', function (ev) {
      if (Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return;
      ev.preventDefault();
      var agora = Date.now();
      if (agora < bloqueio) return;
      acc += ev.deltaX;
      if (Math.abs(acc) > 50) { ir(acc > 0 ? 1 : -1); acc = 0; bloqueio = agora + 450; }
    }, { passive: false });
  }

  function montarCarrossel(i, fotosWrap, inicio) {
    if ((i.nImg || 0) > 1 && !(window.__PH_GAL__ && window.__PH_GAL__[i.id])) {
      return montarCapa(i, fotosWrap);
    }
    var imgs = imagensDo(i);
    if (!imgs.length) {
      fotosWrap.classList.add('ok');
      fotosWrap.appendChild(el('span', 'sem-foto', 'Sem foto'));
      return;
    }
    var track = el('div', 'car-track');
    var idx = 0;
    var counter = el('span', 'car-contador', '1/' + imgs.length);
    function paint(n) {
      idx = (n + imgs.length) % imgs.length;
      Array.prototype.forEach.call(track.children, function (slide, j) {
        slide.classList.toggle('ativo', j === idx);
        var im = slide.querySelector('img');
        if (j === idx || j === idx + 1 || j === idx - 1 || (idx === 0 && j === imgs.length - 1)) {
          if (im && !im.src) im.src = im.getAttribute('data-src');
        }
      });
      counter.textContent = (idx + 1) + '/' + imgs.length;
    }
    imgs.forEach(function (src, j) {
      var slide = el('div', 'car-slide' + (j === 0 ? ' ativo' : ''));
      var im = el('img');
      im.alt = i.titulo + (imgs.length > 1 ? ' — foto ' + (j + 1) : '');
      im.decoding = 'async';
      im.referrerPolicy = 'no-referrer';
      im.setAttribute('data-src', src);
      if (j === 0) {
        im.loading = 'eager';
        im.src = src;
        im.onload = function () { im.classList.add('carregada'); fotosWrap.classList.add('ok'); };
        im.onerror = function () { fotoFalhou(im); fotosWrap.classList.add('ok'); };
      } else {
        im.loading = 'lazy';
        im.onload = function () { im.classList.add('carregada'); };
        im.onerror = function () { fotoFalhou(im); };
      }
      slide.appendChild(im);
      track.appendChild(slide);
    });
    fotosWrap.appendChild(track);
    fotosWrap.classList.add('ok');
    if (inicio) setTimeout(function () { paint(inicio); }, 0);

    if (imgs.length > 1) {
      var prev = el('button', 'car-btn car-prev');
      prev.type = 'button'; prev.innerHTML = SVG_PREV;
      prev.setAttribute('aria-label', 'Foto anterior');
      var next = el('button', 'car-btn car-next');
      next.type = 'button'; next.innerHTML = SVG_NEXT;
      next.setAttribute('aria-label', 'Próxima foto');
      prev.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); paint(idx - 1); });
      next.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); paint(idx + 1); });
      fotosWrap.appendChild(prev);
      fotosWrap.appendChild(next);
      fotosWrap.appendChild(counter);

      // swipe
      var startX = 0;
      track.addEventListener('touchstart', function (ev) { startX = ev.changedTouches[0].clientX; }, { passive: true });
      track.addEventListener('touchend', function (ev) {
        var dx = ev.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) paint(idx + (dx < 0 ? 1 : -1));
      }, { passive: true });
    }

    track.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      abrirLightbox(i, idx);
    });
  }

  var lightbox = null;
  function garantirLightbox() {
    if (lightbox) return lightbox;
    lightbox = el('div', 'lightbox');
    lightbox.hidden = true;
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.innerHTML = '<button type="button" class="lb-fechar" aria-label="Fechar">' + SVG_CLOSE + '</button>' +
      '<button type="button" class="lb-btn lb-prev" aria-label="Anterior">' + SVG_PREV + '</button>' +
      '<img class="lb-img" alt="">' +
      '<button type="button" class="lb-btn lb-next" aria-label="Próxima">' + SVG_NEXT + '</button>' +
      '<div class="lb-contador"></div>';
    document.body.appendChild(lightbox);
    lightbox.querySelector('.lb-fechar').addEventListener('click', fecharLightbox);
    lightbox.addEventListener('click', function (ev) { if (ev.target === lightbox) fecharLightbox(); });
    var lsx = 0;
    lightbox.addEventListener('touchstart', function (ev) { lsx = ev.changedTouches[0].clientX; }, { passive: true });
    lightbox.addEventListener('touchend', function (ev) {
      var dx = ev.changedTouches[0].clientX - lsx;
      if (Math.abs(dx) > 40 && lbState.imgs.length > 1) { lbState.idx = (lbState.idx + (dx < 0 ? 1 : -1) + lbState.imgs.length) % lbState.imgs.length; pintarLightbox(); }
    }, { passive: true });
    return lightbox;
  }
  var lbState = { imgs: [], idx: 0, titulo: '' };
  function pintarLightbox() {
    var lb = garantirLightbox();
    var img = lb.querySelector('.lb-img');
    img.src = lbState.imgs[lbState.idx];
    img.alt = lbState.titulo + ' — foto ' + (lbState.idx + 1);
    lb.querySelector('.lb-contador').textContent = (lbState.idx + 1) + '/' + lbState.imgs.length;
    lb.querySelector('.lb-prev').hidden = lbState.imgs.length < 2;
    lb.querySelector('.lb-next').hidden = lbState.imgs.length < 2;
  }
  function abrirLightbox(i, start) {
    var imgs = imagensDo(i);
    if (!imgs.length) return;
    lbState = { imgs: imgs, idx: start || 0, titulo: i.titulo };
    var lb = garantirLightbox();
    lb.hidden = false;
    document.body.classList.add('lb-aberto');
    pintarLightbox();
    lb.querySelector('.lb-prev').onclick = function (ev) { ev.stopPropagation(); lbState.idx = (lbState.idx - 1 + lbState.imgs.length) % lbState.imgs.length; pintarLightbox(); };
    lb.querySelector('.lb-next').onclick = function (ev) { ev.stopPropagation(); lbState.idx = (lbState.idx + 1) % lbState.imgs.length; pintarLightbox(); };
  }
  function fecharLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    document.body.classList.remove('lb-aberto');
  }
  document.addEventListener('keydown', function (ev) {
    if (!lightbox || lightbox.hidden) return;
    if (ev.key === 'Escape') fecharLightbox();
    if (ev.key === 'ArrowLeft') { lbState.idx = (lbState.idx - 1 + lbState.imgs.length) % lbState.imgs.length; pintarLightbox(); }
    if (ev.key === 'ArrowRight') { lbState.idx = (lbState.idx + 1) % lbState.imgs.length; pintarLightbox(); }
  });

  function card(i) {
    var aluguel = i.transacao === 'aluguel';
    var fora = indisponivel(i);
    var li = el('li', 'card' + (fora ? ' card-indisponivel' : ''));
    var url = seguro(i.link);

    var foto = el('div', 'foto');
    montarCarrossel(i, foto);
    ligarNavegacaoFoto(foto);
    var etq = el('div', 'etiquetas');
    etq.appendChild(el('span', 'etq ' + (aluguel ? 'etq-aluguel' : 'etq-venda'), aluguel ? 'Aluguel' : 'Venda'));
    etq.appendChild(el('span', 'etq', ROTULOS[i.tipo] || 'Outros'));
    if (fora) etq.appendChild(el('span', 'etq etq-status' + (i.situacao === 'possivel' ? ' etq-possivel' : ''), rotuloSituacao(i)));
    else if (i.novo) etq.appendChild(el('span', 'etq etq-novo', 'Novo'));
    foto.appendChild(etq);
    li.appendChild(foto);

    var corpo = el('div', 'corpo');
    var temPreco = typeof i.preco === 'number' && i.preco > 0;
    var preco = el('div', 'preco' + (temPreco ? '' : ' consulta'), temPreco ? brl.format(i.preco / 100) : 'Preço sob consulta');
    if (aluguel && temPreco) preco.appendChild(el('small', null, ' /mês'));
    corpo.appendChild(preco);
    corpo.appendChild(el('h3', 'titulo', i.titulo));
    var cod = el('p', 'codigo', i.codigo ? 'Cód. ' + i.codigo : '');
    if (!i.codigo) cod.setAttribute('aria-hidden', 'true');
    corpo.appendChild(cod);

    var local = [i.bairro, i.cidade && (i.bairro || '').indexOf(i.cidade) < 0 ? i.cidade : ''].filter(Boolean).join(' · ');
    var p = el('p', 'local');
    if (local) {
      p.innerHTML = SVG_PIN;
      p.appendChild(el('span', null, local));
    }
    corpo.appendChild(p); // always present → same height on every card

    if (fora) {
      var visto = quando(i.ultimaVez);
      corpo.appendChild(el('p', 'aviso-status', i.situacao === 'possivel'
        ? 'Saiu do site da imobiliária' + (visto ? ' · visto pela última vez em ' + visto : '')
        : 'Marcado como ' + rotuloSituacao(i).toLowerCase() + ' no site' + (visto ? ' · ' + visto : '')));
    }
    var base = el('div', 'base-card'); // pinned to the bottom of the card
    var rod = el('div', 'rodape-card');
    rod.appendChild(el('span', 'fonte', nomeAgencia(i)));
    if (url) {
      // Only this explicit link opens the agency's official listing (new tab);
      // clicking elsewhere on the card does nothing.
      var ver = el('a', 'ver', 'Ver anúncio');
      ver.href = url;
      ver.target = '_blank';
      ver.rel = 'noopener noreferrer';
      ver.setAttribute('aria-label', 'Ver anúncio: ' + i.titulo + ' — ' + preco.textContent + ' (abre o site da imobiliária em nova aba)');
      ver.insertAdjacentHTML('beforeend', SVG_SETA);
      rod.appendChild(ver);
    }
    base.appendChild(rod);
    // Agency contact row: always rendered (empty when the agency publishes none) so cards align
    var linha = el('div', 'linha-contatos');
    var cont = url ? contatosAgencia(i, url) : null;
    if (cont) {
      linha.appendChild(el('span', 'rotulo-contato', 'Falar com a imobiliária'));
      linha.appendChild(cont);
    } else {
      linha.appendChild(el('span', 'rotulo-contato sem', 'Contato pelo anúncio original'));
    }
    base.appendChild(linha);
    if (url) base.appendChild(acoesCompartilhar(i, url, preco.textContent));
    corpo.appendChild(base);
    li.appendChild(corpo);
    return li;
  }

  function renderizarMais() {
    var ul = $('lista');
    var frag = document.createDocumentFragment();
    var fim = Math.min(estado.mostrados + PAGINA, estado.filtrados.length);
    for (var k = estado.mostrados; k < fim; k++) frag.appendChild(card(estado.filtrados[k]));
    ul.appendChild(frag);
    estado.mostrados = fim;
    var resta = estado.filtrados.length - estado.mostrados;
    var btn = $('carregar-mais');
    btn.hidden = resta <= 0;
    btn.textContent = 'Carregar mais (' + resta + ')';
  }

  // ── Filtering ──────────────────────────────────────────────
  var ORDENS = [['preco-asc', 'Menor preço'], ['preco-desc', 'Maior preço'], ['recentes', 'Mais recentes']];
  var FAIXAS = {
    venda: [['Até 300 mil', 0, 300000], ['300–500 mil', 300000, 500000], ['500 mil–1 mi', 500000, 1000000], ['1 mi+', 1000000, 0]],
    aluguel: [['Até R$ 1.500', 0, 1500], ['1.500–3.000', 1500, 3000], ['3.000–5.000', 3000, 5000], ['5.000+', 5000, 0]]
  };
  var QUARTOS = [[0, 'Qualquer'], [1, '1+'], [2, '2+'], [3, '3+'], [4, '4+']];
  estado.quartos = 0;
  estado.agencias = {};
  estado.ordem = ORDEM_PADRAO;

  todos.forEach(function (i) {
    var m = /(\d+)\s*(?:quartos?|dormit|dorms?\b|qts?\b|su[ií]tes?)/i.exec(i.titulo || '');
    i._q = m ? parseInt(m[1], 10) : 0;
    i._bairro = normalizar(i.bairro);
  });
  if (!todos.some(function (i) { return i._q > 0; })) $('grupo-quartos').hidden = true;
  unicos('bairro').forEach(function (b) { var o = document.createElement('option'); o.value = b; $('dl-bairros').appendChild(o); });

  function digitos(v) { return String(v || '').replace(/\D/g, ''); }
  function reais(id) { var d = digitos($(id).value); return d ? parseInt(d, 10) : NaN; }
  function setReais(id, n) { $(id).value = n > 0 ? n.toLocaleString('pt-BR') : ''; }
  function formatarCampo(ev) {
    var inp = ev.target, d = digitos(inp.value);
    inp.value = d ? parseInt(d, 10).toLocaleString('pt-BR') : '';
  }

  function opcao(box, rotulo, ativo, onClick, extraCls) {
    var b = el('button', 'opcao' + (extraCls ? ' ' + extraCls : ''), rotulo);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!!ativo));
    b.addEventListener('click', onClick);
    box.appendChild(b);
    return b;
  }
  function faixasAtuais() { return FAIXAS[transacaoAtual() === 'aluguel' ? 'aluguel' : 'venda']; }
  function desenharOpcoes() {
    var fx = $('f-faixas'); fx.textContent = '';
    var mn = reais('f-min'), mx = reais('f-max');
    faixasAtuais().forEach(function (f) {
      var on = (f[1] ? mn === f[1] : isNaN(mn)) && (f[2] ? mx === f[2] : isNaN(mx));
      opcao(fx, f[0], on, function () {
        if (on) { setReais('f-min', 0); setReais('f-max', 0); } else { setReais('f-min', f[1]); setReais('f-max', f[2]); }
        aplicar();
      });
    });
    var qb = $('f-quartos'); qb.textContent = '';
    QUARTOS.forEach(function (q) { opcao(qb, q[1], estado.quartos === q[0], function () { estado.quartos = q[0]; aplicar(); }); });
    var ob = $('f-ordens'); ob.textContent = '';
    ORDENS.forEach(function (o) { opcao(ob, o[1], estado.ordem === o[0], function () { estado.ordem = o[0]; aplicar(); }); });
  }
  var contAg = {};
  todos.forEach(function (i) { contAg[i.source] = (contAg[i.source] || 0) + 1; });
  function desenharAgencias() {
    var ab = $('f-agencias'); ab.textContent = '';
    Object.keys(contAg).sort(function (a, b) { return nomeAg(a).localeCompare(nomeAg(b), 'pt-BR'); }).forEach(function (s) {
      opcao(ab, nomeAg(s), !!estado.agencias[s], function () {
        if (estado.agencias[s]) delete estado.agencias[s]; else estado.agencias[s] = true;
        aplicar();
      }, 'opcao-ag');
    });
  }
  function nomeAg(s) { var a = AGENCIAS[s]; return (a && a.nome) || s; }

  function filtrosPainel() {
    var n = 0;
    if (!isNaN(reais('f-min')) || !isNaN(reais('f-max'))) n++;
    if (estado.quartos) n++;
    if ($('f-cidade').value) n++;
    if ($('f-bairro').value.trim()) n++;
    n += Object.keys(estado.agencias).length;
    if (estado.ordem !== ORDEM_PADRAO) n++;
    if ($('f-indisp').checked) n++;
    return n;
  }

  // ── URL hash (shareable filters) ──────────────────────────
  function lerHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    var p = {};
    h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) try { p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* malformed hash part: ignore */ } });
    if ('t' in p) {
      var v = p.t === 'todos' ? '' : p.t;
      var r = (v === '' || v === 'aluguel' || v === 'venda') && document.querySelector('input[name="transacao"][value="' + v + '"]');
      if (r) r.checked = true;
    }
    if ('tp' in p) { estado.tipos = {}; p.tp.split(',').forEach(function (t) { if (ROTULOS[t]) estado.tipos[t] = true; }); }
    if (p.q) $('f-texto').value = p.q;
    if (p.min) setReais('f-min', parseInt(p.min, 10));
    if (p.max) setReais('f-max', parseInt(p.max, 10));
    if (p.qt) estado.quartos = Math.min(4, parseInt(p.qt, 10) || 0);
    if (p.c) $('f-cidade').value = p.c;
    if (p.b) $('f-bairro').value = p.b;
    if (p.ag) p.ag.split(',').forEach(function (s) { if (contAg[s]) estado.agencias[s] = true; });
    if (p.o && ORDENS.some(function (o) { return o[0] === p.o; })) estado.ordem = p.o;
    if (p.i === '1') $('f-indisp').checked = true;
  }
  function escreverHash() {
    var p = [];
    var add = function (k, v) { if (v !== '' && v != null) p.push(k + '=' + encodeURIComponent(v)); };
    var t = transacaoAtual();
    if (t !== 'venda') add('t', t || 'todos');
    var tp = Object.keys(estado.tipos).sort().join(',');
    if (tp !== 'casa') add('tp', tp || 'todos');
    add('q', $('f-texto').value.trim());
    var mn = reais('f-min'), mx = reais('f-max');
    if (!isNaN(mn)) add('min', mn);
    if (!isNaN(mx)) add('max', mx);
    if (estado.quartos) add('qt', estado.quartos);
    add('c', $('f-cidade').value);
    add('b', $('f-bairro').value.trim());
    add('ag', Object.keys(estado.agencias).sort().join(','));
    if (estado.ordem !== ORDEM_PADRAO) add('o', estado.ordem);
    if ($('f-indisp').checked) add('i', '1');
    var h = p.length ? '#' + p.join('&') : '';
    if (h !== location.hash && history.replaceState) history.replaceState(null, '', location.pathname + location.search + h);
  }

  // ── Active filter pills ───────────────────────────────────
  function desenharPills() {
    var box = $('pills'); box.textContent = '';
    function pill(txt, remover, cls) {
      var b = el('button', 'pill' + (cls ? ' ' + cls : ''));
      b.type = 'button';
      b.setAttribute('aria-label', 'Remover filtro ' + txt);
      b.appendChild(el('span', null, txt));
      var x = el('span', 'x'); x.innerHTML = SVG_CLOSE; b.appendChild(x);
      b.addEventListener('click', function () { remover(); aplicar(); });
      box.appendChild(b);
    }
    Object.keys(estado.tipos).forEach(function (t) { pill(ROTULOS[t] || t, function () { delete estado.tipos[t]; }, 'pill-' + t); });
    var q = $('f-texto').value.trim(); if (q) pill('“' + q + '”', function () { $('f-texto').value = ''; });
    var mn = reais('f-min'), mx = reais('f-max');
    if (!isNaN(mn) || !isNaN(mx)) {
      var f = function (n) { return 'R$ ' + n.toLocaleString('pt-BR'); };
      pill(!isNaN(mn) && !isNaN(mx) ? f(mn) + ' – ' + f(mx) : !isNaN(mn) ? 'A partir de ' + f(mn) : 'Até ' + f(mx),
        function () { setReais('f-min', 0); setReais('f-max', 0); });
    }
    if (estado.quartos) pill(estado.quartos + '+ quartos', function () { estado.quartos = 0; });
    if ($('f-cidade').value) pill($('f-cidade').value, function () { $('f-cidade').value = ''; });
    var b = $('f-bairro').value.trim(); if (b) pill(b, function () { $('f-bairro').value = ''; });
    Object.keys(estado.agencias).forEach(function (s) { pill(nomeAg(s), function () { delete estado.agencias[s]; }); });
    if (estado.ordem !== ORDEM_PADRAO) {
      var r = ORDENS.filter(function (o) { return o[0] === estado.ordem; })[0];
      pill(r ? r[1] : estado.ordem, function () { estado.ordem = ORDEM_PADRAO; });
    }
    if ($('f-indisp').checked) pill('Com indisponíveis', function () { $('f-indisp').checked = false; });
    if (box.children.length > 1) {
      var l = el('button', 'pill-limpar', 'Limpar tudo'); l.type = 'button';
      l.addEventListener('click', limpar); box.appendChild(l);
    }
    box.hidden = box.children.length === 0;
  }

  function aplicar() {
    var texto = normalizar($('f-texto').value.trim());
    var transacao = transacaoAtual();
    var cidade = $('f-cidade').value;
    var bairro = normalizar($('f-bairro').value.trim());
    var mult = 100; // preço em centavos
    var min = reais('f-min'), max = reais('f-max');
    var tipos = estado.tipos;
    var algumTipo = Object.keys(tipos).length > 0;
    var ags = estado.agencias, algumaAg = Object.keys(ags).length > 0;
    var mostrarIndisp = $('f-indisp').checked;
    var ocultos = 0;

    var base = todos.filter(function (i) {
      if (transacao && i.transacao !== transacao) return false;
      if (texto && i._busca.indexOf(texto) < 0) return false;
      if (cidade && i.cidade !== cidade) return false;
      if (bairro && i._bairro.indexOf(bairro) < 0) return false;
      if (algumaAg && !ags[i.source]) return false;
      if (estado.quartos && i._q < estado.quartos) return false;
      if (!isNaN(min) && (i.preco == null || i.preco < min * mult)) return false;
      if (!isNaN(max) && (i.preco == null || i.preco > max * mult)) return false;
      if (!mostrarIndisp && indisponivel(i)) { if (!algumTipo || tipos[i.tipo]) ocultos++; return false; }
      return true;
    });
    var lista = algumTipo ? base.filter(function (i) { return tipos[i.tipo]; }) : base.slice();
    lista.sort(comparador(estado.ordem));

    atualizarChips(base);
    desenharOpcoes();
    desenharAgencias();
    desenharPills();
    var n = filtrosPainel();
    var c = $('n-filtros'); c.textContent = n; c.hidden = n === 0;

    estado.filtrados = lista;
    estado.mostrados = 0;
    $('lista').textContent = '';
    renderizarMais();

    var rotulo = transacao === 'venda' ? ' à venda' : transacao === 'aluguel' ? ' para alugar' : '';
    var cont = $('contagem');
    cont.textContent = '';
    cont.appendChild(el('strong', null, lista.length.toLocaleString('pt-BR')));
    cont.appendChild(document.createTextNode(' ' + (lista.length === 1 ? 'imóvel' : 'imóveis') + rotulo));
    if (!mostrarIndisp && ocultos > 0) {
      var oc = el('button', 'link-indisp', '+ ' + ocultos.toLocaleString('pt-BR') + ' indisponíveis ocultos');
      oc.type = 'button';
      oc.addEventListener('click', function () { $('f-indisp').checked = true; aplicar(); });
      cont.appendChild(document.createTextNode(' · '));
      cont.appendChild(oc);
    }
    $('vazio').hidden = lista.length > 0;
    $('ver-resultados').textContent = 'Ver ' + lista.length.toLocaleString('pt-BR') + (lista.length === 1 ? ' imóvel' : ' imóveis');
    escreverHash();
  }

  var timer;
  function aplicarDepois() { clearTimeout(timer); timer = setTimeout(aplicar, 200); }

  // ── Panel: bottom sheet on mobile, sticky sidebar on desktop ──
  var painel = $('painel'), fundo = $('fundo'), abrir = $('abrir-filtros');
  var desktop = window.matchMedia('(min-width: 1024px)');
  function abrirPainel() {
    painel.classList.add('aberto');
    abrir.setAttribute('aria-expanded', 'true');
    fundo.hidden = false;
    document.body.classList.add('travado');
    setTimeout(function () { $('fechar-filtros').focus(); }, 50);
  }
  function fecharPainel() {
    painel.classList.remove('aberto');
    abrir.setAttribute('aria-expanded', 'false');
    fundo.hidden = true;
    document.body.classList.remove('travado');
  }
  abrir.addEventListener('click', abrirPainel);
  $('fechar-filtros').addEventListener('click', fecharPainel);
  $('ver-resultados').addEventListener('click', function () {
    fecharPainel();
    var top = $('conteudo').getBoundingClientRect().top + window.scrollY - 140;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
  });
  fundo.addEventListener('click', fecharPainel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && painel.classList.contains('aberto')) fecharPainel(); });
  (desktop.addEventListener ? desktop.addEventListener.bind(desktop, 'change') : desktop.addListener.bind(desktop))(function () { if (desktop.matches) fecharPainel(); });

  function limpar() {
    $('filtros').reset();
    estado.tipos = copiar(TIPOS_PADRAO);
    estado.quartos = 0;
    estado.agencias = {};
    estado.ordem = ORDEM_PADRAO;
    aplicar();
  }

  $('f-texto').addEventListener('input', aplicarDepois);
  $('f-bairro').addEventListener('input', aplicarDepois);
  ['f-cidade', 'f-indisp'].forEach(function (id) { $(id).addEventListener('change', aplicar); });
  ['f-min', 'f-max'].forEach(function (id) {
    $(id).addEventListener('input', function (ev) { formatarCampo(ev); aplicarDepois(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="transacao"]'), function (r) {
    r.addEventListener('change', function () { setReais('f-min', 0); setReais('f-max', 0); aplicar(); });
  });
  $('f-limpar').addEventListener('click', limpar);
  $('vazio-limpar').addEventListener('click', limpar);
  $('carregar-mais').addEventListener('click', renderizarMais);
  window.addEventListener('hashchange', function () { estado.tipos = copiar(TIPOS_PADRAO); estado.quartos = 0; estado.agencias = {}; estado.ordem = ORDEM_PADRAO; $('filtros').reset(); lerHash(); aplicar(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entradas) {
      if (entradas[0].isIntersecting && estado.mostrados < estado.filtrados.length) renderizarMais();
    }, { rootMargin: '600px 0px' }).observe($('sentinela'));
  }

  // Sticky bar compacts once scrolled
  var barra = $('barra');
  window.addEventListener('scroll', function () {
    var r = window.scrollY > 120;
    barra.classList.toggle('rolou', r);
    document.body.classList.toggle('rolou', r);
  }, { passive: true });

  var nVenda = todos.filter(function (i) { return i.transacao !== 'aluguel'; }).length;
  $('resumo').textContent = nVenda.toLocaleString('pt-BR') + ' à venda · ' +
    (todos.length - nVenda).toLocaleString('pt-BR') + ' para alugar · Indaiatuba e região';
  if (data.geradoEm) {
    $('atualizado').textContent = 'Atualizado em ' + new Date(data.geradoEm).toLocaleString('pt-BR');
  }

  lerHash();
  aplicar();
})();
