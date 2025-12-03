/* eslint-disable @typescript-eslint/no-var-requires */
const { parentPort } = require('worker_threads');
const { existsSync, createReadStream } = require('fs');
const ParseFuncMap = require('./parser');
const { createGunzip } = require('zlib');
const { createInterface } = require('readline');
const { createClient } = require('@clickhouse/client');
const { Readable } = require('stream');

async function insertRecords(filePath, dbConfig) {
  return new Promise(async resolve => {
    try {
      if (!existsSync(filePath)) {
        resolve(true);
        return;
      }

      // open file stream
      const unzip = createGunzip();
      const fileStream = createReadStream(filePath).pipe(unzip).on('error', resolve);

      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      const stream = new Readable({
        objectMode: true,
        read: () => { /* stub */ },
      });
      rl.on('line', line => {
        try {
          const item = JSON.parse(line);
          const row = ParseFuncMap.get(item.type)?.call(undefined, item);
          if (row) { stream.push({ ...row, from_api: 0 }); }
        } catch {
          console.log(`Error on parse record, line=${line}`);
        }
      });
      rl.on('close', () => { stream.push(null); });
      // open database stream
      const client = createClient(dbConfig.serverConfig);
      await client.insert({
        table: dbConfig.table,
        values: stream,
        format: 'JSONEachRow',
      });
      await client.close();
      resolve(true);
    } catch (e) {
      console.error(e);
      resolve(false);
    }
  });
}

parentPort?.on('message', async param => {
  const result = await insertRecords(param.filePath, param.dbConfig);
  parentPort?.postMessage(result);
});
