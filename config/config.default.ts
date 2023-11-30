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
    enableDownload: true,
    downloaderNum: 3,
    downloaderTimeout: 5 * 60 * 1000,
    baseUrl: 'https://data.gharchive.org/',
    // for checker
    enableCheck: true,
    checkerNum: 3,
    checkerMaxMemoryMb: 2048,
    // for importer
    workerNum: 3,
    workerMaxMemoryMb: 2048,
    metaFilePath: 'meta.json',
    usingTugraph: false,
    usingNeo4j: false,
    lockFilePath: '.lock',
    startTime: new Date('2015-01-01'),
    getEndTime: () => new Date(),
    forceInit: false,
  };

  config.clickhouse = {
    serverConfig: {
      host: process.env.CLICKHOUSE_SERVER || '127.0.0.1',
      username: process.env.CLICKHOUSE_USERNAME || 'USERNAME',
      password: process.env.CLICKHOUSE_PASSWORD || 'PASSWORD',
      database: 'opensource',
      application: 'x-lab-data-importer',
    },
    table: 'events',
  };

  config.tugraph = {
    url: '127.0.0.1:7070',
    user: 'user',
    pass: 'pass',
    graph: 'default',
  };

  config.neo4j = {
    url: process.env.NEO4J_URL,
    user: process.env.NEO4J_USER,
    password: process.env.NEO4J_PASSWORD,
  };

  config.gitee = {
    token: '',
    eventTable: 'events',
    orgsReposTable: 'gitee_orgs_repos',
    orgs: [],
    repos: [],
  };

  // the return config will combines to EggAppConfig
  return {
    ...config,
    ...bizConfig,
  };
};
