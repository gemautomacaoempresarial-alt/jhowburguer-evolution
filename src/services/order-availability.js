const { getBusinessStatus, settingsObject } = require('./business-hours');
const { getLunchStatus, isLunchProduct } = require('./lunch-menu');

function getOrderingStatus(settings = settingsObject(), date = new Date()) {
  const regular = getBusinessStatus(settings, date);
  const lunch = getLunchStatus(settings, date);
  const phase = lunch.available ? 'lunch' : (regular.open ? 'regular' : 'closed');
  const open = phase !== 'closed';
  const nextRegular = regular.nextWindow;
  const message = phase === 'lunch'
    ? `O almoço está disponível até ${lunch.end}. Os pedidos normais funcionam no horário noturno configurado.`
    : phase === 'regular'
      ? regular.message
      : `Estamos fora do horário de pedidos. O almoço funciona das ${lunch.start} às ${lunch.end}.${nextRegular ? ` O próximo atendimento normal começa ${nextRegular.anchorDate === regular.date ? `às ${nextRegular.start}` : `em ${nextRegular.anchorDate} às ${nextRegular.start}`}.` : ''}`;
  return {
    open,
    phase,
    regular,
    lunch,
    message,
    canOrderLunch: lunch.available,
    canOrderRegular: regular.open && !lunch.available,
  };
}

function canOrderProduct(product, settings = settingsObject(), date = new Date()) {
  const status = getOrderingStatus(settings, date);
  return isLunchProduct(product) ? status.canOrderLunch : status.canOrderRegular;
}

function unavailableMessage(status = getOrderingStatus()) {
  if (status.phase === 'lunch') {
    return `🍽️ *HORÁRIO DO ALMOÇO*\n\nNeste momento estão disponíveis apenas as marmitex, das *${status.lunch.start} às ${status.lunch.end}*.\n\nDigite *ALMOÇO* para ver as opções. Os pedidos normais voltam no horário noturno configurado.`;
  }
  const next = status.regular.nextWindow;
  const nextText = next
    ? (next.anchorDate === status.regular.date ? `Hoje, às *${next.start}*.` : `Em *${next.anchorDate}*, às *${next.start}*.`)
    : 'Consulte novamente mais tarde.';
  return `🕒 *ESTAMOS FORA DO HORÁRIO DE PEDIDOS*\n\n🍱 Almoço e marmitex: *${status.lunch.start} às ${status.lunch.end}*\n🌙 Pedidos normais: conforme o horário noturno configurado.\n\nPróximo atendimento normal: ${nextText}\n\nVocê pode tirar dúvidas por aqui, mas novos itens e finalizações ficam pausados enquanto a loja estiver fechada.`;
}

module.exports = {
  getOrderingStatus,
  canOrderProduct,
  unavailableMessage,
};
