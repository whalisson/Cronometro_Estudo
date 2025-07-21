// script.js - Cronômetro de Estudos com Pomodoro, Notificações e Gráficos

// --- Variáveis do timer ---
let startTime = null;
let elapsedBefore = 0;
let running = false;
let timerInterval;

// --- Elementos do DOM ---
const display           = document.getElementById('display');
const studyTable        = document.getElementById('studyTable');
const yearSelector      = document.getElementById('yearSelector');
const calendarContainer = document.getElementById('calendarContainer');

// --- Dados de estudo ---
let studyData       = [0,0,0,0,0,0,0];
let studyDataDetail = JSON.parse(localStorage.getItem('studyDataDetail')) || {};

// --- Pomodoro Configuração ---
const pomodoroFocusInput = document.getElementById('pomodoroFocus');
const pomodoroBreakInput = document.getElementById('pomodoroBreak');
const btnTogglePomodoro  = document.getElementById('btnTogglePomodoro');
const btnStartPomodoro   = document.getElementById('btnStartPomodoro');
const pomodoroConfig     = { focusDuration:25*60, breakDuration:5*60, cycles:4 };
let pomodoroMode         = false;
let currentCycle         = 0;
let isOnBreak            = false;
let pomodoroTimer;

// --- Solicita permissão de notificações desktop ---
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// ===== Helpers de data =====
function parseLocalDate(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d);
}
function getStartOfWeek(date) {
  const day = date.getDay();
  const diff = date.getDate() - day;
  return new Date(date.getFullYear(), date.getMonth(), diff);
}

// ===== Recalcular dados da semana atual =====
function recalcularStudyData() {
  studyData = [0,0,0,0,0,0,0];
  const today = new Date();
  const weekStart = getStartOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate()+6);
  for (const key in studyDataDetail) {
    if (key.endsWith('_pomodoro')) continue;
    const d = parseLocalDate(key);
    if (d >= weekStart && d <= weekEnd) {
      studyData[d.getDay()] += studyDataDetail[key];
    }
  }
}
recalcularStudyData();

// ===== Formatar segundos em HH:MM:SS =====
function formatTime(sec) {
  const h=Math.floor(sec/3600).toString().padStart(2,'0');
  const m=Math.floor((sec%3600)/60).toString().padStart(2,'0');
  const s=(sec%60).toString().padStart(2,'0');
  return `${h}:${m}:${s}`;
}

// ===== Timer padrão =====
function startTimer(){
  if(running) return;
  running=true;
  startTime=Date.now();
  timerInterval=setInterval(()=>{
    const elapsed=Math.floor((Date.now()-startTime)/1000)+elapsedBefore;
    display.textContent=formatTime(elapsed);
  },200);
}
function pauseTimer(){
  if(!running) return;
  running=false;
  clearInterval(timerInterval);
  clearInterval(pomodoroTimer);
  const elapsed=Math.floor((Date.now()-startTime)/1000);
  elapsedBefore+=elapsed;
  salvarTempoHoje(elapsed);
}
function resetTimer(){
  running=false;
  clearInterval(timerInterval);
  clearInterval(pomodoroTimer);
  startTime=null;
  elapsedBefore=0;
  display.textContent="00:00:00";
}

// ===== Salvar sessão normal =====
function salvarTempoHoje(segundos=elapsedBefore){
  if(segundos<=0) return;
  const hoje=new Date();
  const key=hoje.toISOString().slice(0,10);
  studyDataDetail[key]=(studyDataDetail[key]||0)+segundos/3600;
  localStorage.setItem('studyDataDetail', JSON.stringify(studyDataDetail));
  recalcularStudyData();
  atualizarTabela();
  atualizarCalendario();
  atualizarGraficos();
}

// ===== Editar tempo de hoje =====
function editarTempoHoje(){
  const hoje=new Date().toISOString().slice(0,10);
  const atual=studyDataDetail[hoje]||0;
  let entrada=prompt('Editar horas estudadas para hoje (decimal):', atual.toFixed(2));
  if(entrada===null) return;
  entrada=parseFloat(entrada);
  if(isNaN(entrada)||entrada<0){
    alert('Por favor insira um número válido.');
    return;
  }
  studyDataDetail[hoje]=entrada;
  localStorage.setItem('studyDataDetail', JSON.stringify(studyDataDetail));
  recalcularStudyData();
  atualizarTabela();
  atualizarCalendario();
  atualizarGraficos();
}

// ===== Remover tempo de hoje =====
function removerTempoHoje(){
  const hoje=new Date().toISOString().slice(0,10);
  if(studyDataDetail[hoje]!==undefined){
    delete studyDataDetail[hoje];
    localStorage.setItem('studyDataDetail', JSON.stringify(studyDataDetail));
    recalcularStudyData();
    atualizarTabela();
    atualizarCalendario();
    atualizarGraficos();
  } else {
    alert('Não há tempo registrado para hoje.');
  }
}

// ===== Pomodoro Config Persistência =====
function loadPomodoroStorage(){
  const focusMin = parseInt(localStorage.getItem('pomodoroFocus'));
  const breakMin = parseInt(localStorage.getItem('pomodoroBreak'));
  if(!isNaN(focusMin)&& focusMin>0){
    pomodoroConfig.focusDuration = focusMin*60;
    pomodoroFocusInput.value = focusMin;
  }
  if(!isNaN(breakMin)&& breakMin>0){
    pomodoroConfig.breakDuration = breakMin*60;
    pomodoroBreakInput.value = breakMin;
  }
  updatePomodoroButton();
}
function savePomodoroStorage(){
  localStorage.setItem('pomodoroFocus', pomodoroConfig.focusDuration/60);
  localStorage.setItem('pomodoroBreak', pomodoroConfig.breakDuration/60);
}
function updatePomodoroConfigFromInputs(){
  const foco = parseInt(pomodoroFocusInput.value);
  const descanso = parseInt(pomodoroBreakInput.value);
  if(!isNaN(foco)&&foco>0) pomodoroConfig.focusDuration = foco*60;
  if(!isNaN(descanso)&&descanso>0) pomodoroConfig.breakDuration = descanso*60;
  savePomodoroStorage();
  updatePomodoroButton();
}
function updatePomodoroButton(){
  btnStartPomodoro.textContent = `Iniciar Pomodoro (${pomodoroConfig.focusDuration/60}m foco / ${pomodoroConfig.breakDuration/60}m descanso)`;
}

// Ao mudar inputs, salvar e atualizar
pomodoroFocusInput.addEventListener('change', updatePomodoroConfigFromInputs);
pomodoroBreakInput.addEventListener('change', updatePomodoroConfigFromInputs);

// Carrega configurações ao iniciar
loadPomodoroStorage();

// ===== Pomodoro =====
btnTogglePomodoro.addEventListener('click', ()=>{
  pomodoroMode = !pomodoroMode;
  btnTogglePomodoro.textContent = pomodoroMode?'Desativar Pomodoro':'Ativar Pomodoro';
  clearInterval(timerInterval);
  clearInterval(pomodoroTimer);
  resetTimer();
});
btnStartPomodoro.addEventListener('click', ()=>{ if(pomodoroMode) startPomodoroCycle(); });

function startPomodoroCycle(){
  clearInterval(pomodoroTimer);
  const duration = isOnBreak?pomodoroConfig.breakDuration:pomodoroConfig.focusDuration;
  startTime=Date.now();
  elapsedBefore=0;
  running=true;
  pomodoroTimer=setInterval(()=>{
    const elapsed=Math.floor((Date.now()-startTime)/1000);
    display.textContent=formatTime(elapsed);
    if(elapsed>=duration){
      clearInterval(pomodoroTimer);
      onPomodoroEnd();
    }
  },500);
}
function onPomodoroEnd(){
  running=false;
  elapsedBefore=0;
  let title,body;
  if(!isOnBreak){
    title='Intervalo iniciado'; body=`Descanse por ${pomodoroConfig.breakDuration/60} minutos.`;
    salvarPomodoroSession(pomodoroConfig.focusDuration); currentCycle++;
  } else{
    title='Período de foco iniciado'; body=`Estude por ${pomodoroConfig.focusDuration/60} minutos.`;
  }
  if(Notification.permission==='granted') new Notification(title,{body});
  isOnBreak=!isOnBreak;
  if(currentCycle>=pomodoroConfig.cycles){
    alert(`Você completou ${pomodoroConfig.cycles} ciclos Pomodoro!`);
    currentCycle=0; isOnBreak=false; pomodoroMode=false;
    clearInterval(pomodoroTimer);
    btnTogglePomodoro.textContent='Ativar Pomodoro';
    resetTimer();
  } else { startPomodoroCycle(); }
}
function salvarPomodoroSession(segundos){
  const hoje=new Date();
  const key=hoje.toISOString().slice(0,10)+'_pomodoro';
  studyDataDetail[key]=(studyDataDetail[key]||0)+segundos/3600;
  localStorage.setItem('studyDataDetail', JSON.stringify(studyDataDetail));
  recalcularStudyData(); atualizarTabela(); atualizarCalendario(); atualizarGraficos();
}

// ===== Atualização da tabela =====
function atualizarTabela() {
  studyTable.querySelectorAll('tr:not(:first-child)').forEach(tr => tr.remove());
  const dias = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${dias[i]}</td><td>${studyData[i].toFixed(2)} h</td>`;
    studyTable.appendChild(tr);
    total += studyData[i];
  }
  const metaSemanal = parseFloat(document.getElementById('metaHoras').value) || 0;
  const pct = metaSemanal > 0 ? (total/metaSemanal)*100 : 0;
  const box = document.getElementById('totalSemana');
  box.textContent = `Total da semana: ${total.toFixed(2)} h`;
  box.className = 'total-semana-box';
  if      (pct <= 25) box.classList.add('meta-baixa');
  else if (pct <= 50) box.classList.add('meta-media-baixa');
  else if (pct <= 75) box.classList.add('meta-media-alta');
  else if (pct < 100) box.classList.add('meta-quase');
  else                box.classList.add('meta-completa');
}

// ===== Calendário e edição =====
function gerarCalendario(ano)     { /* ... */ }
function preencherAnoSelector()   { /* ... */ }
function atualizarCalendario()     { /* ... */ }

// ===== Gráficos =====
let charts = {};
function renderChart(id,label,labels,data) {
  const ctx = document.getElementById(id).getContext('2d');
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label, data, backgroundColor:'rgba(54,162,235,0.5)', borderColor:'rgba(54,162,235,1)', borderWidth:1, borderRadius:6 }]},
    options: { scales: { y:{ beginAtZero:true, title:{ display:true, text:'Horas' }}}}
  });
}

function atualizarGraficos() {
  const semana      = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const semanalData = semana.map((_,i)=>studyData[i]||0);
  const mensalData  = Array(12).fill(0);
  const anualData   = {};
  for (const key in studyDataDetail) {
    if (key.endsWith('_pomodoro')) continue;
    const dt = parseLocalDate(key);
    const h  = studyDataDetail[key]||0;
    mensalData[dt.getMonth()] += h;
    anualData[dt.getFullYear()] = (anualData[dt.getFullYear()]||0) + h;
  }
  // renderChart('chartSemanal','Desempenho Semanal', semana, semanalData);
  // renderChart('chartMensal','Desempenho Mensal', ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], mensalData);
  // renderChart('chartAnual','Desempenho Anual', Object.keys(anualData), Object.values(anualData));
  renderCumulativeWeeklyChart();
  renderHeatmap();
}

function renderCumulativeWeeklyChart() {
  const ctx = document.getElementById('chartAcumuladoSemanal').getContext('2d');
  const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const cumulative = studyData.map((_,i)=>studyData.slice(0,i+1).reduce((a,b)=>a+b,0));
  const metaSemanal = parseFloat(document.getElementById('metaHoras').value) || 0;
  const metaLine    = diasSemana.map((_,i)=>((i+1)*metaSemanal)/7);
  if (charts['chartAcumuladoSemanal']) charts['chartAcumuladoSemanal'].destroy();
  charts['chartAcumuladoSemanal'] = new Chart(ctx, {
    type: 'line',
    data: { labels:diasSemana, datasets:[
      { label:'Horas Acumuladas', data:cumulative, fill:false, tension:0.2 },
      { label:'Meta Semanal (cumulativa)', data:metaLine, fill:false, borderDash:[5,5] }
    ]},
    options:{ scales:{ y:{ beginAtZero:true, title:{ display:true, text:'Horas' }}}}
  });
}

function renderHeatmap() {
  const container = document.getElementById('heatmapContainer');
  container.innerHTML = '';
  const hoje     = new Date();
  const ano      = hoje.getFullYear();
  const mes      = hoje.getMonth();
  const diasNoMes= new Date(ano, mes+1,0).getDate();
  let maxH = 0;
  for (let d=1; d<=diasNoMes; d++) {
    const key = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const h   = studyDataDetail[key]||0;
    if (h>maxH) maxH = h;
  }
  for (let d=1; d<=diasNoMes; d++) {
    const key = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const h   = studyDataDetail[key]||0;
    const lvl = maxH ? Math.ceil((h/maxH)*4) : 0;
    const cell = document.createElement('div');
    cell.className   = `heatmap-cell level-${lvl}`;
    cell.title       = `${key}: ${h.toFixed(2)} h`;
    cell.textContent = d;
    container.appendChild(cell);
  }
}

// ===== Inicialização =====
preencherAnoSelector();
gerarCalendario(new Date().getFullYear());
atualizarTabela();
atualizarGraficos();
