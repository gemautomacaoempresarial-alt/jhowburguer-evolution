const { db, nowIso } = require('../db');
const realtime = require('./realtime');

const TIME_ZONE = 'America/Sao_Paulo';
const DAY_KEYS = { mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };
const DAY_MS = 86_400_000;
const MINUTES_PER_DAY = 1440;
const DEFAULT_NOTICE_MINUTES = 120;

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function settingsObject() {
  return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((row) => [row.key, row.value]));
}

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type, fallback = '') => parts.find((part) => part.type === type)?.value || fallback;
  const weekday = get('weekday').slice(0, 3).toLowerCase();
  const hour = get('hour', '00') === '24' ? '00' : get('hour', '00');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: DAY_KEYS[weekday] || weekday,
    time: `${hour}:${get('minute', '00')}`,
    second: get('second', '00'),
  };
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

function timeToMinutes(value) {
  if (!validTime(value)) return null;
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
}

function dateToDayNumber(dateKey) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS);
}

function dayNumberToDate(dayNumber) {
  const date = new Date(Number(dayNumber) * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function weekdayForDate(dateKey) {
  const dayNumber = dateToDayNumber(dateKey);
  if (dayNumber == null) return '';
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(new Date(dayNumber * DAY_MS)).slice(0, 3).toLowerCase();
  return DAY_KEYS[short] || short;
}

function localAbsoluteMinutes(dateKey, time) {
  const dayNumber = dateToDayNumber(dateKey);
  const minutes = timeToMinutes(time);
  return dayNumber == null || minutes == null ? null : dayNumber * MINUTES_PER_DAY + minutes;
}

function absoluteToLocal(absMinutes) {
  if (!Number.isFinite(Number(absMinutes))) return null;
  const value = Number(absMinutes);
  const dayNumber = Math.floor(value / MINUTES_PER_DAY);
  const minuteOfDay = ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return {
    date: dayNumberToDate(dayNumber),
    time: `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`,
    absoluteMinutes: value,
  };
}

function scheduleWindowForDate(schedule, dateKey) {
  const weekday = weekdayForDate(dateKey);
  const range = Array.isArray(schedule?.[weekday]) ? schedule[weekday] : [];
  const start = validTime(range[0]) ? String(range[0]) : null;
  const end = validTime(range[1]) ? String(range[1]) : null;
  if (!start || !end) return null;
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const startAbs = localAbsoluteMinutes(dateKey, start);
  if (startAbs == null) return null;
  // Horários iguais são tratados como 24 horas. Quando o final é menor ou igual
  // ao início, o expediente termina no dia seguinte (ex.: 19:30 → 00:00).
  const crossesMidnight = endMinutes <= startMinutes;
  const endAbs = localAbsoluteMinutes(dateKey, end) + (crossesMidnight ? MINUTES_PER_DAY : 0);
  return {
    anchorDate: dateKey,
    weekday,
    start,
    end,
    startAbs,
    endAbs,
    crossesMidnight,
  };
}

function parseLocalDateTime(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})[T ]([0-2]\d:[0-5]\d)$/);
  if (!match || !validTime(match[2])) return null;
  const absoluteMinutes = localAbsoluteMinutes(match[1], match[2]);
  return absoluteMinutes == null ? null : { date: match[1], time: match[2], absoluteMinutes };
}

function extensionFromSettings(settings, schedule, now) {
  const modern = parseLocalDateTime(settings.business_hours_extension_until_at);
  if (modern) {
    return {
      anchorDate: String(settings.business_hours_extension_anchor_date || modern.date),
      untilDate: modern.date,
      until: modern.time,
      untilAt: `${modern.date}T${modern.time}`,
      untilAbs: modern.absoluteMinutes,
      createdBy: Number(settings.business_hours_extension_created_by || 0) || null,
      createdAt: settings.business_hours_extension_created_at || null,
    };
  }

  // Compatibilidade com versões anteriores, que guardavam apenas data e hora.
  const legacyDate = String(settings.business_hours_extension_date || '');
  const legacyUntil = String(settings.business_hours_extension_until || '');
  if (!legacyDate || !validTime(legacyUntil)) return null;
  const anchorWindow = scheduleWindowForDate(schedule, legacyDate);
  let untilAbs = localAbsoluteMinutes(legacyDate, legacyUntil);
  if (anchorWindow && untilAbs <= anchorWindow.startAbs) untilAbs += MINUTES_PER_DAY;
  const parsed = absoluteToLocal(untilAbs);
  if (!parsed) return null;
  return {
    anchorDate: legacyDate,
    untilDate: parsed.date,
    until: parsed.time,
    untilAt: `${parsed.date}T${parsed.time}`,
    untilAbs,
    createdBy: Number(settings.business_hours_extension_created_by || 0) || null,
    createdAt: settings.business_hours_extension_created_at || null,
  };
}

function findNextWindow(schedule, currentAbs, currentDate) {
  const currentDay = dateToDayNumber(currentDate);
  if (currentDay == null) return null;
  for (let offset = 0; offset <= 8; offset += 1) {
    const dateKey = dayNumberToDate(currentDay + offset);
    const window = scheduleWindowForDate(schedule, dateKey);
    if (window && window.startAbs > currentAbs) return window;
  }
  return null;
}

function noticeMinutes(settings) {
  const configured = Number(settings.business_hours_extension_notice_minutes || DEFAULT_NOTICE_MINUTES);
  return Number.isFinite(configured) ? Math.max(15, Math.min(360, Math.round(configured))) : DEFAULT_NOTICE_MINUTES;
}

function getBusinessStatus(settings = settingsObject(), date = new Date()) {
  const now = localParts(date);
  const currentAbs = localAbsoluteMinutes(now.date, now.time);
  const enabled = String(settings.business_hours_enabled || 'false') === 'true';
  if (!enabled) {
    return {
      enabled: false,
      open: true,
      ended: false,
      alertActive: false,
      date: now.date,
      currentTime: now.time,
      message: 'Horário de atendimento desativado',
      today: null,
      activeWindow: null,
      lastClosedWindow: null,
      nextWindow: null,
      extension: null,
      alertExpiresAt: null,
    };
  }

  const schedule = safeJson(settings.business_hours_json, {});
  const currentDay = dateToDayNumber(now.date);
  const candidates = [];
  for (let offset = -2; offset <= 1; offset += 1) {
    const dateKey = dayNumberToDate(currentDay + offset);
    const window = scheduleWindowForDate(schedule, dateKey);
    if (window) candidates.push(window);
  }

  const regularActive = candidates.find((window) => currentAbs >= window.startAbs && currentAbs < window.endAbs) || null;
  const extension = extensionFromSettings(settings, schedule, now);
  const extensionBaseWindow = extension
    ? (candidates.find((window) => window.anchorDate === extension.anchorDate) || scheduleWindowForDate(schedule, extension.anchorDate))
    : null;
  const extensionStartsAt = extensionBaseWindow?.startAbs ?? localAbsoluteMinutes(extension?.anchorDate, '00:00');
  const extensionActive = Boolean(
    extension
    && extensionStartsAt != null
    && currentAbs >= extensionStartsAt
    && currentAbs < extension.untilAbs
  );
  const open = Boolean(regularActive || extensionActive);

  const closedCandidates = candidates.filter((window) => window.endAbs <= currentAbs);
  if (extension && extension.untilAbs <= currentAbs) {
    closedCandidates.push({
      anchorDate: extension.anchorDate,
      weekday: weekdayForDate(extension.anchorDate),
      start: candidates.find((window) => window.anchorDate === extension.anchorDate)?.start || '',
      end: extension.until,
      startAbs: candidates.find((window) => window.anchorDate === extension.anchorDate)?.startAbs || extension.untilAbs,
      endAbs: extension.untilAbs,
      crossesMidnight: extension.untilDate !== extension.anchorDate,
      extended: true,
    });
  }
  const lastClosedWindow = closedCandidates.sort((a, b) => b.endAbs - a.endAbs)[0] || null;
  const noticeDuration = noticeMinutes(settings);
  const alertActive = Boolean(!open && lastClosedWindow && currentAbs >= lastClosedWindow.endAbs && currentAbs < lastClosedWindow.endAbs + noticeDuration);
  const nextWindow = findNextWindow(schedule, currentAbs, now.date);
  const todayWindow = scheduleWindowForDate(schedule, now.date);
  const activeBase = regularActive || (extension ? candidates.find((window) => window.anchorDate === extension.anchorDate) : null);
  const effectiveEndAbs = extensionActive ? extension.untilAbs : regularActive?.endAbs;
  const effectiveEnd = effectiveEndAbs != null ? absoluteToLocal(effectiveEndAbs) : null;

  let message = 'Fechado no momento';
  if (extensionActive) message = `Atendimento prolongado até ${extension.until}`;
  else if (regularActive) message = `Aberto até ${absoluteToLocal(regularActive.endAbs)?.time || regularActive.end}`;
  else if (nextWindow) {
    const sameDay = nextWindow.anchorDate === now.date;
    message = sameDay ? `Fechado · abre às ${nextWindow.start}` : `Fechado · próximo atendimento em ${nextWindow.anchorDate} às ${nextWindow.start}`;
  } else message = 'Fechado sem próximo horário configurado';

  const endedAt = lastClosedWindow ? absoluteToLocal(lastClosedWindow.endAbs) : null;
  const alertExpires = lastClosedWindow ? absoluteToLocal(lastClosedWindow.endAbs + noticeDuration) : null;

  return {
    enabled: true,
    open,
    ended: alertActive,
    alertActive,
    date: now.date,
    weekday: now.weekday,
    currentTime: now.time,
    currentAbsoluteMinutes: currentAbs,
    message,
    today: todayWindow ? {
      start: todayWindow.start,
      end: todayWindow.end,
      effectiveEnd: activeBase && effectiveEnd ? effectiveEnd.time : todayWindow.end,
      crossesMidnight: todayWindow.crossesMidnight,
    } : null,
    activeWindow: regularActive ? {
      anchorDate: regularActive.anchorDate,
      start: regularActive.start,
      end: regularActive.end,
      endDate: absoluteToLocal(regularActive.endAbs)?.date,
      effectiveEnd: effectiveEnd?.time || regularActive.end,
      effectiveEndDate: effectiveEnd?.date || absoluteToLocal(regularActive.endAbs)?.date,
    } : (extensionActive ? {
      anchorDate: extension.anchorDate,
      start: activeBase?.start || '',
      end: activeBase?.end || extension.until,
      endDate: extension.untilDate,
      effectiveEnd: extension.until,
      effectiveEndDate: extension.untilDate,
      extended: true,
    } : null),
    lastClosedWindow: lastClosedWindow ? {
      anchorDate: lastClosedWindow.anchorDate,
      start: lastClosedWindow.start,
      end: absoluteToLocal(lastClosedWindow.endAbs)?.time || lastClosedWindow.end,
      endedDate: endedAt?.date || now.date,
      endedAt: endedAt ? `${endedAt.date}T${endedAt.time}` : null,
      extended: Boolean(lastClosedWindow.extended),
    } : null,
    nextWindow: nextWindow ? {
      anchorDate: nextWindow.anchorDate,
      start: nextWindow.start,
      end: nextWindow.end,
      crossesMidnight: nextWindow.crossesMidnight,
    } : null,
    extension: extension ? {
      date: extension.anchorDate,
      until: extension.until,
      untilDate: extension.untilDate,
      untilAt: extension.untilAt,
      createdBy: extension.createdBy,
      createdAt: extension.createdAt,
      active: extensionActive,
    } : null,
    alertExpiresAt: alertExpires ? `${alertExpires.date}T${alertExpires.time}` : null,
    alertDurationMinutes: noticeDuration,
  };
}

function upsertSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
  `).run(key, String(value ?? ''), nowIso());
}

function extendToday(until, userId = null) {
  const cleanUntil = String(until || '').trim();
  if (!validTime(cleanUntil)) throw new Error('Informe um horário válido para o prolongamento.');
  const settings = settingsObject();
  const current = getBusinessStatus(settings);
  if (!current.enabled) throw new Error('O horário de atendimento está desativado nas configurações.');
  if (!current.open && !current.alertActive) throw new Error('O prazo de 2 horas para prolongar este expediente já terminou.');

  const currentAbs = current.currentAbsoluteMinutes;
  const currentMinutes = timeToMinutes(current.currentTime);
  const untilMinutes = timeToMinutes(cleanUntil);
  let targetAbs = localAbsoluteMinutes(current.date, cleanUntil);
  if (targetAbs == null || currentAbs == null || currentMinutes == null || untilMinutes == null) throw new Error('Não foi possível calcular o horário informado.');
  if (targetAbs < currentAbs + 5) targetAbs += MINUTES_PER_DAY;
  if (targetAbs < currentAbs + 5) throw new Error('Escolha um horário pelo menos 5 minutos após o horário atual.');
  // Impede prolongamentos acidentais de mais de 12 horas pelo seletor de hora.
  if (targetAbs - currentAbs > 12 * 60) throw new Error('O prolongamento pode ter no máximo 12 horas.');

  const target = absoluteToLocal(targetAbs);
  const anchorDate = current.activeWindow?.anchorDate || current.lastClosedWindow?.anchorDate || current.date;
  upsertSetting('business_hours_extension_anchor_date', anchorDate);
  upsertSetting('business_hours_extension_until_at', `${target.date}T${target.time}`);
  // Mantém os campos antigos preenchidos para compatibilidade com instalações anteriores.
  upsertSetting('business_hours_extension_date', anchorDate);
  upsertSetting('business_hours_extension_until', target.time);
  upsertSetting('business_hours_extension_created_by', Number(userId || 0));
  upsertSetting('business_hours_extension_created_at', nowIso());
  const status = getBusinessStatus(settingsObject());
  realtime.emit('business-hours:updated', status);
  return status;
}

let schedulerTimer = null;
let lastEndedKey = '';
let lastStatusKey = '';

function checkBusinessHours() {
  const status = getBusinessStatus();
  const endedKey = status.alertActive ? String(status.lastClosedWindow?.endedAt || '') : '';
  if (status.alertActive && endedKey && endedKey !== lastEndedKey) {
    lastEndedKey = endedKey;
    realtime.emit('business-hours:ended', status);
  } else if (!status.alertActive) {
    lastEndedKey = '';
  }
  const statusKey = `${status.open}:${status.message}:${status.extension?.untilAt || ''}:${status.alertActive}`;
  if (statusKey !== lastStatusKey) {
    lastStatusKey = statusKey;
    realtime.emit('business-hours:updated', status);
  }
  return status;
}

function startBusinessHoursScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  setTimeout(() => { try { checkBusinessHours(); } catch (error) { console.error('[Horário] Falha na verificação inicial:', error.message); } }, 3000).unref?.();
  schedulerTimer = setInterval(() => {
    try { checkBusinessHours(); } catch (error) { console.error('[Horário] Falha ao verificar encerramento:', error.message); }
  }, 30000);
  schedulerTimer.unref?.();
}

module.exports = {
  TIME_ZONE,
  getBusinessStatus,
  extendToday,
  startBusinessHoursScheduler,
  settingsObject,
  localParts,
  validTime,
  timeToMinutes,
  localAbsoluteMinutes,
  absoluteToLocal,
  scheduleWindowForDate,
};
