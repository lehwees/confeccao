const state = {
  movimentos: [],
  tipoAtual: 'saida',
  weekRef: new Date(),
  selectedCostureiro: null
};

const firebaseConfig = {
  apiKey: "AIzaSyCdMKCOmZTOSqxEtVhjsWCNJ9TmuPbXLxE",
  authDomain: "confeccao-7fc5e.firebaseapp.com",
  projectId: "confeccao-7fc5e",
  storageBucket: "confeccao-7fc5e.firebasestorage.app",
  messagingSenderId: "751617195260",
  appId: "1:751617195260:web:58119bf625431f09222b79"
};

let useCloud = false;
let docRef = null;
let auth = null;

function setSyncStatus(status){
  const el = document.getElementById('syncStatus');
  if(!el) return;
  const map = {
    local: 'Salvando só neste aparelho',
    conectando: 'Conectando à nuvem…',
    online: 'Sincronizado ✓',
    erro: 'Erro de conexão — salvando local'
  };
  el.textContent = map[status] || status;
}

function showApp(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appMain').style.display = 'block';
  document.getElementById('logoutBtn').style.display = useCloud ? 'inline-block' : 'none';
}
function showLogin(){
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appMain').style.display = 'none';
}

function attachFirestoreListener(){
  docRef.onSnapshot(snap=>{
    state.movimentos = (snap.exists && snap.data().movimentos) ? snap.data().movimentos : [];
    setSyncStatus('online');
    render();
  }, err=>{
    console.error('Erro Firestore', err);
    setSyncStatus('erro');
  });
}

function initCloud(){
  if(!firebaseConfig.apiKey || firebaseConfig.apiKey === 'SUA_API_KEY_AQUI'){
    useCloud = false;
    setSyncStatus('local');
    showApp();
    loadLocal();
    return;
  }
  try{
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    const db = firebase.firestore();
    docRef = db.collection('atelie').doc('dados');
    useCloud = true;

    auth.onAuthStateChanged(user=>{
      if(user){
        showApp();
        setSyncStatus('conectando');
        attachFirestoreListener();
      } else {
        showLogin();
      }
    });
  }catch(e){
    console.error('Erro ao iniciar Firebase', e);
    useCloud = false;
    setSyncStatus('local');
    showApp();
    loadLocal();
  }
}

function loadLocal(){
  try{
    const raw = localStorage.getItem('ficha_atelie_movimentos');
    state.movimentos = raw ? JSON.parse(raw) : [];
  }catch(e){
    state.movimentos = [];
  }
  render();
}

async function saveData(){
  if(useCloud && docRef){
    try{
      await docRef.set({movimentos: state.movimentos}, {merge:true});
      return;
    }catch(e){
      console.error('Falha ao salvar na nuvem, salvando local', e);
    }
  }
  try{
    localStorage.setItem('ficha_atelie_movimentos', JSON.stringify(state.movimentos));
  }catch(e){
    console.error('Falha ao salvar', e);
  }
}

function loadData(){
  initCloud();
}

function toISODate(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseISO(s){ return new Date(s+'T12:00:00'); }
function formatBR(d){
  const day=String(d.getDate()).padStart(2,'0'), m=String(d.getMonth()+1).padStart(2,'0'), y=d.getFullYear();
  return `${day}/${m}/${y}`;
}
function formatMoney(v){
  return 'R$ ' + (v||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function movValorDisplay(m){
  return m.tipo==='saida' ? '–' : formatMoney((m.valorUnit||0)*m.qtd);
}
function formatSaldo(pend){
  if(pend>0) return '-'+pend;
  if(pend<0) return '+'+Math.abs(pend);
  return '0';
}
function getWeekRange(ref){
  const d = new Date(ref); d.setHours(12,0,0,0);
  const dow = d.getDay();
  const diff = dow===0 ? -6 : 1-dow;
  const start = new Date(d); start.setDate(d.getDate()+diff); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999);
  return {start,end};
}

function weekMovs(){
  const {start,end} = getWeekRange(state.weekRef);
  return state.movimentos.filter(m=>{
    const d = parseISO(m.data);
    return d>=start && d<=end;
  });
}

function render(){
  const {start,end} = getWeekRange(state.weekRef);
  document.getElementById('weekRange').textContent = `${formatBR(start)} – ${formatBR(end)}`;

  const names = [...new Set(state.movimentos.map(m=>m.nome))].sort();
  const dl = document.getElementById('nomesList');
  dl.innerHTML = names.map(n=>`<option value="${escapeHtml(n)}">`).join('');

  renderPersonList();
  renderPersonDetail();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderSummary(){
  const movs = weekMovs();
  const grid = document.getElementById('summaryGrid');
  if(movs.length===0){
    grid.innerHTML = `<div class="empty">Nenhum movimento registrado nesta semana.</div>`;
    return;
  }
  const byName = {};
  let totalLevou=0, totalTrouxe=0;
  movs.forEach(m=>{
    if(!byName[m.nome]) byName[m.nome] = {levou:0, trouxe:0};
    if(m.tipo==='saida'){ byName[m.nome].levou += m.qtd; totalLevou += m.qtd; }
    else { byName[m.nome].trouxe += m.qtd; totalTrouxe += m.qtd; }
  });
  const names = Object.keys(byName).sort();
  let html = '';
  names.forEach(n=>{
    const s = byName[n];
    const pend = s.levou - s.trouxe;
    const pct = s.levou>0 ? Math.min(100, Math.round((s.trouxe/s.levou)*100)) : 0;
    html += `<div class="spool">
      <div class="name">${escapeHtml(n)}</div>
      <div class="stats"><span>Saída: ${s.levou}</span><span>Entrada: ${s.trouxe}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="pend ${pend>0?'pos':'zero'}">${pend>0 ? `Pendente: ${pend}` : 'Em dia'}</div>
    </div>`;
  });
  const pendGeral = totalLevou - totalTrouxe;
  html += `<div class="spool total">
    <div class="name">Total geral</div>
    <div class="stats"><span>Saída: ${totalLevou}</span><span>Entrada: ${totalTrouxe}</span></div>
    <div class="bar"><div class="bar-fill" style="width:${totalLevou>0?Math.min(100,Math.round((totalTrouxe/totalLevou)*100)):0}%"></div></div>
    <div class="pend">${pendGeral>0?`Pendente: ${pendGeral}`:'Tudo devolvido'}</div>
  </div>`;
  grid.innerHTML = html;
}

function productTotals(movs){
  const byProd = {};
  movs.forEach(m=>{
    const tam = (m.tamanho||'').trim();
    const cor = (m.cor||'').trim();
    const key = [m.pedido.trim().toLowerCase(), tam.toLowerCase(), cor.toLowerCase()].join('|');
    if(!byProd[key]){
      const labelParts = [m.pedido.trim()];
      if(tam) labelParts.push(tam);
      if(cor) labelParts.push(cor);
      byProd[key] = {label:labelParts.join(' — '), levou:0, trouxe:0, valorPagar:0};
    }
    if(m.tipo==='saida'){
      byProd[key].levou += m.qtd;
    } else {
      byProd[key].trouxe += m.qtd;
      byProd[key].valorPagar += (m.valorUnit||0)*m.qtd;
    }
  });
  return Object.values(byProd).sort((a,b)=>a.label.localeCompare(b.label));
}

function renderProducts(){
  const movs = weekMovs();
  const wrap = document.getElementById('productsWrap');
  const prods = productTotals(movs);
  if(prods.length===0){
    wrap.innerHTML = `<div class="empty">Sem produtos registrados nesta semana.</div>`;
    return;
  }
  let totalLevou=0, totalTrouxe=0, totalValor=0;
  let rows = prods.map(p=>{
    totalLevou += p.levou; totalTrouxe += p.trouxe; totalValor += p.valorPagar;
    const pend = p.levou - p.trouxe;
    return `<tr>
      <td>${escapeHtml(p.label)}</td>
      <td>${p.levou}</td>
      <td>${p.trouxe}</td>
      <td>${pend}</td>
      <td>${formatMoney(p.valorPagar)}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<div style="overflow-x:auto;"><table class="entries">
    <thead><tr><th>Produto</th><th>Saída</th><th>Entrada</th><th>Pendente</th><th>Valor a pagar</th></tr></thead>
    <tbody>${rows}</tbody>
    <tbody><tr style="font-weight:600;background:var(--cream);">
      <td>Total geral</td><td>${totalLevou}</td><td>${totalTrouxe}</td><td>${totalLevou-totalTrouxe}</td><td>${formatMoney(totalValor)}</td>
    </tr></tbody>
  </table></div>`;
}

function renderEntries(){
  const movs = weekMovs().slice().sort((a,b)=> (b.data+b.criadoEm).localeCompare(a.data+a.criadoEm));
  const wrap = document.getElementById('entriesWrap');
  if(movs.length===0){
    wrap.innerHTML = `<div class="empty">Sem movimentos nesta semana ainda. Registre ao lado.</div>`;
    return;
  }
  let rows = movs.map(m=>`
    <tr>
      <td>${formatBR(parseISO(m.data))}</td>
      <td>${escapeHtml(m.nome)}</td>
      <td>${escapeHtml(m.pedido)}</td>
      <td>${escapeHtml(m.tamanho||'-')}</td>
      <td>${escapeHtml(m.cor||'-')}</td>
      <td>${m.qtd}</td>
      <td>${movValorDisplay(m)}</td>
      <td><span class="badge ${m.tipo}">${m.tipo==='saida'?'Saída':'Entrada'}</span></td>
      <td><button class="delbtn" data-id="${m.id}" title="Excluir">✕</button></td>
    </tr>`).join('');
  wrap.innerHTML = `<div style="overflow-x:auto;"><table class="entries">
    <thead><tr><th>Data</th><th>Costureiro</th><th>Pedido</th><th>Tam.</th><th>Cor</th><th>Qtd</th><th>Valor</th><th>Tipo</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
  wrap.querySelectorAll('.delbtn').forEach(btn=>{
    btn.addEventListener('click', ()=> deleteMov(btn.dataset.id));
  });
}

function costureiroTotals(movs){
  const byName = {};
  movs.forEach(m=>{
    if(!byName[m.nome]) byName[m.nome] = {levou:0, trouxe:0, valorPagar:0};
    if(m.tipo==='saida'){
      byName[m.nome].levou += m.qtd;
    } else {
      byName[m.nome].trouxe += m.qtd;
      byName[m.nome].valorPagar += (m.valorUnit||0)*m.qtd;
    }
  });
  return Object.keys(byName).sort().map(n=>({nome:n, levou:byName[n].levou, trouxe:byName[n].trouxe, valorPagar:byName[n].valorPagar}));
}

function renderPersonTotals(){
  const wrap = document.getElementById('personTotalsWrap');
  const totals = costureiroTotals(state.movimentos);
  if(totals.length===0){
    wrap.innerHTML = `<div class="empty">Nenhum costureiro cadastrado ainda.</div>`;
    return;
  }
  let totalLevou=0, totalTrouxe=0, totalValor=0;
  let rows = totals.map(t=>{
    totalLevou += t.levou; totalTrouxe += t.trouxe; totalValor += t.valorPagar;
    const pend = t.levou - t.trouxe;
    return `<tr>
      <td>${escapeHtml(t.nome)}</td>
      <td>${t.levou}</td>
      <td>${t.trouxe}</td>
      <td style="color:${pend>0?'var(--thread)':'var(--ok)'};font-weight:600;">${formatSaldo(pend)}</td>
      <td style="font-weight:600;">${formatMoney(t.valorPagar)}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<div style="overflow-x:auto;"><table class="entries" style="margin-bottom:20px;">
    <thead><tr><th>Costureiro</th><th>Saída (total)</th><th>Entrada (total)</th><th>Pendente</th><th>Valor a pagar</th></tr></thead>
    <tbody>${rows}</tbody>
    <tbody><tr style="font-weight:600;background:var(--cream);">
      <td>Total geral</td><td>${totalLevou}</td><td>${totalTrouxe}</td><td>${totalLevou-totalTrouxe}</td><td>${formatMoney(totalValor)}</td>
    </tr></tbody>
  </table></div>`;
}

function buildTotalsPrintReport(){
  const totals = costureiroTotals(state.movimentos);
  let totalLevou=0, totalTrouxe=0, totalValor=0;
  let rows = totals.map(t=>{
    totalLevou += t.levou; totalTrouxe += t.trouxe; totalValor += t.valorPagar;
    return `<tr><td>${escapeHtml(t.nome)}</td><td>${t.levou}</td><td>${t.trouxe}</td><td>${t.levou-t.trouxe}</td><td>${formatMoney(t.valorPagar)}</td></tr>`;
  }).join('') || `<tr><td colspan="5">Sem dados.</td></tr>`;

  document.getElementById('printReport').innerHTML = `
    <h1>Total geral por costureiro</h1>
    <div class="sub">Todas as semanas registradas — impresso em ${formatBR(new Date())}</div>
    <table>
      <thead><tr><th>Costureiro</th><th>Saída</th><th>Entrada</th><th>Pendente</th><th>Valor a pagar</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total geral</td><td>${totalLevou}</td><td>${totalTrouxe}</td><td>${totalLevou-totalTrouxe}</td><td>${formatMoney(totalValor)}</td></tr></tfoot>
    </table>
  `;
}

document.getElementById('printMenuBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  document.getElementById('printMenu').classList.toggle('open');
});
document.addEventListener('click', ()=>{
  document.getElementById('printMenu').classList.remove('open');
});
document.getElementById('printMenu').addEventListener('click', (e)=> e.stopPropagation());

document.querySelector('[data-action="relatorio"]').addEventListener('click', ()=>{
  buildPrintReport();
  document.getElementById('printMenu').classList.remove('open');
  window.print();
});
document.querySelector('[data-action="totais"]').addEventListener('click', ()=>{
  buildTotalsPrintReport();
  document.getElementById('printMenu').classList.remove('open');
  window.print();
});
document.querySelector('[data-action="cupom"]').addEventListener('click', ()=>{
  const width = document.getElementById('paperWidth').value;
  const chars = parseInt(width, 10);
  document.getElementById('receiptText').textContent = buildReceiptText(chars);
  document.body.classList.add('print-receipt');
  setReceiptPageStyle(true, width);
  document.getElementById('printMenu').classList.remove('open');
  window.print();
});
window.addEventListener('afterprint', ()=>{
  document.body.classList.remove('print-receipt');
  setReceiptPageStyle(false);
});

async function deleteMov(id){
  state.movimentos = state.movimentos.filter(m=>m.id!==id);
  await saveData();
  render();
}

const AVATAR_COLORS = ['#B33A3A','#2E4057','#D4A017','#4C7A52','#7C5A9B','#C06C2E'];
function avatarColor(name){
  let hash=0;
  for(let i=0;i<name.length;i++) hash = name.charCodeAt(i) + ((hash<<5)-hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function initials(name){
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0]||'') + (parts[1]?.[0]||'')).toUpperCase();
}

function renderPersonList(){
  const names = [...new Set(state.movimentos.map(m=>m.nome))].sort();
  const wrap = document.getElementById('personList');
  if(names.length===0){
    wrap.innerHTML = `<div class="empty">Nenhum costureiro cadastrado ainda.</div>`;
    return;
  }
  wrap.innerHTML = names.map(n=>`
    <button type="button" class="person-chip ${state.selectedCostureiro===n?'active':''}" data-name="${escapeHtml(n)}">
      <span class="avatar" style="background:${avatarColor(n)}">${initials(n)}</span>
      ${escapeHtml(n)}
    </button>
  `).join('');
  wrap.querySelectorAll('.person-chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.selectedCostureiro = state.selectedCostureiro===btn.dataset.name ? null : btn.dataset.name;
      renderPersonList();
      renderPersonDetail();
    });
  });
}

function personMovs(name){
  return state.movimentos.filter(m=>m.nome===name).slice().sort((a,b)=> (b.data+b.criadoEm).localeCompare(a.data+a.criadoEm));
}

function renderPersonDetail(){
  const el = document.getElementById('personDetail');
  const name = state.selectedCostureiro;
  if(!name){
    el.innerHTML = '';
    return;
  }
  const movs = personMovs(name);
  let levou=0, trouxe=0, valorPagar=0;
  movs.forEach(m=>{
    if(m.tipo==='saida'){ levou+=m.qtd; }
    else { trouxe+=m.qtd; valorPagar += (m.valorUnit||0)*m.qtd; }
  });
  const pend = levou-trouxe;

  const prods = productTotals(movs);
  let prodRows = prods.map(p=>{
    const pPend = p.levou - p.trouxe;
    return `<tr>
      <td>${escapeHtml(p.label)}</td>
      <td>${p.levou}</td>
      <td>${p.trouxe}</td>
      <td>${formatSaldo(pPend)}</td>
      <td>${formatMoney(p.valorPagar)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5">Sem produtos registrados.</td></tr>`;

  let entryRows = movs.map(m=>`
    <tr>
      <td>${formatBR(parseISO(m.data))}</td>
      <td>${escapeHtml(m.pedido)}</td>
      <td>${escapeHtml(m.tamanho||'-')}</td>
      <td>${escapeHtml(m.cor||'-')}</td>
      <td>${m.qtd}</td>
      <td>${movValorDisplay(m)}</td>
      <td><span class="badge ${m.tipo}">${m.tipo==='saida'?'Saída':'Entrada'}</span></td>
      <td><button class="delbtn" data-id="${m.id}" title="Excluir">✕</button></td>
    </tr>`).join('') || `<tr><td colspan="8">Sem movimentos registrados.</td></tr>`;

  el.innerHTML = `<div class="person-panel">
    <h3>Perfil: ${escapeHtml(name)} — <span class="pend-inline">Saldo pendente: ${pend}</span></h3>
    <div class="stats-row">
      <div class="stat">Total de saídas<b>${levou}</b></div>
      <div class="stat">Total de entradas<b>${trouxe}</b></div>
      <div class="stat">Saldo pendente<b style="color:${pend>0?'var(--thread)':'var(--ok)'}">${pend}</b></div>
      <div class="stat">Valor a pagar<b>${formatMoney(valorPagar)}</b></div>
    </div>
    <div style="overflow-x:auto;"><table class="entries">
      <thead><tr><th>Produto</th><th>Qtd. saída</th><th>Qtd. entrada</th><th>Saldo</th><th>Valor a pagar</th></tr></thead>
      <tbody>${prodRows}</tbody>
    </table></div>
    <button type="button" class="section-toggle" id="toggleHistBtn">Ver histórico detalhado ▾</button>
    <div id="histWrap" style="display:none;overflow-x:auto;">
      <table class="entries">
        <thead><tr><th>Data</th><th>Pedido</th><th>Tam.</th><th>Cor</th><th>Qtd</th><th>Valor</th><th>Tipo</th><th></th></tr></thead>
        <tbody>${entryRows}</tbody>
      </table>
    </div>
    <button class="printbtn" style="margin-top:12px;" id="printPersonBtn">🖨 Imprimir ficha de ${escapeHtml(name)}</button>
  </div>`;

  document.getElementById('toggleHistBtn').addEventListener('click', (e)=>{
    const histWrap = document.getElementById('histWrap');
    const open = histWrap.style.display !== 'none';
    histWrap.style.display = open ? 'none' : 'block';
    e.target.textContent = open ? 'Ver histórico detalhado ▾' : 'Ocultar histórico detalhado ▴';
  });

  el.querySelectorAll('.delbtn').forEach(btn=>{
    btn.addEventListener('click', ()=> deleteMov(btn.dataset.id));
  });

  document.getElementById('printPersonBtn').addEventListener('click', ()=>{
    buildPersonPrintReport(name);
    window.print();
  });
}

function buildPersonPrintReport(name){
  const movs = personMovs(name).slice().sort((a,b)=> a.data.localeCompare(b.data));
  let levou=0, trouxe=0, valorPagar=0;
  movs.forEach(m=>{
    if(m.tipo==='saida'){ levou+=m.qtd; }
    else { trouxe+=m.qtd; valorPagar += (m.valorUnit||0)*m.qtd; }
  });

  const prods = productTotals(movs);
  let prodRows = prods.map(p=>{
    const pPend = p.levou - p.trouxe;
    return `<tr><td>${escapeHtml(p.label)}</td><td>${p.levou}</td><td>${p.trouxe}</td><td>${formatSaldo(pPend)}</td><td>${formatMoney(p.valorPagar)}</td></tr>`;
  }).join('') || `<tr><td colspan="5">Sem produtos registrados.</td></tr>`;

  let rows = movs.map(m=>`<tr>
    <td>${formatBR(parseISO(m.data))}</td>
    <td>${escapeHtml(m.pedido)}</td>
    <td>${escapeHtml(m.tamanho||'-')}</td>
    <td>${escapeHtml(m.cor||'-')}</td>
    <td>${m.qtd}</td>
    <td>${movValorDisplay(m)}</td>
    <td>${m.tipo==='saida'?'Saída':'Entrada'}</td>
  </tr>`).join('') || `<tr><td colspan="7">Sem movimentos registrados.</td></tr>`;

  document.getElementById('printReport').innerHTML = `
    <h1>Ficha do costureiro — ${escapeHtml(name)}</h1>
    <div class="sub">Histórico completo — impresso em ${formatBR(new Date())}</div>
    <h2>Por produto</h2>
    <table>
      <thead><tr><th>Produto</th><th>Saída</th><th>Entrada</th><th>Saldo</th><th>Valor a pagar</th></tr></thead>
      <tbody>${prodRows}</tbody>
    </table>
    <h2>Histórico detalhado</h2>
    <table>
      <thead><tr><th>Data</th><th>Pedido</th><th>Tam.</th><th>Cor</th><th>Qtd</th><th>Valor</th><th>Tipo</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td>Saída: ${levou}</td><td colspan="2">Entrada: ${trouxe}</td></tr></tfoot>
    </table>
    <p style="font-family:'IBM Plex Mono',monospace;font-size:13px;">Pendente: ${levou-trouxe} &nbsp;|&nbsp; Valor a pagar: ${formatMoney(valorPagar)}</p>
  `;
}

function updateValorFieldVisibility(){
  const valorField = document.getElementById('valorField');
  const isEntrada = state.tipoAtual === 'retorno';
  valorField.style.display = isEntrada ? 'block' : 'none';
  if(!isEntrada) document.getElementById('valorUnit').value = '';
}

document.querySelectorAll('.seg-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.tipoAtual = btn.dataset.tipo;
    updateValorFieldVisibility();
  });
});
updateValorFieldVisibility();

document.getElementById('addBtn').addEventListener('click', async ()=>{
  const nome = document.getElementById('nome').value.trim();
  const pedido = document.getElementById('pedido').value.trim();
  const tamanho = document.getElementById('tamanho').value.trim();
  const cor = document.getElementById('cor').value.trim();
  const qtd = parseInt(document.getElementById('qtd').value, 10);
  const valorUnit = parseFloat(document.getElementById('valorUnit').value) || 0;
  const dataVal = document.getElementById('data').value;
  const errEl = document.getElementById('errMsg');

  if(!nome || !pedido || !qtd || qtd<=0 || !dataVal){
    errEl.textContent = 'Preencha nome, pedido, quantidade e data.';
    return;
  }
  errEl.textContent = '';

  state.movimentos.push({
    id: 'm_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    nome, pedido, tamanho, cor, qtd, valorUnit, data: dataVal, tipo: state.tipoAtual,
    criadoEm: new Date().toISOString()
  });
  await saveData();

  document.getElementById('pedido').value='';
  document.getElementById('tamanho').value='';
  document.getElementById('cor').value='';
  document.getElementById('qtd').value='';
  document.getElementById('valorUnit').value='';
  render();
});

document.getElementById('prevWeek').addEventListener('click', ()=>{
  state.weekRef.setDate(state.weekRef.getDate()-7);
  render();
});
document.getElementById('nextWeek').addEventListener('click', ()=>{
  state.weekRef.setDate(state.weekRef.getDate()+7);
  render();
});
document.getElementById('thisWeek').addEventListener('click', ()=>{
  state.weekRef = new Date();
  render();
});

function center(text, width){
  text = String(text);
  if(text.length>=width) return text.slice(0,width);
  const pad = width-text.length;
  const left = Math.floor(pad/2);
  return ' '.repeat(left)+text+' '.repeat(pad-left);
}
function truncate(text, width){
  text = String(text);
  return text.length>width ? text.slice(0,width-1)+'.' : text;
}
function padBetween(left, right, width){
  left = String(left); right = String(right);
  const gap = Math.max(1, width-left.length-right.length);
  return left + ' '.repeat(gap) + right;
}

function buildReceiptText(width){
  const {start,end} = getWeekRange(state.weekRef);
  const movs = weekMovs();
  const byName = {};
  let totalLevou=0, totalTrouxe=0, totalValor=0;
  movs.forEach(m=>{
    if(!byName[m.nome]) byName[m.nome] = {levou:0, trouxe:0, valorPagar:0};
    if(m.tipo==='saida'){ byName[m.nome].levou += m.qtd; totalLevou += m.qtd; }
    else { byName[m.nome].trouxe += m.qtd; totalTrouxe += m.qtd; byName[m.nome].valorPagar += (m.valorUnit||0)*m.qtd; totalValor += (m.valorUnit||0)*m.qtd; }
  });
  const line = '-'.repeat(width);
  const out = [];
  out.push(center('ATELIE', width));
  out.push(center('RELATORIO SEMANAL', width));
  out.push(line);
  out.push('De: '+formatBR(start));
  out.push('Ate: '+formatBR(end));
  out.push(line);

  const names = Object.keys(byName).sort();
  if(names.length===0){
    out.push('Sem movimentos nesta');
    out.push('semana.');
  } else {
    names.forEach(n=>{
      const s = byName[n];
      const pend = s.levou - s.trouxe;
      out.push(truncate(n.toUpperCase(), width));
      out.push(padBetween('Saida', s.levou, width));
      out.push(padBetween('Entrada', s.trouxe, width));
      out.push(padBetween('Pendente', pend, width));
      out.push(padBetween('Valor a pagar', formatMoney(s.valorPagar), width));
      out.push(line);
    });
  }

  out.push(padBetween('TOTAL SAIDA', totalLevou, width));
  out.push(padBetween('TOTAL ENTRADA', totalTrouxe, width));
  out.push(padBetween('PENDENTE GERAL', totalLevou-totalTrouxe, width));
  out.push(padBetween('VALOR A PAGAR', formatMoney(totalValor), width));
  out.push(line);

  const prods = productTotals(movs);
  if(prods.length>0){
    out.push(center('POR PRODUTO', width));
    out.push(line);
    prods.forEach(p=>{
      out.push(truncate(p.label.toUpperCase(), width));
      out.push(padBetween('Saida', p.levou, width));
      out.push(padBetween('Entrada', p.trouxe, width));
      out.push(padBetween('Pendente', p.levou-p.trouxe, width));
      out.push(padBetween('Valor', formatMoney(p.valorPagar), width));
      out.push(line);
    });
  }
  out.push(center('Impresso em', width));
  out.push(center(formatBR(new Date()), width));
  out.push('');
  out.push('');
  return out.join('\n');
}

function setReceiptPageStyle(on, width){
  let el = document.getElementById('receiptPageStyle');
  if(on){
    if(!el){
      el = document.createElement('style');
      el.id = 'receiptPageStyle';
      document.head.appendChild(el);
    }
    const mm = width==='32' ? '58mm' : '80mm';
    el.textContent = `@page{size:${mm} auto;margin:2mm;}`;
  } else if(el){
    el.remove();
  }
}

function buildPrintReport(){
  const {start,end} = getWeekRange(state.weekRef);
  const movs = weekMovs().slice().sort((a,b)=> a.nome.localeCompare(b.nome) || a.data.localeCompare(b.data));
  const byName = {};
  let totalLevou=0, totalTrouxe=0, totalValor=0;
  movs.forEach(m=>{
    if(!byName[m.nome]) byName[m.nome] = {levou:0, trouxe:0, valorPagar:0};
    if(m.tipo==='saida'){ byName[m.nome].levou += m.qtd; totalLevou += m.qtd; }
    else { byName[m.nome].trouxe += m.qtd; totalTrouxe += m.qtd; byName[m.nome].valorPagar += (m.valorUnit||0)*m.qtd; totalValor += (m.valorUnit||0)*m.qtd; }
  });

  let detailRows = movs.map(m=>`<tr>
    <td>${formatBR(parseISO(m.data))}</td>
    <td>${escapeHtml(m.nome)}</td>
    <td>${escapeHtml(m.pedido)}</td>
    <td>${escapeHtml(m.tamanho||'-')}</td>
    <td>${escapeHtml(m.cor||'-')}</td>
    <td>${m.qtd}</td>
    <td>${movValorDisplay(m)}</td>
    <td>${m.tipo==='saida'?'Saída':'Entrada'}</td>
  </tr>`).join('') || `<tr><td colspan="8">Sem movimentos registrados.</td></tr>`;

  let summaryRows = Object.keys(byName).sort().map(n=>{
    const s = byName[n];
    const pend = s.levou - s.trouxe;
    return `<tr><td>${escapeHtml(n)}</td><td>${s.levou}</td><td>${s.trouxe}</td><td>${pend}</td><td>${formatMoney(s.valorPagar)}</td></tr>`;
  }).join('') || `<tr><td colspan="5">Sem dados.</td></tr>`;

  const prods = productTotals(movs);
  let prodTotalLevou=0, prodTotalTrouxe=0, prodTotalValor=0;
  let productRows = prods.map(p=>{
    prodTotalLevou += p.levou; prodTotalTrouxe += p.trouxe; prodTotalValor += p.valorPagar;
    return `<tr><td>${escapeHtml(p.label)}</td><td>${p.levou}</td><td>${p.trouxe}</td><td>${p.levou-p.trouxe}</td><td>${formatMoney(p.valorPagar)}</td></tr>`;
  }).join('') || `<tr><td colspan="5">Sem dados.</td></tr>`;

  document.getElementById('printReport').innerHTML = `
    <h1>Relatório semanal — Ateliê</h1>
    <div class="sub">Semana de ${formatBR(start)} a ${formatBR(end)} — impresso em ${formatBR(new Date())}</div>

    <h2>Resumo por costureiro</h2>
    <table>
      <thead><tr><th>Costureiro</th><th>Saída</th><th>Entrada</th><th>Pendente</th><th>Valor a pagar</th></tr></thead>
      <tbody>${summaryRows}</tbody>
      <tfoot><tr><td>Total geral</td><td>${totalLevou}</td><td>${totalTrouxe}</td><td>${totalLevou-totalTrouxe}</td><td>${formatMoney(totalValor)}</td></tr></tfoot>
    </table>

    <h2>Total por produto</h2>
    <table>
      <thead><tr><th>Produto</th><th>Saída</th><th>Entrada</th><th>Pendente</th><th>Valor a pagar</th></tr></thead>
      <tbody>${productRows}</tbody>
      <tfoot><tr><td>Total geral</td><td>${prodTotalLevou}</td><td>${prodTotalTrouxe}</td><td>${prodTotalLevou-prodTotalTrouxe}</td><td>${formatMoney(prodTotalValor)}</td></tr></tfoot>
    </table>

    <h2>Detalhamento dos movimentos</h2>
    <table>
      <thead><tr><th>Data</th><th>Costureiro</th><th>Pedido</th><th>Tam.</th><th>Cor</th><th>Qtd</th><th>Valor</th><th>Tipo</th></tr></thead>
      <tbody>${detailRows}</tbody>
    </table>
  `;
}

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try{
    await auth.signInWithEmailAndPassword(email, pass);
  }catch(err){
    errEl.textContent = 'E-mail ou senha incorretos.';
  }
});

document.getElementById('logoutBtn').addEventListener('click', ()=>{
  if(auth) auth.signOut();
});

document.getElementById('data').value = toISODate(new Date());
loadData();
