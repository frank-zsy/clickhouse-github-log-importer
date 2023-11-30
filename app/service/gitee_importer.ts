/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable array-bracket-spacing */
import { Service } from 'egg';
const dateformat = require('dateformat');

interface ReqContext {
  name: string;
  type: 'org' | 'repo';
  maxId: number;
  minId: number;
  prevId: number;
  stage: 'new' | 'old';
}

export default class GiteeImporter extends Service {

  private supportEventsMap = new Map<string, string>([
    ['IssueEvent', 'IssuesEvent'],
    ['IssueCommentEvent', 'IssueCommentEvent'],
    ['PullRequestEvent', 'PullRequestEvent'],
    ['PullRequestCommentEvent', 'PullRequestReviewCommentEvent'],
    ['CommitCommentEvent', 'CommitCommentEvent'],
    ['PushEvent', 'PushEvent'],
    ['StarEvent', 'WatchEvent'],
    ['ForkEvent', 'ForkEvent'],
  ]);

  private unsupportedEventsSet = new Set<string | null>([
    'CreateEvent', 'DeleteEvent', 'MemberEvent', 'ProjectCommentEvent', 'MilestoneEvent', null,
  ]);

  private actionMap = new Map<string | undefined, string | null>([
    ['opened', 'opened'],
    ['open', 'opened'],
    ['closed', 'closed'],
    ['rejected', 'closed'],
    ['merged', 'closed'],
    ['starred', 'started'],
    ['progressing', null],
  ]);

  public async start() {
    this.logger.info('Start to import gitee');
    const config = this.config.gitee;

    const orgsAndRepos = await this.getGiteeOrgsAndRepos();
    this.logger.info(`Update events for ${orgsAndRepos.orgs.length} orgs and ${orgsAndRepos.repos.length} repos.`);

    this.service.requestExecutor.setOption({
      batchSize: 30,
      postProcessor: async (_res, body, option) => {
        try {
          const resp = JSON.parse(body);
          if (!resp || !Array.isArray(resp)) {
            this.logger.error(`Event parse error: ${JSON.stringify(option.userdata)}, ${body}`);
            return;
          }
          const events = resp.map(e => this.parseEvent(e)).filter(e => e !== null);
          if (events.length === 0) return;
          // this.logger.info(`Got ${JSON.stringify(option.userdata)}, ${events.length} events.`);
          const context: ReqContext = option.userdata;
          context.prevId = events[events.length - 1].id;
          if (context.stage === 'new') {
            if (context.maxId > 0) {
              // filter the events that already in database
              const filterEvents: any[] = [];
              for (const e of events) {
                if (e.id === context.maxId) {
                  // run into the lastest event, start to get from oldest
                  if (context.minId > 0) {
                    context.stage = 'old';
                    context.prevId = context.minId;
                  }
                  break;
                } else {
                  filterEvents.push(e);
                }
              }
              await this.service.clickhouse.insertRecords(filterEvents, config.eventTable);
            } else {
              // no maxId, first time insert
              await this.service.clickhouse.insertRecords(events, config.eventTable);
            }
          } else {
            await this.service.clickhouse.insertRecords(events, config.eventTable);
          }
          this.requestEvents(context);
        } catch (e: any) {
          this.logger.error(`Event parse error: ${e.message}, ${JSON.stringify(option.userdata)}, ${body}`);
        }
      },
    });

    const idMap = new Map<string, { maxId: number; minId: number }>();
    const loadOrgs = async () => {
      const q = "SELECT org_login, argMax(id, created_at), argMin(id, created_at) FROM events WHERE platform='Gitee' GROUP BY org_login";
      const result = await this.service.clickhouse.query<any[]>(q);
      for (const r of result) {
        const [org, maxId, minId] = r;
        idMap.set(org, { maxId: parseInt(maxId), minId: parseInt(minId) });
      }
    };
    const loadRepos = async () => {
      const q = "SELECT repo_name, argMax(id, created_at), argMin(id, created_at) FROM events WHERE platform='Gitee' GROUP BY repo_name";
      const result = await this.service.clickhouse.query<any[]>(q);
      for (const r of result) {
        const [name, maxId, minId] = r;
        idMap.set(name, { maxId: parseInt(maxId), minId: parseInt(minId) });
      }
    };
    await loadOrgs();
    await loadRepos();

    for (const o of orgsAndRepos.orgs) {
      const ids = idMap.get(o);
      const maxId = ids?.maxId ?? 0;
      const minId = ids?.minId ?? 0;
      // this.logger.info(`For org ${o} maxId=${maxId}, minId=${minId}`);
      this.requestEvents({ name: o, type: 'org', prevId: -1, maxId, minId, stage: 'new' });
    }

    for (const r of orgsAndRepos.repos) {
      const ids = idMap.get(r);
      const maxId = ids?.maxId ?? 0;
      const minId = ids?.minId ?? 0;
      // this.logger.info(`For repo ${r} maxId=${maxId}, minId=${minId}`);
      this.requestEvents({ name: r, type: 'repo', prevId: -1, maxId, minId, stage: 'new' });
    }

    await this.service.requestExecutor.start();
  }

  private requestEvents(context: ReqContext) {
    let url = '';
    if (context.type === 'org') {
      url = `https://gitee.com/api/v5/orgs/${context.name}/events`;
    } else {
      url = `https://gitee.com/api/v5/networks/${context.name}/events`;
    }
    url += `?limit=50&access_token=${this.config.gitee.token}`;
    if (context.prevId > 0) {
      url += `&prev_id=${context.prevId}`;
    }
    this.service.requestExecutor.appendOptions({
      method: 'GET',
      url,
      userdata: context,
    });
  }

  private parseEvent(event: any): any {
    try {
      if (this.unsupportedEventsSet.has(event.type)) return null;
      if (!this.supportEventsMap.has(event.type)) {
        this.logger.info(`Unknown event type ${event.type}`);
        return null;
      }
      const type = this.supportEventsMap.get(event.type);

      if (!event.actor || !event.repo) return null;

      const ret: any = {
        platform: 'Gitee',
        id: event.id,
        type,
        actor_id: event.actor.id,
        actor_login: event.actor.login,
        repo_id: event.repo.id,
        repo_name: event.repo.full_name,
        created_at: this.formatDateTime(event.created_at),
      };

      if (event.org) {
        ret.org_id = event.org.id;
        ret.org_login = event.org.login;
      }

      if (!event.payload) return null;

      const payload = event.payload;
      if (this.actionMap.get(payload.action) === null) {
        return null;
      }
      if (payload.action !== undefined && !this.actionMap.has(payload.action)) {
        this.logger.error(`Unknown action: ${payload.action}`);
        return null;
      }
      ret.action = this.actionMap.get(payload.action);

      if (type === 'IssueCommentEvent' || type === 'PullRequestCommentEvent') {
        ret.action = 'created';
      }

      const parseIssue = (i: any): boolean => {
        if (!i.id || !i.number) return false;
        ret.issue_id = i.id;
        ret.issue_number = parseInt(i.number, 36);
        ret.issue_title = i.title;
        ret.body = i.body;
        if (!i.labels) {
          i.labels = [];
        }
        ret['issue_labels.name'] = i.labels.map(l => this.processNestedString(l.name) ?? '');
        ret['issue_labels.color'] = i.labels.map(l => this.processNestedString(l.color) ?? '');
        ret['issue_labels.default'] = i.labels.map(() => false);
        ret['issue_labels.description'] = i.labels.map(() => '');
        ret.issue_author_id = i.user.id;
        ret.issue_author_login = i.user.login;
        ret.issue_created_at = this.formatDateTime(i.created_at);
        ret.issue_updated_at = this.formatDateTime(i.updated_at);
        if (i.finished_at) {
          ret.issue_closed_at = this.formatDateTime(i.finished_at);
        }
        return true;
      };

      const parseComment = (c: any): boolean => {
        if (!c.id) return false;
        ret.issue_comment_id = c.id;
        ret.body = c.body;
        ret.issue_comment_created_at = this.formatDateTime(c.created_at);
        ret.issue_comment_updated_at = this.formatDateTime(c.updated_at);
        ret.issue_comment_author_id = c.user.id;
        ret.issue_comment_author_login = c.user.login;
        return true;
      };

      const parseCommitComment = (c: any): boolean => {
        if (!c.id) return false;
        ret.commit_comment_id = c.id;
        ret.body = c.body;
        ret.commit_comment_sha = c.commit_id;
        ret.commit_comment_created_at = this.formatDateTime(c.created_at);
        ret.commit_comment_updated_at = this.formatDateTime(c.updated_at);
        return true;
      };

      const parsePull = (p: any): boolean => {
        if (p.action === 'merged') {
          ret.pull_merged = 1;
        }
        if (p.merged_at) {
          ret.pull_merged_at = this.formatDateTime(p.merged_at);
        }
        ret.issue_number = parseInt(p.number);
        return true;
      };

      const parsePush = (p: any) => {
        ret.push_size = p.size;
        ret.push_ref = p.ref;
        ret.push_head = p.after;
        if (!p.commits) {
          p.commits = [];
        }
        ret['push_commits.name'] = p.commits.map(c => (c.author ? this.processNestedString(c.author.name) : ''));
        ret['push_commits.email'] = p.commits.map(c => (c.author ? this.processNestedString(c.author.email) : ''));
        ret['push_commits.message'] = p.commits.map(c => this.processNestedString(c.message) ?? '');
      };

      if (type === 'IssuesEvent') {
        if (!parseIssue(payload)) return null;
      } else if (type === 'IssueCommentEvent') {
        if (!parseIssue(payload.issue)) return null;
        if (!parseComment(payload.comment)) return null;
      } else if (type === 'PullRequestEvent') {
        if (!parseIssue(payload)) return null;
        if (!parsePull(payload)) return null;
      } else if (type === 'PullRequestReviewCommentEvent') {
        if (!parseIssue(payload.pull_request)) return null;
        if (!parseComment(payload.comment)) return null;
      } else if (type === 'CommitCommentEvent') {
        if (!parseCommitComment(payload.comment)) return null;
      } else if (type === 'PushEvent') {
        parsePush(payload);
      }

      return ret;
    } catch (e: any) {
      this.logger.info(`Error on parse event: ${e.message}, ${JSON.stringify(event)}`);
      return null;
    }
  }

  public async getGiteeOrgsAndRepos(): Promise<{ orgs: string[]; repos: string[] }> {
    const config = this.config.gitee;
    await this.createGiteeReposTable();

    const repos: string[] = config.repos;
    const orgs: { name: string; split: boolean }[] = config.orgs;

    const orgsAndRepos: string[][] = await this.service.clickhouse.query(`SELECT name FROM ${config.orgsReposTable} WHERE name IN (${repos.map(r => `'${r}'`).join(',')}) OR name IN (${orgs.map(o => `'${o.name}'`).join(',')})`);

    const insertItems: any[] = [];
    this.service.requestExecutor.setOption({
      workerRetry: 0,
      workerRetryInterval: 10,
      postProcessor: async (_res, body, option) => {
        try {
          const data = JSON.parse(body);
          if (!data.id) {
            this.logger.info(`Error on parse orgs and repos: ${JSON.stringify(option.userdata)}, ${body}`);
            return;
          }
          const item = {
            id: data.id,
            ...option.userdata,
          };
          insertItems.push(item);
        } catch (e: any) {
          this.logger.error(`Error on parse orgs and repos: ${e.message}, ${body}`);
        }
      },
    });
    const missingRepos = repos.filter(r => !orgsAndRepos.find(o => o[0] === r));
    if (missingRepos.length > 0) {
      this.logger.info(`Goona insert ${missingRepos.length} repos`);
      missingRepos.forEach(r => {
        this.service.requestExecutor.appendOptions({
          method: 'GET',
          url: `https://gitee.com/api/v5/repos/${r}`,
          userdata: {
            name: r,
            type: 'repo',
            split: 0,
          },
        });
      });
    }

    const missingOrgs = orgs.filter(o => !orgsAndRepos.find(r => r[0] === o.name));
    if (missingOrgs.length > 0) {
      this.logger.info(`Goona insert ${missingOrgs.length} orgs`);
      missingOrgs.forEach(o => {
        this.service.requestExecutor.appendOptions({
          method: 'GET',
          url: `https://gitee.com/api/v5/orgs/${o.name}`,
          userdata: {
            name: o.name,
            type: 'org',
            split: o.split ? 1 : 0,
          },
        });
      });
    }

    await this.service.requestExecutor.start();

    if (insertItems.length > 0) {
      this.logger.info(`Goona insert items: ${JSON.stringify(insertItems)}`);
      await this.service.clickhouse.insertRecords(insertItems, config.orgsReposTable);
    }

    // update split orgs into repos
    const splitOrgs = await this.service.clickhouse.query(`SELECT name FROM ${config.orgsReposTable} WHERE type='org' AND split=1`);
    const splitRepos: any[] = [];
    this.service.requestExecutor.setOption({
      postProcessor: async (_res, body, option) => {
        try {
          const data = JSON.parse(body);
          if (!data || !Array.isArray(data)) {
            this.logger.info(`Error on parse orgs and repos: ${JSON.stringify(option.userdata)}, ${body}`);
            return;
          }
          const { page, per_page, name } = option.userdata;
          for (const r of data) {
            const item = {
              id: r.id,
              name: r.full_name,
              type: 'repo',
              split: 0,
            };
            splitRepos.push(item);
          }
          if (data.length === per_page) {
            // not the last page
            this.service.requestExecutor.appendOptions({
              method: 'GET',
              url: `https://gitee.com/api/v5/orgs/${name}/repos?page=${page + 1}&per_page=${per_page}&access_token=${config.token}`,
              userdata: {
                page: page + 1,
                per_page,
                name,
              },
            });
          }
        } catch (e: any) {
          this.logger.error(`Error on parse orgs and repos: ${e.message}, ${body}`);
        }
      },
    });

    splitOrgs.forEach(o => {
      this.logger.info(`Start to get repos for ${o}`);
      this.service.requestExecutor.appendOptions({
        method: 'GET',
        url: `https://gitee.com/api/v5/orgs/${o}/repos?page=1&per_page=100&access_token=${config.token}`,
        userdata: {
          page: 1,
          per_page: 100,
          name: o,
        },
      });
    });

    await this.service.requestExecutor.start();

    if (splitRepos.length > 0) {
      this.logger.info(`Goona insert split repos: ${splitRepos.length}`);
      await this.service.clickhouse.insertRecords(splitRepos, config.orgsReposTable);
    }

    await this.service.clickhouse.query(`OPTIMIZE TABLE ${config.orgsReposTable} DEDUPLICATE`);
    const results: any[] = await this.service.clickhouse.query(`SELECT name, type FROM ${config.orgsReposTable} WHERE split=0`);

    return {
      orgs: results.filter(r => r[1] === 'org').map(r => r[0]),
      repos: results.filter(r => r[1] === 'repo').map(r => r[0]),
    };
  }

  private processNestedString(s: string): string {
    return s.toString().replace(new RegExp("'", 'gm'), '\\\'');
  }

  private async createGiteeReposTable() {
    const q = `CREATE TABLE IF NOT EXISTS ${this.config.gitee.orgsReposTable}
(
    \`id\` UInt64,
    \`name\` String,
    \`type\` Enum8('org' = 1, 'repo' = 2),
    \`split\` UInt8
) ENGINE = ReplacingMergeTree
ORDER BY (id, name, type);`;
    await this.service.clickhouse.query(q);
  }

  private formatDateTime(d) {
    return dateformat(new Date(d), 'yyyy-mm-dd HH:MM:ss', true);
  }

}
