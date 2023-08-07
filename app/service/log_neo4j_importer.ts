/* eslint-disable array-bracket-spacing */
import { Service } from 'egg';
import { createInterface } from 'readline';
import { waitUntil } from '../utils';
import { stdin as input, stdout as output } from 'process';
import neo4j = require('neo4j-driver');

interface EntityItem {
  createdAt: Date;
  data: {
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

  private nodeMap: Map<NodeType, Map<number | string, EntityItem>>;
  private edgeMap: Map<EdgeType, Map<string, Map<number, EdgeItem>>>;
  private exportNodeMap: Map<NodeType, Map<number | string, EntityItem>>;
  private exportEdgeMap: Map<EdgeType, Map<string, Map<number, EdgeItem>>>;
  private modifyIdSet: Set<NodeType> = new Set<NodeType>(['github_actor', 'github_org', 'github_repo']);
  private isExporting = false;
  private lastParseTime = 0;

  public async import(filePath: string, onSuccess: () => void): Promise<void> {
    this.init();
    const parseStartTime = new Date().getTime();
    await this.service.fileUtils.readlineUnzip(filePath, async line => {
      try {
        this.parse(line);
      } catch (e: any) {
        this.logger.error(`Error on parse line, e=${JSON.stringify(e.message)}, line=${line}`);
      }
    });
    const parseTime = new Date().getTime() - parseStartTime;
    // wait until last insert done
    await waitUntil(() => !this.isExporting, 10);
    this.lastParseTime = parseTime;
    this.isExporting = true;
    // change node map and edge map reference to avoid next data procedure clear the data on inserting
    this.exportNodeMap = this.nodeMap;
    this.exportEdgeMap = this.edgeMap;
    (async () => {
      const insertNodesStart = new Date().getTime();
      try {
        await this.insertNodes();
      } catch (e) {
        this.logger.error(`Error on insert nodes, e=${e}`);
      }
      const insertNodesTime = new Date().getTime() - insertNodesStart;

      const insertEdgesStart = new Date().getTime();
      await this.insertEdges();
      const insertEdgesTime = new Date().getTime() - insertEdgesStart;

      this.logger.info(`Insert ${filePath} done. Durations are ${this.lastParseTime}, ${insertNodesTime}, ${insertEdgesTime}`);
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

  private updateNode(type: NodeType, id: number | string, data: any, createdAt: Date) {
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

  private updateEdge(type: EdgeType, from: any, to: any, id: number, data: any, createdAt: Date) {
    const key = `${from}_${to}`;
    const dataMap = this.edgeMap.get(type)!;
    if (!dataMap.has(key)) {
      dataMap.set(key, new Map<number, EdgeItem>());
    }
    const item = dataMap.get(key)!.get(id) ?? { from, to, id: neo4j.int(id), data, createdAt };
    if (item.createdAt.getTime() <= createdAt.getTime()) {
      item.data = data;
      item.createdAt = createdAt;
    }
    dataMap.get(key)!.set(id, item);
  }

  private parse(line: string) {
    const r = JSON.parse(line);
    const type = r.type;
    const action = r.payload?.action;

    const eventId = r.id;
    const actorId = r.actor.id;
    const actorLogin = r.actor.login;
    const repoId = r.repo.id;
    const repoName = r.repo.name;
    const createdAt = new Date(r.created_at);
    if (!this.check(actorId, actorLogin, repoId, repoName, createdAt)) {
      this.logger.info(`Invalid line: ${line}`);
      return;
    }
    this.updateNode('github_repo', repoId, { name: repoName }, createdAt);
    this.updateNode('github_actor', actorId, { login: actorLogin }, createdAt);
    if (r.org) {
      const orgId = r.org.id;
      const orgLogin = r.org.login;
      if (this.check(orgId, orgLogin)) {
        this.updateNode('github_org', orgId, { login: orgLogin }, createdAt);
        this.updateEdge('has_repo', orgId, repoId, -1, {}, createdAt);
      }
    }

    const created_at = this.formatDateTime(createdAt);
    const getIssueChangeRequestId = (): string => {
      const issue = r.payload.issue ?? r.payload.pull_request;
      const number = issue.number;
      return `${repoId}_${number}`;
    };

    let issueChangeRequestId = '';

    const parseIssue = () => {
      issueChangeRequestId = getIssueChangeRequestId();
      let issue = r.payload.issue;
      let isPull = false;
      if (!issue) {
        issue = r.payload.pull_request;
        isPull = true;
      }
      if (issue.pull_request) {
        // for issue comment event, there will be a pull_request field in issue
        isPull = true;
      }
      if (!this.check(issue)) {
        this.logger.info(`Issue not found ${r.payload}`);
        return;
      }
      const number = issue.number;
      const title = issue.title;
      const body = issue.body ?? '';
      this.updateNode('github_issue_change_request', issueChangeRequestId, {
        type: isPull ? 'change_request' : 'issue',
        number,
        title,
        body,
      }, createdAt);
      if (!Array.isArray(issue.labels)) issue.labels = [];
      issue.labels.forEach(l => {
        const label = l.name;
        this.updateNode('issue_label', label, {}, createdAt);
        this.updateEdge('has_issue_label', issueChangeRequestId, label, -1, {}, createdAt);
      });
      if (issue.assignee) {
        const assigneeId = issue.assignee.id;
        const assigneeLogin = issue.assignee.login;
        this.updateNode('github_actor', assigneeId, { login: assigneeLogin }, createdAt);
        this.updateEdge('has_assignee', issueChangeRequestId, assigneeId, -1, {}, createdAt);
      }
      if (!Array.isArray(issue.assignees)) issue.assignees = [];
      issue.assignees.forEach(a => {
        const assigneeId = a.id;
        const assigneeLogin = a.login;
        this.updateNode('github_actor', assigneeId, { login: assigneeLogin }, createdAt);
        this.updateEdge('has_assignee', issueChangeRequestId, assigneeId, -1, {}, createdAt);
      });
      this.updateEdge('has_issue_change_request', repoId, issueChangeRequestId, -1, {}, createdAt);

      if (action === 'opened') {
        this.updateEdge('action', actorId, issueChangeRequestId, eventId, { type: 'open', ...created_at }, createdAt);
      } else if (action === 'closed') {
        this.updateEdge('action', actorId, issueChangeRequestId, eventId, { type: 'close', ...created_at }, createdAt);
      }
      return issue;
    };

    const parseIssueComment = () => {
      const body = r.payload.comment.body;
      this.updateEdge('action', actorId, getIssueChangeRequestId(), eventId, { body, type: 'comment', ...created_at }, createdAt);
    };

    const parsePullRequest = () => {
      const pull = parseIssue();
      const commits = pull.commits ?? 0;
      const additions = pull.additions ?? 0;
      const deletions = pull.deletions ?? 0;
      const changed_files = pull.changed_files ?? 0;
      if (action === 'closed') {
        if (pull.merged) {
          this.updateEdge('action', actorId, issueChangeRequestId, eventId, {
            type: 'close',
            merged: true,
            ...created_at,
          }, createdAt);
        } else {
          this.updateEdge('action', actorId, issueChangeRequestId, eventId, {
            type: 'close',
            merged: false,
            ...created_at,
          }, createdAt);
        }
      }
      if ([commits, additions, deletions, changed_files].some(i => i > 0)) {
        // these may not exists for some events
        this.updateNode('github_issue_change_request', issueChangeRequestId, {
          type: 'change_request',
          commits,
          additions,
          deletions,
          changed_files,
        }, createdAt);
      }
      if (!Array.isArray(pull.requested_reviewers)) pull.requested_reviewers = [];
      pull.requested_reviewers.forEach(r => {
        const reviewerId = r.id;
        const reviewerLogin = r.login;
        this.updateNode('github_actor', reviewerId, { login: reviewerLogin }, createdAt);
        this.updateEdge('has_requested_reviewer', issueChangeRequestId, reviewerId, -1, {}, createdAt);
      });
      const repo = pull.base.repo;
      if (repo.language) {
        const language = repo.language;
        this.updateNode('language', language, {}, createdAt);
        this.updateEdge('has_language', repoId, language, -1, {}, createdAt);
      }
      if (repo.license) {
        const spdx_id = repo.license.spdx_id;
        if (this.check(spdx_id)) {
          this.updateNode('license', spdx_id, {}, createdAt);
          this.updateEdge('has_license', repoId, spdx_id, -1, {}, createdAt);
        }
      }
      ['description', 'default_branch'].forEach(f => {
        if (repo[f]) this.updateNode('github_repo', repoId, { [f]: repo[f] }, createdAt);
      });
      ['updated_at', 'created_at', 'pushed_at'].forEach(f => {
        if (repo[f]) this.updateNode('github_repo', repoId, { [f]: repo[f] }, createdAt);
      });
      if (this.check(pull.base?.ref, pull.base?.sha)) {
        this.updateNode('github_issue_change_request', issueChangeRequestId, {
          base_ref: pull.base.ref,
          type: 'change_request',
        }, createdAt);
      }
      if (this.check(pull.head?.ref, pull.head?.sha, pull.head?.repo)) {
        this.updateNode('github_issue_change_request', issueChangeRequestId, {
          head_id: pull.head.repo.id,
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
      this.updateEdge('action', actorId, issueChangeRequestId, eventId, {
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
      this.updateEdge('action', actorId, issueChangeRequestId, eventId, {
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

  private async insertNodes() {
    const processArr: any[] = [];
    for (const type of nodeTypes) {
      const map = this.exportNodeMap.get(type)!;
      const primary = nodePrimaryKey.get(type) ?? 'id';
      const nodes: any[] = [];
      for (const i of map.entries()) {
        let id: any = i[0];
        const data = i[1].data;
        if (this.modifyIdSet.has(type)) {
          data.__updated_at = i[1].createdAt.toISOString();
          id = neo4j.int(id);
          if (type === 'github_actor' && data.login.endsWith('[bot]')) {
            data.is_bot = true;
          } else if (type === 'github_repo') {
            ['created_at', 'updated_at', 'pushed_at'].forEach(f => {
              if (data[f]) {
                data[f] = new Date(data[f]).toISOString();
              }
            });
          }
        } else if (type === 'github_issue_change_request') {
          data.__updated_at = i[1].createdAt.toISOString();
          if (data.number) data.number = neo4j.int(data.number);
          if (data.type === 'change_request') {
            ['commits', 'additions', 'deletions', 'changed_files', 'head_id'].forEach(f => {
              if (data[f] > 0) {
                data[f] = neo4j.int(data[f]);
              }
            });
          }
        }
        nodes.push({
          [primary]: id,
          properties: {
            ...i[1].data,
          },
        });
      }
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
      const map = this.exportEdgeMap.get(type)!;
      const [fromLabel, toLabel]: any[] = edgeTypePair.get(type)!;
      const [fromKey, toKey] = [fromLabel, toLabel].map(t => nodePrimaryKey.get(t) ?? 'id');
      for (const m of map.values()) {
        for (const [id, v] of m.entries()) {
          if (!v.from || !v.to) continue; // avoid id parse error
          edges.push({
            from: v.from,
            to: v.to,
            data: v.data ?? {},
            id: id > 0 ? v.id : undefined,
          });
        }
      }
      if (edges.length === 0) continue;
      try {
        const cypher = `
UNWIND $edges AS edge
MATCH (from:${`${fromLabel}`}{${fromKey}:edge.from}), (to:${`${toLabel}`}{${toKey}:edge.to})
MERGE (from)-[e:${type}${type === 'action' ? '{id:edge.id}' : ''}]->(to)
SET e += edge.data
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
        for (const q of initQuries) {
          await this.service.neo4j.runQuery(q);
        }
        this.logger.info('Init database done.');
        resolve();
      });
    });
  }

}
