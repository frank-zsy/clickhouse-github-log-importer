/* eslint-disable no-loop-func */
/* eslint-disable array-bracket-spacing */
import { Service } from 'egg';
import { EOL } from 'os';
import { join } from 'path';
import { StaticPool } from 'node-worker-threads-pool';
import { FileStatus } from '../types';
import { FieldMap } from '../utils';

export default class LogImporter extends Service {

  public async import(meta: any) {
    const config = this.config.fileProcessor;
    const dbConfig = this.config.clickhouse;
    await this.init(config.forceInit);
    if (config.forceInit) {
      for (const k in meta) {
        if (meta[k] === FileStatus.Imported) {
          meta[k] = FileStatus.Verified;
        }
      }
      this.ctx.service.fileUtils.writeMetaData(meta);
    }

    if (config.usingNeo4j) {
      let importedCount = 0;
      for (const f in meta) {
        if (meta[f] === FileStatus.Verified) {
          const filePath = join(config.baseDir, f);
          await this.service.logNeo4jImporter.import(filePath, () => {
            meta[f] = FileStatus.Imported;
            this.ctx.service.fileUtils.writeMetaData(meta);
            importedCount++;
            if (importedCount % 1000 === 0) {
              this.logger.info(`${importedCount} files have been imported.`);
            }
          });
        }
      }
    } else if (config.usingTugraph) {
      let importedCount = 0;
      for (const f in meta) {
        if (meta[f] === FileStatus.Verified) {
          const filePath = join(config.baseDir, f);
          const imported = await this.service.logTugraphImporter.import(filePath);
          if (imported) {
            meta[f] = FileStatus.Imported;
            this.ctx.service.fileUtils.writeMetaData(meta);
            importedCount++;
            if (importedCount % 1000 === 0) {
              this.logger.info(`${importedCount} files have been imported.`);
            }
          }
        }
      }
    } else {
      const pool = new StaticPool({
        size: config.workerNum,
        task: join(__dirname, '../importer_worker.js'),
        resourceLimits: {
          maxOldGenerationSizeMb: config.workerMaxMemoryMb,
        },
      });
      const params: { filePath: string; key: string }[] = [];
      for (const f in meta) {
        if (meta[f] === FileStatus.Verified) {
          const filePath = join(config.baseDir, f);
          params.push({ filePath, key: f });
        }
      }

      let importedCount = 0;
      await Promise.all(params.map(async p => {
        const matchResult = p.filePath.match(/.*\/(\d+)-(\d+)-(\d+)-(\d+).json.gz/);
        if (!matchResult) {
          return;
        }
        const insertResult = await pool.exec({
          filePath: p.filePath,
          dbConfig: {
            serverConfig: dbConfig.serverConfig,
            db: dbConfig.db,
            table: dbConfig.table,
          },
        });
        if (insertResult) {
          meta[p.key] = FileStatus.Imported;
          importedCount++;
          this.ctx.service.fileUtils.writeMetaData(meta);
          if (importedCount % 1000 === 0) {
            this.logger.info(`${importedCount} files have been imported.`);
          }
        }
      }));
    }

    this.logger.info('All files have been imported');
  }

  private async init(forceInit: boolean) {
    this.logger.info('Start to init database');
    if (this.config.fileProcessor.usingNeo4j) {
      await this.service.logNeo4jImporter.initDatabase(forceInit);
    } else if (this.config.fileProcessor.usingTugraph) {
      await this.service.logTugraphImporter.initDatabase(forceInit);
    } else {
      const dbConfig = this.config.clickhouse;
      const getTableSchema = (map: Map<string, string>): string => {
        let ret = '';
        for (const [key, value] of map) {
          ret += `\`${key}\` ${value},${EOL}`;
        }
        return ret.substring(0, ret.length - 2) + EOL;
      };
      const initQuerys: string[] = [];
      if (forceInit) {
        initQuerys.push(`DROP TABLE IF EXISTS ${dbConfig.table}`);
      }
      initQuerys.push(`CREATE TABLE IF NOT EXISTS ${dbConfig.table}
(
${getTableSchema(FieldMap)}
) ENGINE = ReplacingMergeTree(id)
ORDER BY (type, repo_name, created_at)
PARTITION BY toYYYYMM(created_at);`);
      for (const q of initQuerys) {
        await this.ctx.service.clickhouse.query(q);
      }
    }
    this.logger.info('Database inited.');
  }

}
