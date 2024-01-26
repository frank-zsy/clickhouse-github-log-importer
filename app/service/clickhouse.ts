import { Service } from 'egg';
import { ClickHouseClient, Row, createClient } from '@clickhouse/client';
import { Readable } from 'stream';

export default class Clickhouse extends Service {

  private _client: ClickHouseClient;

  public get client(): ClickHouseClient {
    if (this._client) {
      return this._client;
    }
    const config = this.config.clickhouse;
    const clickhouse = createClient(config.serverConfig);
    this._client = clickhouse;
    return clickhouse;
  }

  public get newClient(): ClickHouseClient {
    return createClient(this.config.clickhouse.serverConfig);
  }

  public async query<T>(q: string, options: any = {}): Promise<T[]> {
    const result: T[] = [];
    await this.queryStream(q, row => result.push(row), options);
    return result;
  }

  public async queryStream<T = any>(q: string, onRow: (row: T) => void, options: any = {}): Promise<void> {
    return new Promise(async resolve => {
      try {
        const resultSet = await this.client.query({ query: q, format: 'JSONCompactEachRow', ...options });
        const stream = resultSet.stream();
        stream.on('data', (rows: Row[]) => rows.forEach(row => onRow(row.json())));
        stream.on('end', () => resolve());
        stream.on('error', (err: any) => console.error(`Query for ${q} error: ${err}`));
      } catch (e) {
        console.error(`Query for ${q} error: ${e}`);
        resolve();
      }
    });
  }

  public async insertRecords(records: any[], table: string) {
    if (records.length === 0) return;
    const stream = new Readable({
      objectMode: true,
      read: () => {
        //
      },
    });
    for (const e of records) stream.push(e);
    stream.push(null);
    const client = this.newClient;
    await client.insert({
      table,
      values: stream,
      format: 'JSONEachRow',
    });
    await client.close();
  }

}
