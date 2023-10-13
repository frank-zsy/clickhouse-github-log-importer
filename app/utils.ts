/* eslint-disable array-bracket-spacing */
export async function waitFor(mill: number) {
  return new Promise<void>(resolve => {
    setTimeout(() => {
      resolve();
    }, mill);
  });
}

export async function waitUntil(func: () => boolean, mill = 100) {
  while (!func()) {
    await waitFor(mill);
  }
}

const userType = "Enum('Bot' = 1, 'Mannequin' = 2, 'Organization' = 3, 'User' = 4)";
const associationType = "Enum('COLLABORATOR' = 1, 'CONTRIBUTOR' = 2, 'MEMBER' = 3, 'NONE' = 4, 'OWNER' = 5, 'MANNEQUIN' = 6)";
const reviewStateType = "Enum('approved' = 1, 'commented' = 2, 'dismissed' = 3, 'changes_requested' = 4)";

export const FieldMap = new Map<string, string>([
  // common
  ['id', 'UInt64'],
  ['type', `Enum('CommitCommentEvent' = 1, 'CreateEvent' = 2, 'DeleteEvent' = 3, 'ForkEvent' = 4,
                    'GollumEvent' = 5, 'IssueCommentEvent' = 6, 'IssuesEvent' = 7, 'MemberEvent' = 8,
                    'PublicEvent' = 9, 'PullRequestEvent' = 10, 'PullRequestReviewCommentEvent' = 11,
                    'PushEvent' = 12, 'ReleaseEvent' = 13, 'WatchEvent' = 14, 'PullRequestReviewEvent' = 15)`],
  ['action', `Enum('added' = 1, 'closed' = 2, 'created' = 3, 'labeled' = 4, 'opened' = 5, 'published' = 6,
                    'reopened' = 7, 'started' = 8)`],
  ['actor_id', 'UInt64'],
  ['actor_login', 'LowCardinality(String)'],
  ['repo_id', 'UInt64'],
  ['repo_name', 'LowCardinality(String)'],
  ['org_id', 'UInt64'],
  ['org_login', 'LowCardinality(String)'],
  ['created_at', 'DateTime'],
  // IssuesEvent_opened
  // IssuesEvent_reopened
  // IssuesEvent_closed
  ['issue_id', 'UInt64'],
  ['issue_number', 'UInt32'],
  ['issue_title', 'String'],
  ['body', 'String'],
  ['issue_labels', `Nested
  (
    name String,
    color String,
    default UInt8,
    description String
  )`],
  ['issue_author_id', 'UInt64'],
  ['issue_author_login', 'LowCardinality(String)'],
  ['issue_author_type', userType],
  ['issue_author_association', associationType],
  ['issue_assignee_id', 'UInt64'],
  ['issue_assignee_login', 'LowCardinality(String)'],
  ['issue_assignees', `Nested
  (
    login LowCardinality(String),
    id UInt64
  )`],
  ['issue_created_at', 'Nullable(DateTime)'],
  ['issue_updated_at', 'Nullable(DateTime)'],
  ['issue_comments', 'UInt16'],
  ['issue_closed_at', 'Nullable(DateTime)'],
  // IssueCommentEvent_created
  ['issue_comment_id', 'UInt64'],
  ['issue_comment_created_at', 'Nullable(DateTime)'],
  ['issue_comment_updated_at', 'Nullable(DateTime)'],
  ['issue_comment_author_association', associationType],
  ['issue_comment_author_id', 'UInt64'],
  ['issue_comment_author_login', 'LowCardinality(String)'],
  ['issue_comment_author_type', userType],
  // PullRequestEvent_opened
  // PullRequestEvent_reopened
  // PullRequestEvent_closed
  ['pull_commits', 'UInt16'],
  ['pull_additions', 'UInt16'],
  ['pull_deletions', 'UInt16'],
  ['pull_changed_files', 'UInt32'],
  ['pull_merged', 'UInt8'],
  ['pull_merge_commit_sha', 'String'],
  ['pull_merged_at', 'Nullable(DateTime)'],
  ['pull_merged_by_id', 'UInt64'],
  ['pull_merged_by_login', 'LowCardinality(String)'],
  ['pull_merged_by_type', userType],
  ['pull_requested_reviewer_id', 'UInt64'],
  ['pull_requested_reviewer_login', 'LowCardinality(String)'],
  ['pull_requested_reviewer_type', userType],
  ['pull_review_comments', 'UInt16'],
  ['pull_base_ref', 'String'],
  ['pull_head_repo_id', 'UInt64'],
  ['pull_head_repo_name', 'LowCardinality(String)'],
  ['pull_head_ref', 'String'],

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
  ['repo_created_at', 'Nullable(DateTime)'],
  ['repo_updated_at', 'Nullable(DateTime)'],
  ['repo_pushed_at', 'Nullable(DateTime)'],
  ['repo_topics', `Nested
  (
    name LowCardinality(String)
  )`],
  // PullRequestReviewEvent_created
  ['pull_review_state', reviewStateType],
  ['pull_review_author_association', associationType],
  // PullRequestReviewCommentEvent_created
  ['pull_review_id', 'UInt64'],
  ['pull_review_comment_id', 'UInt64'],
  ['pull_review_comment_path', 'String'],
  ['pull_review_comment_position', 'String'],
  ['pull_review_comment_author_id', 'UInt64'],
  ['pull_review_comment_author_login', 'LowCardinality(String)'],
  ['pull_review_comment_author_type', userType],
  ['pull_review_comment_author_association', associationType],
  ['pull_review_comment_created_at', 'Nullable(DateTime)'],
  ['pull_review_comment_updated_at', 'Nullable(DateTime)'],
  // PushEvent
  ['push_id', 'UInt64'],
  ['push_size', 'UInt32'],
  ['push_distinct_size', 'UInt32'],
  ['push_ref', 'String'],
  ['push_head', 'String'],
  ['push_commits', `Nested
  (
    name LowCardinality(String),
    email String,
    message String
  )`],
  // ForkEvent
  ['fork_forkee_id', 'UInt64'],
  ['fork_forkee_full_name', 'LowCardinality(String)'],
  ['fork_forkee_owner_id', 'UInt64'],
  ['fork_forkee_owner_login', 'LowCardinality(String)'],
  ['fork_forkee_owner_type', userType],
  // WatchEvent_started, none
  // DeleteEvent
  ['delete_ref', 'String'],
  ['delete_ref_type', 'String'],
  ['delete_pusher_type', "Enum('deploy_key' = 1, 'user' = 2)"],
  // CreateEvent
  ['create_ref', 'String'],
  ['create_ref_type', "Enum('branch' = 1, 'tag' = 2)"],
  ['create_master_branch', 'String'],
  ['create_description', 'String'],
  ['create_pusher_type', "Enum('deploy_key' = 1, 'user' = 2)"],
  // GollumEvent
  ['gollum_pages', `Nested
  (
    page_name String,
    title String,
    action String
  )`],
  // MemberEvent_added
  ['member_id', 'UInt64'],
  ['member_login', 'LowCardinality(String)'],
  ['member_type', userType],
  // PublicEvent, none
  // ReleaseEvent_published
  ['release_id', 'UInt64'],
  ['release_tag_name', 'String'],
  ['release_target_commitish', 'String'],
  ['release_name', 'String'],
  ['release_draft', 'UInt8'],
  ['release_author_id', 'UInt64'],
  ['release_author_login', 'LowCardinality(String)'],
  ['release_author_type', userType],
  ['release_prerelease', 'UInt8'],
  ['release_created_at', 'Nullable(DateTime)'],
  ['release_published_at', 'Nullable(DateTime)'],
  ['release_body', 'String'],
  ['release_assets', `Nested
  (
    name String,
    uploader_login LowCardinality(String),
    uploader_id UInt64,
    content_type LowCardinality(String),
    state String,
    size UInt64,
    download_count UInt16
  )`],
  // CommitCommentEvent_action
  ['commit_comment_id', 'UInt64'],
  ['commit_comment_author_id', 'UInt64'],
  ['commit_comment_author_login', 'LowCardinality(String)'],
  ['commit_comment_author_type', userType],
  ['commit_comment_author_association', associationType],
  ['commit_comment_path', 'String'],
  ['commit_comment_position', 'String'],
  ['commit_comment_line', 'String'],
  ['commit_comment_sha', 'String'],
  ['commit_comment_created_at', 'Nullable(DateTime)'],
  ['commit_comment_updated_at', 'Nullable(DateTime)'],
]);
