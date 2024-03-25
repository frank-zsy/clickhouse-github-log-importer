import { Context } from 'egg';

module.exports = {
  schedule: {
    cron: '0 0 */1 * * *',
    type: 'worker',
    immediate: false,
    disable: false,
  },
  async task(ctx: Context) {
    const importerTaskKey = 'GitHubImporterTask';
    const cache: Map<string, any> = (ctx.app as any).cache;
    ctx.logger.info('App cache is ', Array.from(cache.entries()));
    if (cache.has(importerTaskKey)) {
      ctx.logger.info('Task still running, skip for now.');
      return;
    }
    cache.set(importerTaskKey, true);
    try {
      const showStat = (prefix: any, meta: any) => {
        ctx.logger.info(prefix, 'Meta stat ', ctx.service.fileUtils.metaDataStat(meta));
      };
      ctx.logger.info('File process task scheduled');
      const metaData = ctx.service.fileUtils.getMetaData();
      showStat('Start to process,', metaData);
      // check exist
      await ctx.service.logExistChecker.check(metaData);
      showStat('Check exist finished,', metaData);
      // check verify, first time, check for partially downloaded file
      await ctx.service.logValidChecker.check(metaData);
      showStat('Check valid finished,', metaData);
      // download
      await ctx.service.logDownloader.download(metaData);
      showStat('Download finished', metaData);
      // check verify
      await ctx.service.logValidChecker.check(metaData);
      showStat('Check valid finished,', metaData);
      // check import status
      await ctx.service.logImporterStatusChecker.check(metaData);
      showStat('Check import status finished,', metaData);
      // import file
      await ctx.service.logImporter.import(metaData);
      showStat('Import finished,', metaData);

      ctx.service.updateStatus.update();
    } catch (e) {
      ctx.logger.error(e);
    } finally {
      ctx.logger.info('Process done.');
      cache.delete(importerTaskKey);
    }
  },
};
