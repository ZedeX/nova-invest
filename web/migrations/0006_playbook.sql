-- Migration 0006: EP08 Playbook System
-- ADR-0011 §Master Schema - Part 6/9
-- Creates: playbooks, playbook_versions, playbook_dependencies

-- Playbooks: composable, versioned packages (SemVer)
CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  author_id TEXT NOT NULL,
  kind TEXT NOT NULL,           -- 'strategy' | 'risk_manager' | 'data_fetcher'
  current_version TEXT NOT NULL,  -- SemVer string e.g. "1.2.0"
  lifecycle_status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published' | 'deprecated'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Playbook versions: one row per published version
CREATE TABLE IF NOT EXISTS playbook_versions (
  playbook_id TEXT NOT NULL,
  version TEXT NOT NULL,        -- SemVer string
  yaml_r2_key TEXT NOT NULL,    -- R2 object key for the YAML content
  changelog TEXT,
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (playbook_id, version),
  FOREIGN KEY (playbook_id) REFERENCES playbooks(id) ON DELETE CASCADE,
  FOREIGN KEY (published_by) REFERENCES users(id)
);

-- Playbook dependencies: DAG of playbook composition
CREATE TABLE IF NOT EXISTS playbook_dependencies (
  parent_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  child_version TEXT,
  dependency_type TEXT NOT NULL,  -- 'requires' | 'optional' | 'extends'
  weight REAL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (parent_id, child_id, dependency_type),
  FOREIGN KEY (parent_id) REFERENCES playbooks(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES playbooks(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_playbooks_author ON playbooks(author_id);
CREATE INDEX IF NOT EXISTS idx_playbooks_kind ON playbooks(kind);
CREATE INDEX IF NOT EXISTS idx_playbooks_status ON playbooks(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_playbook_versions_playbook ON playbook_versions(playbook_id);
CREATE INDEX IF NOT EXISTS idx_playbook_deps_parent ON playbook_dependencies(parent_id);
CREATE INDEX IF NOT EXISTS idx_playbook_deps_child ON playbook_dependencies(child_id);
