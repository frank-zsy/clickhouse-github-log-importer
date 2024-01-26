import { Context } from 'egg';

module.exports = {
  schedule: {
    cron: '0 0 */1 * * *',
    type: 'worker',
    immediate: false,
    disable: false,
  },
  async task(ctx: Context) {
    if (!ctx.service.fileUtils.tryLock()) {
      // do not move this check into try-catch block
      // because return will trigger finally block any way
      ctx.logger.info('Still processing, exit for this time');
      return;
    }
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
      // download
      await ctx.service.logDownloader.download(metaData);
      showStat('Download finished', metaData);
      // check verify
      await ctx.service.logValidChecker.check(metaData);
      showStat('Check valid finished,', metaData);
      // import file
      await ctx.service.logImporter.import(metaData);
      showStat('Import finished,', metaData);

      ctx.service.updateStatus.update();
    } catch (e) {
      ctx.logger.error(e);
    } finally {
      ctx.logger.info('Process done.');
      ctx.service.fileUtils.unlock();
    }
  },
};
