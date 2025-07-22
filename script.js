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
  }
};

/* ---------------------------
   4. UI Helpers
---------------------------- */
const UI = {
  updateRing(percent){
    if(!DOM.ringFg) return;
    DOM.ringFg.style.strokeDashoffset = RING_TOTAL - RING_TOTAL * percent;
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
  toggle(){ State.running ? Timer.pause() : Timer.start(); },

  start(){
    if(State.running) return;
    State.running = true;
    State.startTime = Date.now();
    State.sessionStartTs = Date.now();
    UI.setRunButton(true);

    State.timerInterval = setInterval(()=>{
      const elapsed = Math.floor((Date.now() - State.startTime)/1000) + State.elapsedBefore;
      DOM.display.textContent = Utils.formatTime(elapsed);
      UI.updateRing(Math.min(elapsed/(60*60), 1)); // referência: 1h
    }, 200);
  },

  pause(){
    if(!State.running) return;
    State.running = false;
    clearInterval(State.timerInterval);
    clearInterval(State.pomodoroTimer);
    UI.setRunButton(false);

    const elapsed = Math.floor((Date.now() - State.startTime)/1000);
    State.elapsedBefore += elapsed;

    if(!(State.pomodoroMode && State.isOnBreak) && State.sessionStartTs){
      Sessions.save(State.sessionStartTs, Date.now(), State.pomodoroMode ? 'focus' : 'normal');
      State.sessionStartTs = null;
    }
    if(!(State.pomodoroMode && State.isOnBreak)) Day.saveToday(elapsed);

    UI.updateRing(0);
  },

  reset(){
    State.running = false;
    clearInterval(State.timerInterval);
    clearInterval(State.pomodoroTimer);
    State.startTime = null;
    State.elapsedBefore = 0;
    State.sessionStartTs = null;
    DOM.display.textContent = "00:00:00";
    UI.setRunButton(false);
    UI.updateRing(0);
  }
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
  updateBtn(){
    DOM.btnStartPomodoro.textContent = `Iniciar Pomodoro (${pomodoroConfig.focusDuration/60}m foco / ${pomodoroConfig.breakDuration/60}m descanso)`;
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
    const arr = [0,0,0,0,0,0,0];
    const today  = new Date();
    const ws     = Utils.startOfWeek(today);
    const we     = new Date(ws); we.setDate(ws.getDate()+6);

    const detail = Store.studyDataDetail;
    for(const k in detail){
      const d = Utils.parseDateKey(k);
      if(d>=ws && d<=we){
        arr[d.getDay()] += detail[k];
      }
    }
    Store.studyDataArray = arr;
    return arr;
  },
  all(){
    Table.update();
    Charts.update();
    Timeline.render();
  }
};

const Table = {
  update(){
    const studyData = Recalc.weeklyArray();

    // limpa linhas
    DOM.studyTable.querySelectorAll('tr:not(:first-child)').forEach(tr=>tr.remove());

    const dias = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    let total = 0;

    for(let i=0;i<7;i++){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${dias[i]}</td><td>${studyData[i].toFixed(2)} h</td>`;
      DOM.studyTable.appendChild(tr);
      total += studyData[i];
    }

    // UI meta semanal
    const meta = parseFloat(DOM.metaHorasInput.value) || 0;
    const pct  = meta>0 ? (total/meta)*100 : 0;
    const box  = document.getElementById('totalSemana');
    box.textContent = `Total da semana: ${total.toFixed(2)} h`;
    box.className   = 'total-semana-box';

    if      (pct <= 25) box.classList.add('meta-baixa');
    else if (pct <= 50) box.classList.add('meta-media-baixa');
    else if (pct <= 75) box.classList.add('meta-media-alta');
    else if (pct < 100) box.classList.add('meta-quase');
    else {
      box.classList.add('meta-completa');
      if(!box.dataset.done){
        box.dataset.done = 'true';
        UI.confetti();
        box.classList.add('wiggle');
        setTimeout(()=>box.classList.remove('wiggle'),600);
      }
    }
    if(DOM.weeklyFill) DOM.weeklyFill.style.width = Math.min(pct,100)+'%';
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
      seg.className = 'timeline-segment' + (s.type==='focus' ? '' : ' break');
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

  renderHeatmap(){
    const container = document.getElementById('heatmapContainer');
    if(!container) return;
    container.innerHTML = '';

    const hoje = new Date();
    const ano  = hoje.getFullYear();
    const mes  = hoje.getMonth();
    const dias = new Date(ano, mes+1, 0).getDate();

    const detail = Store.studyDataDetail;
    let maxH = 0;
    for(let d=1; d<=dias; d++){
      const k = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const h = detail[k] || 0;
      if(h>maxH) maxH = h;
    }
    for(let d=1; d<=dias; d++){
      const k = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const h = detail[k] || 0;
      const lvl = maxH ? Math.ceil((h/maxH)*4) : 0;
      const cell = document.createElement('div');
      cell.className = `heatmap-cell level-${lvl}`;
      cell.title     = `${k}: ${h.toFixed(2)} h`;
      cell.textContent = d;
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
      metaSemanal:     DOM.metaHorasInput.value
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
  DOM.btnTogglePomodoro?.addEventListener('click', Pomodoro.toggleMode);
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

  setTimeout(()=>document.getElementById('loader')?.remove(), 900);
}
init();
