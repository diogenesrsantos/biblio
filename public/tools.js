/* Small utilities opened from the main toolbar. */
(() => {
  const { formatCalculatorDisplay, Calculator, yearHolidays, nationalHolidays } = window.BiblioTools;
  const calculator = new Calculator();
  const calculatorDialog = $('#calculatorDialog'), calendarDialog = $('#calendarDialog');
  document.querySelectorAll('[data-tool-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
  [calculatorDialog, calendarDialog].forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
  const keys = [
    ['MC', 'MC', 'Limpar memória'], ['MR', 'MR', 'Recuperar memória'], ['M-', 'M−', 'Subtrair da memória'], ['M+', 'M+', 'Somar à memória'],
    ['C', 'C', 'Limpar cálculo'], ['back', '⌫', 'Apagar dígito'], ['%', '%', 'Porcentagem'], ['/', '÷', 'Dividir'],
    ['sqrt', '√', 'Raiz quadrada'], ['square', 'x²', 'Elevar ao quadrado'], ['pi', 'π', 'Número pi'], ['*', '×', 'Multiplicar'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['-', '−', 'Subtrair'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['+', '+', 'Somar'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['=', '=', 'Calcular'],
    ['sign', '±', 'Inverter sinal'], ['0', '0'], ['.', ',', 'Separador decimal']
  ];
  $('#calculatorKeys').innerHTML = keys.map(([key, label, title]) => `<button type="button" data-key="${key}" aria-label="${title || label}" class="${key === '=' ? 'calculatorEquals' : ''}">${label}</button>`).join('');
  function calculate(key) {
    calculator.press(key);
    $('#calculatorDisplay').textContent = formatCalculatorDisplay(calculator.display);
    fitCalculatorDisplay();
    $('#calculatorStatus').textContent = [calculator.memory !== 0 ? 'M' : '', calculator.operator ? `${formatCalculatorDisplay(calculator.left)} ${calculator.operator.replace('*', '×').replace('/', '÷')}` : ''].filter(Boolean).join(' · ') || '\u00a0';
  }
  $('#calculatorKeys').onclick = event => { const button = event.target.closest('[data-key]'); if (button) calculate(button.dataset.key); };
  function fitCalculatorDisplay() {
    const display = $('#calculatorDisplay');
    const size = Math.min(30, display.clientWidth / (Math.max(display.textContent.length, 1) * .62));
    display.style.fontSize = `${size}px`;
  }
  new ResizeObserver(fitCalculatorDisplay).observe($('#calculatorDisplay'));
  $('#calculatorButton').onclick = () => { calculatorDialog.showModal(); fitCalculatorDisplay(); };
  calculatorDialog.addEventListener('keydown', event => {
    const key = ({ Enter: '=', ',': '.', Backspace: 'back', Delete: 'C', c: 'C', C: 'C' })[event.key] || event.key;
    if (/^[0-9.+*/%=-]$/.test(key) || ['back', 'C'].includes(key)) { event.preventDefault(); calculate(key); }
  });

  let year = new Date().getFullYear(), custom = [];
  const months = Array.from({ length: 12 }, (_, month) => new Date(2026, month, 1).toLocaleDateString('pt-BR', { month: 'long' }));
  const iso = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dateLabel = date => date.slice(8) + '/' + date.slice(5, 7);
  function renderCalendar() {
    $('#calendarYear').value = year;
    $('#calendarPrevious').disabled = year <= 1900;
    $('#calendarNext').disabled = year >= 2199;
    const holidays = yearHolidays(year, custom), today = new Date(), todayDate = iso(today.getFullYear(), today.getMonth(), today.getDate());
    $('#calendarMonths').innerHTML = months.map((name, month) => {
      const start = new Date(year, month, 1).getDay(), days = new Date(year, month + 1, 0).getDate();
      let cells = '<span aria-hidden="true"></span>'.repeat(start);
      for (let day = 1; day <= days; day++) {
        const date = iso(year, month, day), matches = holidays.filter(item => item.date === date);
        const national = matches.some(item => item.national), regional = matches.some(item => !item.national);
        const description = `${day} de ${name} de ${year}${matches.length ? ': ' + matches.map(item => item.name).join('; ') : ''}`;
        cells += `<button type="button" data-date="${date}" class="calendarDay${national ? ' nationalHoliday' : ''}${regional ? ' regionalHoliday' : ''}${date === todayDate ? ' calendarCurrentDay' : ''}" title="${escapeHtml(description)}" aria-label="${escapeHtml(description)}"${date === todayDate ? ' aria-current="date"' : ''}>${day}${regional ? '<small aria-hidden="true">◆</small>' : ''}</button>`;
      }
      return `<section class="calendarMonth"><h3>${name}</h3><div class="calendarWeekdays" aria-hidden="true">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendarDays">${cells}</div></section>`;
    }).join('');
    $('#nationalHolidayList').innerHTML = nationalHolidays(year).map(item => `<li><strong>${dateLabel(item.date)}</strong> — ${escapeHtml(item.name)}</li>`).join('');
    $('#customHolidayList').innerHTML = custom.length ? custom.map(item => `<li><span><strong>${escapeHtml(item.name)}</strong><small>${dateLabel(item.date)}${item.annual ? ' · todos os anos' : '/' + item.date.slice(0, 4)}</small></span><button type="button" data-delete-holiday="${item.id}" aria-label="Excluir ${escapeHtml(item.name)}">Excluir</button></li>`).join('') : '<li class="muted">Nenhum feriado personalizado cadastrado.</li>';
  }
  function changeYear(value) {
    if (!Number.isInteger(value) || value < 1900 || value > 2199) { $('#calendarYear').reportValidity(); return; }
    year = value; renderCalendar();
  }
  $('#calendarButton').onclick = async () => {
    $('#holidayError').textContent = '';
    custom = [];
    renderCalendar(); calendarDialog.showModal();
    $('#holidaySave').disabled = true;
    try { custom = await api('/api/calendar/holidays'); renderCalendar(); $('#holidaySave').disabled = false; }
    catch (error) { $('#holidayError').textContent = 'Não foi possível carregar os feriados. Feche e abra o calendário para tentar novamente. ' + error.message; }
  };
  $('#calendarPrevious').onclick = () => changeYear(year - 1);
  $('#calendarNext').onclick = () => changeYear(year + 1);
  $('#calendarToday').onclick = () => changeYear(new Date().getFullYear());
  $('#calendarYear').onchange = event => changeYear(Number(event.target.value));
  $('#calendarMonths').onclick = event => {
    const button = event.target.closest('[data-date]');
    if (button) { $('#holidayDate').value = button.dataset.date; $('#holidayName').focus(); }
  };
  $('#holidayForm').onsubmit = async event => {
    event.preventDefault(); $('#holidayError').textContent = ''; $('#holidaySave').disabled = true;
    try {
      const item = await api('/api/calendar/holidays', { method: 'POST', body: JSON.stringify({ name: $('#holidayName').value, date: $('#holidayDate').value, annual: $('#holidayAnnual').checked }) });
      custom.push(item); year = Number(item.date.slice(0, 4)); renderCalendar(); $('#holidayName').value = ''; toast('Feriado adicionado.');
    } catch (error) { $('#holidayError').textContent = error.message; }
    finally { $('#holidaySave').disabled = false; }
  };
  $('#customHolidayList').onclick = async event => {
    const button = event.target.closest('[data-delete-holiday]'); if (!button) return;
    button.disabled = true; $('#holidayError').textContent = '';
    try {
      await api('/api/calendar/holidays/' + button.dataset.deleteHoliday, { method: 'DELETE' });
      custom = custom.filter(item => item.id !== Number(button.dataset.deleteHoliday)); renderCalendar();
    } catch (error) { $('#holidayError').textContent = error.message; button.disabled = false; }
  };
})();
