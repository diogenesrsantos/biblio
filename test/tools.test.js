const test = require('node:test');
const assert = require('node:assert/strict');
const { formatCalculatorDisplay, Calculator, nationalHolidays, yearHolidays, validDate } = require('../public/tools-core');
function calculate(...keys) { const calc = new Calculator(); keys.forEach(key => String(key).split(' ').forEach(value => calc.press(value))); return calc; }
test('calculadora: operações, decimais, porcentagens e operações unárias', () => {
  assert.equal(calculate('8 / 2 =').display, '4');
  assert.equal(calculate('7 * 6 =').display, '42');
  assert.equal(calculate('9 - 2 =').display, '7');
  assert.equal(calculate('0 . 1 + 0 . 2 =').display, '0.3');
  assert.equal(calculate('2 0 0 + 1 0 % =').display, '220');
  assert.equal(calculate('2 0 0 - 1 0 % =').display, '180');
  assert.equal(calculate('2 0 0 * 1 0 % =').display, '20');
  assert.equal(calculate('9 sqrt square').display, '9');
  assert.equal(calculate('pi').display, '3.14159265359');
  assert.equal(calculate('2 + 3 = =').display, '8');
  assert.equal(calculate('2 0 0 + 1 0 % + 5 =').display, '225');
  assert.equal(calculate('8 + - 2 =').display, '6');
});
test('calculadora: memória, erros e recuperação', () => {
  const calc = calculate('8 M+ C 3 M- C MR');
  assert.equal(calc.display, '5');
  calc.press('MC'); calc.press('MR'); assert.equal(calc.display, '0');
  assert.equal(calculate('2 / 0 =').display, 'Erro');
  assert.equal(calculate('9 sign sqrt').display, 'Erro');
  assert.equal(calculate('2 / 0 = 7').display, '7');
  assert.equal(calculate('1 sign back').display, '0');
});
test('calendário: nacionais, Paixão de Cristo e pontos facultativos', () => {
  const holidays = nationalHolidays(2026);
  assert.equal(holidays.length, 10);
  assert.equal(holidays.find(item => item.name === 'Paixão de Cristo').date, '2026-04-03');
  assert.equal(nationalHolidays(2027).find(item => item.name === 'Paixão de Cristo').date, '2027-03-26');
  assert.ok(holidays.some(item => item.date === '2026-11-20'));
  assert.ok(!nationalHolidays(2023).some(item => item.date.endsWith('11-20')));
  assert.ok(!holidays.some(item => /Carnaval|Corpus Christi/.test(item.name)));
});
test('calendário: datas inválidas, recorrência e ano bissexto', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2026-2-01'), false);
  assert.equal(validDate('1899-01-01'), false);
  const custom = [{ id: 1, name: 'Regional', date: '2024-02-29', annual: 1 }, { id: 2, name: 'Único', date: '2026-10-15', annual: 0 }];
  assert.ok(!yearHolidays(2026, custom).some(item => item.id === 1));
  assert.ok(yearHolidays(2028, custom).some(item => item.date === '2028-02-29'));
  assert.ok(!yearHolidays(2028, custom).some(item => item.id === 2));
});

test('visor: agrupa milhares preservando decimais digitados, sinal e expoente', () => {
  for (const [raw, formatted] of [['1234', '1.234'], ['1234567.89', '1.234.567,89'], ['-12345.00', '-12.345,00'], ['1234.', '1.234,'], ['0.001', '0,001'], ['1.23e+21', '1,23e+21'], ['Erro', 'Erro']]) {
    assert.equal(formatCalculatorDisplay(raw), formatted);
  }
});
