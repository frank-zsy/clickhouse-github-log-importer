import { Service } from 'egg';
import { FileStatus } from '../types';
import { join } from 'path';
import { StaticPool, isTimeoutError } from 'node-worker-threads-pool';
import { existsSync, unlinkSync } from 'fs';

export default class LogDownloader extends Service {

  public async download(meta: any) {
    // download the lost files
    const config = this.app.config.fileProcessor;
    if (!config.enableDownload) return;
    const params: { url: string; filePath: string; key: string }[] = [];
    for (const k in meta) {
      const s = meta[k];
      if (s === FileStatus.NeedDownload) {
        const { year, month } = this.service.fileUtils.getDateInfoFromFile(k);
        const current = new Date().getFullYear() * 1000 + new Date().getMonth();
        // do not try not download the file 6 month ago, must be missing
        if (current - year * 1000 + month > 6) continue;
        // need download the file
        const fileName = k.split('/').pop() ?? '';
        const url = `${config.baseUrl}${fileName}`;
        const filePath = `${join(config.baseDir, k)}`;
        params.push({ url, filePath, key: k });
      }
    }

    const pool = new StaticPool({
      size: config.downloaderNum,
      task: join(__dirname, '../downloader_worker.js'),
    });

    const shuffleArray = (array: any[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
      }
    };
    // shuffle the params array to avoid hit cache in a row
    shuffleArray(params);

    let count = 0;
    let notFoundCount = 0;
    let timeoutCount = 0;
    await Promise.all(params.map(async param => {
      try {
        const result = await pool.exec(param, config.downloaderTimeout);
        if (result) {
          count++;
          meta[param.key] = FileStatus.Downloaded;
          this.ctx.service.fileUtils.writeMetaData(meta);
          this.logger.info(`Download done, ${param.filePath}, ${count}/${params.length}`);
        } else {
          notFoundCount++;
        }
      } catch (e) {
        // may timeout
        if (isTimeoutError(e as any)) {
          timeoutCount++;
          this.logger.info(`Time out for ${param.url}`);
          // if timeout, the file can't be intact, clean up
          if (existsSync(param.filePath)) {
            unlinkSync(param.filePath);
          }
        }
      }
    }));
    this.logger.info(`Total status: download count=${count}, not found count=${notFoundCount}, timeout count=${timeoutCount}`);
  }
}
