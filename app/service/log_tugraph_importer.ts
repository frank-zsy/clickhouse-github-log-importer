/* eslint-disable array-bracket-spacing */
import { Service } from 'egg';

interface EntityItem {
  createdAt: Date;
  data?: {
    [key: string]: any;
  };
}
type NodeType = 'github_repo' | 'github_org' | 'github_actor' | 'github_issue' | 'github_change_request' | 'issue_label' | 'language' | 'license';
const nodeTypes: NodeType[] = [
  'github_repo', 'github_org', 'github_actor', 'github_issue', 'github_change_request',
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
  id?: number;
  data?: {
    [key: string]: any;
  };
}
type EdgeType = 'has_license' | 'has_language' | 'has_repo' | 'has_fork' | 'fork' | 'star' | 'has_issue_change_request' | 'change_request_from' | 'has_issue_label' | 'open' | 'comment' | 'close' | 'has_assignee' | 'has_requested_reviewer' | 'review' | 'review_comment';
const edgeTypes: EdgeType[] = ['has_license', 'has_language', 'has_repo', 'has_fork', 'fork', 'star', 'has_issue_change_request', 'change_request_from', 'has_issue_label', 'open', 'comment', 'close', 'has_assignee', 'has_requested_reviewer', 'review', 'review_comment'];
const edgeTypePair = new Map<EdgeType, string[]>([
  ['has_license', ['github_repo', 'license']],
  ['has_language', ['github_repo', 'language']],
  ['has_repo', ['github_org', 'github_repo']],
  ['has_fork', ['github_repo', 'github_repo']],
  ['fork', ['github_actor', 'github_repo']],
  ['star', ['github_actor', 'github_repo']],
  ['has_issue_change_request', ['github_repo', 'github_issue|github_change_request']],
  ['change_request_from', ['github_change_request', 'github_repo']],
  ['has_issue_label', ['github_issue|github_change_request', 'issue_label']],
  ['open', ['github_actor', 'github_issue|github_change_request']],
  ['comment', ['github_actor', 'github_issue|github_change_request']],
  ['close', ['github_actor', 'github_issue|github_change_request']],
  ['has_assignee', ['github_issue|github_change_request', 'github_actor']],
  ['has_requested_reviewer', ['github_issue|github_change_request', 'github_actor']],
  ['review', ['github_actor', 'github_change_request']],
  ['review_comment', ['github_actor', 'github_change_request']],
]);

export default class LogTugraphImporter extends Service {

  private nodeMap = new Map<NodeType, Map<number, EntityItem>>();
  private edgeMap = new Map<EdgeType, Map<string, Map<number, EdgeItem>>>();

  public async import(filePath: string): Promise<boolean> {
    this.logger.info(`Ready to prepare data for ${filePath}.`);
    this.init();
    await this.service.fileUtils.readlineUnzip(filePath, async line => {
      this.parse(line);
    });
    this.logger.info('Ready to insert data into database.');
    await this.insertNodes();
    await this.insertEdges();
    return true;
  }

  private init() {
    this.nodeMap.clear();
    this.edgeMap.clear();
    nodeTypes.forEach(t => this.nodeMap.set(t, new Map<number, EntityItem>()));
    edgeTypes.forEach(t => this.edgeMap.set(t, new Map<string, Map<number, EdgeItem>>()));
  }

  private updateNode(type: NodeType, id: number, data: any, createdAt: Date) {
    const dataMap = this.nodeMap.get(type)!;
    if (dataMap.has(id)) {
      const item = dataMap.get(id)!;
      if (item.createdAt.getTime() < createdAt.getTime()) {
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

  private updateEdge(type: EdgeType, from: number, to: number, id: number, data: any, createdAt: Date) {
    const key = `${from}_${to}`;
    const dataMap = this.edgeMap.get(type)!;
    if (!dataMap.has(key)) {
      dataMap.set(key, new Map<number, EdgeItem>());
    }
    const item = dataMap.get(key)!.get(id) ?? { from, to, id, data, createdAt };
    if (item.createdAt.getTime() < createdAt.getTime()) {
      item.data = data;
      item.createdAt = createdAt;
    }
    dataMap.get(key)!.set(id, item);
  }

  private parse(line: string) {
    const r = JSON.parse(line);
    const type = r.type;
    const action = r.payload?.action;

    const eventId = parseInt(r.id);
    const actorId = parseInt(r.actor.id);
    const actorLogin = r.actor.login;
    const repoId = parseInt(r.repo.id);
    const repoName = r.repo.name;
    const createdAt = new Date(r.created_at);
    if (!this.check(actorId, actorLogin, repoId, repoName, createdAt)) {
      this.logger.info(`Invalid line: ${line}`);
      return;
    }
    this.updateNode('github_repo', repoId, { name: repoName }, createdAt);
    this.updateNode('github_actor', actorId, { login: actorLogin }, createdAt);
    if (r.org) {
      const orgId = parseInt(r.org.id);
      const orgLogin = r.org.login;
      if (this.check(orgId, orgLogin)) {
        this.updateNode('github_org', orgId, { login: orgLogin }, createdAt);
        this.updateEdge('has_repo', orgId, repoId, -1, {}, createdAt);
      }
    }

    const created_at = this.formatDateTime(createdAt);
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
      const id = parseInt(issue.id);
      const number = parseInt(issue.number);
      const title = issue.title;
      const body = issue.body ?? '';
      this.updateNode(isPull ? 'github_change_request' : 'github_issue', id, { id, number, title, body }, createdAt);
      if (!Array.isArray(issue.labels)) issue.labels = [];
      issue.labels.forEach(l => {
        const label = l.name;
        this.updateNode('issue_label', label, {}, createdAt);
        this.updateEdge('has_issue_label', id, label, -1, {}, createdAt);
      });
      if (issue.assignee) {
        const assigneeId = parseInt(issue.assignee.id);
        const assigneeLogin = issue.assignee.login;
        this.updateNode('github_actor', assigneeId, { login: assigneeLogin }, createdAt);
        this.updateEdge('has_assignee', id, assigneeId, -1, {}, createdAt);
      }
      if (!Array.isArray(issue.assignees)) issue.assignees = [];
      issue.assignees.forEach(a => {
        const assigneeId = parseInt(a.id);
        const assigneeLogin = a.login;
        this.updateNode('github_actor', assigneeId, { login: assigneeLogin }, createdAt);
        this.updateEdge('has_assignee', id, assigneeId, -1, {}, createdAt);
      });
      this.updateEdge('has_issue_change_request', repoId, id, -1, {}, createdAt);

      if (action === 'opened') {
        this.updateEdge('open', actorId, id, eventId, { id, created_at }, createdAt);
      } else if (action === 'closed') {
        this.updateEdge('close', actorId, id, eventId, { id, created_at }, createdAt);
      }
      return issue;
    };

    const parseIssueComment = () => {
      const issue = parseIssue();
      const id = r.payload.comment.id;
      const body = r.payload.comment.body;
      this.updateEdge('comment', actorId, parseInt(issue.id), id, { id, body, created_at }, createdAt);
    };

    const parsePullRequest = () => {
      const pull = parseIssue();
      const id = parseInt(pull.id);
      const commits = parseInt(pull.commits ?? 0);
      const additions = parseInt(pull.additions ?? 0);
      const deletions = parseInt(pull.deletions ?? 0);
      const changed_files = parseInt(pull.changed_files ?? 0);
      if (action === 'closed' && pull.merged) {
        this.updateEdge('close', actorId, id, eventId, { id, merged: true, created_at }, createdAt);
      }
      this.updateNode('github_change_request', id, { commits, additions, deletions, changed_files }, createdAt);
      if (!Array.isArray(pull.requested_reviewers)) pull.requested_reviewers = [];
      pull.requested_reviewers.forEach(r => {
        const reviewerId = parseInt(r.id);
        const reviewerLogin = r.login;
        this.updateNode('github_actor', reviewerId, { login: reviewerLogin }, createdAt);
        this.updateEdge('has_requested_reviewer', id, reviewerId, -1, {}, createdAt);
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
        if (r[f]) this.updateNode('github_repo', repoId, { [f]: repo[f] }, createdAt);
      });
      ['updated_at', 'created_at', 'pushed_at'].forEach(f => {
        if (r[f]) this.updateNode('github_repo', repoId, { [f]: this.formatDateTime(new Date(repo[f])) }, createdAt);
      });
      if (this.check(pull.base?.ref, pull.base?.sha)) {
        this.updateNode('github_change_request', id, { ref: pull.base.ref, sha: pull.base.sha }, createdAt);
      }
      if (this.check(pull.head?.ref, pull.head?.sha, pull.head?.repo)) {
        this.updateNode('github_repo', pull.head.repo.id, { name: pull.head.repo.name }, createdAt);
        this.updateEdge('change_request_from', id, pull.head.repo.id, -1, { ref: pull.head.ref, sha: pull.head.sha }, createdAt);
      }
      return pull;
    };

    const parsePullRequestReview = () => {
      const pull = parsePullRequest();
      const review = r.payload.review;
      const body = review.body ?? '';
      const state = review.state ?? '';
      const id = review.id ?? 0;
      this.updateEdge('review', actorId, parseInt(pull.id), id, { id, body, state, created_at: createdAt }, createdAt);
    };

    const parsePullRequestReviewComment = () => {
      const pull = parsePullRequest();
      const comment = r.payload.comment;
      const id = comment.id;
      const body = comment.body;
      const path = comment.path;
      const position = comment.position ?? 0;
      const line = comment.line ?? 0;
      const startLine = comment.start_line ?? 0;
      this.updateEdge('review_comment', actorId, parseInt(pull.id), id, { id, body, path, position, line, start_line: startLine, created_at }, createdAt);
    };

    const parseStar = () => {
      this.updateEdge('star', actorId, repoId, -1, { created_at }, createdAt);
    };

    const parseFork = () => {
      this.updateEdge('fork', actorId, repoId, eventId, { id: eventId, created_at }, createdAt);
      const forkee = r.payload.forkee;
      if (!this.check(forkee)) return;
      const id = parseInt(forkee.id);
      const name = forkee.full_name;
      this.updateNode('github_repo', id, { name }, createdAt);
      this.updateEdge('has_fork', repoId, id, -1, { created_at }, createdAt);
    };

    const parseMap = new Map<string, Function>([
      ['WatchEvent', parseStar],
      ['ForkEvent', parseFork],
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
      const map = this.nodeMap.get(type)!;
      const primary = nodePrimaryKey.get(type) ?? 'id';
      const nodes = Array.from(map.entries()).map(i => {
        const n: any = {
          [primary]: i[0],
          data: {
            ...i[1].data,
          },
        };
        if (['github_actor', 'github_repo', 'github_org', 'github_issue', 'github_change_request'].includes(type)) {
          n.data.__updated_at = this.formatDateTime(i[1].createdAt);
        }
        return n;
      });
      if (nodes.length === 0) continue;
      const nodesArr = this.splitArr(nodes);
      for (const nodes of nodesArr) {
        processArr.push(this.service.tugraph.callPlugin('cpp', 'update_nodes', { type, primary, nodes }));
      }
    }
    await Promise.all(processArr);
  }

  private async insertEdges() {
    const processArr: any[] = [];
    for (const type of edgeTypes) {
      const edges: any[] = [];
      const map = this.edgeMap.get(type)!;
      const [fromLabel, toLabel]: any[] = edgeTypePair.get(type)!;
      const [fromKey, toKey] = [fromLabel, toLabel].map(t => nodePrimaryKey.get(t) ?? 'id');
      for (const m of map.values()) {
        for (const v of m.values()) {
          edges.push({
            from: v.from,
            to: v.to,
            data: v.data ?? {},
            id: v.id ?? -1,
          });
        }
      }
      if (edges.length === 0) continue;
      const edgesArr = this.splitArr(edges);
      for (const e of edgesArr) {
        processArr.push(this.service.tugraph.callPlugin('cpp', 'update_edges', {
          fromKey,
          fromLabel,
          toKey,
          toLabel,
          label: type,
          edges: e,
        }));
      }
    }
    await Promise.all(processArr);
  }

  private check(...params: any[]): boolean {
    return params.every(p => p !== null && p !== undefined);
  }

  private formatDateTime(d: Date) {
    return d.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  }

  private splitArr<T>(arr: T[], len = 50000): T[][] {
    if (arr.length < len) return [arr];
    let index = 0;
    const newArr: T[][] = [];
    while (index < arr.length) {
      newArr.push(arr.slice(index, index += len));
    }
    return newArr;
  }

}