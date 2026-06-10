import React, { FormEvent, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ProjectCreateInput, RepoInput } from "./types";

export function ProjectEmptyState({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <section className="empty-state project-empty-state">
      <div>
        <h3>No project selected</h3>
        <p>Create a Pool project to register local repos, write tickets, and run the governed delivery loop.</p>
      </div>
      <button className="primary-button" type="button" onClick={onCreateProject}>
        Create project
      </button>
    </section>
  );
}

export function ProjectOnboardingDialog({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { project: ProjectCreateInput; repo: RepoInput | null }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const repoName = String(form.get("repoName") || "").trim();
    const repoLocalPath = String(form.get("repoLocalPath") || "").trim();
    const repoSlug = String(form.get("repoSlug") || "").trim();
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        project: {
          name: String(form.get("name") || "").trim(),
          slug: String(form.get("slug") || "").trim(),
          workspaceRoot: String(form.get("workspaceRoot") || "").trim(),
          defaultBaseBranch: String(form.get("defaultBaseBranch") || "main").trim(),
          description: String(form.get("description") || "").trim(),
        },
        repo: repoName && repoLocalPath
          ? {
              name: repoName,
              slug: repoSlug || slugify(repoName),
              localPath: repoLocalPath,
              remoteUrl: String(form.get("repoRemoteUrl") || "").trim(),
              defaultBranch: String(form.get("repoDefaultBranch") || form.get("defaultBaseBranch") || "main").trim(),
              isPrimary: true,
            }
          : null,
      });
      event.currentTarget.reset();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-scrim" />
        <Dialog.Content className="onboarding-dialog" aria-label="New project onboarding">
          <div className="drawer-heading">
            <div>
              <p className="kicker">Project Onboarding</p>
              <Dialog.Title asChild>
                <h2>New project</h2>
              </Dialog.Title>
            </div>
            <button className="icon-button" type="button" aria-label="Close onboarding" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          {error ? <div className="status is-error">{error}</div> : null}
          <form className="onboarding-form" onSubmit={handleSubmit}>
            <section className="settings-card">
              <div className="section-heading">
                <h3>Project info</h3>
              </div>
              <div className="action-grid">
                <label>
                  <span>Name</span>
                  <input name="name" required autoFocus />
                </label>
                <label>
                  <span>Slug</span>
                  <span className="input-with-action">
                    <input name="slug" required />
                    <button className="quiet-button" type="button" onClick={(event) => fillSlugFromField(event.currentTarget, "name", "slug")}>Generate</button>
                  </span>
                </label>
                <label className="wide-field">
                  <span>Workspace root</span>
                  <input name="workspaceRoot" placeholder="/home/me/src/project" required />
                </label>
                <label>
                  <span>Default branch</span>
                  <input name="defaultBaseBranch" defaultValue="main" required />
                </label>
                <label className="wide-field">
                  <span>Description</span>
                  <textarea name="description" rows={3} />
                </label>
              </div>
            </section>
            <section className="settings-card">
              <div className="section-heading">
                <h3>Primary repository</h3>
                <span>Optional</span>
              </div>
              <div className="action-grid">
                <label>
                  <span>Repo name</span>
                  <input name="repoName" />
                </label>
                <label>
                  <span>Repo slug</span>
                  <span className="input-with-action">
                    <input name="repoSlug" />
                    <button className="quiet-button" type="button" onClick={(event) => fillSlugFromField(event.currentTarget, "repoName", "repoSlug")}>Generate</button>
                  </span>
                </label>
                <label className="wide-field">
                  <span>Local path</span>
                  <input name="repoLocalPath" placeholder="/home/me/src/project" />
                </label>
                <label>
                  <span>Repo branch</span>
                  <input name="repoDefaultBranch" defaultValue="main" />
                </label>
                <label>
                  <span>Remote URL</span>
                  <input name="repoRemoteUrl" />
                </label>
              </div>
            </section>
            <div className="composer-actions">
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Creating project" : "Create project"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function fillSlugFromField(button: HTMLButtonElement, sourceName: string, targetName: string) {
  const form = button.form;
  if (!form) return;
  const source = form.elements.namedItem(sourceName);
  const target = form.elements.namedItem(targetName);
  if (!(source instanceof HTMLInputElement) || !(target instanceof HTMLInputElement)) return;
  target.value = slugify(source.value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}
