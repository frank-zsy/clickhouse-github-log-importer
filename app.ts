import { Application } from 'egg';
import { writeFileSync } from 'fs';
import dateformat = require('dateformat');

export default class AppBootHook {
  private app: Application;

  constructor(app: Application) {
    this.app = app;
    (this.app as any).cache = new Map<string, any>();
  }

  public async didReady() {
    writeFileSync(this.app.config.statusFilePath, JSON.stringify({
      startTime: dateformat(new Date(), 'yyyy-mm-dd HH:MM:ss'),
      reason: '日常重启',
    }));
    this.app.createAnonymousContext().service.fileUtils.unlock();
    process.on('uncaughtException', e => this.app.logger.error(e));
  }
}
