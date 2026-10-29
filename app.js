/**
 * @fileoverview Frontend application logic for the Jira Clone Kanban Board.
 * Optimized for iframe embedding in Google Sites with zero framework dependencies.
 *
 * Implements REST API communication, dual card movement (native HTML5 Drag & Drop
 * and accessible mobile touch buttons), and user-friendly notifications in Spanish.
 */

(function () {
  'use strict';

  // =========================================================================
  // Configuration & State
  // =========================================================================

  /**
   * Base REST API URL. Can be overridden globally via window.KANBAN_API_URL
   * when embedded in production Google Sites iframes.
   */
  const API_BASE_URL = window.KANBAN_API_URL || 'http://localhost:8080/api/v1';

  /**
   * Kanban column statuses definitions.
   * @readonly
   * @enum {string}
   */
  const Status = {
    TODO: 'TODO',
    IN_PROGRESS: 'IN_PROGRESS',
    DONE: 'DONE',
  };

  /**
   * Cached list of tasks in client memory.
   * @type {Array<Object>}
   */
  let currentTasks = [];

  /**
   * DOM elements cache.
   */
  const dom = {
    badgeTodo: document.getElementById('badgeTodo'),
    badgeInProgress: document.getElementById('badgeInProgress'),
    badgeDone: document.getElementById('badgeDone'),
    cardsTodo: document.getElementById('cardsTodo'),
    cardsInProgress: document.getElementById('cardsInProgress'),
    cardsDone: document.getElementById('cardsDone'),
    btnOpenModal: document.getElementById('btnOpenModal'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnCancelModal: document.getElementById('btnCancelModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    createTaskForm: document.getElementById('createTaskForm'),
    taskTitle: document.getElementById('taskTitle'),
    taskDescription: document.getElementById('taskDescription'),
    titleFeedback: document.getElementById('titleFeedback'),
    btnRefresh: document.getElementById('btnRefresh'),
    toastContainer: document.getElementById('toastContainer'),
  };

  // =========================================================================
  // Notifications (Toast)
  // =========================================================================

  /**
   * Displays an ephemeral notification toast.
   * @param {string} message - Message text in Spanish.
   * @param {'info'|'success'|'error'} type - Category of toast.
   */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // =========================================================================
  // API REST Client Functions
  // =========================================================================

  /**
   * Fetches all tasks from the Go backend.
   * @async
   */
  async function fetchTasks() {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const tasks = await response.json();
      currentTasks = Array.isArray(tasks) ? tasks : [];
      renderBoard();
    } catch (err) {
      console.error('Failed to load tasks:', err);
      showToast('No se pudo conectar con el servidor de tareas.', 'error');
    }
  }

  /**
   * Creates a new task via the Go backend.
   * @async
   * @param {string} title
   * @param {string} description
   * @returns {Promise<boolean>}
   */
  async function createTask(title, description) {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ title, description }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear la tarea');
      }

      showToast('Tarea creada exitosamente', 'success');
      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error creating task:', err);
      showToast(err.message, 'error');
      return false;
    }
  }

  /**
   * Updates an existing task's status.
   * @async
   * @param {string} taskId - UUID of the task.
   * @param {string} newStatus - Target Status enum.
   */
  async function updateTaskStatus(taskId, newStatus) {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al actualizar el estado de la tarea');
      }

      showToast('Estado de tarea actualizado', 'success');
      await fetchTasks();
    } catch (err) {
      console.error('Error updating status:', err);
      showToast(err.message, 'error');
      renderBoard(); // Re-render to revert any optimistic UI drift
    }
  }

  // =========================================================================
  // Board Rendering & Card Generation
  // =========================================================================

  /**
   * Re-renders all 3 columns and counts on the Kanban board.
   */
  function renderBoard() {
    dom.cardsTodo.innerHTML = '';
    dom.cardsInProgress.innerHTML = '';
    dom.cardsDone.innerHTML = '';

    let countTodo = 0;
    let countInProgress = 0;
    let countDone = 0;

    currentTasks.forEach((task) => {
      const card = createCardElement(task);

      switch (task.status) {
        case Status.TODO:
          dom.cardsTodo.appendChild(card);
          countTodo++;
          break;
        case Status.IN_PROGRESS:
          dom.cardsInProgress.appendChild(card);
          countInProgress++;
          break;
        case Status.DONE:
          dom.cardsDone.appendChild(card);
          countDone++;
          break;
      }
    });

    dom.badgeTodo.textContent = countTodo;
    dom.badgeInProgress.textContent = countInProgress;
    dom.badgeDone.textContent = countDone;
  }

  /**
   * Generates a single Task Card element with event listeners.
   * @param {Object} task
   * @returns {HTMLElement}
   */
  function createCardElement(task) {
    const card = document.createElement('article');
    card.className = 'task-card';
    card.setAttribute('data-id', task.id);
    card.setAttribute('data-status', task.status);
    card.setAttribute('draggable', 'true');
    card.setAttribute('role', 'listitem');

    // Title & Description
    const titleEl = document.createElement('h3');
    titleEl.className = 'card-title';
    titleEl.textContent = task.title;

    card.appendChild(titleEl);

    if (task.description && task.description.trim() !== '') {
      const descEl = document.createElement('p');
      descEl.className = 'card-desc';
      descEl.textContent = task.description;
      card.appendChild(descEl);
    }

    // Card Footer with Short ID and Quick Action Buttons
    const footer = document.createElement('div');
    footer.className = 'card-footer';

    const idEl = document.createElement('span');
    idEl.className = 'card-id';
    idEl.textContent = task.id.substring(0, 8);
    footer.appendChild(idEl);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    // Contextual movement buttons for mobile touch support
    if (task.status === Status.TODO) {
      const btn = createMoveButton('→ En progreso', () => updateTaskStatus(task.id, Status.IN_PROGRESS));
      actions.appendChild(btn);
    } else if (task.status === Status.IN_PROGRESS) {
      const btnBack = createMoveButton('← Por hacer', () => updateTaskStatus(task.id, Status.TODO));
      const btnNext = createMoveButton('→ Hecho', () => updateTaskStatus(task.id, Status.DONE));
      actions.appendChild(btnBack);
      actions.appendChild(btnNext);
    } else if (task.status === Status.DONE) {
      const btnBack = createMoveButton('← Reabrir', () => updateTaskStatus(task.id, Status.IN_PROGRESS));
      actions.appendChild(btnBack);
    }

    footer.appendChild(actions);
    card.appendChild(footer);

    // Native Drag and Drop listeners
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);

    return card;
  }

  /**
   * Creates a lightweight movement button.
   * @param {string} label
   * @param {Function} onClick
   * @returns {HTMLButtonElement}
   */
  function createMoveButton(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-move';
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  // =========================================================================
  // Native HTML5 Drag and Drop Handlers
  // =========================================================================

  let draggedTaskId = null;

  function handleDragStart(e) {
    draggedTaskId = this.getAttribute('data-id');
    this.classList.add('dragging');
    e.dataTransfer.setData('text/plain', draggedTaskId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
    draggedTaskId = null;
    clearDragOverEffects();
  }

  function clearDragOverEffects() {
    document.querySelectorAll('.column-cards').forEach((el) => {
      el.classList.remove('drag-over');
    });
  }

  // Configure Column Drop Zones
  [dom.cardsTodo, dom.cardsInProgress, dom.cardsDone].forEach((columnCards) => {
    columnCards.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      columnCards.classList.add('drag-over');
    });

    columnCards.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && columnCards.contains(e.relatedTarget)) {
        return;
      }
      columnCards.classList.remove('drag-over');
    });

    columnCards.addEventListener('drop', async (e) => {
      e.preventDefault();
      clearDragOverEffects();

      const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
      const targetStatus = columnCards.getAttribute('data-status');

      if (!taskId || !targetStatus) return;

      const currentTask = currentTasks.find((t) => t.id === taskId);
      if (currentTask && currentTask.status !== targetStatus) {
        await updateTaskStatus(taskId, targetStatus);
      }
    });
  });

  // =========================================================================
  // Modal & Form Handlers
  // =========================================================================

  function openCreateModal() {
    dom.taskTitle.value = '';
    dom.taskDescription.value = '';
    dom.titleFeedback.textContent = '';
    dom.modalBackdrop.hidden = false;
    setTimeout(() => dom.taskTitle.focus(), 50);
  }

  function closeCreateModal() {
    dom.modalBackdrop.hidden = true;
  }

  dom.btnOpenModal.addEventListener('click', openCreateModal);
  dom.btnCloseModal.addEventListener('click', closeCreateModal);
  dom.btnCancelModal.addEventListener('click', closeCreateModal);
  dom.btnRefresh.addEventListener('click', fetchTasks);

  // Close modal when clicking outside dialog
  dom.modalBackdrop.addEventListener('click', (e) => {
    if (e.target === dom.modalBackdrop) {
      closeCreateModal();
    }
  });

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dom.modalBackdrop.hidden) {
      closeCreateModal();
    }
  });

  // Submit Task Form
  dom.createTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = dom.taskTitle.value.trim();
    const description = dom.taskDescription.value.trim();

    if (!title) {
      dom.titleFeedback.textContent = 'El título de la tarea es obligatorio.';
      dom.taskTitle.focus();
      return;
    }

    dom.titleFeedback.textContent = '';
    const success = await createTask(title, description);
    if (success) {
      closeCreateModal();
    }
  });

  // =========================================================================
  // Initialization
  // =========================================================================

  // Fetch initial board state on page load
  fetchTasks();
})();
