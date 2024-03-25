import { Service } from 'egg';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, createReadStream } from 'fs';
import { FileStatus } from '../types';
import { createInterface } from 'readline';
import { createGunzip } from 'zlib';

export default class FileUtils extends Service {

  private getMetaFilePath(): string {
    const config = this.config.fileProcessor;
    const prefix = config.usingTugraph ? 'tugraph_' : (config.usingNeo4j ? 'neo4j_' : '');
    return join(config.baseDir, `${prefix}${config.metaFilePath}`);
  }

  public getMetaData(): any {
    const metaFilePath = this.getMetaFilePath();
    if (!existsSync(metaFilePath)) {
      this.logger.info('Meta file not exist, create empty meta');
      return {};
    }
    try {
      const meta = JSON.parse(readFileSync(metaFilePath).toString());
      this.logger.info('Meta loaded');
      return meta;
    } catch (e) {
      this.logger.error('Meta file parse error, create empty meta');
      return {};
    }
  }

  public getDateInfoFromFile(f: string): { year: number; month: number; day: number; hour: number } {
    const matchResult = f.match(/.*\/(\d+)-(\d+)-(\d+)-(\d+).json.gz/);
    if (!matchResult) {
      return { year: -1, month: -1, day: -1, hour: -1 };
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, array-bracket-spacing
    const [_, year, month, day, hour] = matchResult.map(n => +n);
    return { year, month, day, hour };
  }

  public writeMetaData(meta: any) {
    const metaFilePath = this.getMetaFilePath();
    writeFileSync(metaFilePath, JSON.stringify(meta));
  }

  public metaDataStat(meta: any) {
    const statMap = new Map<FileStatus, number>();
    for (const k in meta) {
      const s = meta[k];
      statMap.set(s, (statMap.get(s) ?? 0) + 1);
    }
    return statMap;
  }

  public getFilePathList(): string[] {
    const config = this.config.fileProcessor;

    const getFilePath = (year: number, month: number, day: number, hour: number): string => {
      const yearStr = year.toString();
      const monthStr = month.toString().padStart(2, '0');
      const dayStr = day.toString().padStart(2, '0');
      const hourStr = hour.toString();
      return join(yearStr, monthStr, dayStr, `${yearStr}-${monthStr}-${dayStr}-${hourStr}.json.gz`);
    };
    const parseDate = (d: Date): { year: number; month: number; day: number } => {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      };
    };
    const isLeapYear = (y: number): boolean => {
      return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0));
    };

    const startDate = parseDate(config.startTime);
    const endDate = parseDate(config.getEndTime());
    const startYear = startDate.year;
    const startMonth = startDate.month;
    const startDay = startDate.day;
    const endYear = endDate.year;
    const endMonth = endDate.month;
    const endDay = endDate.day;

    const ret: string[] = [];
    for (let year = startYear; year <= endYear; year++) {
      const sMonth = (year === startYear) ? startMonth : 1;
      const eMonth = (year === endYear) ? endMonth : 12;
      for (let month = sMonth; month <= eMonth; month++) {
        let maxDay = 31;
        if (month === 2) maxDay = isLeapYear(year) ? 29 : 28;
        else if (month % 2 === 0 && month < 7) maxDay = 30;
        else if (month % 2 === 1 && month > 8) maxDay = 30;
        const sDay = (year === startYear && month === startMonth) ? startDay : 1;
        const eDay = (year === endYear && month === endMonth) ? endDay : maxDay;
        for (let day = sDay; day <= eDay; day++) {
          for (let hour = 0; hour <= 23; hour++) {
            const filePath = getFilePath(year, month, day, hour);
            ret.push(filePath);
          }
        }
      }
    }

    return ret;
  }

  public async readline(filePath: string, onLine: (line: string, index: number) => Promise<void>): Promise<void> {
    return new Promise(async resolve => {
      if (!existsSync(filePath)) {
        resolve();
      }
      const fileStream = createReadStream(filePath);

      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let lineCount = 0;
      for await (const line of rl) {
        lineCount++;
        await onLine(line, lineCount);
      }

      resolve();
    });
  }

  public async readlineUnzip(filePath: string, onLine: (line: string, index: number) => Promise<void>): Promise<void> {
    return new Promise(async resolve => {
      if (!existsSync(filePath)) {
        resolve();
      }
      const fileStream = createReadStream(filePath).pipe(createGunzip());

      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let lineCount = 0;
      for await (const line of rl) {
        lineCount++;
        await onLine(line, lineCount);
      }

      resolve();
    });
  }
}
