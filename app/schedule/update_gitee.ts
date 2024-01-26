import { Context } from 'egg';

module.exports = {
  schedule: {
    cron: '0 0 0 */3 * *',
    type: 'worker',
    immediate: true,
    disable: false,
  },
  async task(ctx: Context) {
    const importerTaskKey = 'GiteeImporterTask';
    const cache: Map<string, any> = (ctx.app as any).cache;
    ctx.logger.info('App cache is ', Array.from(cache.entries()));
    if (cache.has(importerTaskKey)) {
      ctx.logger.info('Task still running, skip for now.');
      return;
    }
    cache.set(importerTaskKey, true);
    await ctx.service.giteeImporter.start();
    ctx.logger.info('Task done.');
    cache.delete(importerTaskKey);
  },
};
