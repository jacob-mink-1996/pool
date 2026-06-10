create table if not exists projects (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text,
  workspace_root text not null,
  default_base_branch text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists repos (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  slug text not null,
  name text not null,
  local_path text not null,
  remote_url text,
  default_branch text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (project_id, slug),
  unique (project_id, local_path)
);

create table if not exists project_policies (
  id text primary key,
  project_id text not null unique references projects(id) on delete cascade,
  require_reviewer boolean not null default true,
  require_validator boolean not null default true,
  require_human_approval_before_merge boolean not null default true,
  max_parallel_executions integer not null default 1,
  max_parallel_merges integer not null default 1,
  max_auto_continue_iterations integer not null default 3,
  agent_created_ticket_default_state text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists agent_profiles (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  role text not null,
  adapter text not null,
  model text,
  display_name text not null,
  max_iterations integer,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (project_id, role, display_name)
);

create table if not exists tickets (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  parent_ticket_id text references tickets(id) on delete set null,
  key text not null,
  title text not null,
  brief text not null,
  acceptance_criteria_md text,
  definition_of_done_md text,
  state text not null,
  priority text not null,
  created_by_kind text not null,
  created_by_ref text,
  assigned_role text,
  assigned_agent_profile_id text references agent_profiles(id) on delete set null,
  blocked_reason_kind text,
  latest_summary text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  closed_at timestamptz,
  unique (project_id, key)
);

create table if not exists ticket_dependencies (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  blocking_ticket_id text not null references tickets(id) on delete cascade,
  blocked_ticket_id text not null references tickets(id) on delete cascade,
  dependency_type text not null default 'finish_to_start',
  created_at timestamptz not null,
  unique (blocking_ticket_id, blocked_ticket_id, dependency_type)
);

create table if not exists ticket_repo_targets (
  id text primary key,
  ticket_id text not null references tickets(id) on delete cascade,
  repo_id text not null references repos(id) on delete cascade,
  base_ref text not null,
  branch_name text,
  target_scope_md text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (ticket_id, repo_id)
);
