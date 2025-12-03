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

const userType = "Enum('Bot' = 1, 'Mannequin' = 2, 'Organization' = 3, 'User' = 4) COMMENT '用户的平台类型'";
const associationType = "Enum('COLLABORATOR' = 1, 'CONTRIBUTOR' = 2, 'MEMBER' = 3, 'NONE' = 4, 'OWNER' = 5, 'MANNEQUIN' = 6) COMMENT '用户在当前仓库的角色'";
const reviewStateType = "Enum('approved' = 1, 'commented' = 2, 'dismissed' = 3, 'changes_requested' = 4, 'pending' = 5) COMMENT 'PR Review 的状态变更类型'";

export const FieldMap = new Map<string, string>([
  // common
  ['platform', "LowCardinality(String) COMMENT '日志所属平台'"],
  ['type', `Enum('CommitCommentEvent' = 1, 'ForkEvent' = 2, 'ReleaseEvent' = 3,
                    'IssueCommentEvent' = 4, 'IssuesEvent' = 5, 
                    'PullRequestEvent' = 6, 'PullRequestReviewCommentEvent' = 7,
                    'PushEvent' = 8, 'WatchEvent' = 9, 'PullRequestReviewEvent' = 10,
                    'IssuesReactionEvent' = 11, 'IssueCommentsReactionEvent' = 12) COMMENT '日志事件类型'`],
  ['action', "LowCardinality(String) COMMENT '日志事件动作'"],
  ['actor_id', "UInt64 COMMENT '用户平台 ID'"],
  ['actor_login', "LowCardinality(String) COMMENT '用户账户名'"],
  ['repo_id', "UInt64 COMMENT '仓库平台 ID'"],
  ['repo_name', "LowCardinality(String) COMMENT '仓库名称'"],
  ['org_id', "UInt64 COMMENT '仓库所属组织平台 ID，个人仓库为 0'"],
  ['org_login', "LowCardinality(String) COMMENT '仓库所属组织名称'"],
  ['created_at', "DateTime COMMENT '日志事件时间戳，为 UTC 时间'"],
  // IssuesEvent_opened
  // IssuesEvent_reopened
  // IssuesEvent_closed
  ['issue_id', "UInt64 COMMENT 'Issue/PR 的平台唯一 ID'"],
  ['issue_number', "UInt32 COMMENT 'Issue/PR 在仓库中的编号，Gitee 平台的 Issue 编号视为 36 进制数转换为 10 进制后的结果'"],
  ['issue_title', "String COMMENT 'Issue/PR 的标题信息'"],
  ['body', "String COMMENT '主体文本，适用于所有 Issue、PR 或评论类事件'"],
  ['issue_labels', `Nested
  (
    name String,
    color String,
    default UInt8,
    description String
  ) COMMENT 'Issue/PR 标签，适用于 Issue 或 PR'`],
  ['issue_author_id', "UInt64 COMMENT 'Issue/PR 作者的平台 ID'"],
  ['issue_author_login', "LowCardinality(String) COMMENT 'Issue/PR 作者的账户名'"],
  ['issue_author_type', userType],
  ['issue_author_association', associationType],
  ['issue_assignee_id', "UInt64 COMMENT 'Issue/PR 指派者的平台 ID'"],
  ['issue_assignee_login', "LowCardinality(String) COMMENT 'Issue/PR 指派者的账户名'"],
  ['issue_assignees', "Nested(login LowCardinality(String), id UInt64) COMMENT 'Issue/PR 指派者列表'"],
  ['issue_created_at', "Nullable(DateTime) COMMENT 'Issue/PR 创建时间'"],
  ['issue_updated_at', "Nullable(DateTime) COMMENT 'Issue/PR 更新时间'"],
  ['issue_comments', "UInt16 COMMENT 'Issue/PR 中的评论数量'"],
  ['issue_closed_at', "Nullable(DateTime) COMMENT 'Issue/PR 的关闭时间'"],
  ['issue_closed_by_pull_request_numbers', "Array(UInt32) COMMENT 'Issue/PR 被合入的 PR 编号列表'"],
  // IssueCommentEvent_created
  ['issue_comment_id', "UInt64 COMMENT 'Issue/PR 评论的平台唯一 ID'"],
  ['issue_comment_created_at', "Nullable(DateTime) COMMENT 'Issue/PR 评论创建时间'"],
  ['issue_comment_updated_at', "Nullable(DateTime) COMMENT 'Issue/PR 评论更新时间'"],
  ['issue_comment_author_association', associationType],
  ['issue_comment_author_id', "UInt64 COMMENT 'Issue/PR 评论作者的平台 ID'"],
  ['issue_comment_author_login', "LowCardinality(String) COMMENT 'Issue/PR 评论作者的账户名'"],
  ['issue_comment_author_type', userType],
  // PullRequestEvent_opened
  // PullRequestEvent_reopened
  // PullRequestEvent_closed
  ['pull_commits', "UInt16 COMMENT 'PR 中包含 commit 数量'"],
  ['pull_additions', "UInt16 COMMENT 'PR 中新增代码行数'"],
  ['pull_deletions', "UInt16 COMMENT 'PR 中删除代码行数'"],
  ['pull_changed_files', "UInt32 COMMENT 'PR 中修改文件数量'"],
  ['pull_merged', "UInt8 COMMENT 'PR 是否被合入'"],
  ['pull_merge_commit_sha', "String COMMENT 'PR 合入的 commit SHA'"],
  ['pull_merged_at', "Nullable(DateTime) COMMENT 'PR 合入时间'"],
  ['pull_merged_by_id', "UInt64 COMMENT 'PR 合入者的平台 ID'"],
  ['pull_merged_by_login', "LowCardinality(String) COMMENT 'PR 合入者的账户名'"],
  ['pull_merged_by_type', userType],
  ['pull_requested_reviewer_id', "UInt64 COMMENT 'PR 被请求 Reviewer 的平台 ID'"],
  ['pull_requested_reviewer_login', "LowCardinality(String) COMMENT 'PR 被请求 Reviewer 的账户名'"],
  ['pull_requested_reviewer_type', userType],
  ['pull_review_comments', "UInt16 COMMENT 'PR 中的评审评论数量'"],
  ['pull_base_ref', "String COMMENT 'PR 提交的分支名'"],
  ['pull_head_repo_id', "UInt64 COMMENT 'PR 源仓库 ID'"],
  ['pull_head_repo_name', "LowCardinality(String) COMMENT 'PR 源仓库名称'"],
  ['pull_head_ref', "String COMMENT 'PR 源分支名'"],
  // PullRequestReviewEvent_created
  ['pull_review_state', reviewStateType],
  ['pull_review_author_association', associationType],
  // PullRequestReviewCommentEvent_created
  ['pull_review_id', "UInt64 COMMENT 'PR 评审 ID'"],
  ['pull_review_comment_id', "UInt64 COMMENT 'PR 评审评论 ID'"],
  ['pull_review_comment_path', "String COMMENT 'PR 评审评论文件路径'"],
  ['pull_review_comment_position', "String COMMENT 'PR 评审评论位置'"],
  ['pull_review_comment_author_id', "UInt64 COMMENT 'PR 评审评论作者平台 ID'"],
  ['pull_review_comment_author_login', "LowCardinality(String) COMMENT 'PR 评审评论作者账户名'"],
  ['pull_review_comment_author_type', userType],
  ['pull_review_comment_author_association', associationType],
  ['pull_review_comment_created_at', "Nullable(DateTime) COMMENT 'PR 评审评论创建时间'"],
  ['pull_review_comment_updated_at', "Nullable(DateTime) COMMENT 'PR 评审评论更新时间'"],
  // PushEvent
  ['push_id', "UInt64 COMMENT '推送 ID'"],
  ['push_size', "UInt32 COMMENT '推送提交总数'"],
  ['push_distinct_size', "UInt32 COMMENT '推送唯一提交数'"],
  ['push_ref', "String COMMENT '推送提交分支名'"],
  ['push_head', "String COMMENT '推送提交 SHA'"],
  ['push_commits', "Nested(name LowCardinality(String), email String, message String) COMMENT '推送提交详情'"],
  // ForkEvent
  ['fork_forkee_id', "UInt64 COMMENT 'Fork 仓库 ID'"],
  ['fork_forkee_full_name', "LowCardinality(String) COMMENT 'Fork 仓库完整名称'"],
  ['fork_forkee_owner_id', "UInt64 COMMENT 'Fork 仓库所有者平台 ID'"],
  ['fork_forkee_owner_login', "LowCardinality(String) COMMENT 'Fork 仓库所有者账户名'"],
  ['fork_forkee_owner_type', userType],
  // ReleaseEvent_published
  ['release_id', "UInt64 COMMENT '发布 ID'"],
  ['release_tag_name', "String COMMENT '发布标签名称'"],
  ['release_target_commitish', "String COMMENT '发布目标提交'"],
  ['release_name', "String COMMENT '发布名称'"],
  ['release_draft', "UInt8 COMMENT '是否为草稿版本'"],
  ['release_author_id', "UInt64 COMMENT '发布作者平台 ID'"],
  ['release_author_login', "LowCardinality(String) COMMENT '发布作者账户名'"],
  ['release_author_type', userType],
  ['release_prerelease', "UInt8 COMMENT '是否为预发布版本'"],
  ['release_created_at', "Nullable(DateTime) COMMENT '发布创建时间'"],
  ['release_published_at', "Nullable(DateTime) COMMENT '发布发布时间'"],
  ['release_body', "String COMMENT '发布描述'"],
  ['release_assets', "Nested(name String, uploader_login LowCardinality(String), uploader_id UInt64, content_type LowCardinality(String), state String, size UInt64, download_count UInt16) COMMENT '发布附件信息'"],
  // CommitCommentEvent_action
  ['commit_comment_id', "UInt64 COMMENT '提交评论 ID'"],
  ['commit_comment_author_id', "UInt64 COMMENT '提交评论作者平台 ID'"],
  ['commit_comment_author_login', "LowCardinality(String) COMMENT '提交评论作者账户名'"],
  ['commit_comment_author_type', userType],
  ['commit_comment_author_association', associationType],
  ['commit_comment_path', "String COMMENT '提交评论路径'"],
  ['commit_comment_position', "String COMMENT '提交评论位置'"],
  ['commit_comment_line', "String COMMENT '提交评论行号'"],
  ['commit_comment_sha', "String COMMENT '提交 SHA'"],
  ['commit_comment_created_at', "Nullable(DateTime) COMMENT '提交评论创建时间'"],
  ['commit_comment_updated_at', "Nullable(DateTime) COMMENT '提交评论更新时间'"],
  ['from_api', "UInt8 COMMENT '是否来自 API 采集，0 表示来自日志采集，1 表示来自 API 采集'"],
]);
