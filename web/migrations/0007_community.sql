-- Migration 0007: EP07 Community UGC
-- ADR-0011 §Master Schema - Part 7/9
-- Creates: community_playbooks, user_playbook_installs, playbook_ratings,
--          playbook_comments, playbook_reports

-- Community playbooks: published packages visible in the community feed
CREATE TABLE IF NOT EXISTS community_playbooks (
  package_id TEXT PRIMARY KEY,   -- UUID for the published package
  playbook_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags_json TEXT,                -- JSON array of string tags
  content_hash TEXT,             -- SHA-256 of YAML content (ADR-0011 C16)
  version TEXT NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  installed_count INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User playbook installs: tracks which user installed which version
CREATE TABLE IF NOT EXISTS user_playbook_installs (
  user_id TEXT NOT NULL,
  playbook_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  installed_version TEXT NOT NULL,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, package_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (package_id) REFERENCES community_playbooks(package_id) ON DELETE CASCADE
);

-- Playbook ratings: 1-5 star ratings per user per package
CREATE TABLE IF NOT EXISTS playbook_ratings (
  user_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, package_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (package_id) REFERENCES community_playbooks(package_id) ON DELETE CASCADE
);

-- Playbook comments: threaded comments on community packages
CREATE TABLE IF NOT EXISTS playbook_comments (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  parent_id TEXT,                -- NULL = top-level comment
  moderation_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'hidden'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (package_id) REFERENCES community_playbooks(package_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES playbook_comments(id) ON DELETE CASCADE
);

-- Playbook reports: user-submitted abuse reports
CREATE TABLE IF NOT EXISTS playbook_reports (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL,          -- 'spam' | 'offensive' | 'copyright' | 'malicious' | 'other'
  description TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'reviewing' | 'resolved' | 'dismissed'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (package_id) REFERENCES community_playbooks(package_id) ON DELETE CASCADE,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_community_pb_author ON community_playbooks(author_id);
CREATE INDEX IF NOT EXISTS idx_community_pb_moderation ON community_playbooks(moderation_status);
CREATE INDEX IF NOT EXISTS idx_community_pb_rating ON community_playbooks(rating_avg DESC);
CREATE INDEX IF NOT EXISTS idx_user_installs_user ON user_playbook_installs(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_package ON playbook_ratings(package_id);
CREATE INDEX IF NOT EXISTS idx_comments_package ON playbook_comments(package_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON playbook_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_reports_package ON playbook_reports(package_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON playbook_reports(moderation_status);
