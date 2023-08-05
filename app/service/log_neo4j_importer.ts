/* eslint-disable array-bracket-spacing */
import { Service } from 'egg';
import { createInterface } from 'readline';
import { waitUntil } from '../utils';
import { stdin as input, stdout as output } from 'process';
import neo4j = require('neo4j-driver');

interface EntityItem {
  createdAt: Date;
  data?: {
    [key: string]: any;
  };
}
type NodeType = 'github_repo' | 'github_org' | 'github_actor' | 'github_issue_change_request' | 'issue_label' | 'language' | 'license';
const nodeTypes: NodeType[] = [
  'github_repo', 'github_org', 'github_actor', 'github_issue_change_request',
  'issue_label', 'language', 'license',
];
const nodePrimaryKey = new Map<NodeType, string>([
  ['issue_label', 'name'],
  ['language', 'name'],
  ['license', 'spdx_id'],
]);

interface EdgeItem {
  from: any;
  to: any;
  createdAt: Date;
  id: neo4j.Integer;
  data?: {
    [key: string]: any;
  };
}
type EdgeType = 'has_license' | 'has_language' | 'has_repo' | 'has_issue_change_request' | 'has_issue_label' | 'action' | 'has_assignee' | 'has_requested_reviewer';
const edgeTypes: EdgeType[] = ['has_license', 'has_language', 'has_repo', 'has_issue_change_request', 'has_issue_label', 'action', 'has_assignee', 'has_requested_reviewer'];
const edgeTypePair = new Map<EdgeType, string[]>([
  ['has_license', ['github_repo', 'license']],
  ['has_language', ['github_repo', 'language']],
  ['has_repo', ['github_org', 'github_repo']],
  ['has_issue_change_request', ['github_repo', 'github_issue_change_request']],
  ['has_issue_label', ['github_issue_change_request', 'issue_label']],
  ['action', ['github_actor', 'github_issue_change_request']],
  ['has_assignee', ['github_issue_change_request', 'github_actor']],
  ['has_requested_reviewer', ['github_issue_change_request', 'github_actor']],
]);

export default class LogTugraphImporter extends Service {

  private nodeMap: Map<NodeType, Map<number, EntityItem>>;
  private edgeMap: Map<EdgeType, Map<string, Map<number, EdgeItem>>>;
  private exportNodeMap: Map<NodeType, Map<number, EntityItem>>;
  private exportEdgeMap: Map<EdgeType, Map<string, Map<number, EdgeItem>>>;
  private isExporting = false;

  public async import(filePath: string, onSuccess: () => void): Promise<void> {
    this.init();
    await this.service.fileUtils.readlineUnzip(filePath, async line => {
      try {
        this.parse(line);
      } catch (e) {
        this.logger.error(`Error on parse line, e=${JSON.stringify(e)}, line=${line}`);
      }
    });
    // wait until last insert done
    await waitUntil(() => !this.isExporting, 10);
    this.isExporting = true;
    // change node map and edge map reference to avoid next data procedure clear the data on inserting
    this.exportNodeMap = this.nodeMap;
    this.exportEdgeMap = this.edgeMap;
    (async () => {
      this.logger.info(`Start to insert ${filePath}.`);
      try {
        await this.insertNodes();
      } catch (e) {
        this.logger.error(`Error on insert nodes, e=${e}`);
      }
      await this.insertEdges();
      this.logger.info(`Insert ${filePath} done.`);
      this.isExporting = false;
      onSuccess();
    })();
  }

  private init() {
    this.nodeMap = new Map<NodeType, Map<number, EntityItem>>();
    this.edgeMap = new Map<EdgeType, Map<string, Map<number, EdgeItem>>>();
    nodeTypes.forEach(t => this.nodeMap.set(t, new Map<number, EntityItem>()));
    edgeTypes.forEach(t => this.edgeMap.set(t, new Map<string, Map<number, EdgeItem>>()));
  }

  private updateNode(type: NodeType, id: any, data: any, createdAt: Date) {
    if (type === 'github_actor' && data.login.endsWith('[bot]')) {
      data.is_bot = true;
    }
    if (type === 'github_actor' || type === 'github_repo' || type === 'github_org') {
      id = neo4j.integer.toNumber(id);
    }
    const dataMap = this.nodeMap.get(type)!;
    if (dataMap.has(id)) {
      const item = dataMap.get(id)!;
      if (item.createdAt.getTime() <= createdAt.getTime()) {
        item.data = {
          ...item.data,
          ...data,
        };
        item.createdAt = createdAt;
      }
    } else {
      dataMap.set(id, { data, createdAt });
    }
  }

  private updateEdge(type: EdgeType, from: any, to: any, id: neo4j.Integer, data: any, createdAt: Date) {
    const key = `${from}_${to}`;
    const dataMap = this.edgeMap.get(type)!;
    if (!dataMap.has(key)) {
      dataMap.set(key, new Map<number, EdgeItem>());
    }
    const item = dataMap.get(key)!.get(neo4j.integer.toNumber(id)) ?? { from, to, id, data, createdAt };
    if (item.createdAt.getTime() <= createdAt.getTime()) {
      item.data = data;
      item.createdAt = createdAt;
    }
    dataMap.get(key)!.set(neo4j.integer.toNumber(id), item);
  }

  private parse(line: string) {
    const r = JSON.parse(line);
    const type = r.type;
    const action = r.payload?.action;

    const eventId = neo4j.int(r.id);
    const actorId = neo4j.int(r.actor.id);
    const actorLogin = r.actor.login;
    const repoId = neo4j.int(r.repo.id);
    const repoName = r.repo.name;
    const createdAt = new Date(r.created_at);
    if (!this.check(actorId, actorLogin, repoId, repoName, createdAt)) {
      this.logger.info(`Invalid line: ${line}`);
      return;
    }
    this.updateNode('github_repo', repoId, { id: repoId, name: repoName }, createdAt);
    this.updateNode('github_actor', actorId, { id: actorId, login: actorLogin }, createdAt);
    if (r.org) {
      const orgId = neo4j.int(r.org.id);
      const orgLogin = r.org.login;
      if (this.check(orgId, orgLogin)) {
        this.updateNode('github_org', orgId, { id: orgId, login: orgLogin }, createdAt);
        this.updateEdge('has_repo', orgId, repoId, neo4j.int(-1), {}, createdAt);
      }
    }

    const created_at = this.formatDateTime(createdAt);
    const getTuGraphIssueId = (): string => {
      const issue = r.payload.issue ?? r.payload.pull_request;
      const number = neo4j.int(issue.number);
      return `${repoId}_${number}`;
    };

    const parseIssue = () => {
      let issue = r.payload.issue;
      let isPull = false;
      if (!issue) {
        issue = r.payload.pull_request;
        isPull = true;
      }
      if (!this.check(issue)) {
        this.logger.info(`Issue not found ${r.payload}`);
        return;
      }
      const number = neo4j.int(issue.number);
      const title = issue.title;
      const body = issue.body ?? '';
      this.updateNode('github_issue_change_request', getTuGraphIssueId(), {
        id: getTuGraphIssueId(),
        type: isPull ? 'change_request' : 'issue',
        number,
        title,
        body,
      }, createdAt);
      if (!Array.isArray(issue.labels)) issue.labels = [];
      issue.labels.forEach(l => {
        const label = l.name;
        this.updateNode('issue_label', label, {}, createdAt);
        this.updateEdge('has_issue_label', getTuGraphIssueId(), label, neo4j.int(-1), {}, createdAt);
      });
      if (issue.assignee) {
        const assigneeId = neo4j.int(issue.assignee.id);
        const assigneeLogin = issue.assignee.login;
        this.updateNode('github_actor', assigneeId, { id: assigneeId, login: assigneeLogin }, createdAt);
        this.updateEdge('has_assignee', getTuGraphIssueId(), assigneeId, neo4j.int(-1), {}, createdAt);
      }
      if (!Array.isArray(issue.assignees)) issue.assignees = [];
      issue.assignees.forEach(a => {
        const assigneeId = neo4j.int(a.id);
        const assigneeLogin = a.login;
        this.updateNode('github_actor', assigneeId, { id: assigneeId, login: assigneeLogin }, createdAt);
        this.updateEdge('has_assignee', getTuGraphIssueId(), assigneeId, neo4j.int(-1), {}, createdAt);
      });
      this.updateEdge('has_issue_change_request', repoId, getTuGraphIssueId(), neo4j.int(-1), {}, createdAt);

      if (action === 'opened') {
        this.updateEdge('action', actorId, getTuGraphIssueId(), eventId, { id: eventId, type: 'open', ...created_at }, createdAt);
      } else if (action === 'closed') {
        this.updateEdge('action', actorId, getTuGraphIssueId(), eventId, { id: eventId, type: 'close', ...created_at }, createdAt);
      }
      return issue;
    };

    const parseIssueComment = () => {
      const body = r.payload.comment.body;
      this.updateEdge('action', actorId, getTuGraphIssueId(), eventId, { id: eventId, body, type: 'comment', ...created_at }, createdAt);
    };

    const parsePullRequest = () => {
      const pull = parseIssue();
      const commits = neo4j.int(pull.commits ?? 0);
      const additions = neo4j.int(pull.additions ?? 0);
      const deletions = neo4j.int(pull.deletions ?? 0);
      const changed_files = neo4j.int(pull.changed_files ?? 0);
      if (action === 'closed') {
        if (pull.merged) {
          this.updateEdge('action', actorId, getTuGraphIssueId(), eventId, {
            id: eventId,
            type: 'close',
            merged: true,
            ...created_at,
          }, createdAt);
        } else {
          this.updateEdge('action', actorId, getTuGraphIssueId(), eventId, {
            id: eventId,
            type: 'close',
            merged: false,
            ...created_at,
          }, createdAt);
        }
      }
      if ([commits, additions, deletions, changed_files].some(i => i.isPositive())) {
        // these may not exists for some events
        this.updateNode('github_issue_change_request', getTuGraphIssueId(), {
          id: getTuGraphIssueId(),
          type: 'change_request',
          commits,
          additions,
          deletions,
          changed_files,
        }, createdAt);
      }
      if (!Array.isArray(pull.requested_reviewers)) pull.requested_reviewers = [];
      pull.requested_reviewers.forEach(r => {
        const reviewerId = neo4j.int(r.id);
        const reviewerLogin = r.login;
        this.updateNode('github_actor', reviewerId, { id: reviewerId, login: reviewerLogin }, createdAt);
        this.updateEdge('has_requested_reviewer', getTuGraphIssueId(), reviewerId, neo4j.int(-1), {}, createdAt);
      });
      const repo = pull.base.repo;
      if (repo.language) {
        const language = repo.language;
        this.updateNode('language', language, {}, createdAt);
        this.updateEdge('has_language', repoId, language, neo4j.int(-1), {}, createdAt);
      }
      if (repo.license) {
        const spdx_id = repo.license.spdx_id;
        if (this.check(spdx_id)) {
          this.updateNode('license', spdx_id, {}, createdAt);
          this.updateEdge('has_license', repoId, spdx_id, neo4j.int(-1), {}, createdAt);
        }
      }
      ['description', 'default_branch'].forEach(f => {
        if (repo[f]) this.updateNode('github_repo', repoId, { [f]: repo[f] }, createdAt);
      });
      ['updated_at', 'created_at', 'pushed_at'].forEach(f => {
        if (repo[f]) this.updateNode('github_repo', repoId, { [f]: new Date(repo[f]).toISOString() }, createdAt);
      });
      if (this.check(pull.base?.ref, pull.base?.sha)) {
        this.updateNode('github_issue_change_request', getTuGraphIssueId(), {
          base_ref: pull.base.ref,
          type: 'change_request',
        }, createdAt);
      }
      if (this.check(pull.head?.ref, pull.head?.sha, pull.head?.repo)) {
        this.updateNode('github_issue_change_request', getTuGraphIssueId(), {
          head_id: neo4j.int(pull.head.repo.id),
          head_name: pull.head.repo.full_name,
          head_ref: pull.head.ref,
          type: 'change_request',
        }, createdAt);
      }
      return pull;
    };

    const parsePullRequestReview = () => {
      parsePullRequest();
      const review = r.payload.review;
      const body = review.body ?? '';
      const state = review.state ?? '';
      this.updateEdge('action', actorId, getTuGraphIssueId(), eventId, {
        id: eventId,
        type: 'review',
        body,
        state,
        ...created_at,
      }, createdAt);
    };

    const parsePullRequestReviewComment = () => {
      parsePullRequest();
      const comment = r.payload.comment;
      const body = comment.body;
      const path = comment.path;
      const position = neo4j.int(comment.position ?? 0);
      const line = neo4j.int(comment.line ?? 0);
      const startLine = neo4j.int(comment.start_line ?? 0);
      this.updateEdge('action', actorId, getTuGraphIssueId(), eventId, {
        id: eventId,
        body,
        path,
        position,
        line,
        start_line: startLine,
        type: 'review_comment',
        ...created_at,
      }, createdAt);
    };

    const parseMap = new Map<string, Function>([
      ['IssuesEvent', parseIssue],
      ['IssueCommentEvent', parseIssueComment],
      ['PullRequestEvent', parsePullRequest],
      ['PullRequestReviewEvent', parsePullRequestReview],
      ['PullRequestReviewCommentEvent', parsePullRequestReviewComment],
    ]);
    if (parseMap.has(type)) {
      parseMap.get(type)!();
    }
  }

  private objToString(obj: any): string {
    const type = typeof obj;
    if (type === 'object') { // if nested object
      if (Array.isArray(obj)) { // array obj, wrap with []
        return `[${obj.map(o => this.objToString(o)).join(',')}]`;
      }
      // normal object, recursive call
      return `{${Object.entries(obj).map(([k, v]) => `${k}:${this.objToString(v)}`).join(',')}}`;
    } else if (type === 'string') { // if string, wrap by '
      return `'${obj}'`;
    }
    return obj.toString(); // simple type
  }

  private async insertNodes() {
    const processArr: any[] = [];
    for (const type of nodeTypes) {
      const map = this.exportNodeMap.get(type)!;
      const primary = nodePrimaryKey.get(type) ?? 'id';
      const nodes = Array.from(map.entries()).map(i => {
        const n: any = {
          [primary]: i[0],
          properties: {
            ...i[1].data,
          },
        };
        if (['github_actor', 'github_repo', 'github_org', 'github_issue_change_request'].includes(type)) {
          n.properties.__updated_at = i[1].createdAt.toISOString();
        }
        return n;
      });
      if (nodes.length === 0) continue;
      processArr.push(this.service.neo4j.runQueryWithParamBatch(`
UNWIND $nodes AS node
MERGE (n:${type}{${primary}:node.${primary}})
SET n += node.properties
`, nodes, 'nodes'));
    }
    await Promise.all(processArr);
  }

  private async insertEdges() {
    for (const type of edgeTypes) {
      const edges: any[] = [];
      let hasId = false;
      const map = this.exportEdgeMap.get(type)!;
      const [fromLabel, toLabel]: any[] = edgeTypePair.get(type)!;
      const [fromKey, toKey] = [fromLabel, toLabel].map(t => nodePrimaryKey.get(t) ?? 'id');
      for (const m of map.values()) {
        for (const v of m.values()) {
          if (!v.from || !v.to) continue; // avoid id parse error
          edges.push({
            from: v.from,
            to: v.to,
            data: v.data ?? {},
            id: v.id ?? undefined,
          });
          if (v.id && v.id.isPositive()) hasId = true;
        }
      }
      if (edges.length === 0) continue;
      try {
        const cypher = `
UNWIND $edges AS edge
MATCH (from:${`${fromLabel}`}{${fromKey}:edge.from})
WITH edge, from
MATCH (to:${`${toLabel}`}{${toKey}:edge.to})
WITH edge, from, to
MERGE (from)-[e:${type}${hasId ? '{id:edge.id}' : ''}]->(to)
ON CREATE SET e += edge.data
`;
        await this.service.neo4j.runQueryWithParamBatch(cypher, edges, 'edges');
      } catch (e) {
        this.logger.error(`Error on insert edges ${type}, e=${e}`);
      }
    }
  }

  private check(...params: any[]): boolean {
    return params.every(p => p !== null && p !== undefined);
  }

  private formatDateTime(d: Date): any {
    return {
      timestamp: neo4j.int(d.getTime()),
    };
  }

  public async initDatabase(forceInit: boolean) {
    if (!forceInit) return;
    return new Promise<void>(resolve => {
      const rl = createInterface({ input, output });
      rl.question('!!!Do you want to init the neo4j database?(Yes)', async answer => {
        if (answer !== 'Yes') return resolve();
        // clear database and reset indexes
        const initQuries = ['MATCH (n) DETACH DELETE n;'];
        nodeTypes.forEach(type => {
          initQuries.push(`CREATE CONSTRAINT ${type}_unique IF NOT EXISTS FOR (r:${type}) REQUIRE r.${nodePrimaryKey.get(type) ?? 'id'} IS UNIQUE;`);
        });
        initQuries.push('CREATE CONSTRAINT action_id IF NOT EXISTS FOR ()-[r:action]->() REQUIRE (r.id) IS UNIQUE');
        // initQuries.push('CREATE INDEX github_actor_login IF NOT EXISTS FOR (r:github_actor) ON (r.login);');
        // initQuries.push('CREATE INDEX github_actor_bot IF NOT EXISTS FOR (r:github_actor) ON (r.is_bot);');
        // initQuries.push('CREATE INDEX github_org_login IF NOT EXISTS FOR (r:github_org) ON (r.login);');
        // initQuries.push('CREATE INDEX github_repo_name IF NOT EXISTS FOR (r:github_repo) ON (r.name);');
        // initQuries.push('CREATE INDEX action_timestamp IF NOT EXISTS FOR ()-[r:action]-() ON (r.timestamp);');
        for (const q of initQuries) {
          await this.service.neo4j.runQuery(q);
        }
        this.logger.info('Init database done.');
        resolve();
      });
    });
  }

}
