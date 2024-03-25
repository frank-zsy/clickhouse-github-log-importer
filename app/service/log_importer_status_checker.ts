/* eslint-disable array-bracket-spacing */
import { Service } from 'egg';
import { FileStatus } from '../types';

export default class LogImporterStatusChecker extends Service {

  public async check(metaData: any) {
    const fileList = this.ctx.service.fileUtils.getFilePathList();
    const keyFileMap = new Map<number, string>();
    const keys: number[] = [];

    for (const p of fileList) {
      if (metaData[p] !== FileStatus.Imported) continue;

      const { year, month, day, hour } = this.service.fileUtils.getDateInfoFromFile(p);
      if (year < 0) continue;

      const key = year * 1000000 + month * 10000 + day * 100 + hour;
      keys.push(key);
      keyFileMap.set(key, p);
    }

    const checkRes: string[][] = await this.service.clickhouse.query(`
SELECT h FROM (SELECT arrayJoin({keys: Array(UInt64)}) AS h) WHERE h NOT IN (
SELECT floor(toYYYYMMDDhhmmss(created_at)/10000) AS h FROM events WHERE platform='GitHub' GROUP BY h)
`, { query_params: { keys } });

    for (const [key] of checkRes) {
      metaData[keyFileMap[+key]] = FileStatus.Verified;
    }

    this.ctx.service.fileUtils.writeMetaData(metaData);
  }

}
