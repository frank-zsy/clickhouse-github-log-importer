import { Service } from 'egg';
import neo4j = require('neo4j-driver');
import parser = require('parse-neo4j');

export default class Neo4jService extends Service {

  private _driver: any;

  private get driver() {
    if (this._driver) return this._driver;
    const { url, user, password } = this.config.neo4j;
    if (user && password) {
      this._driver = neo4j.driver(url, neo4j.auth.basic(user, password));
    } else {
      this._driver = neo4j.driver(url);
    }
    return this._driver;
  }

  public async runQuery<T = any>(query: string, params?: any) {
    const session = this.driver.session();
    const r = await session.run(query, params);
    await session.close();
    return parser.parse(r) as T;
  }

  public async runQueries(query: string, params: any[]) {
    const session = this.driver.session();
    for (const param of params) {
      await session.run(query, param);
    }
    await session.close();
  }

  public async runQueryStream<T = any>(query: string, onRecord: (r: T) => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const session = this.driver.session();
      const result = session.run(query);
      result.subscribe({
        onNext: (r: any) => onRecord(this.parseRecord(r)),
        onCompleted: () => session.close().then(() => resolve()),
        onError: reject,
      });
    });
  }

  public async runQueryWithParamBatch(query: string, params: any, key: string, batch = 5000) {
    if (params.length <= 0) return;
    if (params.length <= batch) {
      await this.runQuery(query, { [key]: params });
      return;
    }
    const session = this.driver.session();
    const group = <T>(arr: T[], subLen: number) => {
      let index = 0;
      const newArr: T[][] = [];
      while (index < arr.length) {
        newArr.push(arr.slice(index, index += subLen));
      }
      return newArr;
    };
    // group anyway to copy the array because it will reset the array param outside
    const groupQueries = group(params, batch);
    for (const q of groupQueries) {
      await session.run(query, { [key]: q });
    }
    await session.close();
  }

  public parseRecord(r: any): any {
    const item = parser.parseRecord(r);
    const ret: any = {};
    for (const key of item.keys) {
      ret[key] = item._fields[item._fieldLookup[key]];
    }
    return ret;
  }

  public async getCurrentDatabase() {
    const query = 'CALL db.info';
    const result = await this.runQuery(query);
    return result[0].name;
  }

  public async checkDatabase(name: string): Promise<boolean> {
    return (await this.getCurrentDatabase()) === name;
  }

  public async close() {
    await this.driver.close();
  }

}
