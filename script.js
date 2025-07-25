/* ============================================================
   Estudo Tracker – script.js (versão organizada)
   ============================================================ */

/* ---------------------------
   0. Constantes & Estado
---------------------------- */
const RING_TOTAL = 276.4; // 2π * 44 (raio do SVG)
const ONE_DAY_MS = 86_400_000;

const pomodoroConfig = {
  focusDuration: 25 * 60,
  breakDuration: 5 * 60,
  cycles: 4
};

// Estado volátil (runtime)
const State = {
  startTime: null,
  elapsedBefore: 0,
  running: false,
  timerInterval: null,
  sessionStartTs: null,

  pomodoroMode: false,
  currentCycle: 0,
  isOnBreak: false,
  pomodoroTimer: null
};

/* ---------------------------
   1. DOM Cache
---------------------------- */
const DOM = {
  display:            document.getElementById('display'),
  studyTable:         document.getElementById('studyTable'),
  metaHorasInput:     document.getElementById('metaHoras'),
  timelineContainer:  document.getElementById('timelineContainer'),
  weeklyFill:         document.getElementById('weeklyFill'),
  streakCounter:      document.getElementById('streakCounter'),
  ringFg:             document.querySelector('.ring-fg'),

  pomodoroFocusInput: document.getElementById('pomodoroFocus'),
  pomodoroBreakInput: document.getElementById('pomodoroBreak'),
  btnTogglePomodoro:  document.getElementById('btnTogglePomodoro'),
  btnStartPomodoro:   document.getElementById('btnStartPomodoro'),
  btnStartPause:      document.querySelector('.btn-start'),

  btnExport:    document.getElementById('btnExport'),
  btnImport:    document.getElementById('btnImport'),
  importFile:   document.getElementById('importFile'),
  btnHardReset: document.getElementById('btnHardReset'),

  navBtns:      document.querySelectorAll('.nav-btn'),
  navIndicator: document.querySelector('.nav-indicator')
};

/* ---------------------------
   2. Storage Layer
---------------------------- */
const Store = {
  get studyDataDetail(){ return JSON.parse(localStorage.getItem('studyDataDetail')) || {}; },
  set studyDataDetail(v){ localStorage.setItem('studyDataDetail', JSON.stringify(v)); },

  get studyDataArray(){ return JSON.parse(localStorage.getItem('studyDataArray')) || [0,0,0,0,0,0,0]; },
  set studyDataArray(v){ localStorage.setItem('studyDataArray', JSON.stringify(v)); },

  get sessionLog(){ return JSON.parse(localStorage.getItem('sessionLog')) || {}; },
  set sessionLog(v){ localStorage.setItem('sessionLog', JSON.stringify(v)); },

  get metaHistory(){ return JSON.parse(localStorage.getItem('metaHistory')) || []; },
  set metaHistory(v){ localStorage.setItem('metaHistory', JSON.stringify(v)); },

  get metaSemanal(){ return parseFloat(localStorage.getItem('metaSemanalHoras')); },
  set metaSemanal(v){ localStorage.setItem('metaSemanalHoras', v); },

  get streak(){ return parseInt(localStorage.getItem('streak')) || 0; },
  set streak(v){ localStorage.setItem('streak', v); },

  get lastStudyDay(){ return localStorage.getItem('lastStudyDay') || null; },
  set lastStudyDay(v){ localStorage.setItem('lastStudyDay', v); },

  get points(){ return parseInt(localStorage.getItem('points')) || 0; },
  set points(v){ localStorage.setItem('points', v); },

  get pomodoroFocus(){ return parseInt(localStorage.getItem('pomodoroFocus')); },
  set pomodoroFocus(v){ localStorage.setItem('pomodoroFocus', v); },

  get pomodoroBreak(){ return parseInt(localStorage.getItem('pomodoroBreak')); },
  set pomodoroBreak(v){ localStorage.setItem('pomodoroBreak', v); },

  get theme(){ return localStorage.getItem('theme'); },
  set theme(v){ localStorage.setItem('theme', v); }
};

// —– Persistir sessões apagadas —–
Store.removedSessions = JSON.parse(localStorage.getItem('removedSessions')) || {};

function saveRemoved() {
  localStorage.setItem('removedSessions', JSON.stringify(Store.removedSessions));
}

/* ---------------------------
   3. Utils
---------------------------- */
const Utils = {
  parseDateKey(key){ // supports *_pomodoro
    const dateStr = key.split('_')[0];
    const [y,m,d] = dateStr.split('-').map(Number);
    return new Date(y, m-1, d);
  },
  startOfWeek(d){
    const date = new Date(d);
    date.setHours(0,0,0,0);
    const diff = date.getDate() - date.getDay(); // 0=Dom
    return new Date(date.getFullYear(), date.getMonth(), diff);
  },
  weekStartISO(d=new Date()){
    return Utils.startOfWeek(d).toISOString().slice(0,10);
  },
  
  formatTime(sec){
    const h = String(Math.floor(sec/3600)).padStart(2,'0');
    const m = String(Math.floor((sec%3600)/60)).padStart(2,'0');
    const s = String(sec%60).padStart(2,'0');
    return `${h}:${m}:${s}`;
  },
  todayISO(){
    return new Date().toISOString().slice(0,10);
  },
  yesterdayISO(){
    return new Date(Date.now()-ONE_DAY_MS).toISOString().slice(0,10);
  },
   // Converte horas decimais (e.g. 1.75) em string "HH:MM"
  formatDecimalToHHMM(decimal) {
    const totalMinutes = Math.round(decimal * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  },

  // Converte string "HH:MM" em horas decimais (e.g. "01:45" → 1.75)
  parseHHMM(str) {
    const parts = str.split(':').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] + parts[1] / 60;
  }
};

/* ---------------------------
   4. UI Helpers
---------------------------- */
const UI = {
  updateRing(percent) {
    const pizza = document.querySelector('.timer-ring .pizza');
    if (!pizza) return;
    const deg = percent * 360;
    // do começo (0°) até deg usamos a cor de progresso, depois fundo
    pizza.style.background = 
      `conic-gradient(var(--orange) 0deg ${deg}deg, var(--yellow-soft) ${deg}deg 360deg)`;
  },
  setRunButton(running){
    if(!DOM.btnStartPause) return;
    DOM.btnStartPause.innerHTML = running
      ? '<i class="fas fa-pause"></i> Pausar'
      : '<i class="fas fa-play"></i> Iniciar';
  },
  moveIndicator(btn){
    if(!DOM.navIndicator) return;
    const rect = btn.getBoundingClientRect();
    const parentRect = btn.parentElement.getBoundingClientRect();
    DOM.navIndicator.style.width = rect.width+'px';
    DOM.navIndicator.style.transform = `translateX(${rect.left - parentRect.left}px)`;
  },
  confetti(){ if(window.confetti) confetti(); }
};

/* ---------------------------
   5. Timer (livre)
---------------------------- */
const Timer = {
  toggle() {
    State.running ? Timer.pause() : Timer.start();
  },

  start() {
    if (State.running) return;
    State.running = true;
    State.startTime = Date.now();

    // Se não havia sessão em andamento, inicia como "focus"
    if (!State.sessionStartTs) {
        State.sessionStartTs = Date.now();
    }
    // Se voltar de uma pausa aberta, salva seu fim
    if (State.pauseStartTs) {
      const pauseEnd = Date.now();
      Sessions.save(State.pauseStartTs, pauseEnd, 'pause');
      State.pauseStartTs = null;
    }
    UI.setRunButton(true);

    State.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - State.startTime) / 1000) + State.elapsedBefore;
      DOM.display.textContent = Utils.formatTime(elapsed);
      UI.updateRing(Math.min(elapsed / (60 * 60), 1)); // referência: 1h
    }, 200);
  },

  pause() {
    if (!State.running) return;
    State.running = false;
    clearInterval(State.timerInterval);
    clearInterval(State.pomodoroTimer);
    UI.setRunButton(false);

    const now = Date.now();
    const elapsed = Math.floor((now - State.startTime) / 1000);
    State.elapsedBefore += elapsed;

    // Fecha a sessão ativa como "focus"
    if (State.sessionStartTs) {
        Sessions.save(State.sessionStartTs, now, 'focus');
        Day.saveToday((now - State.sessionStartTs) / 1000); // soma horas reais
    }

    // Cria um pequeno bloco de pausa (para mostrar no timeline)
    Sessions.save(now, now + 60 * 1000, 'pause'); // pausa visual de 1min

    Recalc.all();

    // Reseta sessionStartTs (será reaberto no próximo play)
    State.sessionStartTs = null;
    UI.updateRing(0);
  },

  /**
   * Reseta o cronômetro e, se estiver em modo Pomodoro,
   * reinicia também ciclos e estado de descanso.
   */
  reset() {
    // ── 1) Se houver sessão iniciada (rodando ou pausada), calcula e salva ───
    if (State.sessionStartTs) {
      const now     = Date.now();
      // começa com o que já foi acumulado antes do pause
      let elapsed   = State.elapsedBefore;
      // se ainda estivesse “running” (não pausou), soma o intervalo atual
      if (State.running && State.startTime) {
        elapsed += Math.floor((now - State.startTime) / 1000);
      }

      // salva no timeline (focus ou normal)
      const type = (State.pomodoroMode && !State.isOnBreak) ? 'focus' : 'normal';
      Sessions.save(State.sessionStartTs, now, type);
      State.sessionStartTs = null;

      // salva nas horas estudadas
      if (State.pomodoroMode && !State.isOnBreak) {
        Day.savePomodoro(elapsed);
        // recalc nos gráficos, pois savePomodoro não faz isso
        Recalc.all();
      } else {
        Day.saveToday(elapsed);
        // saveToday já chama Recalc.all() internamente
      }
    }
     DOM.display.textContent = "00:00:00";
  UI.setRunButton(false);
  UI.updateRing(0);

  // ── REABILITA O BOTÃO DE POMODORO ───────────────────────────────
  if (DOM.btnStartPomodoro) {
    DOM.btnStartPomodoro.disabled = false;
    Pomodoro.updateBtn();
  }

  // ── reconfigura ciclos se estava em Pomodoro (se aplicável) ──────
  if (State.pomodoroMode) {
    State.currentCycle = 0;
    State.isOnBreak    = false;
    Pomodoro.updateBtn();
  }
    // ── 2) Para timers ativos e zera estado básico ───────────────────────
    State.running       = false;
    clearInterval(State.timerInterval);
    clearInterval(State.pomodoroTimer);

    State.startTime     = null;
    State.elapsedBefore = 0;
    State.sessionStartTs= null;

    DOM.display.textContent = "00:00:00";
    UI.setRunButton(false);
    UI.updateRing(0);

    // ── 3) Se em Pomodoro, reseta ciclos e volta ao modo foco ───────────
    if (State.pomodoroMode) {
      State.currentCycle = 0;
      State.isOnBreak    = false;
      Pomodoro.updateBtn();
      DOM.btnTogglePomodoro.textContent = 'Desativar Pomodoro';
    }
  }
};

// Expor a função global para o botão inline
window.resetTimer = () => {
  Timer.reset();
  // reabilita e restaura texto do botão Pomodoro
  DOM.btnStartPomodoro.disabled = false;
  Pomodoro.updateBtn();
};

/* ---------------------------
   6. Sessions (Timeline logs)
---------------------------- */
const Sessions = {
  save(startTs, endTs, type='normal'){
    const key = new Date(startTs).toISOString().slice(0,10);
    const log = Store.sessionLog;
    log[key] = log[key] || [];
    log[key].push({ start: startTs, end: endTs, type });
    Store.sessionLog = log;
  }
};

/* ---------------------------
   7. Meta semanal & Progress
---------------------------- */
const Meta = {
  load(){
    const m = Store.metaSemanal;
    if(!isNaN(m) && m >= 0) DOM.metaHorasInput.value = m;
  },
  save(){
    const v = parseFloat(DOM.metaHorasInput.value);
    if(isNaN(v) || v < 0) return;
    Store.metaSemanal = v;
    Meta.pushHistory(v);
    Table.update();
    Charts.renderMetaHistory();
  },
  pushHistory(value){
    const weekStart = Utils.weekStartISO();
    const hist = Store.metaHistory;
    const idx = hist.findIndex(h=>h.weekStart===weekStart);
    if(idx>=0) hist[idx].value = value;
    else hist.push({ weekStart, value });
    Store.metaHistory = hist;
  }
};

/* ---------------------------
   8. Pomodoro
---------------------------- */
const Pomodoro = {
  loadConfig(){
    const f = Store.pomodoroFocus;
    const b = Store.pomodoroBreak;
    if(!isNaN(f) && f>0){ pomodoroConfig.focusDuration = f*60; DOM.pomodoroFocusInput.value = f; }
    if(!isNaN(b) && b>0){ pomodoroConfig.breakDuration = b*60; DOM.pomodoroBreakInput.value = b; }
    Pomodoro.updateBtn();
  },
  saveConfig(){
    Store.pomodoroFocus = pomodoroConfig.focusDuration/60;
    Store.pomodoroBreak = pomodoroConfig.breakDuration/60;
  },
  updateFromInputs(){
    const foco = parseInt(DOM.pomodoroFocusInput.value);
    const desc = parseInt(DOM.pomodoroBreakInput.value);
    if(!isNaN(foco) && foco>0) pomodoroConfig.focusDuration = foco*60;
    if(!isNaN(desc) && desc>0) pomodoroConfig.breakDuration = desc*60;
    Pomodoro.saveConfig();
    Pomodoro.updateBtn();
  },
  updateBtn() {
  DOM.btnStartPomodoro.innerHTML =
    `<i class="fas fa-play-circle"></i> ` +
    `Iniciar Pomodoro (${pomodoroConfig.focusDuration/60}m | ${pomodoroConfig.breakDuration/60}m)`;
  },

  toggleMode(){
    State.pomodoroMode = !State.pomodoroMode;
    DOM.btnTogglePomodoro.textContent = State.pomodoroMode ? 'Desativar Pomodoro' : 'Ativar Pomodoro';
    clearInterval(State.timerInterval);
    clearInterval(State.pomodoroTimer);
    Timer.reset();
  },

  startCycle(){
    clearInterval(State.pomodoroTimer);
    const duration = State.isOnBreak ? pomodoroConfig.breakDuration : pomodoroConfig.focusDuration;

    State.startTime      = Date.now();
    State.elapsedBefore  = 0;
    State.running        = true;
    State.sessionStartTs = State.isOnBreak ? null : Date.now();
    UI.setRunButton(true);

    State.pomodoroTimer = setInterval(()=>{
      const elapsed = Math.floor((Date.now()-State.startTime)/1000);
      DOM.display.textContent = Utils.formatTime(elapsed);
      UI.updateRing(Math.min(elapsed/duration,1));
      if(elapsed >= duration){
        clearInterval(State.pomodoroTimer);
        Pomodoro.endInterval();
      }
    }, 500);
  },

  endInterval(){
    State.running = false;
    State.elapsedBefore = 0;
    UI.setRunButton(false);
    UI.updateRing(0);

    let title, body;

    if(!State.isOnBreak){
      if(State.sessionStartTs){
        Sessions.save(State.sessionStartTs, Date.now(), 'focus');
        State.sessionStartTs = null;
      }
      Day.savePomodoro(pomodoroConfig.focusDuration);
      State.currentCycle++;
      title = 'Intervalo iniciado';
      body  = `Descanse por ${pomodoroConfig.breakDuration/60} minutos.`;
    } else {
      title = 'Período de foco iniciado';
      body  = `Estude por ${pomodoroConfig.focusDuration/60} minutos.`;
    }

    if(Notification.permission === 'granted') new Notification(title, { body });

    State.isOnBreak = !State.isOnBreak;

    if(State.currentCycle >= pomodoroConfig.cycles){
      alert(`Você completou ${pomodoroConfig.cycles} ciclos!`);
      UI.confetti();
      State.currentCycle = 0;
      State.isOnBreak    = false;
      State.pomodoroMode = false;
      DOM.btnTogglePomodoro.textContent = 'Ativar Pomodoro';
      Timer.reset();
    } else {
      Pomodoro.startCycle();
    }

    Recalc.all();
  }
};

/* ---------------------------
   9. Dia / Pontos / Streak
---------------------------- */
const Day = {
  saveToday(seconds){
    if(seconds<=0) return;
    const key = Utils.todayISO();
    const detail = Store.studyDataDetail;
    detail[key] = (detail[key] || 0) + seconds/3600;
    Store.studyDataDetail = detail;
    Day.updateStreak();
    Points.add(seconds);
    Recalc.all();
  },

  savePomodoro(seconds){
    if(seconds<=0) return;
    const key = Utils.todayISO() + '_pomodoro';
    const detail = Store.studyDataDetail;
    detail[key] = (detail[key] || 0) + seconds/3600;
    Store.studyDataDetail = detail;
    Points.add(seconds);
    Recalc.all();
  },

  editToday(){
    const key = Utils.todayISO();
    const detail = Store.studyDataDetail;
    const atual = detail[key] || 0;
    let entrada = prompt('Editar horas para hoje (decimal):', atual.toFixed(2));
    if(entrada===null) return;
    entrada = parseFloat(entrada);
    if(isNaN(entrada) || entrada < 0){ alert('Número inválido.'); return; }
    detail[key] = entrada;
    Store.studyDataDetail = detail;
    Recalc.all();
  },

  removeToday(){
    const key = Utils.todayISO();
    const detail = Store.studyDataDetail;
    if(detail[key] !== undefined){
      delete detail[key];
      Store.studyDataDetail = detail;
      Recalc.all();
    } else alert('Nada registrado para hoje.');
  },

  updateStreak(){
    const today = Utils.todayISO();
    const last  = Store.lastStudyDay;
    let streak  = Store.streak;

    if(!last){
      streak = 1;
    } else {
      const yesterday = Utils.yesterdayISO();
      if(last === today){
        // nada
      } else if(last === yesterday){
        streak++;
      } else {
        streak = 1;
      }
    }
    Store.lastStudyDay = today;
    Store.streak = streak;
    if(DOM.streakCounter) DOM.streakCounter.textContent = `${streak} 🔥`;
  },

  editDate(key) {
    const detail = Store.studyDataDetail;
    const current = detail[key] || 0;
    const currentStr = Utils.formatDecimalToHHMM(current);
    let entrada = prompt(`Editar tempo para ${key} (HH:MM):`, currentStr);
    if (entrada === null) return;
    const dec = Utils.parseHHMM(entrada);
    if (dec === null) {
      alert('Formato inválido. Use HH:MM');
      return;
    }
    detail[key] = dec;
    Store.studyDataDetail = detail;
    Recalc.all();
  },

  addDate(key) {
    const detail = Store.studyDataDetail;
    const current = detail[key] || 0;
    let entrada = prompt(`Adicionar tempo para ${key} (HH:MM):`, '00:00');
    if (entrada === null) return;
    const dec = Utils.parseHHMM(entrada);
    if (dec === null) {
      alert('Formato inválido. Use HH:MM');
      return;
    }
    detail[key] = current + dec;
    Store.studyDataDetail = detail;
    Recalc.all();
  }
};

const Points = {
  add(sec){
    const pts = Store.points + Math.floor(sec/1500);
    Store.points = pts;
  }
};

/* ---------------------------
   10. Recalcular / Tabela / Timeline / Charts
---------------------------- */
const Recalc = {
  weeklyArray(){
  const arr    = [0,0,0,0,0,0,0];
  const ws     = Utils.startOfWeek(new Date());
  const detail = Store.studyDataDetail;
  const log    = Store.sessionLog;

  for(let i=0; i<7; i++){
    const d    = new Date(ws);
    d.setDate(ws.getDate() + i);
    const key  = d.toISOString().slice(0,10);

    if(detail[key] !== undefined){
      // valor manual (edição ou subtração)
      arr[i] = detail[key];
    } else {
      // soma todas as sessões de foco que ainda estão no sessionLog
      arr[i] = (log[key] || [])
        .filter(s => s.type === 'focus')
        .reduce((sum, s) => sum + (s.end - s.start) / 3600000, 0);
    }
  }

    Store.studyDataArray = arr;
    return arr;
  },
  all(){
    Table.update();
    Charts.update();
    Timeline.render();
    Recalc.updateWeeklyProgress();
  },
  updateWeeklyProgress() {
    const arr = Store.studyDataArray;
    const total = arr.reduce((a,b)=>a+b,0); // soma total da semana
    const meta = parseFloat(DOM.metaHorasInput.value) || 0;

    // Atualiza texto
    const totalEl = document.getElementById('totalSemana');
    if (totalEl) totalEl.textContent = `Total da semana: ${Utils.formatDecimalToHHMM(total)}`;

    // Atualiza barra
    const fillEl = DOM.weeklyFill;
    if (fillEl) {
      const pct = meta > 0 ? Math.min(total / meta, 1) * 100 : 0;
      fillEl.style.width = `${pct}%`;
    }
  },
};

const Table = {
  update() {
    // 1) monta o array de horas por dia (normal + pomodoro, ou fallback em sessionLog)
    const weekStart = Utils.startOfWeek(new Date());
    const studyData = Array.from({ length: 7 }, (_, i) => {
      const d   = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = d.toISOString().slice(0,10);
      const detail = Store.studyDataDetail;

      const hNorm = detail[key]               || 0;
      const hPomo = detail[`${key}_pomodoro`] || 0;
      if (hNorm || hPomo) {
        return hNorm + hPomo;
      }
      return (Store.sessionLog[key] || [])
        .filter(s => s.type === 'focus')
        .reduce((sum, s) => sum + (s.end - s.start)/3600000, 0);
    });
    // 2) persiste e deixa disponível para gráficos
    Store.studyDataArray = studyData;

    // 3) monta o cabeçalho
    const dias      = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const headerRow = document.getElementById('studyHeader');
    headerRow.innerHTML = '';
    dias.forEach(d => {
      const th = document.createElement('th');
      th.textContent = d;
      headerRow.appendChild(th);
    });

    // 4) monta os valores + ícones
    const valuesRow = document.getElementById('studyValues');
    valuesRow.innerHTML = '';
    studyData.forEach((decimal, i) => {
      const dateObj = new Date(weekStart);
      dateObj.setDate(weekStart.getDate() + i);
      const dateKey = dateObj.toISOString().slice(0,10);

      const td = document.createElement('td');
      const hhmm = Utils.formatDecimalToHHMM(decimal);
      td.innerHTML = `
        <span class="time-text">${hhmm}</span>
        <i class="fas fa-pen edit-icon" onclick="Day.editDate('${dateKey}')"></i>
        <i class="fas fa-plus add-icon" onclick="Day.addDate('${dateKey}')"></i>
        <i class="fas fa-minus minus-icon" onclick="Day.showSessions('${dateKey}')"></i>
      `;
      valuesRow.appendChild(td);
    });
  }
};



const Timeline = {
  render(date=new Date()){
    if(!DOM.timelineContainer) return;
    DOM.timelineContainer.innerHTML = '';

    const key = date.toISOString().slice(0,10);
    const sessions = Store.sessionLog[key] || [];

    const row   = document.createElement('div');
    row.className = 'timeline-row';

    const label = document.createElement('span');
    label.className = 'timeline-label';
    label.textContent = key;
    row.appendChild(label);

    const track = document.createElement('div');
    track.className = 'timeline-track';

    const scale = document.createElement('div');
    scale.className = 'timeline-scale';

    for(let h=0; h<=24; h+=2){
      const t = document.createElement('span');
      t.className = 'timeline-tick';
      t.style.left = (h/24*100)+'%';
      t.textContent = h.toString().padStart(2,'0')+':00';
      scale.appendChild(t);
    }
    track.appendChild(scale);

    const bar = document.createElement('div');
    bar.className = 'timeline-bar';

  sessions.forEach(s=>{
    const st = new Date(s.start);
    const en = new Date(s.end);
    const startMin = st.getHours()*60 + st.getMinutes() + st.getSeconds()/60;
    const endMin   = en.getHours()*60 + en.getMinutes() + en.getSeconds()/60;

    const seg = document.createElement('div');
    if (s.type === 'focus') {
      seg.className = 'timeline-segment';
    } else if (s.type === 'pause') {
      seg.className = 'timeline-segment pause';
    } else {
      seg.className = 'timeline-segment break';
    }
    seg.style.left  = (startMin/1440*100)+'%';
    seg.style.width = ((endMin-startMin)/1440*100)+'%';
    seg.title = `${st.toLocaleTimeString()} - ${en.toLocaleTimeString()} (${s.type})`;
    bar.appendChild(seg);
  });


    // linha do agora
    const todayISO = Utils.todayISO();
    if(key === todayISO){
      const now = new Date();
      const nowPct = ((now.getHours()*60 + now.getMinutes())/1440)*100;
      const nl = document.createElement('div');
      nl.className = 'timeline-now';
      nl.style.left = nowPct+'%';
      bar.appendChild(nl);
    }

    track.appendChild(bar);
    row.appendChild(track);
    DOM.timelineContainer.appendChild(row);

    if(sessions.length === 0){
      const msg = document.createElement('p');
      msg.className = 'empty-msg';
      msg.textContent = 'Sem sessões registradas hoje.';
      DOM.timelineContainer.appendChild(msg);
    }
  }
};

const Charts = {
  _charts: {},

  renderCumulative(){
    const canvas = document.getElementById('chartAcumuladoSemanal');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');

    const studyData = Store.studyDataArray;
    const dias      = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const cumulative = studyData.map((_,i)=>studyData.slice(0,i+1).reduce((a,b)=>a+b,0));
    const meta       = parseFloat(DOM.metaHorasInput.value) || 0;
    const metaLine   = dias.map((_,i)=>((i+1)*meta)/7);

    Charts._destroy('chartAcumuladoSemanal');
    Charts._charts['chartAcumuladoSemanal'] = new Chart(ctx,{
      type:'line',
      data:{ labels:dias, datasets:[
        { label:'Horas Acumuladas', data:cumulative, fill:false, tension:0.2 },
        { label:'Meta Semanal (cumulativa)', data:metaLine, fill:false, borderDash:[5,5] }
      ]},
      options:{ scales:{ y:{ beginAtZero:true, title:{ display:true, text:'Horas' }}}}
    });
  },

  renderMetaHistory(){
    const canvas = document.getElementById('chartMetaHistory');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');

    Charts._destroy('chartMetaHistory');

    const sorted = [...Store.metaHistory].sort((a,b)=> new Date(a.weekStart)-new Date(b.weekStart));
    if(sorted.length === 0){
      canvas.insertAdjacentHTML('beforebegin','<p class="empty-msg">Nenhuma meta salva ainda.</p>');
      return;
    }
    const labels = sorted.map(m=>m.weekStart);
    const data   = sorted.map(m=>m.value);

    Charts._charts['chartMetaHistory'] = new Chart(ctx,{
      type:'line',
      data:{ labels, datasets:[{ label:'Meta semanal (h)', data, fill:false, tension:0.2 }]},
      options:{ scales:{ y:{ beginAtZero:true, title:{ display:true, text:'Horas' }}}}
    });
  },

  renderHeatmap() {
  const container = document.getElementById('heatmapContainer');
  if (!container) return;
    container.innerHTML = '';

    const hoje = new Date();
    const ano  = hoje.getFullYear();
    const mes  = hoje.getMonth();
    const dias = new Date(ano, mes + 1, 0).getDate();

    const detail   = Store.studyDataDetail;
    const metaSem  = parseFloat(DOM.metaHorasInput.value) || 0;
    const metaDia  = metaSem / 7;

    for (let d = 1; d <= dias; d++) {
      const dayStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hNorm   = detail[dayStr]               || 0;
      const hPomo   = detail[`${dayStr}_pomodoro`] || 0;
      const hTot    = hNorm + hPomo;

      // percentual em relação à meta diária (corta em 1)
      const pct = metaDia > 0 ? Math.min(hTot / metaDia, 1) : 0;

      // monta o <div>
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.textContent = d;
      cell.title = `${dayStr}: ${hTot.toFixed(2)} h (meta diária: ${metaDia.toFixed(2)} h)`;

      // cor de fundo: verde com alpha proporcional
      cell.style.backgroundColor = `rgba(34, 139, 34, ${pct})`;
      // opcional: borda clara para dias sem estudo
      if (pct === 0) {
        cell.style.border = '1px solid rgba(34,139,34,0.2)';
      }

      container.appendChild(cell);
    }
  },


  update(){
    Charts.renderCumulative();
    Charts.renderHeatmap();
  },

  _destroy(id){
    if(Charts._charts[id]){ Charts._charts[id].destroy(); delete Charts._charts[id]; }
  }
};

/* ---------------------------
   11. Export / Import / Reset
---------------------------- */
const DataIO = {
  export(){
    const data = {
      studyDataDetail: Store.studyDataDetail,
      sessionLog:      Store.sessionLog,
      metaHistory:     Store.metaHistory,
      points:          Store.points,
      streak:          Store.streak,
      lastStudyDay:    Store.lastStudyDay,
      metaSemanal:     DOM.metaHorasInput.value,
      notes:           localStorage.getItem('userNotes') || ''
    };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'estudo-tracker.json'; a.click();
    URL.revokeObjectURL(url);
  },

  import(file){
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        if(data.studyDataDetail) Store.studyDataDetail = data.studyDataDetail;
        if(data.sessionLog)      Store.sessionLog      = data.sessionLog;
        if(data.metaHistory)     Store.metaHistory     = data.metaHistory;
        if(data.points)          Store.points          = data.points;
        if(data.streak)          Store.streak          = data.streak;
        if(data.lastStudyDay)    Store.lastStudyDay    = data.lastStudyDay;
        if(data.metaSemanal){
          Store.metaSemanal = data.metaSemanal;
          DOM.metaHorasInput.value = data.metaSemanal;
        }

        if(data.notes !== undefined){
          localStorage.setItem('userNotes', data.notes);
          const notesArea = document.getElementById('notesArea');
          if(notesArea) notesArea.value = data.notes;
        }
        Recalc.all();
        Charts.renderMetaHistory();
        Day.updateStreak();
        alert('Dados importados com sucesso!');
      }catch(err){
        alert('Arquivo inválido.');
      }
    };
    reader.readAsText(file);
  },

  hardReset(){
    if(confirm('Tem certeza? Isso apagará TODOS os dados!')){
      localStorage.clear();
      location.reload();
    }
  }
};


/* ---------------------------
   12. Tabs & Tema
---------------------------- */
const Tabs = {
  init(){
    DOM.navBtns.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        DOM.navBtns.forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        document.getElementById('tab-'+btn.dataset.tab).classList.add('active');

        UI.moveIndicator(btn);
      });
    });
    // mover indicador após render inicial
    setTimeout(()=>{
      const active = document.querySelector('.nav-btn.active');
      if(active) UI.moveIndicator(active);
    }, 100);
  }
};

const Theme = {
  init(){
    const root = document.documentElement;
    if(Store.theme === 'dark') root.classList.add('dark');

    document.getElementById('themeToggle')?.addEventListener('click', ()=>{
      root.classList.toggle('dark');
      Store.theme = root.classList.contains('dark') ? 'dark' : 'light';
    });
  }
};

/* ---------------------------
   11. Notas (notes)
---------------------------- */
const Notes = {
  init(){
    this.area     = document.getElementById('notesArea');
    this.clearBtn = document.getElementById('clearNotesBtn');
    if(!this.area) return;
    this.KEY = 'userNotes';

    // Carrega
    this.area.value = localStorage.getItem(this.KEY) || '';

    // Autosave (debounce)
    let timeout;
    this.area.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        localStorage.setItem(this.KEY, this.area.value);
      }, 300);
    });

    // Limpar
    this.clearBtn.addEventListener('click', () => {
      if(this.area.value && confirm('Limpar todas as notas?')){
        this.area.value = '';
        localStorage.removeItem(this.KEY);
      }
    });
  }
};
/* ---------------------------
   13. Eventos
---------------------------- */
function bindEvents(){
  // Timer
  DOM.btnStartPause?.addEventListener('click', Timer.toggle);
  // Keyboard shortcuts
  document.addEventListener('keyup', e=>{
    if(e.target.tagName === 'INPUT') return;
    if(e.code === 'Space'){ e.preventDefault(); Timer.toggle(); }
    if(e.key === 'r' || e.key === 'R'){ Timer.reset(); }
  });

  // Pomodoro
  DOM.btnStartPomodoro?.addEventListener('click', () => {
  if (!State.pomodoroMode) {
    State.pomodoroMode = true;
    Pomodoro.updateBtn();
  }
  Pomodoro.startCycle();

  // bloqueia o botão e mostra ícone de execução
  DOM.btnStartPomodoro.disabled = true;
  DOM.btnStartPomodoro.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  });
  DOM.btnStartPomodoro?.addEventListener('click', ()=>{ if(State.pomodoroMode) Pomodoro.startCycle(); });
  [DOM.pomodoroFocusInput, DOM.pomodoroBreakInput].forEach(el=> el?.addEventListener('change', Pomodoro.updateFromInputs));

  // Meta semanal
  DOM.metaHorasInput?.addEventListener('change', Meta.save);

  // Edit / remove dia
  window.editarTempoHoje  = Day.editToday;
  window.removerTempoHoje = Day.removeToday;

  // Export / Import / Reset
  DOM.btnExport?.addEventListener('click', DataIO.export);
  DOM.btnImport?.addEventListener('click', ()=>DOM.importFile.click());
  DOM.importFile?.addEventListener('change', e=>{
    const file = e.target.files[0];
    if(file) DataIO.import(file);
  });
  DOM.btnHardReset?.addEventListener('click', DataIO.hardReset);
}

/* ---------------------------
   14. Inicialização
---------------------------- */
function init(){
  if("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
  }

  Meta.load();
  Pomodoro.loadConfig();
  Day.updateStreak();
  Recalc.all();
  Charts.renderMetaHistory();

  Tabs.init();
  Theme.init();
  bindEvents();
  Notes.init();
  setTimeout(()=>document.getElementById('loader')?.remove(), 900);
}
init();


// abre o modal com as sessões de foco do dia
Day.showSessions = function(dateKey) {
  const modal     = document.getElementById('sessionsModal');
  const modalDate = document.getElementById('modalDate');
  const list      = document.getElementById('sessionsList');

  modalDate.textContent = dateKey;
  list.innerHTML = '';

  // ① só as sessões de foco ativas naquele dia
  const sessions = (Store.sessionLog[dateKey] || [])
    .filter(s => s.type === 'focus');

  if (sessions.length === 0) {
    list.innerHTML = '<li>Nenhuma sessão de foco registrada.</li>';
  } else {
    sessions.forEach(s => {
      const li = document.createElement('li');
      li.className = 'sessions-item';

      // formatar horário e duração
      const st = new Date(s.start), en = new Date(s.end);
      const timeStr = st.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) +
                      ' – ' +
                      en.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      const durationH = ((s.end - s.start) / 3600000).toFixed(2);

      const span = document.createElement('span');
      span.className = 'session-info';
      span.textContent = `${timeStr} (${durationH} h)`;

      const trash = document.createElement('i');
      trash.className = 'fas fa-trash trash-icon';
      trash.onclick = () => {
        // ② remove a sessão exata do sessionLog
        const log = Store.sessionLog;
        log[dateKey] = (log[dateKey] || []).filter(item =>
          !(item.type === 'focus'
            && item.start === s.start
            && item.end   === s.end)
        );
        Store.sessionLog = log;

        // ③ remove qualquer override manual ou pomodoro daquele dia
        const detail = Store.studyDataDetail;
        delete detail[dateKey];
        delete detail[`${dateKey}_pomodoro`];
        Store.studyDataDetail = detail;

        // ④ força recálculo de tabela, gráficos, timeline e totais
        Recalc.all();

        // ⑤ reexibe o modal com a lista atualizada
        Day.showSessions(dateKey);
      };

      li.appendChild(span);
      li.appendChild(trash);
      list.appendChild(li);
    });
  }

  modal.classList.remove('hidden');
};

// fecha o modal
Day.hideSessions = function() {
  document.getElementById('sessionsModal').classList.add('hidden');
};

// clicando no “×” ou fora do conteúdo
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('close-modal') ||
      e.target.id === 'sessionsModal') {
    Day.hideSessions();
  }
});