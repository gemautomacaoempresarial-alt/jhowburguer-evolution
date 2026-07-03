const assert = require('node:assert/strict');
const { getBusinessStatus } = require('../src/services/business-hours');
const { getOrderingStatus } = require('../src/services/order-availability');

function dateAtBrazilTime(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

const regularSettings = {
  business_hours_enabled: 'true',
  business_hours_json: JSON.stringify({ fri: ['19:30', '00:00'] }),
  business_hours_extension_notice_minutes: '120',
  lunch_menu_enabled: 'true',
  lunch_menu_start: '09:00',
  lunch_menu_end: '14:00',
};

let status = getBusinessStatus(regularSettings, dateAtBrazilTime('2026-07-03', '19:29'));
assert.equal(status.open, false, 'O atendimento normal não deve abrir antes das 19:30.');

status = getBusinessStatus(regularSettings, dateAtBrazilTime('2026-07-03', '19:30'));
assert.equal(status.open, true, 'O atendimento deve abrir exatamente às 19:30.');
assert.equal(status.activeWindow?.anchorDate, '2026-07-03');
assert.equal(status.activeWindow?.effectiveEnd, '00:00');
assert.equal(status.activeWindow?.effectiveEndDate, '2026-07-04');

status = getBusinessStatus(regularSettings, dateAtBrazilTime('2026-07-03', '23:59'));
assert.equal(status.open, true, 'O atendimento deve permanecer aberto até 23:59.');

status = getBusinessStatus(regularSettings, dateAtBrazilTime('2026-07-04', '00:00'));
assert.equal(status.open, false, 'O atendimento deve fechar exatamente à meia-noite.');
assert.equal(status.alertActive, true, 'O aviso de encerramento deve aparecer à meia-noite.');
assert.equal(status.lastClosedWindow?.endedAt, '2026-07-04T00:00');
assert.equal(status.alertExpiresAt, '2026-07-04T02:00');

status = getBusinessStatus(regularSettings, dateAtBrazilTime('2026-07-04', '01:59'));
assert.equal(status.alertActive, true, 'O aviso deve continuar disponível até 01:59.');

status = getBusinessStatus(regularSettings, dateAtBrazilTime('2026-07-04', '02:00'));
assert.equal(status.alertActive, false, 'O aviso deve desaparecer exatamente às 02:00.');
assert.equal(status.open, false, 'O sistema deve continuar fechado após o aviso desaparecer.');

const extendedSettings = {
  ...regularSettings,
  business_hours_extension_anchor_date: '2026-07-03',
  business_hours_extension_until_at: '2026-07-04T01:30',
};

status = getBusinessStatus(extendedSettings, dateAtBrazilTime('2026-07-03', '10:00'));
assert.equal(status.open, false, 'Um prolongamento noturno não pode abrir a loja antes do início do expediente.');
assert.equal(status.extension?.active, false);

status = getBusinessStatus(extendedSettings, dateAtBrazilTime('2026-07-04', '00:30'));
assert.equal(status.open, true, 'O prolongamento deve funcionar após a virada do dia.');
assert.equal(status.extension?.active, true);
assert.equal(status.message, 'Atendimento prolongado até 01:30');

status = getBusinessStatus(extendedSettings, dateAtBrazilTime('2026-07-04', '01:30'));
assert.equal(status.open, false, 'O prolongamento deve terminar exatamente no horário escolhido.');
assert.equal(status.extension?.active, false);

let ordering = getOrderingStatus(regularSettings, dateAtBrazilTime('2026-07-03', '10:00'));
assert.equal(ordering.phase, 'lunch', 'Das 09:00 às 14:00 deve valer o período de almoço.');
assert.equal(ordering.canOrderLunch, true);
assert.equal(ordering.canOrderRegular, false, 'O cardápio normal não deve aceitar pedidos durante o almoço.');

ordering = getOrderingStatus(regularSettings, dateAtBrazilTime('2026-07-03', '14:00'));
assert.equal(ordering.phase, 'closed', 'Às 14:00 o cardápio de almoço deve encerrar.');
assert.equal(ordering.canOrderLunch, false);
assert.equal(ordering.canOrderRegular, false);

ordering = getOrderingStatus(regularSettings, dateAtBrazilTime('2026-07-03', '20:00'));
assert.equal(ordering.phase, 'regular', 'Às 20:00 deve valer o cardápio normal.');
assert.equal(ordering.canOrderLunch, false);
assert.equal(ordering.canOrderRegular, true);

console.log('Horários de almoço, expediente noturno, virada do dia e aviso de 2 horas testados com sucesso.');
