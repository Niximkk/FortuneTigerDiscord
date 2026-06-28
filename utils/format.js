const config = require('../config.json');

function formatCurrency(value) {
  const formatted = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${config.currency.symbol} ${formatted}`;
}

module.exports = { formatCurrency };
