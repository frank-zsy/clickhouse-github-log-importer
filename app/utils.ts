/* eslint-disable array-bracket-spacing */
export async function waitFor(mill: number) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, mill);
  });
}

export const FieldMap = new Map<string, string>([
  // common
  ['id', 'String'],
  ['type', 'String'],
  ['action', 'String'],
  ['actor_id', 'UInt64'],
  ['actor_login', 'String'],
  ['repo_id', 'UInt64'],
  ['repo_name', 'String'],
  ['org_id', 'UInt64'],
  ['org_login', 'String'],
  ['created_at', 'DateTime'],
  ['created_date', 'Date'],
  // IssuesEvent_opened
  // IssuesEvent_reopened
  // IssuesEvent_closed
  ['issue_id', 'UInt64'],
  ['issue_number', 'UInt32'],
  ['issue_title', 'String'],
  ['issue_body', 'String'],
  ['issue_labels', `Nested
  (
    name String,
    color String,
    default UInt8,
    description String
  )`],
  ['issue_author_id', 'UInt64'],
  ['issue_author_login', 'String'],
  ['issue_author_type', 'String'],
  ['issue_author_association', 'String'],
  ['issue_assignee_id', 'UInt64'],
  ['issue_assignee_login', 'String'],
  ['issue_assignees', `Nested
  (
    login String,
    id UInt64
  )`],
  ['issue_created_at', 'DateTime'],
  ['issue_updated_at', 'DateTime'],
  ['issue_comments', 'UInt16'],
  ['issue_closed_at', 'DateTime'],
  // IssueCommentEvent_created
  ['issue_comment_id', 'UInt64'],
  ['issue_comment_body', 'String'],
  ['issue_comment_created_at', 'DateTime'],
  ['issue_comment_updated_at', 'DateTime'],
  ['issue_comment_author_association', 'String'],
  ['issue_comment_author_id', 'UInt64'],
  ['issue_comment_author_login', 'String'],
  ['issue_comment_author_type', 'String'],
  // PullRequestEvent_opened
  // PullRequestEvent_reopened
  // PullRequestEvent_closed
  ['pull_commits', 'UInt16'],
  ['pull_additions', 'UInt16'],
  ['pull_deletions', 'UInt16'],
  ['pull_changed_files', 'UInt32'],
  ['pull_merged', 'UInt8'],
  ['pull_merge_commit_sha', 'String'],
  ['pull_merged_at', 'DateTime'],
  ['pull_merged_by_id', 'UInt64'],
  ['pull_merged_by_login', 'String'],
  ['pull_merged_by_type', 'String'],
  ['pull_requested_reviewer_id', 'UInt64'],
  ['pull_requested_reviewer_login', 'String'],
  ['pull_requested_reviewer_type', 'String'],
  ['pull_review_comments', 'UInt16'],

  ['repo_description', 'String'],
  ['repo_size', 'UInt32'],
  ['repo_stargazers_count', 'UInt32'],
  ['repo_forks_count', 'UInt32'],
  ['repo_language', 'String'],
  ['repo_has_issues', 'UInt8'],
  ['repo_has_projects', 'UInt8'],
  ['repo_has_downloads', 'UInt8'],
  ['repo_has_wiki', 'UInt8'],
  ['repo_has_pages', 'UInt8'],
  ['repo_license', 'String'],
  ['repo_default_branch', 'String'],
  ['repo_created_at', 'DateTime'],
  ['repo_updated_at', 'DateTime'],
  ['repo_pushed_at', 'DateTime'],
  // PullRequestReviewCommentEvent_created
  ['pull_review_id', 'UInt64'],
  ['pull_review_comment_id', 'UInt64'],
  ['pull_review_comment_path', 'String'],
  ['pull_review_comment_position', 'String'],
  ['pull_review_comment_author_id', 'UInt64'],
  ['pull_review_comment_author_login', 'String'],
  ['pull_review_comment_author_type', 'String'],
  ['pull_review_comment_author_association', 'String'],
  ['pull_review_comment_body', 'String'],
  ['pull_review_comment_created_at', 'DateTime'],
  ['pull_review_comment_updated_at', 'DateTime'],
  // PushEvent
  ['push_id', 'UInt64'],
  ['push_size', 'UInt32'],
  ['push_distinct_size', 'UInt32'],
  ['push_ref', 'String'],
  ['push_head', 'String'],
  ['push_before', 'String'],
  ['push_commits', `Nested
  (
    name String,
    email String,
    message String
  )`],
  // ForkEvent
  ['fork_forkee_id', 'UInt64'],
  ['fork_forkee_full_name', 'String'],
  ['fork_forkee_owner_id', 'UInt64'],
  ['fork_forkee_owner_login', 'String'],
  ['fork_forkee_owner_type', 'String'],
  // WatchEvent_started, none
  // DeleteEvent
  ['delete_ref', 'String'],
  ['delete_ref_type', 'String'],
  ['delete_pusher_type', 'String'],
  // CreateEvent
  ['create_ref', 'String'],
  ['create_ref_type', 'String'],
  ['create_master_branch', 'String'],
  ['create_description', 'String'],
  ['create_pusher_type', 'String'],
  // GollumEvent
  ['gollum_pages', `Nested
  (
    page_name String,
    title String,
    action String
  )`],
  // MemberEvent_added
  ['member_id', 'UInt64'],
  ['member_login', 'String'],
  ['member_type', 'String'],
  // PublicEvent, none
  // ReleaseEvent_published
  ['release_id', 'UInt64'],
  ['release_tag_name', 'String'],
  ['release_target_commitish', 'String'],
  ['release_name', 'String'],
  ['release_draft', 'UInt8'],
  ['release_author_id', 'UInt64'],
  ['release_author_login', 'String'],
  ['release_author_type', 'String'],
  ['release_prerelease', 'UInt8'],
  ['release_created_at', 'DateTime'],
  ['release_published_at', 'DateTime'],
  ['release_body', 'String'],
  ['release_assets', `Nested
  (
    name String,
    uploader_login String,
    uploader_id UInt64,
    content_type String,
    state String,
    size UInt64,
    download_count UInt16
  )`],
  // CommitCommentEvent_action
  ['commit_comment_id', 'UInt64'],
  ['commit_comment_author_id', 'UInt64'],
  ['commit_comment_author_login', 'String'],
  ['commit_comment_author_type', 'String'],
  ['commit_comment_author_association', 'String'],
  ['commit_comment_body', 'String'],
  ['commit_comment_path', 'String'],
  ['commit_comment_position', 'String'],
  ['commit_comment_line', 'String'],
  ['commit_comment_created_at', 'DateTime'],
  ['commit_comment_updated_at', 'DateTime'],
]);
