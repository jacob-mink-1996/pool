import React, { FormEvent, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  createRepo,
  updateProject,
  updateProjectPolicy,
  updateRepo,
  updateRoleProfile,
} from "./api";
import { prettyRole, prettyState, ticketStates } from "./domain";
import type {
  CeremonyAutomation,
  CeremonyAutomationTrigger,
  CeremonyType,
  Project,
  ProjectPolicyInput,
  ProjectUpdateInput,
  Repo,
  RepoInput,
  RepoUpdateInput,
  RefinementMode,
  RoleName,
  RoleProfile,
  TicketState,
} from "./types";

const refinementModes: Array<{ value: RefinementMode; label: string; detail: string }> = [
  { value: "autonomous", label: "Autonomous", detail: "Agent-created tickets may leave refinement automatically." },
  { value: "user_approved", label: "User approved", detail: "Pool proposes refined tickets; a user approves readiness." },
  { value: "user_participant", label: "User participant", detail: "Pool and the user collaborate before readiness." },
  { value: "user_only", label: "User only", detail: "Only user action brings tickets out of refinement." },
];

const ceremonyLabels: Record<CeremonyType, string> = {
  refinement: "Refinement",
  planning: "Planning",
  daily_triage: "Daily triage",
  review_demo_prep: "Review/demo prep",
  retro: "Retro",
};

const defaultCeremonyAutomation: CeremonyAutomation = {
  enabled: false,
  mode: "operator_approved",
  triggers: {
    refinement: {
      enabled: true,
      onTicketCreatedStates: ["DRAFT", "PROPOSED"],
      onBacklogChange: true,
      minIntervalMinutes: 30,
      participantRoles: ["product_manager", "architect", "developer", "reviewer"],
      deciderRole: "product_manager",
      consensusPolicy: "decider_synthesizes_objections",
    },
    planning: {
      enabled: true,
      onReadyQueueChanged: true,
      onCapacityAvailable: true,
      minIntervalMinutes: 60,
      participantRoles: ["product_manager", "architect", "developer", "integrator"],
      deciderRole: "integrator",
      consensusPolicy: "decider_synthesizes_objections",
    },
    daily_triage: {
      enabled: true,
      onStaleActiveWorkHours: 24,
      onBlockedOrRework: true,
      minIntervalMinutes: 240,
      participantRoles: ["product_manager", "developer", "reviewer", "validator"],
      deciderRole: "product_manager",
      consensusPolicy: "blockers_and_stale_work_win",
    },
    review_demo_prep: {
      enabled: true,
      onDoneOrMergeReady: true,
      minIntervalMinutes: 120,
      participantRoles: ["product_manager", "reviewer", "validator", "integrator"],
      deciderRole: "reviewer",
      consensusPolicy: "only_evidence_backed_done_work_is_demoable",
    },
    retro: {
      enabled: true,
      onRepeatedBlockedOrReworkCount: 3,
      onCycleComplete: true,
      minIntervalMinutes: 1440,
      participantRoles: ["product_manager", "architect", "developer", "reviewer", "validator"],
      deciderRole: "product_manager",
      consensusPolicy: "recurring_systemic_risk_wins",
    },
  },
};

export function SettingsDrawer({
  projectId,
  project,
  repos,
  isOpen,
  onClose,
  onDeleteProject,
  onRefresh,
}: {
  projectId: string;
  project: Project | null;
  repos: Repo[];
  isOpen: boolean;
  onClose: () => void;
  onDeleteProject: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    setError("");
    try {
      await work();
      await onRefresh();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
    } finally {
      setBusy("");
    }
  };

  const runDelete = async () => {
    setBusy("Deleting project");
    setError("");
    try {
      await onDeleteProject();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : String(settingsError));
    } finally {
      setBusy("");
    }
  };

  if (!project) {
    return null;
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-scrim" />
        <Dialog.Content className="settings-drawer" aria-label="Project settings">
          <div className="drawer-heading">
            <div>
              <p className="kicker">Project Controls</p>
              <Dialog.Title asChild>
                <h2>Settings</h2>
              </Dialog.Title>
            </div>
            <button className="icon-button" type="button" aria-label="Close settings" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          {error ? <div className="status is-error">{error}</div> : null}
          <div className="settings-grid">
            <section className="settings-overview" aria-label="Project summary">
              <SettingsFact label="Workspace" value={project.workspaceRoot} />
              <SettingsFact label="Base branch" value={project.defaultBaseBranch} />
              <SettingsFact label="Repos" value={String(project.repoCount)} />
              <SettingsFact label="Tickets" value={String(project.ticketCount)} />
            </section>
            <div className="settings-primary">
              <ProjectSettingsForm project={project} busy={busy} onSubmit={(input) => run("Saving project", () => updateProject(projectId, input))} />
              <PolicyForm project={project} busy={busy} onSubmit={(input) => run("Saving policy", () => updateProjectPolicy(projectId, input))} />
            </div>
            <RepoRegistry
              repos={repos}
              busy={busy}
              onSubmit={(input) => run("Registering repo", () => createRepo(projectId, input))}
              onUpdate={(repoId, input) => run("Saving repo", () => updateRepo(projectId, repoId, input))}
            />
            <section className="advanced-settings">
              <div className="section-heading">
                <div>
                  <h3>Agent profiles</h3>
                  <span className="section-note">Advanced</span>
                </div>
                <button className="quiet-button" type="button" onClick={() => setShowAdvanced((value) => !value)}>
                  {showAdvanced ? "Hide profiles" : "Show profiles"}
                </button>
              </div>
              {showAdvanced ? (
                <RoleProfiles project={project} busy={busy} onSubmit={(role, input) => run(`Saving ${role}`, () => updateRoleProfile(projectId, role, input))} />
              ) : null}
            </section>
            <DeleteProjectSection project={project} busy={busy} onDelete={runDelete} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeleteProjectSection({
  project,
  busy,
  onDelete,
}: {
  project: Project;
  busy: string;
  onDelete: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const canDelete = confirmation === project.name && !busy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canDelete) return;
    await onDelete();
  }

  return (
    <form className="settings-card settings-card-wide danger-card" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <h3>Delete Project</h3>
          <span className="section-note">Permanent</span>
        </div>
      </div>
      <p>
        Delete this project and all Pool-managed tickets, repos, executions, reviews, validations, merge records, events, and artifacts.
      </p>
      <label>
        <span>Type {project.name} to confirm</span>
        <input
          name="deleteConfirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.currentTarget.value)}
          autoComplete="off"
        />
      </label>
      <button className="danger-button" type="submit" disabled={!canDelete}>
        {busy === "Deleting project" ? busy : "Delete project"}
      </button>
    </form>
  );
}

function triggerSummary(type: CeremonyType, trigger: CeremonyAutomationTrigger) {
  if (type === "refinement") {
    return "Draft/proposed tickets or backlog changes";
  }
  if (type === "planning") {
    return "Ready queue changes or execution capacity opens";
  }
  if (type === "daily_triage") {
    return "Blocked, rework, or stale active work";
  }
  if (type === "review_demo_prep") {
    return "Done or merge-ready work appears";
  }
  return `Repeated blocked/rework patterns, ${trigger.onRepeatedBlockedOrReworkCount || 3}+ signals`;
}

function SettingsFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function ProjectSettingsForm({
  project,
  busy,
  onSubmit,
}: {
  project: Project;
  busy: string;
  onSubmit: (input: ProjectUpdateInput) => Promise<void>;
}) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit({
      name: String(form.get("name") || project.name),
      description: String(form.get("description") || ""),
      workspaceRoot: String(form.get("workspaceRoot") || project.workspaceRoot),
      defaultBaseBranch: String(form.get("defaultBaseBranch") || project.defaultBaseBranch),
    });
  }

  return (
    <form className="settings-card" onSubmit={handleSubmit}>
      <div className="section-heading">
        <h3>Project</h3>
      </div>
      <label>
        <span>Name</span>
        <input name="name" defaultValue={project.name} required />
      </label>
      <label>
        <span>Workspace root</span>
        <input name="workspaceRoot" defaultValue={project.workspaceRoot} required />
      </label>
      <label>
        <span>Default branch</span>
        <input name="defaultBaseBranch" defaultValue={project.defaultBaseBranch} required />
      </label>
      <label>
        <span>Description</span>
        <textarea name="description" defaultValue={project.description} rows={3} />
      </label>
      <button className="primary-button" type="submit" disabled={Boolean(busy)}>
        {busy === "Saving project" ? busy : "Save project"}
      </button>
    </form>
  );
}

function PolicyForm({
  project,
  busy,
  onSubmit,
}: {
  project: Project;
  busy: string;
  onSubmit: (input: ProjectPolicyInput) => Promise<void>;
}) {
  const policy = project.policy;
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const existingAutomation = policy?.ceremonyAutomation || defaultCeremonyAutomation;
    const ceremonyAutomation: CeremonyAutomation = {
      ...defaultCeremonyAutomation,
      ...existingAutomation,
      enabled: form.get("ceremonyAutomationEnabled") === "on",
      mode: String(form.get("ceremonyAutomationMode") || existingAutomation.mode || "operator_approved"),
      triggers: Object.fromEntries(
        (Object.keys(ceremonyLabels) as CeremonyType[]).map((type) => {
          const existingTrigger = existingAutomation.triggers?.[type] || defaultCeremonyAutomation.triggers[type];
          return [
            type,
            {
              ...defaultCeremonyAutomation.triggers[type],
              ...existingTrigger,
              enabled: form.get(`ceremonyTrigger:${type}:enabled`) === "on",
              minIntervalMinutes: Number(
                form.get(`ceremonyTrigger:${type}:minIntervalMinutes`) || existingTrigger.minIntervalMinutes || 30,
              ),
            },
          ];
        }),
      ),
    };
    await onSubmit({
      requireReviewer: form.get("requireReviewer") === "on",
      requireValidator: form.get("requireValidator") === "on",
      requireHumanApprovalBeforeMerge: form.get("requireHumanApprovalBeforeMerge") === "on",
      requiredValidationCommandProfileForMerge: String(form.get("requiredValidationCommandProfileForMerge") || ""),
      maxParallelExecutions: Number(form.get("maxParallelExecutions") || 1),
      maxParallelMerges: Number(form.get("maxParallelMerges") || 1),
      maxAutoContinueIterations: Number(form.get("maxAutoContinueIterations") || 1),
      refinementMode: String(form.get("refinementMode") || "user_approved") as RefinementMode,
      agentCreatedTicketDefaultState: String(form.get("agentCreatedTicketDefaultState") || "PROPOSED") as TicketState,
      ceremonyAutomation,
    });
  }

  return (
    <form className="settings-card" onSubmit={handleSubmit}>
      <div className="section-heading">
        <h3>Delivery Policy</h3>
      </div>
      <div className="toggle-list">
        <label><input name="requireReviewer" type="checkbox" defaultChecked={policy?.requireReviewer ?? true} /> Require reviewer</label>
        <label><input name="requireValidator" type="checkbox" defaultChecked={policy?.requireValidator ?? true} /> Require validator</label>
        <label><input name="requireHumanApprovalBeforeMerge" type="checkbox" defaultChecked={policy?.requireHumanApprovalBeforeMerge ?? true} /> Human approval</label>
      </div>
      <label>
        <span>Required validation profile</span>
        <input name="requiredValidationCommandProfileForMerge" defaultValue={policy?.requiredValidationCommandProfileForMerge || ""} placeholder="ci" />
      </label>
      <div className="action-grid">
        <label>
          <span>Max executions</span>
          <input name="maxParallelExecutions" type="number" min={1} defaultValue={policy?.maxParallelExecutions || 1} />
        </label>
        <label>
          <span>Max merges</span>
          <input name="maxParallelMerges" type="number" min={1} defaultValue={policy?.maxParallelMerges || 1} />
        </label>
        <label>
          <span>Continue limit</span>
          <input name="maxAutoContinueIterations" type="number" min={1} defaultValue={policy?.maxAutoContinueIterations || 3} />
        </label>
        <label>
          <span>Agent ticket state</span>
          <select name="agentCreatedTicketDefaultState" defaultValue={policy?.agentCreatedTicketDefaultState || "PROPOSED"}>
            {ticketStates.map((state) => <option key={state} value={state}>{prettyState(state)}</option>)}
          </select>
        </label>
        <label>
          <span>Refinement mode</span>
          <select name="refinementMode" defaultValue={policy?.refinementMode || "user_approved"}>
            {refinementModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </select>
        </label>
      </div>
      <div className="mode-list">
        {refinementModes.map((mode) => (
          <span key={mode.value} className={mode.value === (policy?.refinementMode || "user_approved") ? "mode-pill active" : "mode-pill"}>
            <strong>{mode.label}</strong>
            {mode.detail}
          </span>
        ))}
      </div>
      <div className="subform">
        <div className="section-heading">
          <h3>Ceremony Triggers</h3>
          <span className="section-note">Automation</span>
        </div>
        <div className="toggle-list">
          <label>
            <input
              name="ceremonyAutomationEnabled"
              type="checkbox"
              defaultChecked={policy?.ceremonyAutomation?.enabled ?? false}
            />{" "}
            Enable automatic ceremony triggers
          </label>
        </div>
        <label>
          <span>Automation mode</span>
          <select name="ceremonyAutomationMode" defaultValue={policy?.ceremonyAutomation?.mode || "operator_approved"}>
            <option value="operator_approved">Operator approves runs</option>
            <option value="fully_automatic">Fully automatic</option>
          </select>
        </label>
        <div className="compact-list">
          {(Object.keys(ceremonyLabels) as CeremonyType[]).map((type) => {
            const trigger = policy?.ceremonyAutomation?.triggers?.[type] || defaultCeremonyAutomation.triggers[type];
            return (
              <article key={type} className="compact-item split-item">
                <label className="check-row">
                  <input
                    name={`ceremonyTrigger:${type}:enabled`}
                    type="checkbox"
                    defaultChecked={trigger.enabled}
                  />
                  <span>
                    <strong>{ceremonyLabels[type]}</strong>
                    <small>{triggerSummary(type, trigger)}</small>
                  </span>
                </label>
                <label>
                  <span>Min</span>
                  <input
                    name={`ceremonyTrigger:${type}:minIntervalMinutes`}
                    type="number"
                    min={1}
                    defaultValue={trigger.minIntervalMinutes || 30}
                  />
                </label>
              </article>
            );
          })}
        </div>
      </div>
      <button className="primary-button" type="submit" disabled={Boolean(busy)}>
        {busy === "Saving policy" ? busy : "Save policy"}
      </button>
    </form>
  );
}

function RepoRegistry({
  repos,
  busy,
  onSubmit,
  onUpdate,
}: {
  repos: Repo[];
  busy: string;
  onSubmit: (input: RepoInput) => Promise<void>;
  onUpdate: (repoId: string, input: RepoUpdateInput) => Promise<void>;
}) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const localPath = String(form.get("localPath") || "").trim();
    const fallbackName = repoNameFromPath(localPath);
    const name = String(form.get("name") || fallbackName).trim();
    await onSubmit({
      name,
      slug: String(form.get("slug") || slugify(name)).trim(),
      localPath,
      remoteUrl: String(form.get("remoteUrl") || "").trim(),
      defaultBranch: String(form.get("defaultBranch") || "main").trim(),
      isPrimary: form.get("isPrimary") === "on",
    });
    event.currentTarget.reset();
  }

  return (
    <section className="settings-card settings-card-wide">
      <div className="section-heading">
        <h3>Repositories</h3>
        <span>{repos.length}</span>
      </div>
      <div className="repo-list">
        {repos.map((repo) => (
          <RepoEditor key={repo.id} repo={repo} busy={busy} onUpdate={onUpdate} />
        ))}
      </div>
      <form className="subform" onSubmit={handleSubmit}>
        <div className="section-heading">
          <h3>Add local checkout</h3>
        </div>
        <div className="action-grid">
          <label className="wide-field"><span>Local checkout path</span><input name="localPath" placeholder="/home/me/src/project" required /></label>
          <label><span>Name</span><input name="name" placeholder="Derived from path" /></label>
          <label><span>Slug</span><input name="slug" placeholder="Derived from name" /></label>
          <label><span>Default branch</span><input name="defaultBranch" defaultValue="main" /></label>
          <label><span>Remote URL</span><input name="remoteUrl" /></label>
        </div>
        <label className="check-row"><input name="isPrimary" type="checkbox" defaultChecked={repos.length === 0} /> Set as primary</label>
        <button className="primary-button" type="submit" disabled={Boolean(busy)}>
          {busy === "Registering repo" ? busy : "Add checkout"}
        </button>
      </form>
    </section>
  );
}

function RepoEditor({
  repo,
  busy,
  onUpdate,
}: {
  repo: Repo;
  busy: string;
  onUpdate: (repoId: string, input: RepoUpdateInput) => Promise<void>;
}) {
  const [isEditing, setEditing] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onUpdate(repo.id, {
      name: String(form.get("name") || repo.name).trim(),
      localPath: String(form.get("localPath") || repo.localPath).trim(),
      remoteUrl: String(form.get("remoteUrl") || "").trim(),
      defaultBranch: String(form.get("defaultBranch") || repo.defaultBranch).trim(),
      isPrimary: form.get("isPrimary") === "on",
    });
    setEditing(false);
  }

  if (!isEditing) {
    return (
      <article className="repo-item">
        <div>
          <strong>{repo.name}</strong>
          <span>{repo.localPath} @ {repo.defaultBranch}</span>
          {repo.remoteUrl ? <code>{repo.remoteUrl}</code> : null}
        </div>
        <div className="repo-actions">
          {repo.isPrimary ? <span className="badge">Primary</span> : (
            <button className="quiet-button" type="button" disabled={Boolean(busy)} onClick={() => onUpdate(repo.id, { isPrimary: true })}>
              Set primary
            </button>
          )}
          <button className="quiet-button" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </article>
    );
  }

  return (
    <form className="repo-edit-form" onSubmit={handleSubmit}>
      <div className="action-grid">
        <label><span>Name</span><input name="name" defaultValue={repo.name} required /></label>
        <label><span>Default branch</span><input name="defaultBranch" defaultValue={repo.defaultBranch} required /></label>
        <label className="wide-field"><span>Local checkout path</span><input name="localPath" defaultValue={repo.localPath} required /></label>
        <label className="wide-field"><span>Remote URL</span><input name="remoteUrl" defaultValue={repo.remoteUrl} /></label>
      </div>
      <label className="check-row"><input name="isPrimary" type="checkbox" defaultChecked={repo.isPrimary} /> Set as primary</label>
      <div className="composer-actions">
        <button className="quiet-button" type="button" onClick={() => setEditing(false)}>Cancel</button>
        <button className="primary-button" type="submit" disabled={Boolean(busy)}>
          {busy === "Saving repo" ? busy : "Save repo"}
        </button>
      </div>
    </form>
  );
}

function RoleProfiles({
  project,
  busy,
  onSubmit,
}: {
  project: Project;
  busy: string;
  onSubmit: (role: RoleName, input: { adapter: string; model: string; config: Record<string, unknown> }) => Promise<void>;
}) {
  const profiles = project.roleProfiles || [];
  return (
    <section className="settings-card settings-card-wide">
      <div className="section-heading">
        <h3>Agent Profiles</h3>
        <span>{profiles.length}</span>
      </div>
      <div className="profile-grid">
        {profiles.map((profile) => (
          <RoleProfileForm key={profile.role} profile={profile} busy={busy} onSubmit={onSubmit} />
        ))}
      </div>
    </section>
  );
}

function RoleProfileForm({
  profile,
  busy,
  onSubmit,
}: {
  profile: RoleProfile;
  busy: string;
  onSubmit: (role: RoleName, input: { adapter: string; model: string; config: Record<string, unknown> }) => Promise<void>;
}) {
  const [configError, setConfigError] = useState("");
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const configText = String(form.get("config") || "");
    let config: Record<string, unknown> = {};
    try {
      config = configText.trim() ? JSON.parse(configText) : {};
      setConfigError("");
    } catch {
      setConfigError("Config must be valid JSON");
      return;
    }
    await onSubmit(profile.role, {
      adapter: String(form.get("adapter") || profile.adapter),
      model: String(form.get("model") || profile.model),
      config,
    });
  }
  return (
    <form className="profile-card" onSubmit={handleSubmit}>
      <strong>{prettyRole(profile.role)}</strong>
      {configError ? <span className="field-error">{configError}</span> : null}
      <label><span>Adapter</span><input name="adapter" defaultValue={profile.adapter} required /></label>
      <label><span>Model</span><input name="model" defaultValue={profile.model} required /></label>
      <label><span>Config JSON</span><textarea name="config" defaultValue={JSON.stringify(profile.config || {}, null, 2)} rows={4} /></label>
      <button className="quiet-button" type="submit" disabled={Boolean(busy)}>
        Save profile
      </button>
    </form>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function repoNameFromPath(value: string) {
  const cleaned = value.trim().replace(/\/+$/g, "");
  return cleaned.split("/").filter(Boolean).pop() || "local-repo";
}
