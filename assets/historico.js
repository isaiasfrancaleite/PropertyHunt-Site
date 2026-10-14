(function () {
  'use strict';
  var H = window.__PH_HIST__ || { ciclos: [] };
  var fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  function data(iso) { var d = new Date(iso); return isNaN(d) ? '—' : fmt.format(d).replace(',', ''); }
  function dur(ms) { if (!(ms >= 0)) return '—'; var s = Math.round(ms / 1000); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; }
  function n(v) { return (v || 0).toLocaleString('pt-BR'); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var ROT = { completo: 'Completo', parcial: 'Parcial', erro: 'Erro' };
  function selo(st, txt) { return el('span', 'selo selo-' + st, txt || ROT[st] || st); }

  function sitesDe(c) {
    if (Array.isArray(c.detalhes)) return c.detalhes;
    // older cycles: only error strings were stored
    return (c.erros || []).map(function (e) {
      var site = String(e).split(/[:( ]/)[0];
      return { site: site, status: 'erro', erros: [e], antigo: true, bloqueio: /429/.test(e) ? '429' : null };
    });
  }

  var lista = document.getElementById('hist-lista');
  var ciclos = H.ciclos || [];
  document.getElementById('hist-vazio').hidden = ciclos.length > 0;
  var r = document.getElementById('hist-resumo');
  r.innerHTML = '';
  [['Coletas registradas', n(ciclos.length)], ['Última coleta', ciclos[0] ? data(ciclos[0].concluido_em) : '—'], ['Site gerado em', data(H.geradoEm)]].forEach(function (k) {
    var b = el('div', 'hist-kpi'); b.appendChild(el('span', 'kpi-rot', k[0])); b.appendChild(el('strong', null, k[1])); r.appendChild(b);
  });

  ciclos.forEach(function (c) {
    var sites = sitesDe(c);
    var cont = { completo: 0, parcial: 0, erro: 0 };
    var b429 = false;
    sites.forEach(function (s) { cont[s.status] = (cont[s.status] || 0) + 1; if (s.bloqueio === '429') b429 = true; });
    var li = el('li', 'ciclo');
    var det = el('details');
    var sum = el('summary');
    var topo = el('div', 'ciclo-topo');
    topo.appendChild(el('strong', 'ciclo-data', data(c.iniciado_em)));
    var st = cont.erro ? 'erro' : cont.parcial ? 'parcial' : 'completo';
    topo.appendChild(selo(st, cont.erro || cont.parcial ? (cont.erro ? 'Com erros' : 'Parcial') : 'Completo'));
    if (b429) topo.appendChild(selo('erro', '429'));
    if (c.origem) topo.appendChild(el('span', 'ciclo-origem', c.origem));
    sum.appendChild(topo);
    var m = el('div', 'ciclo-metricas');
    [['Duração', dur(c.duracao_ms != null ? c.duracao_ms : Date.parse(c.concluido_em) - Date.parse(c.iniciado_em))],
     ['Itens', c.total_itens != null ? n(c.total_itens) : '—'], ['Novos', n(c.novos_detectados)],
     ['Removidos', c.removidos != null ? n(c.removidos) : '—'], ['Erros', n((c.erros || []).length)],
     ['Sites', Array.isArray(c.detalhes) ? cont.completo + ' ok · ' + cont.parcial + ' parc. · ' + cont.erro + ' erro' : '—']
    ].forEach(function (k) { var d = el('span'); d.appendChild(el('small', null, k[0])); d.appendChild(el('b', null, k[1])); m.appendChild(d); });
    sum.appendChild(m);
    det.appendChild(sum);
    var corpo = el('div', 'ciclo-corpo');
    if (!Array.isArray(c.detalhes)) corpo.appendChild(el('p', 'nota', 'Ciclo antigo: detalhes por site não foram registrados.' + (sites.length ? '' : ' Nenhum erro.')));
    if (sites.length) {
      var t = el('table', 'tab-sites');
      var h = el('tr'); ['Site', 'Status', 'Itens', 'Novos', 'Removidos', 'Tempo', 'Observações'].forEach(function (x) { h.appendChild(el('th', null, x)); });
      var thead = el('thead'); thead.appendChild(h); t.appendChild(thead);
      var tb = el('tbody');
      sites.forEach(function (s) {
        var tr = el('tr');
        tr.appendChild(el('td', 'c-site', s.site));
        var tdS = el('td'); tdS.setAttribute('data-rot', 'Status'); tdS.appendChild(selo(s.status)); if (s.bloqueio) tdS.appendChild(selo('erro', s.bloqueio)); tr.appendChild(tdS);
        [['Itens', s.antigo ? '—' : n(s.itens)], ['Novos', s.antigo ? '—' : n(s.novos)], ['Removidos', s.antigo ? '—' : n(s.ausentes)], ['Tempo', s.antigo ? '—' : dur(s.ms)]]
          .forEach(function (k) { var td = el('td', 'c-num', k[1]); td.setAttribute('data-rot', k[0]); tr.appendChild(td); });
        var obs = [s.motivo].concat(s.erros || []).filter(Boolean);
        var o = el('td', 'c-obs', obs.length ? obs.filter(function (v, i) { return obs.indexOf(v) === i; }).join(' · ') : '—');
        o.setAttribute('data-rot', 'Observações'); tr.appendChild(o);
        tb.appendChild(tr);
      });
      t.appendChild(tb); corpo.appendChild(t);
    }
    det.appendChild(corpo);
    li.appendChild(det);
    lista.appendChild(li);
  });
  var first = lista.querySelector('details'); if (first) first.open = true;
})();
