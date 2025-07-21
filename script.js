let startTime = null;        // marca quando começou
let elapsedBefore = 0;       // tempo anterior acumulado
let running = false;
let timerInterval;

const display = document.getElementById('display');
const studyTable = document.getElementById('studyTable');
const yearSelector = document.getElementById('yearSelector');
const calendarContainer = document.getElementById('calendarContainer');

let studyData = [0, 0, 0, 0, 0, 0, 0]; // horas por dia da semana (Dom=0 ... Sab=6)
let studyDataDetail = JSON.parse(localStorage.getItem('studyDataDetail')) || {}; // tempo por data no formato 'YYYY-MM-DD'

// Recalcula studyData com base nos dados armazenados
function recalcularStudyData() {
  studyData = [0, 0, 0, 0, 0, 0, 0];
  for (const key in studyDataDetail) {
    const d = new Date(key);
    const diaSemana = d.getDay();
    studyData[diaSemana] += studyDataDetail[key];
  }
}

recalcularStudyData();

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function startTimer() {
  if (running) return;
  running = true;
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.floor((now - startTime) / 1000) + elapsedBefore;
    display.textContent = formatTime(elapsed);
  }, 200);
}

function pauseTimer() {
  if (!running) return;
  running = false;
  clearInterval(timerInterval);
  const now = Date.now();
  const elapsed = Math.floor((now - startTime) / 1000);
  elapsedBefore += elapsed;
  salvarTempoHoje(elapsed);
}

function resetTimer() {
  running = false;
  clearInterval(timerInterval);
  startTime = null;
  elapsedBefore = 0;
  display.textContent = "00:00:00";
}

function salvarTempoHoje(segundos = elapsedBefore) {
  if (segundos <= 0) return;

  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const dataISO = hoje.toISOString().slice(0, 10);

  if (!studyDataDetail[dataISO]) studyDataDetail[dataISO] = 0;
  studyDataDetail[dataISO] += segundos / 3600;

  localStorage.setItem('studyDataDetail', JSON.stringify(studyDataDetail));

  recalcularStudyData();
  atualizarTabela();
  atualizarCalendario();
  atualizarGraficos();
}

function atualizarTabela() {
  studyTable.querySelectorAll('tr:not(:first-child)').forEach(tr => tr.remove());

  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  let totalSemana = 0;

  for (let i = 0; i < 7; i++) {
    const tr = document.createElement('tr');
    const tdDia = document.createElement('td');
    tdDia.textContent = diasSemana[i];
    const tdTempo = document.createElement('td');
    tdTempo.textContent = studyData[i].toFixed(2) + " h";
    tr.appendChild(tdDia);
    tr.appendChild(tdTempo);
    studyTable.appendChild(tr);
    totalSemana += studyData[i];
  }

  const meta = parseFloat(document.getElementById('metaHoras').value) || 0;
  const porcentagem = meta > 0 ? (totalSemana / meta) * 100 : 0;
  const totalBox = document.getElementById('totalSemana');
  totalBox.textContent = `Total da semana: ${totalSemana.toFixed(2)} h`;

  totalBox.className = 'total-semana-box'; // reset classes

  if (porcentagem <= 25) {
    totalBox.classList.add('meta-baixa');
  } else if (porcentagem <= 50) {
    totalBox.classList.add('meta-media-baixa');
  } else if (porcentagem <= 75) {
    totalBox.classList.add('meta-media-alta');
  } else if (porcentagem < 100) {
    totalBox.classList.add('meta-quase');
  } else {
    totalBox.classList.add('meta-completa');
  }
}



function gerarCalendario(ano) {
  calendarContainer.innerHTML = '';
  for (let m = 0; m < 12; m++) {
    const monthDiv = document.createElement('div');
    monthDiv.classList.add('month');

    const monthHeader = document.createElement('div');
    monthHeader.classList.add('month-header');
    monthHeader.textContent = new Date(ano, m).toLocaleString('pt-BR', { month: 'long' });
    monthDiv.appendChild(monthHeader);

    const daysGrid = document.createElement('div');
    daysGrid.classList.add('days');

    const diasSemana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    diasSemana.forEach(dia => {
      const dayNameDiv = document.createElement('div');
      dayNameDiv.classList.add('day-name');
      dayNameDiv.textContent = dia;
      daysGrid.appendChild(dayNameDiv);
    });

    const primeiroDia = new Date(ano, m, 1);
    const ultimoDia = new Date(ano, m + 1, 0);
    const primeiroDiaSemana = primeiroDia.getDay();

    for (let i = 0; i < primeiroDiaSemana; i++) {
      const emptyDiv = document.createElement('div');
      emptyDiv.classList.add('day');
      emptyDiv.style.border = 'none';
      emptyDiv.style.cursor = 'default';
      daysGrid.appendChild(emptyDiv);
    }

    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const dayDiv = document.createElement('div');
      dayDiv.classList.add('day');
      const dateStr = `${ano}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dayDiv.textContent = d;

      if (studyDataDetail[dateStr]) {
        dayDiv.classList.add('has-study');
        dayDiv.title = `Horas estudadas: ${studyDataDetail[dateStr].toFixed(2)} h`;
      }

      dayDiv.onclick = () => {
        if (studyDataDetail[dateStr]) {
          alert(`Data: ${dateStr}\nHoras estudadas: ${studyDataDetail[dateStr].toFixed(2)} h`);
        } else {
          alert(`Data: ${dateStr}\nNenhum tempo registrado.`);
        }
      };

      daysGrid.appendChild(dayDiv);
    }

    monthDiv.appendChild(daysGrid);
    calendarContainer.appendChild(monthDiv);
  }
}

function preencherAnoSelector() {
  const anoAtual = new Date().getFullYear();
  for (let i = anoAtual - 5; i <= anoAtual + 5; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i;
    if (i === anoAtual) option.selected = true;
    yearSelector.appendChild(option);
  }
}

yearSelector.onchange = () => {
  gerarCalendario(Number(yearSelector.value));
};

function editarTempoHoje() {
  const hoje = new Date().toISOString().slice(0, 10);
  const tempoAtual = studyDataDetail[hoje] || 0;
  let entrada = prompt(`Editar horas estudadas para hoje (formato decimal):`, tempoAtual.toFixed(2));
  if (entrada === null) return;
  entrada = parseFloat(entrada);
  if (isNaN(entrada) || entrada < 0) {
    alert('Por favor insira um número válido.');
    return;
  }

  const antigo = studyDataDetail[hoje] || 0;
  studyDataDetail[hoje] = entrada;
  localStorage.setItem('studyDataDetail', JSON.stringify(studyDataDetail));

  recalcularStudyData();
  atualizarTabela();
  atualizarCalendario();
  atualizarGraficos();
}

function removerTempoHoje() {
  const hoje = new Date().toISOString().slice(0, 10);
  if (studyDataDetail[hoje]) {
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

function atualizarCalendario() {
  gerarCalendario(Number(yearSelector.value));
}

function atualizarGraficos() {
  const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const semanalData = semana.map((_, i) => studyData[i] || 0);
  const mensalData = Array(12).fill(0);
  const anualData = {};

  for (const key in studyDataDetail) {
    const date = new Date(key);
    const hours = studyDataDetail[key] || 0;

    mensalData[date.getMonth()] += hours;
    const year = date.getFullYear();
    if (!anualData[year]) anualData[year] = 0;
    anualData[year] += hours;
  }

  renderChart('chartSemanal', 'Desempenho Semanal', semana, semanalData);
  renderChart('chartMensal', 'Desempenho Mensal', ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], mensalData);
  renderChart('chartAnual', 'Desempenho Anual', Object.keys(anualData), Object.values(anualData));
}

let charts = {};
function renderChart(id, label, labels, data) {
  const ctx = document.getElementById(id).getContext('2d');
  if (charts[id]) charts[id].destroy();

  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Horas'
          }
        }
      }
    }
  });
}

// Inicialização
preencherAnoSelector();
gerarCalendario(new Date().getFullYear());
atualizarTabela();
atualizarGraficos();