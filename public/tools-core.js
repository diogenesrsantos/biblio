/* Shared, offline calculation and calendar rules. */
(function (root) {
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2199;
  }
  function nationalHolidays(year) {
    const fixed = [['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'], ['09-07', 'Independência do Brasil'], ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'], ['12-25', 'Natal']];
    if (year >= 2024) fixed.push(['11-20', 'Dia Nacional de Zumbi e da Consciência Negra']);
    // Gregorian Easter (Meeus/Jones/Butcher); Good Friday is two days earlier.
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    const friday = new Date(Date.UTC(year, Math.floor(n / 31) - 1, n % 31 + 1 - 2, 12));
    return fixed.map(([date, name]) => ({ date: `${year}-${date}`, name, national: true }))
      .concat({ date: friday.toISOString().slice(0, 10), name: 'Paixão de Cristo', national: true }).sort((a, b) => a.date.localeCompare(b.date));
  }
  function yearHolidays(year, custom = []) {
    return nationalHolidays(year).concat(custom.map(item => ({ ...item, date: item.annual ? `${year}-${item.date.slice(5)}` : item.date }))
      .filter(item => item.date.startsWith(`${year}-`) && validDate(item.date))).sort((a, b) => a.date.localeCompare(b.date));
  }
  function formatCalculatorDisplay(value) {
    if (!Number.isFinite(Number(value))) return String(value);
    const [mantissa, exponent] = String(value).split(/e/i);
    const [integer, fraction] = mantissa.split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return grouped + (fraction !== undefined ? ',' + fraction : '') + (exponent !== undefined ? 'e' + exponent : '');
  }
  class Calculator {
    constructor() { this.memory = 0; this.clear(); }
    clear() { this.display = '0'; this.left = null; this.operator = null; this.fresh = true; this.last = null; this.operand = false; }
    value(number) {
      if (!Number.isFinite(number)) { this.clear(); this.display = 'Erro'; return; }
      this.display = String(Number(number.toPrecision(12))); this.fresh = true;
    }
    calculate(a, op, b) { return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b === 0 ? NaN : a / b; }
    press(key) {
      if (/^[0-9.]$/.test(key)) {
        if (this.fresh || this.display === 'Erro') this.display = key === '.' ? '0.' : key;
        else if (key !== '.' || !this.display.includes('.')) {
          if (this.display.length < 16) this.display = this.display === '0' && key !== '.' ? key : this.display + key;
        }
        this.fresh = false; this.operand = true; this.last = null; return;
      }
      if (key === 'C') { this.clear(); return; }
      if (key === 'MC') { this.memory = 0; return; }
      if (key === 'MR') { this.value(this.memory); this.operand = true; return; }
      if (key === 'pi') { this.value(Math.PI); this.operand = true; this.last = null; return; }
      const current = Number(this.display);
      if (!Number.isFinite(current)) return;
      if (key === 'M+' || key === 'M-') { const next = this.memory + (key === 'M+' ? current : -current); if (Number.isFinite(next)) this.memory = next; this.fresh = true; return; }
      if (key === 'back') { this.display = this.display.slice(0, -1).replace(/^-$/, '') || '0'; this.fresh = false; this.operand = true; return; }
      if (['sqrt', 'square', 'sign', '%'].includes(key)) {
        const result = key === 'sqrt' ? Math.sqrt(current) : key === 'square' ? current * current : key === 'sign' ? -current : this.operator && ['+', '-'].includes(this.operator) ? this.left * current / 100 : current / 100;
        this.value(result); this.operand = true; this.last = null; return;
      }
      if (['+', '-', '*', '/'].includes(key)) {
        if (this.operator && this.operand) this.value(this.calculate(this.left, this.operator, current));
        if (this.display === 'Erro') return;
        this.left = Number(this.display); this.operator = key; this.fresh = true; this.operand = false; this.last = null; return;
      }
      if (key === '=') {
        if (this.operator) { const op = this.operator, left = this.left; this.value(this.calculate(left, op, current)); if (this.display !== 'Erro') { this.last = { op, value: current }; this.operator = null; this.left = null; } }
        else if (this.last) this.value(this.calculate(current, this.last.op, this.last.value));
      }
    }
  }
  const exports = { formatCalculatorDisplay, Calculator, nationalHolidays, yearHolidays, validDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  else root.BiblioTools = exports;
})(typeof window !== 'undefined' ? window : globalThis);
