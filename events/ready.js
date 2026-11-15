const { Events, ActivityType } = require('discord.js');

const STATUSES = [
  { name: 'Win up to 2500x!', type: ActivityType.Custom },
  { name: 'Respins in Fortune Tiger Feature!', type: ActivityType.Custom },
  { name: 'x10 multiplier with full screen win!', type: ActivityType.Custom },
];

let statusIndex = 0;

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`[Bot] Logado como ${client.user.tag}`);

    const updateStatus = () => {
      const status = STATUSES[statusIndex];
      client.user.setPresence({ activities: [status] });
      statusIndex = (statusIndex + 1) % STATUSES.length;
    };

    updateStatus();
    setInterval(updateStatus, 15_000).unref();
  },
};
