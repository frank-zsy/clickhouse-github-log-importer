/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable array-bracket-spacing */
const dateformat = require('dateformat');

// use true as third param to convert to UTC time
function formatDateTime(d) {
  return dateformat(new Date(d), 'yyyy-mm-dd HH:MM:ss', true);
}

function commonParser(r) {
  const o = {
    id: parseInt(r.id),
    type: r.type,
    actor_id: r.actor.id,
    actor_login: r.actor.login,
    repo_id: r.repo.id,
    repo_name: r.repo.name,
    created_at: formatDateTime(r.created_at),
  };
  if (r.payload.action) {
    o.action = r.payload.action;
  }
  if (r.org) {
    o.org_id = r.org.id;
    o.org_login = r.org.login;
  }
  return o;
}

function issuesParser(r) {
  const o = commonParser(r);
  const issue = r.payload.issue ?? r.payload.pull_request;

  if (!issue) {
    return null;
  }
  o.issue_id = issue.id;
  o.issue_number = issue.number;
  o.issue_title = issue.title;
  o.body = issue.body ?? '';
  if (!Array.isArray(issue.labels)) {
    issue.labels = [];
  }
  o['issue_labels.name'] = issue.labels.map(l => l.name ?? '');
  o['issue_labels.color'] = issue.labels.map(l => l.color ?? '');
  o['issue_labels.default'] = issue.labels.map(l => l.default ?? false);
  o['issue_labels.description'] = issue.labels.map(l => l.description ?? '');
  if (issue.user) {
    o.issue_author_id = issue.user.id;
    o.issue_author_login = issue.user.login;
    o.issue_author_type = issue.user.type;
  }
  if (o.issue_author_association) {
    o.issue_author_association = issue.author_association;
  }
  if (issue.assignee) {
    o.issue_assignee_id = issue.assignee.id;
    o.issue_assignee_login = issue.assignee.login;
  }

  if (!Array.isArray(issue.assignees)) {
    issue.assignees = [];
  }
  o['issue_assignees.login'] = issue.assignees.map(a => a.login ?? '');
  o['issue_assignees.id'] = issue.assignees.map(a => a.id ?? 0);
  o.issue_comments = issue.comments ?? 0;
  o.issue_created_at = formatDateTime(issue.created_at);
  o.issue_updated_at = formatDateTime(issue.updated_at);
  if (issue.closed_at) {
    o.issue_closed_at = formatDateTime(issue.closed_at);
  }
  return o;
}

function issueCommentParser(r) {
  const o = issuesParser(r);
  const comment = r.payload.comment;
  o.issue_comment_id = comment.id;
  o.body = comment.body;
  o.issue_comment_created_at = formatDateTime(comment.created_at);
  o.issue_comment_updated_at = formatDateTime(comment.updated_at);
  o.issue_comment_author_id = comment.user.id;
  o.issue_comment_author_login = comment.user.login;
  o.issue_comment_author_type = comment.user.type;
  if (comment.author_association) {
    o.issue_comment_author_association = comment.author_association;
  }
  return o;
}

function pullRequestParser(r) {
  const o = issuesParser(r);
  const pull = r.payload.pull_request;
  const repo = pull.base.repo;
  const requestedReviewer = pull.requested_reviewers?.length > 0 ? pull.requested_reviewers[0] : undefined;

  o.pull_commits = pull.commits ?? 0;
  o.pull_additions = pull.additions ?? 0;
  o.pull_deletions = pull.deletions ?? 0;
  o.pull_changed_files = pull.changed_files ?? 0;
  o.pull_merged = pull.merged ?? false;
  o.pull_merge_commit_sha = pull.merge_commit_sha ?? '';
  if (pull.merged_at) {
    o.pull_merged_at = formatDateTime(pull.merged_at);
  }
  if (pull.merged_by) {
    o.pull_merged_by_id = pull.merged_by.id;
    o.pull_merged_by_login = pull.merged_by.login;
    o.pull_merged_by_type = pull.merged_by.type;
  }
  o.pull_review_comments = pull.review_comments ?? 0;
  if (requestedReviewer) {
    o.pull_requested_reviewer_id = requestedReviewer.id;
    o.pull_requested_reviewer_login = requestedReviewer.login;
    o.pull_requested_reviewer_type = requestedReviewer.type;
  }
  o.pull_base_ref = pull.base.ref;
  const headRepo = pull.head.repo;
  o.pull_head_repo_id = headRepo?.id ?? 0;
  o.pull_head_repo_name = headRepo?.full_name ?? '';
  o.pull_head_ref = pull.head.ref;

  if (repo.description) {
    o.repo_description = repo.description;
  }
  o.repo_size = repo.size;
  o.repo_stargazers_count = repo.stargazers_count;
  o.repo_forks_count = Math.max(Number.isNaN(parseInt(repo.forks_count)) ? 0 : parseInt(repo.forks_count), 0);
  if (repo.language) {
    o.repo_language = repo.language;
  }
  o.repo_has_issues = repo.has_issues;
  o.repo_has_projects = repo.has_projects ?? false;
  o.repo_has_downloads = repo.has_downloads;
  o.repo_has_wiki = repo.has_wiki;
  o.repo_has_pages = repo.has_pages;
  if (repo.license) {
    o.repo_license = repo.license.name;
  }
  if (repo.default_branch) {
    o.repo_default_branch = repo.default_branch;
  }
  o['repo_topics.name'] = repo.topics ?? [];
  o.repo_created_at = formatDateTime(repo.created_at);
  o.repo_updated_at = formatDateTime(repo.updated_at);
  o.repo_pushed_at = formatDateTime(repo.pushed_at);
  return o;
}

function pullRequestReviewParser(r) {
  const o = pullRequestParser(r);
  const review = r.payload.review;
  o.body = review.body ?? undefined;
  if (review.id > 0) {
    o.pull_review_id = review.id;
  }
  o.pull_review_state = review.state;
  o.pull_review_author_association = review.author_association;
  return o;
}

function pullRequestReviewCommentParser(r) {
  const o = pullRequestParser(r);
  const comment = r.payload.comment;
  if (comment.pull_request_review_id > 0) {
    o.pull_review_id = comment.pull_request_review_id;
  }
  o.pull_review_comment_id = comment.id;
  if (comment.path) {
    o.pull_review_comment_path = comment.path;
  }
  if (comment.position) {
    o.pull_review_comment_position = comment.position.toString();
  }
  if (comment.user) {
    o.pull_review_comment_author_id = comment.user.id;
    o.pull_review_comment_author_login = comment.user.login;
    o.pull_review_comment_author_type = comment.user.type;
  }
  if (comment.author_association) {
    o.pull_review_comment_author_association = comment.author_association;
  }
  o.body = comment.body;
  o.pull_review_comment_created_at = formatDateTime(comment.created_at);
  o.pull_review_comment_updated_at = formatDateTime(comment.updated_at);
  return o;
}

function pushParser(r) {
  const o = commonParser(r);
  o.push_id = r.payload.push_id;
  o.push_size = r.payload.size;
  o.push_distinct_size = r.payload.distinct_size;
  o.push_ref = r.payload.ref;
  o.push_head = r.payload.head;
  if (!Array.isArray(r.payload.commits)) {
    r.payload.commits = [];
  }
  o['push_commits.name'] = r.payload.commits.map(c => (c.author ? c.author.name : ''));
  o['push_commits.email'] = r.payload.commits.map(c => (c.author ? c.author.email : ''));
  o['push_commits.message'] = r.payload.commits.map(c => c.message ?? '');
  return o;
}

function forkParser(r) {
  const o = commonParser(r);
  const forkee = r.payload.forkee;
  o.fork_forkee_id = forkee.id;
  o.fork_forkee_full_name = forkee.full_name;
  if (forkee.owner) {
    o.fork_forkee_owner_id = forkee.owner.id;
    o.fork_forkee_owner_login = forkee.owner.login;
    o.fork_forkee_owner_type = forkee.owner.type;
  }
  return o;
}

function watchParser(r) {
  return commonParser(r);
}

function deleteParser(r) {
  const o = commonParser(r);
  o.delete_ref = r.payload.ref;
  o.delete_ref_type = r.payload.ref_type;
  o.delete_pusher_type = r.payload.pusher_type;
  return o;
}

function createParser(r) {
  const o = commonParser(r);
  if (r.payload.ref) {
    o.create_ref = r.payload.ref;
    o.create_ref_type = r.payload.ref_type;
  }
  o.create_master_branch = r.payload.master_branch;
  o.create_description = r.payload.description ?? '';
  o.create_pusher_type = r.payload.pusher_type;
  return o;
}

function gollumParser(r) {
  const o = commonParser(r);
  if (!Array.isArray(r.payload.pages)) {
    r.payload.pages = [];
  }
  o['gollum_pages.page_name'] = r.payload.pages.map(p => p.page_name ?? '');
  o['gollum_pages.title'] = r.payload.pages.map(p => p.title ?? '');
  o['gollum_pages.action'] = r.payload.pages.map(p => p.action ?? '');
  return o;
}

function memberParser(r) {
  const o = commonParser(r);
  const member = r.payload.member;
  o.member_id = member.id;
  o.member_login = member.login;
  o.member_type = member.type;
  return o;
}

function publicParser(r) {
  return commonParser(r);
}

function releaseParser(r) {
  const o = commonParser(r);
  const release = r.payload.release;
  o.release_id = release.id;
  o.release_tag_name = release.tag_name ?? '';
  o.release_target_commitish = release.target_commitish;
  o.release_name = release.name ?? '';
  o.release_draft = release.draft;
  if (release.author) {
    o.release_author_id = release.author.id;
    o.release_author_login = release.author.login;
    o.release_author_type = release.author.type;
  }
  o.release_prerelease = release.prerelease;
  o.release_created_at = formatDateTime(release.created_at);
  if (release.published_at) {
    o.release_published_at = formatDateTime(release.published_at);
  }
  o.release_body = release.body ?? '';
  if (!Array.isArray(release.assets)) {
    release.assets = [];
  }
  o['release_assets.name'] = release.assets.map(a => a.name ?? '');
  o['release_assets.uploader_login'] = release.assets.map(a => (a.uploader ? a.uploader.login : ''));
  o['release_assets.uploader_id'] = release.assets.map(a => (a.uploader ? a.uploader.id : 0));
  o['release_assets.content_type'] = release.assets.map(a => a.content_type ?? '');
  o['release_assets.state'] = release.assets.map(a => a.state ?? '');
  o['release_assets.size'] = release.assets.map(a => a.size ?? 0);
  o['release_assets.download_count'] = release.assets.map(a => a.download_count ?? 0);
  return o;
}

function commitCommentParser(r) {
  const o = commonParser(r);
  const comment = r.payload.comment;
  o.commit_comment_id = comment.id;
  if (comment.user) {
    o.commit_comment_author_id = comment.user.id;
    o.commit_comment_author_login = comment.user.login;
    o.commit_comment_author_type = comment.user.type;
  }
  if (comment.author_association) {
    o.commit_comment_author_association = comment.author_association;
  }
  o.body = comment.body ?? '';
  if (comment.path) {
    o.commit_comment_path = comment.path;
  }
  if (comment.position) {
    o.commit_comment_position = comment.position.toString();
  }
  if (comment.line) {
    o.commit_comment_line = comment.line.toString();
  }
  o.commit_comment_sha = comment.commit_id;
  o.commit_comment_created_at = formatDateTime(comment.created_at);
  o.commit_comment_updated_at = formatDateTime(comment.updated_at);
  return o;
}

module.exports = new Map([
  ['IssuesEvent', issuesParser],
  ['IssueCommentEvent', issueCommentParser],
  ['PullRequestEvent', pullRequestParser],
  ['PullRequestReviewEvent', pullRequestReviewParser],
  ['PullRequestReviewCommentEvent', pullRequestReviewCommentParser],
  ['PushEvent', pushParser],
  ['ForkEvent', forkParser],
  ['WatchEvent', watchParser],
  ['DeleteEvent', deleteParser],
  ['CreateEvent', createParser],
  ['GollumEvent', gollumParser],
  ['MemberEvent', memberParser],
  ['PublicEvent', publicParser],
  ['ReleaseEvent', releaseParser],
  ['CommitCommentEvent', commitCommentParser],
]);
