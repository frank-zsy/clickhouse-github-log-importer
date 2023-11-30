import { Context } from 'egg';

module.exports = {
  schedule: {
    cron: '0 0 15 1 * *',
    type: 'worker',
    immediate: true,
    disable: true,
  },
  async task(ctx: Context) {
    ctx.service.giteeImporter.start();
  },
};
