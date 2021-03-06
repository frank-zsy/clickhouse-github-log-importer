import { EggAppConfig, EggAppInfo, PowerPartial } from 'egg';

export default (appInfo: EggAppInfo) => {
  const config = {} as PowerPartial<EggAppConfig>;

  // override config from framework / plugin
  // use for cookie sign key, should change to your own and keep security
  config.keys = appInfo.name + '_1589765552170_7121';

  // add your egg config in here
  config.middleware = [];

  // add your special config in here
  const bizConfig = {
    sourceUrl: `https://github.com/eggjs/examples/tree/master/${appInfo.name}`,
  };

  config.security = {
    csrf: {
      enable: false,
    },
  };

  config.bodyParser = {
    formLimit: '1mb',
  };

  config.statusFilePath = './status.json';

  config.fileProcessor = {
    baseDir: process.env.DATA_DIR || 'GHA_DATA',
    // for downloader
    downloaderNum: 3,
    downloaderTimeout: 5 * 60 * 1000,
    baseUrl: 'https://data.gharchive.org/',
    // for checker
    checkerNum: 3,
    checkerMaxMemoryMb: 1024,
    // for importer
    workerNum: 3,
    workerMaxMemoryMb: 1024,
    metaFilePath: 'meta.json',
    lockFilePath: '.lock',
    startTime: new Date('2015-01-01'),
    getEndTime: () => new Date(),
    forceInit: false,
  };

  config.clickhouse = {
    serverConfig: {
      host: process.env.CLICKHOUSE_SERVER || 'clickhouse',
      protocol: 'http:',
      port: 8123,
      format: 'JSON',
      user: process.env.CLICKHOUSE_USER || 'USER',
      password: process.env.CLICKHOUSE_PASSWORD || 'PASSWORD',
    },
    db: 'github_log',
    table: 'events',
  };

  // the return config will combines to EggAppConfig
  return {
    ...config,
    ...bizConfig,
  };
};
