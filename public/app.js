(function () {
  'use strict';

  const DAYS = [
    { id: 'segunda', name: 'Segunda-feira' },
    { id: 'terca', name: 'Terça-feira' },
    { id: 'quarta', name: 'Quarta-feira' },
    { id: 'quinta', name: 'Quinta-feira' },
    { id: 'sexta', name: 'Sexta-feira' },
    { id: 'sabado', name: 'Sábado' },
    { id: 'domingo', name: 'Domingo' }
  ];

  const STORAGE_KEY = 'minha-rotina-v1';

  // State
  let data = {
    wake: '07:00',
    sleep: '23:00',
    days: {}
  };

  DAYS.forEach(d => {
    data.days[d.id] = [];
  });

  let currentDay = 'segunda';
  let editing = null; // { day, index }

  // DOM refs
  const panelsEl = document.getElementById('panels');
  const wakeInput = document.getElementById('wakeTime');
  const sleepInput = document.getElementById('sleepTime');
  const toastEl = document.getElementById('toast');
  const editModal = document.getElementById('editModal');
  const editTime = document.getElementById('editTime');
  const editDesc = document.getElementById('editDesc');

  // Utils
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(msg, type = 'success') {
    toastEl.textContent = msg;
    toastEl.className = 'toast show ' + type;
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2200);
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Não foi possível salvar:', e);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          data.wake = parsed.wake || '07:00';
          data.sleep = parsed.sleep || '23:00';
          DAYS.forEach(d => {
            data.days[d.id] = Array.isArray(parsed.days?.[d.id])
              ? parsed.days[d.id].filter(t => t && t.time && t.desc)
              : [];
          });
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar dados:', e);
    }
  }

  function sortTasks(tasks) {
    return [...tasks].sort((a, b) => a.time.localeCompare(b.time));
  }

  // Render
  function renderPanels() {
    panelsEl.innerHTML = DAYS.map(day => {
      const tasks = sortTasks(data.days[day.id] || []);
      const isActive = day.id === currentDay;

      let tasksHtml;
      if (tasks.length === 0) {
        tasksHtml = `
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
              <path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/>
            </svg>
            <p>Nenhuma atividade ainda.<br>Adicione a primeira abaixo!</p>
          </div>`;
      } else {
        tasksHtml = tasks.map((task, i) => `
          <div class="task-item" data-index="${i}">
            <span class="task-time">${escapeHtml(task.time)}</span>
            <span class="task-desc">${escapeHtml(task.desc)}</span>
            <div class="task-actions">
              <button class="btn-icon edit" data-action="edit" data-index="${i}" title="Editar" aria-label="Editar atividade">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon" data-action="delete" data-index="${i}" title="Excluir" aria-label="Excluir atividade">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            </div>
          </div>
        `).join('');
      }

      return `
        <div class="day-panel ${isActive ? 'active' : ''}" id="panel-${day.id}" role="tabpanel" aria-labelledby="tab-${day.id}">
          <div class="day-header">
            <h2>${day.name}</h2>
            <span class="day-count">${tasks.length} atividade${tasks.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="task-list">
            ${tasksHtml}
          </div>
          <form class="add-form" data-day="${day.id}">
            <div>
              <label for="time-${day.id}">Horário</label>
              <input type="time" id="time-${day.id}" required value="08:00">
            </div>
            <div>
              <label for="desc-${day.id}">Atividade</label>
              <input type="text" id="desc-${day.id}" placeholder="Ex: Academia, estudo, leitura..." maxlength="120" required autocomplete="off">
            </div>
            <button type="submit" class="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Adicionar
            </button>
          </form>
        </div>
      `;
    }).join('');

    // Re-attach event listeners for forms and buttons
    attachPanelEvents();
  }

  function attachPanelEvents() {
    // Add forms
    document.querySelectorAll('.add-form').forEach(form => {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const day = this.dataset.day;
        const timeInput = this.querySelector('input[type="time"]');
        const descInput = this.querySelector('input[type="text"]');
        const time = timeInput.value;
        const desc = descInput.value.trim();

        if (!time || !desc) return;

        data.days[day].push({ time, desc });
        data.days[day] = sortTasks(data.days[day]);
        save();
        renderPanels();
        showToast('Atividade adicionada!');
        // Keep focus on the same day
        switchDay(day);
      });
    });

    // Task action buttons
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', function () {
        const action = this.dataset.action;
        const index = parseInt(this.dataset.index, 10);
        const panel = this.closest('.day-panel');
        const day = panel.id.replace('panel-', '');

        if (action === 'delete') {
          data.days[day].splice(index, 1);
          save();
          renderPanels();
          showToast('Atividade removida');
          switchDay(day);
        } else if (action === 'edit') {
          const task = data.days[day][index];
          editing = { day, index };
          editTime.value = task.time;
          editDesc.value = task.desc;
          editModal.classList.add('open');
          editDesc.focus();
        }
      });
    });
  }

  function switchDay(dayId) {
    currentDay = dayId;
    document.querySelectorAll('.day-tab').forEach(tab => {
      const isActive = tab.dataset.day === dayId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });
    document.querySelectorAll('.day-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${dayId}`);
    });
  }

  // Init
  function init() {
    load();
    wakeInput.value = data.wake;
    sleepInput.value = data.sleep;
    renderPanels();

    // Day tabs
    document.querySelectorAll('.day-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchDay(tab.dataset.day);
      });
    });

    // Global times
    wakeInput.addEventListener('change', () => {
      data.wake = wakeInput.value;
      save();
      showToast('Horário de acordar salvo');
    });

    sleepInput.addEventListener('change', () => {
      data.sleep = sleepInput.value;
      save();
      showToast('Horário de dormir salvo');
    });

    // Modal
    document.getElementById('btnCancelEdit').addEventListener('click', () => {
      editModal.classList.remove('open');
      editing = null;
    });

    document.getElementById('btnSaveEdit').addEventListener('click', () => {
      if (!editing) return;
      const time = editTime.value;
      const desc = editDesc.value.trim();
      if (!time || !desc) return;

      data.days[editing.day][editing.index] = { time, desc };
      data.days[editing.day] = sortTasks(data.days[editing.day]);
      save();
      renderPanels();
      showToast('Atividade atualizada!');
      switchDay(editing.day);
      editModal.classList.remove('open');
      editing = null;
    });

    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) {
        editModal.classList.remove('open');
        editing = null;
      }
    });

    // Keyboard escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && editModal.classList.contains('open')) {
        editModal.classList.remove('open');
        editing = null;
      }
    });

    // Export PDF
    document.getElementById('btnExport').addEventListener('click', () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 18;
      let y = 20;

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42);
      doc.text('Minha Rotina Semanal', pageWidth / 2, y, { align: 'center' });
      y += 10;

      // Wake & Sleep
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(70, 70, 70);
      doc.text(`Acordar: ${data.wake}   |   Dormir: ${data.sleep}`, pageWidth / 2, y, { align: 'center' });
      y += 12;

      // Line
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      DAYS.forEach((day, dayIndex) => {
        const tasks = sortTasks(data.days[day.id] || []);

        // Check if we need a new page
        if (y > 260) {
          doc.addPage();
          y = 20;
        }

        // Day name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(day.name, margin, y);
        y += 7;

        if (tasks.length === 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(10);
          doc.setTextColor(140, 140, 140);
          doc.text('Nenhuma atividade', margin + 4, y);
          y += 8;
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(40, 40, 40);

          tasks.forEach(task => {
            if (y > 275) {
              doc.addPage();
              y = 20;
            }
            const line = `${task.time}  —  ${task.desc}`;
            doc.text(line, margin + 4, y);
            y += 6;
          });
          y += 4;
        }

        // Separator between days (except last)
        if (dayIndex < DAYS.length - 1) {
          doc.setDrawColor(230, 230, 230);
          doc.line(margin, y, pageWidth - margin, y);
          y += 8;
        }
      });

      // Footer
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}  •  Página ${i} de ${totalPages}`, pageWidth / 2, 290, { align: 'center' });
      }

      doc.save('minha-rotina.pdf');
      showToast('PDF baixado com sucesso!');
    });

    // Clear all
    document.getElementById('btnClear').addEventListener('click', () => {
      if (confirm('Tem certeza que deseja apagar toda a rotina? Esta ação não pode ser desfeita.')) {
        data = {
          wake: '07:00',
          sleep: '23:00',
          days: {}
        };
        DAYS.forEach(d => { data.days[d.id] = []; });
        wakeInput.value = '07:00';
        sleepInput.value = '23:00';
        save();
        renderPanels();
        showToast('Rotina limpa');
        switchDay('segunda');
      }
    });
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();