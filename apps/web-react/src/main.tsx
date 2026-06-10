import React, { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent } from "@dnd-kit/core";
import { Check, ChevronLeft, ChevronRight, Menu, Pencil, Plus, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import {
  completeExecution,
  addDependency,
  cleanWorktree,
  createProject,
  createRepo,
  createReview,
  createTicket,
  createValidation,
  getBoard,
  getProject,
  getTicket,
  listArtifacts,
  listEvents,
  listMergeQueue,
  listProjects,
  listRepos,
  mergeTicket,
  removeDependency,
  startExecution,
  transitionTicket,
  updateTicket,
} from "./api";
import {
  formatDate,
  groupBoardColumns,
  nextActionForTicket,
  prettyRole,
  prettyState,
  priorities,
  roles,
  ticketStates,
} from "./domain";
import type {
  Artifact,
  Board,
  BoardTicket,
  EventRecord,
  MergeQueueItem,
  Project,
  ProjectCreateInput,
  Repo,
  RepoInput,
  RoleName,
  TicketDetail,
  TicketState,
} from "./types";
import { ProjectEmptyState, ProjectOnboardingDialog } from "./ProjectOnboarding";
import { SettingsDrawer } from "./ProjectSettings";
import "./styles.css";

type LoadState = "idle" | "loading" | "ready" | "error";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [mergeQueue, setMergeQueue] = useState<MergeQueueItem[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [message, setMessage] = useState("");
  const [isRailOpen, setRailOpen] = useState(false);
  const [isRailCollapsed, setRailCollapsed] = useState(false);
  const [isDetailOpen, setDetailOpen] = useState(false);
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isProjectOnboardingOpen, setProjectOnboardingOpen] = useState(false);
  const [activeView, setActiveView] = useState<"board" | "ops">("board");
  const [liveStatus, setLiveStatus] = useState("idle");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    listProjects()
      .then((items) => {
        if (cancelled) return;
        setProjects(items);
        const hashProject = window.location.hash.slice(1);
        const initial = items.find((item) => item.id === hashProject)?.id || items[0]?.id || "";
        setProjectId(initial);
        setLoadState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadState("error");
        setMessage(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoadState("loading");
    Promise.all([
      getProject(projectId),
      getBoard(projectId),
      listRepos(projectId),
      listMergeQueue(projectId),
      listEvents(projectId),
      listArtifacts(projectId),
    ])
      .then(([nextProject, nextBoard, nextRepos, nextMergeQueue, nextEvents, nextArtifacts]) => {
        if (cancelled) return;
        setProject(nextProject);
        setBoard(nextBoard);
        setRepos(nextRepos);
        setMergeQueue(nextMergeQueue);
        setEvents(nextEvents);
        setArtifacts(nextArtifacts);
        setLoadState("ready");
        window.history.replaceState(null, "", `#${projectId}`);
        const firstTicket = nextBoard.columns.flatMap((column) => column.tickets)[0];
        setSelectedTicketId((existing) =>
          existing && nextBoard.columns.some((column) => column.tickets.some((item) => item.id === existing))
            ? existing
            : firstTicket?.id || "",
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadState("error");
        setMessage(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || typeof window.EventSource !== "function") {
      setLiveStatus(projectId ? "manual" : "idle");
      return;
    }

    let refreshTimer = 0;
    const source = new EventSource(`/api/v1/projects/${projectId}/events/stream?limit=20`);
    setLiveStatus("connecting");
    source.addEventListener("open", () => setLiveStatus("live"));
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refresh().catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
      }, 180);
    };
    source.addEventListener("event", scheduleRefresh);
    source.addEventListener("snapshot", scheduleRefresh);
    source.addEventListener("error", () => setLiveStatus("reconnecting"));

    return () => {
      window.clearTimeout(refreshTimer);
      source.close();
    };
  }, [projectId, selectedTicketId]);

  useEffect(() => {
    if (!projectId || !selectedTicketId) {
      setTicket(null);
      setDetailOpen(false);
      return;
    }
    let cancelled = false;
    getTicket(projectId, selectedTicketId)
      .then((detail) => {
        if (cancelled) return;
        setTicket(detail);
      })
      .catch((error) => {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedTicketId]);

  const selectedTicketSummary = useMemo(() => {
    if (!board || !selectedTicketId) return null;
    return board.columns.flatMap((column) => column.tickets).find((item) => item.id === selectedTicketId) || null;
  }, [board, selectedTicketId]);
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const selectTicket = (ticketId: string) => {
    flushSync(() => {
      setSelectedTicketId(ticketId);
      setDetailOpen(true);
    });
  };

  const refresh = async () => {
    if (!projectId) return;
    const [nextProject, nextBoard, nextRepos, nextMergeQueue, nextEvents, nextArtifacts] = await Promise.all([
      getProject(projectId),
      getBoard(projectId),
      listRepos(projectId),
      listMergeQueue(projectId),
      listEvents(projectId),
      listArtifacts(projectId),
    ]);
    setProject(nextProject);
    setBoard(nextBoard);
    setRepos(nextRepos);
    setMergeQueue(nextMergeQueue);
    setEvents(nextEvents);
    setArtifacts(nextArtifacts);
    if (selectedTicketId) {
      setTicket(await getTicket(projectId, selectedTicketId));
    }
  };

  const refreshTicket = async (ticketId = selectedTicketId) => {
    if (!projectId || !ticketId) return;
    const [nextProject, nextBoard, nextTicket] = await Promise.all([
      getProject(projectId),
      getBoard(projectId),
      getTicket(projectId, ticketId),
    ]);
    setProject(nextProject);
    setBoard(nextBoard);
    setTicket(nextTicket);
    setSelectedTicketId(ticketId);
  };

  const handleTicketDrop = async (ticketId: string, targetState: TicketState) => {
    if (!projectId || !board) return;
    const ticketSummary = board.columns.flatMap((column) => column.tickets).find((item) => item.id === ticketId);
    if (!ticketSummary || ticketSummary.state === targetState) return;
    setMessage("");
    try {
      await transitionTicket(projectId, ticketId, {
        targetState,
        reason: `Moved ${ticketSummary.key} to ${prettyState(targetState)} from the board.`,
      });
      await refreshTicket(ticketId);
    } catch (dropError) {
      setMessage(dropError instanceof Error ? dropError.message : String(dropError));
    }
  };

  const handleCreateTicket = async (input: {
    title: string;
    brief: string;
    priority: string;
    state: string;
    assignedRole: string;
    repoId: string;
  }) => {
    if (!projectId) return;
    const repo = repos.find((candidate) => candidate.id === input.repoId) || repos[0];
    const created = await createTicket(projectId, {
      title: input.title,
      brief: input.brief,
      priority: input.priority,
      state: input.state,
      assignedRole: input.assignedRole,
      repoTargets: repo ? [{ repoId: repo.id, baseRef: repo.defaultBranch }] : [],
    });
    await refresh();
    setSelectedTicketId(created.id);
    setTicket(created);
    setComposerOpen(false);
    setDetailOpen(true);
  };

  const handleCreateProject = async (input: { project: ProjectCreateInput; repo: RepoInput | null }) => {
    setMessage("");
    const created = await createProject(input.project);
    if (input.repo) {
      await createRepo(created.id, input.repo);
    }
    const nextProjects = await listProjects();
    setProjects(nextProjects);
    setProjectId(created.id);
    setSelectedTicketId("");
    setTicket(null);
    setProjectOnboardingOpen(false);
    setRailOpen(false);
  };

  return (
    <Tooltip.Provider delayDuration={250}>
    <div className={`app-shell ${isRailCollapsed ? "is-rail-collapsed" : ""}`}>
      <ProjectRail
        projects={projects}
        activeProjectId={projectId}
        isOpen={isRailOpen}
        isCollapsed={isRailCollapsed}
        onClose={() => flushSync(() => setRailOpen(false))}
        onToggleCollapse={() => flushSync(() => setRailCollapsed((value) => !value))}
        onCreateProject={() => flushSync(() => setProjectOnboardingOpen(true))}
        onSelect={(id) => {
          flushSync(() => {
            setProjectId(id);
            setRailOpen(false);
          });
        }}
      />
      {isRailOpen ? <button className="scrim" type="button" aria-label="Close projects" onClick={() => flushSync(() => setRailOpen(false))} /> : null}

      <main className="workspace">
        <header className="topbar">
          <IconButton className="mobile-only" label="Projects" onClick={() => flushSync(() => setRailOpen(true))}>
            <Menu size={18} />
          </IconButton>
          <div className="topbar-title">
            <p className="kicker">Mission Control</p>
            <div className="project-title-line">
              <h1>{project?.name || "Pool"}</h1>
              {project?.description ? <p className="project-description">{project.description}</p> : null}
            </div>
          </div>
          <div className="topbar-actions">
            <span className={`live-pill live-${liveStatus}`}>{liveStatus}</span>
          </div>
        </header>

        {message ? <div className={`status ${loadState === "error" ? "is-error" : ""}`}>{message}</div> : null}

        <div className="workspace-tools">
          <Tabs.Root value={activeView} onValueChange={(value) => setActiveView(value as "board" | "ops")}>
            <Tabs.List className="view-tabs" aria-label="Workspace view">
              <Tabs.Trigger value="board">Board</Tabs.Trigger>
              <Tabs.Trigger value="ops">Ops</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
          <div className="tool-cluster" aria-label="Workspace actions">
            <IconButton label="Refresh" onClick={refresh} disabled={!projectId}>
              <RefreshCw size={17} />
            </IconButton>
            <IconButton label="Settings" onClick={() => flushSync(() => setSettingsOpen(true))} disabled={!projectId}>
              <SlidersHorizontal size={17} />
            </IconButton>
            <IconButton className="is-primary" label="New Ticket" onClick={() => flushSync(() => setComposerOpen((value) => !value))} disabled={!projectId}>
              <Plus size={18} />
            </IconButton>
          </div>
        </div>

        <section className="board-surface">
          <BoardHeader project={project} board={board} loadState={loadState} label={activeView === "board" ? "Board" : "Ops"} />
          {!projectId && loadState === "ready" ? (
            <ProjectEmptyState onCreateProject={() => flushSync(() => setProjectOnboardingOpen(true))} />
          ) : isComposerOpen ? (
            <TicketComposer repos={repos} onSubmit={handleCreateTicket} onCancel={() => setComposerOpen(false)} />
          ) : activeView === "board" ? (
            <BoardView board={board} selectedTicketId={selectedTicketId} sensors={dragSensors} onSelectTicket={selectTicket} onMoveTicket={handleTicketDrop} />
          ) : (
            <OpsPanel mergeQueue={mergeQueue} events={events} artifacts={artifacts} />
          )}
        </section>
      </main>
      <Dialog.Root open={isDetailOpen} onOpenChange={(open) => flushSync(() => setDetailOpen(open))}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-scrim" />
          <Dialog.Content className="ticket-detail">
            <TicketDetailPanel
              projectId={projectId}
              ticket={ticket}
              selectedTicket={selectedTicketSummary}
              onClose={() => flushSync(() => setDetailOpen(false))}
              onRefresh={refreshTicket}
              onFullRefresh={refresh}
              repos={repos}
              tickets={board?.columns.flatMap((column) => column.tickets) || []}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <SettingsDrawer
        projectId={projectId}
        project={project}
        repos={repos}
        isOpen={isSettingsOpen}
        onClose={() => flushSync(() => setSettingsOpen(false))}
        onRefresh={refresh}
      />
      <ProjectOnboardingDialog
        isOpen={isProjectOnboardingOpen || (loadState === "ready" && projects.length === 0)}
        onClose={() => flushSync(() => setProjectOnboardingOpen(false))}
        onSubmit={handleCreateProject}
      />
    </div>
    </Tooltip.Provider>
  );
}

function ProjectRail({
  projects,
  activeProjectId,
  isOpen,
  isCollapsed,
  onClose,
  onToggleCollapse,
  onCreateProject,
  onSelect,
}: {
  projects: Project[];
  activeProjectId: string;
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
  onCreateProject: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className={`project-rail ${isOpen ? "is-open" : ""} ${isCollapsed ? "is-collapsed" : ""}`}>
      <div className="rail-heading">
        <div className="rail-title">
          <p className="kicker">Pool</p>
          <h2>Projects</h2>
        </div>
        <IconButton className="rail-collapse" label={isCollapsed ? "Expand project rail" : "Collapse project rail"} onClick={onToggleCollapse}>
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </IconButton>
        <IconButton className="mobile-only" label="Close projects" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="project-list">
        <button className="project-create-button" type="button" onClick={onCreateProject}>
          <Plus size={16} />
          <span>New project</span>
        </button>
        {projects.map((project) => (
          <button
            key={project.id}
            className={`project-item ${project.id === activeProjectId ? "is-active" : ""}`}
            type="button"
            onClick={() => onSelect(project.id)}
          >
            <span>{project.name}</span>
            <small>
              {project.ticketCount} tickets · {project.repoCount} repos
            </small>
          </button>
        ))}
      </div>
    </aside>
  );
}

function IconButton({
  label,
  className = "",
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button className={`icon-button ${className}`.trim()} type="button" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" sideOffset={8}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function BoardHeader({ project, board, loadState, label }: { project: Project | null; board: Board | null; loadState: LoadState; label: string }) {
  const summary = project?.board || {};
  return (
    <section className="summary-strip">
      <div>
        <p className="kicker">{label}</p>
        <h2>{label === "Ops" ? "Operations" : board?.projectName || (loadState === "loading" ? "Loading project..." : "No project selected")}</h2>
      </div>
      <Metric label="Total" value={String(board?.totalTickets || 0)} />
      <Metric label="Working" value={String((summary.WORKING || 0) + (summary.REWORK || 0))} />
      <Metric label="Evidence" value={String((summary.REVIEWING || 0) + (summary.VALIDATING || 0))} />
      <Metric label="Merge" value={String((summary.READY_TO_MERGE || 0) + (summary.MERGING || 0))} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OpsPanel({
  mergeQueue,
  events,
  artifacts,
}: {
  mergeQueue: MergeQueueItem[];
  events: EventRecord[];
  artifacts: Artifact[];
}) {
  return (
    <section className="ops-panel" aria-label="Operations overview">
      <div className="ops-column">
        <div className="section-heading">
          <h3>Merge Queue</h3>
          <span>{mergeQueue.length}</span>
        </div>
        <div className="compact-list">
          {mergeQueue.length === 0 ? <p className="lane-empty">No tickets waiting to merge.</p> : null}
          {mergeQueue.slice(0, 4).map((item) => (
            <article key={item.id} className="compact-item">
              <strong>{item.key}</strong>
              <span>{item.mergeStatus?.statusSummary || item.title}</span>
            </article>
          ))}
        </div>
      </div>
      <div className="ops-column">
        <div className="section-heading">
          <h3>Activity</h3>
          <span>{events.length}</span>
        </div>
        <div className="compact-list">
          {events.slice(0, 4).map((event) => (
            <article key={event.id} className="compact-item">
              <strong>{event.summary}</strong>
              <span>{prettyState(event.type)} · {formatDate(event.createdAt)}</span>
            </article>
          ))}
        </div>
      </div>
      <div className="ops-column">
        <div className="section-heading">
          <h3>Artifacts</h3>
          <span>{artifacts.length}</span>
        </div>
        <div className="compact-list">
          {artifacts.slice(0, 4).map((artifact) => (
            <article key={artifact.id} className="compact-item">
              <strong>{artifact.label}</strong>
              <span>{artifact.kind}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function BoardView({
  board,
  selectedTicketId,
  sensors,
  onSelectTicket,
  onMoveTicket,
}: {
  board: Board | null;
  selectedTicketId: string;
  sensors: ReturnType<typeof useSensors>;
  onSelectTicket: (id: string) => void;
  onMoveTicket: (ticketId: string, targetState: TicketState) => void;
}) {
  const groups = useMemo(() => (board ? groupBoardColumns(board.columns) : []), [board]);
  const dragDeltaRef = useRef({ x: 0, y: 0 });
  const laneRefs = useRef(new Map<string, HTMLElement>());
  const [laneHeight, setLaneHeight] = useState(420);
  useLayoutEffect(() => {
    const measureLaneHeight = () => {
      let nextHeight = 420;
      for (const lane of laneRefs.current.values()) {
        const styles = window.getComputedStyle(lane);
        const header = lane.querySelector<HTMLElement>(".lane-header");
        const body = lane.querySelector<HTMLElement>(".lane-body");
        const headerStyles = header ? window.getComputedStyle(header) : null;
        const chrome =
          Number.parseFloat(styles.paddingTop) +
          Number.parseFloat(styles.paddingBottom) +
          Number.parseFloat(styles.borderTopWidth) +
          Number.parseFloat(styles.borderBottomWidth) +
          (headerStyles ? Number.parseFloat(headerStyles.marginBottom) : 0);
        const contentHeight = chrome + (header?.offsetHeight || 0) + (body?.scrollHeight || 0);
        nextHeight = Math.max(nextHeight, Math.ceil(contentHeight));
      }
      setLaneHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    measureLaneHeight();
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(measureLaneHeight) : null;
    for (const lane of laneRefs.current.values()) {
      resizeObserver?.observe(lane);
    }
    window.addEventListener("resize", measureLaneHeight);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureLaneHeight);
    };
  }, [groups]);
  const registerLane = (id: string, node: HTMLElement | null) => {
    if (node) {
      laneRefs.current.set(id, node);
    } else {
      laneRefs.current.delete(id);
    }
  };
  const handleDragMove = (event: DragMoveEvent) => {
    dragDeltaRef.current = event.delta;
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const ticketId = String(event.active.id || "");
    let targetState = event.over?.data.current?.state as TicketState | undefined;
    const sourceState = groups.flatMap((group) => group.tickets).find((item) => item.id === ticketId)?.state;
    const deltaX = event.delta.x || dragDeltaRef.current.x;
    const sourceGroupIndex = sourceState
      ? groups.findIndex((group) => (group.states as readonly string[]).includes(String(sourceState)))
      : -1;
    const targetGroupIndex = targetState
      ? groups.findIndex((group) => (group.states as readonly string[]).includes(String(targetState)))
      : -1;
    if (sourceGroupIndex >= 0 && (targetGroupIndex === -1 || targetGroupIndex === sourceGroupIndex) && Math.abs(deltaX) > 80) {
      const targetGroup = groups[sourceGroupIndex + (deltaX > 0 ? 1 : -1)];
      targetState = targetGroup?.states[0] as TicketState | undefined;
    } else if (targetGroupIndex === sourceGroupIndex) {
      targetState = sourceState;
    }
    dragDeltaRef.current = { x: 0, y: 0 };
    if (ticketId && targetState && sourceState !== targetState) {
      onMoveTicket(ticketId, targetState);
    }
  };
  if (!board) {
    return <div className="empty-state">Create or select a project to start routing tickets.</div>;
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={() => {
        dragDeltaRef.current = { x: 0, y: 0 };
      }}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <div className="board-grid" aria-label="Ticket board" style={{ "--board-lane-height": `${laneHeight}px` } as React.CSSProperties}>
        {groups.map((group) => (
          <BoardLane key={group.id} group={group} selectedTicketId={selectedTicketId} onLaneRef={registerLane} onSelectTicket={onSelectTicket} />
        ))}
      </div>
    </DndContext>
  );
}

function BoardLane({
  group,
  selectedTicketId,
  onLaneRef,
  onSelectTicket,
}: {
  group: ReturnType<typeof groupBoardColumns>[number];
  selectedTicketId: string;
  onLaneRef: (id: string, node: HTMLElement | null) => void;
  onSelectTicket: (id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `lane-${group.id}`,
    data: { state: group.states[0] },
  });
  const setLaneRef = (node: HTMLElement | null) => {
    setNodeRef(node);
    onLaneRef(group.id, node);
  };
  return (
    <section className={`lane ${isOver ? "is-drop-target" : ""}`} ref={setLaneRef}>
      <div className="lane-header">
        <h3>{group.label}</h3>
        <span>{group.count}</span>
      </div>
      <div className="lane-body">
        {group.tickets.length === 0 ? <p className="lane-empty">No tickets</p> : null}
        {group.tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            selected={ticket.id === selectedTicketId}
            onClick={() => onSelectTicket(ticket.id)}
          />
        ))}
      </div>
    </section>
  );
}

function TicketCard({ ticket, selected, onClick }: { ticket: BoardTicket; selected: boolean; onClick: () => void }) {
  const action = nextActionForTicket(ticket);
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    id: ticket.id,
    data: { state: ticket.state },
  });
  const dragStyle = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <button
      ref={setNodeRef}
      className={`ticket-card ${selected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""}`}
      type="button"
      style={dragStyle}
      onClick={onClick}
      {...listeners}
      {...attributes}
    >
      <div className="ticket-card-top">
        <span className="ticket-key">{ticket.key}</span>
        <span className={`badge state-${ticket.state.toLowerCase().replace(/_/g, "-")}`}>{prettyState(ticket.state)}</span>
      </div>
      <strong>{ticket.title}</strong>
      <p>{ticket.latestSummary || ticket.brief}</p>
      <div className="next-action">
        <span>{action.label}</span>
        <small>{action.detail}</small>
      </div>
      <div className="card-meta">
        <span>{ticket.priority}</span>
        <span>{prettyRole(ticket.assignedRole)}</span>
        <span>{ticket.repoCount} repos</span>
      </div>
    </button>
  );
}

function TicketDetailPanel({
  projectId,
  ticket,
  selectedTicket,
  onClose,
  onRefresh,
  onFullRefresh,
  repos,
  tickets,
}: {
  projectId: string;
  ticket: TicketDetail | null;
  selectedTicket: BoardTicket | null;
  onClose: () => void;
  onRefresh: (ticketId?: string) => Promise<void>;
  onFullRefresh: () => Promise<void>;
  repos: Repo[];
  tickets: BoardTicket[];
}) {
  const action = nextActionForTicket(ticket || selectedTicket);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [isEditing, setEditing] = useState(false);
  useEffect(() => {
    setEditing(false);
  }, [ticket?.id]);
  const runAction = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await work();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <div className="detail-heading">
        <div>
          <p className="kicker">Ticket Detail</p>
          <Dialog.Title asChild>
            <h2>{ticket?.title || selectedTicket?.title || "Select a ticket"}</h2>
          </Dialog.Title>
        </div>
        <div className="tool-cluster">
          {ticket ? (
            <button className={`icon-button ${isEditing ? "is-active" : ""}`} type="button" aria-label={isEditing ? "Stop editing" : "Edit ticket"} title={isEditing ? "Done" : "Edit"} onClick={() => setEditing((value) => !value)}>
              {isEditing ? <Check size={18} /> : <Pencil size={17} />}
            </button>
          ) : null}
          <button className="icon-button" type="button" aria-label="Close ticket detail" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>
      {!ticket ? (
        <div className="empty-state">Pick a ticket to inspect work, evidence, and merge readiness.</div>
      ) : (
        <div className="detail-stack">
          {error ? <div className="status is-error">{error}</div> : null}
          <section className="next-action-panel">
            <span className={`badge state-${ticket.state.toLowerCase().replace(/_/g, "-")}`}>{prettyState(ticket.state)}</span>
            <h3>{action.label}</h3>
            <p>{action.detail}</p>
            <TicketActionForm
              projectId={projectId}
              ticket={ticket}
              busy={busy}
              onRun={runAction}
              onRefresh={onRefresh}
            />
          </section>
          <section className="detail-section">
            <h3>Overview</h3>
            <p>{ticket.brief}</p>
            <div className="fact-grid">
              <Fact label="Priority" value={ticket.priority} />
              <Fact label="Role" value={prettyRole(ticket.assignedRole)} />
              <Fact label="Repos" value={String(ticket.repoTargets.length)} />
              <Fact label="Updated" value={formatDate(ticket.updatedAt)} />
            </div>
          </section>
          {isEditing ? (
            <TicketEditSection projectId={projectId} ticket={ticket} onRefresh={onRefresh} onSaved={() => setEditing(false)} />
          ) : (
            <TicketPlanSummary ticket={ticket} />
          )}
          <ScopeSection
            projectId={projectId}
            ticket={ticket}
            repos={repos}
            tickets={tickets}
            isEditing={isEditing}
            onRefresh={onRefresh}
          />
          <section className="detail-section">
            <h3>Evidence</h3>
            <EvidenceList ticket={ticket} />
          </section>
          <WorktreeAndArtifactSection
            projectId={projectId}
            ticket={ticket}
            onRun={runAction}
            onRefresh={onRefresh}
            onFullRefresh={onFullRefresh}
          />
          <section className="detail-section">
            <h3>Merge Readiness</h3>
            <p>{ticket.mergeStatus?.statusSummary || (ticket.mergeStatus?.canMerge ? "Ready to merge." : "Not ready to merge yet.")}</p>
            {ticket.mergeStatus?.blockingReasons?.length ? (
              <div className="reason-list">
                {ticket.mergeStatus.blockingReasons.map((reason) => (
                  <article key={reason.code} className="reason-card">
                    <strong>{reason.summary || reason.message || prettyState(reason.code)}</strong>
                    <span>{reason.detail || reason.source || ""}</span>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
          <section className="detail-section">
            <h3>Timeline</h3>
            <div className="timeline">
              {ticket.events.slice(-8).map((event) => (
                <article key={event.id}>
                  <span>{event.type}</span>
                  <strong>{event.summary}</strong>
                  <time>{formatDate(event.createdAt)}</time>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function TicketPlanSummary({ ticket }: { ticket: TicketDetail }) {
  return (
    <section className="detail-section">
      <div className="section-heading">
        <h3>Ticket Plan</h3>
        <span>Locked</span>
      </div>
      <div className="read-model">
        <ReadField label="Title" value={ticket.title} />
        <ReadField label="Latest summary" value={ticket.latestSummary || "No summary recorded."} />
        <ReadField label="Brief" value={ticket.brief} />
        <ReadField label="Acceptance criteria" value={ticket.acceptanceCriteriaMd || "No acceptance criteria recorded."} />
        <ReadField label="Definition of done" value={ticket.definitionOfDoneMd || "No definition of done recorded."} />
      </div>
    </section>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <article className="read-field">
      <span>{label}</span>
      <p>{value}</p>
    </article>
  );
}

function TicketEditSection({
  projectId,
  ticket,
  onRefresh,
  onSaved,
}: {
  projectId: string;
  ticket: TicketDetail;
  onRefresh: (ticketId?: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await updateTicket(projectId, ticket.id, {
        title: String(form.get("title") || ticket.title),
        brief: String(form.get("brief") || ticket.brief),
        priority: String(form.get("priority") || ticket.priority),
        assignedRole: String(form.get("assignedRole") || ticket.assignedRole),
        latestSummary: String(form.get("latestSummary") || ""),
        acceptanceCriteriaMd: String(form.get("acceptanceCriteriaMd") || ""),
        definitionOfDoneMd: String(form.get("definitionOfDoneMd") || ""),
      });
      await onRefresh(ticket.id);
      onSaved();
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : String(editError));
    }
  }
  return (
    <section className="detail-section">
      <div className="section-heading">
        <h3>Ticket Plan</h3>
      </div>
      {error ? <div className="status is-error">{error}</div> : null}
      <form className="subform" onSubmit={handleSubmit}>
        <label><span>Title</span><input name="title" defaultValue={ticket.title} required /></label>
        <div className="action-grid">
          <label><span>Priority</span><select name="priority" defaultValue={ticket.priority}>{priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
          <label><span>Role</span><select name="assignedRole" defaultValue={ticket.assignedRole}>{roles.map((role) => <option key={role} value={role}>{prettyRole(role)}</option>)}</select></label>
        </div>
        <label><span>Latest summary</span><input name="latestSummary" defaultValue={ticket.latestSummary || ""} /></label>
        <label><span>Brief</span><textarea name="brief" defaultValue={ticket.brief} rows={3} /></label>
        <label><span>Acceptance criteria</span><textarea name="acceptanceCriteriaMd" defaultValue={ticket.acceptanceCriteriaMd || ""} rows={4} /></label>
        <label><span>Definition of done</span><textarea name="definitionOfDoneMd" defaultValue={ticket.definitionOfDoneMd || ""} rows={4} /></label>
        <button className="primary-button" type="submit">Save</button>
      </form>
    </section>
  );
}

function ScopeSection({
  projectId,
  ticket,
  repos,
  tickets,
  isEditing,
  onRefresh,
}: {
  projectId: string;
  ticket: TicketDetail;
  repos: Repo[];
  tickets: BoardTicket[];
  isEditing: boolean;
  onRefresh: (ticketId?: string) => Promise<void>;
}) {
  const availableRepos = repos.filter((repo) => !ticket.repoTargets.some((target) => target.repoId === repo.id));
  const dependencyCandidates = tickets.filter(
    (candidate) =>
      candidate.id !== ticket.id && !ticket.dependencies.some((dependency) => dependency.blockingTicketId === candidate.id),
  );

  async function addRepoTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const repoId = String(form.get("repoId") || "");
    const repo = repos.find((candidate) => candidate.id === repoId);
    if (!repo) return;
    await updateTicket(projectId, ticket.id, {
      repoTargets: [
        ...ticket.repoTargets.map(toRepoTargetInput),
        {
          repoId,
          baseRef: String(form.get("baseRef") || repo.defaultBranch),
          branchName: String(form.get("branchName") || ""),
          targetScopeMd: String(form.get("targetScopeMd") || ""),
        },
      ],
    });
    await onRefresh(ticket.id);
    event.currentTarget.reset();
  }

  async function removeRepoTarget(repoId: string) {
    await updateTicket(projectId, ticket.id, {
      repoTargets: ticket.repoTargets.filter((target) => target.repoId !== repoId).map(toRepoTargetInput),
    });
    await onRefresh(ticket.id);
  }

  async function addBlocker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const blockingTicketId = String(form.get("blockingTicketId") || "");
    if (!blockingTicketId) return;
    await addDependency(projectId, ticket.id, { blockingTicketId });
    await onRefresh(ticket.id);
    event.currentTarget.reset();
  }

  async function removeBlocker(dependencyId: string) {
    await removeDependency(projectId, ticket.id, dependencyId);
    await onRefresh(ticket.id);
  }

  return (
    <section className="detail-section">
      <div className="section-heading">
        <h3>Scope</h3>
        {!isEditing ? <span>Locked</span> : null}
      </div>
      <div className="compact-list">
        {ticket.repoTargets.map((target) => (
          <article key={target.repoId} className="compact-item split-item">
            <div>
              <strong>{target.repoName}</strong>
              <span>{target.repoSlug} · base {target.baseRef}{target.branchName ? ` · ${target.branchName}` : ""}</span>
            </div>
            {isEditing ? (
              <button className="icon-button danger-text" type="button" aria-label={`Remove ${target.repoName}`} title="Remove" onClick={() => removeRepoTarget(target.repoId)}>
                <X size={18} />
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {isEditing ? (
        <form className="subform" onSubmit={addRepoTarget}>
          <div className="action-grid">
            <label><span>Add repo</span><select name="repoId" disabled={availableRepos.length === 0}>{availableRepos.map((repo) => <option key={repo.id} value={repo.id}>{repo.name}</option>)}</select></label>
            <label><span>Base ref</span><input name="baseRef" placeholder="default branch" /></label>
            <label><span>Branch</span><input name="branchName" placeholder="optional" /></label>
            <label className="wide-field"><span>Scope note</span><textarea name="targetScopeMd" rows={2} /></label>
          </div>
          <button className="quiet-button" type="submit" disabled={availableRepos.length === 0}>Add repo target</button>
        </form>
      ) : null}
      <div className="compact-list">
        {ticket.dependencies.map((dependency) => (
          <article key={dependency.id} className="compact-item split-item">
            <div>
              <strong>{dependency.blockingTicketKey} · {dependency.blockingTicketTitle}</strong>
              <span>{prettyState(dependency.blockingTicketState)} · {dependency.dependencyType}</span>
            </div>
            {isEditing ? (
              <button className="icon-button danger-text" type="button" aria-label={`Remove blocker ${dependency.blockingTicketKey}`} title="Remove" onClick={() => removeBlocker(dependency.id)}>
                <X size={18} />
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {isEditing ? (
        <form className="subform inline-form" onSubmit={addBlocker}>
          <label><span>Add blocker</span><select name="blockingTicketId" disabled={dependencyCandidates.length === 0}>{dependencyCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.key} · {candidate.title}</option>)}</select></label>
          <button className="quiet-button" type="submit" disabled={dependencyCandidates.length === 0}>Add blocker</button>
        </form>
      ) : null}
    </section>
  );
}

function WorktreeAndArtifactSection({
  projectId,
  ticket,
  onRun,
  onRefresh,
  onFullRefresh,
}: {
  projectId: string;
  ticket: TicketDetail;
  onRun: (label: string, work: () => Promise<void>) => Promise<void>;
  onRefresh: (ticketId?: string) => Promise<void>;
  onFullRefresh: () => Promise<void>;
}) {
  const cleanableWorktrees = ticket.worktrees.filter((worktree) => worktree.status !== "active" && worktree.status !== "cleaned");
  return (
    <section className="detail-section">
      <div className="section-heading">
        <h3>Worktrees + Artifacts</h3>
        <span>{ticket.worktrees.length + ticket.artifacts.length}</span>
      </div>
      <div className="compact-list">
        {ticket.worktrees.length === 0 ? <p className="lane-empty">No worktrees planned yet.</p> : null}
        {ticket.worktrees.map((worktree) => (
          <article key={worktree.id} className="compact-item split-item">
            <div>
              <strong>{worktree.repoName} · {worktree.branchName}</strong>
              <span>{prettyState(worktree.status)} · {prettyRole(worktree.executionRole)} iter {worktree.executionIteration}</span>
              <code>{worktree.path}</code>
            </div>
            {cleanableWorktrees.some((candidate) => candidate.id === worktree.id) ? (
              <button
                className="quiet-button"
                type="button"
                onClick={() =>
                  onRun("Cleaning worktree", async () => {
                    await cleanWorktree(projectId, worktree.id);
                    await onRefresh(ticket.id);
                    await onFullRefresh();
                  })
                }
              >
                Mark cleaned
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <div className="compact-list">
        {ticket.artifacts.length === 0 ? <p className="lane-empty">No durable artifacts recorded yet.</p> : null}
        {ticket.artifacts.map((artifact) => (
          <article key={artifact.id} className="compact-item">
            <strong>{artifact.label}</strong>
            <span>{artifact.kind} · {artifact.uri}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function toRepoTargetInput(target: { repoId: string; baseRef: string; branchName?: string; targetScopeMd?: string }) {
  return {
    repoId: target.repoId,
    baseRef: target.baseRef,
    branchName: target.branchName || "",
    targetScopeMd: target.targetScopeMd || "",
  };
}

function TicketActionForm({
  projectId,
  ticket,
  busy,
  onRun,
  onRefresh,
}: {
  projectId: string;
  ticket: TicketDetail;
  busy: string;
  onRun: (label: string, work: () => Promise<void>) => Promise<void>;
  onRefresh: (ticketId?: string) => Promise<void>;
}) {
  const activeExecution = ticket.executions.find((execution) => execution.status === "running");
  const latestCompletedExecution = ticket.executions.find(
    (execution) => execution.status === "completed" && execution.outcome === "completed",
  );
  const submitLabel = busy || primaryActionLabel(ticket);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await onRun(primaryActionLabel(ticket), async () => {
      if (ticket.state === "READY" || ticket.state === "REWORK") {
        await startExecution(projectId, ticket.id, {
          role: String(form.get("role") || ticket.assignedRole || "developer") as RoleName,
          reason: String(form.get("summary") || `Start ${ticket.key}`),
        });
      } else if (ticket.state === "WORKING" && activeExecution) {
        await completeExecution(projectId, activeExecution.id, {
          outcome: String(form.get("outcome") || "completed"),
          summaryMd: String(form.get("summary") || `${ticket.key} execution updated.`),
          blockedKind: String(form.get("outcome")) === "blocked" ? "needs_human_input" : "",
        });
      } else if (ticket.state === "REVIEWING" && latestCompletedExecution) {
        await createReview(projectId, ticket.id, {
          executionId: latestCompletedExecution.id,
          verdict: String(form.get("verdict") || "passed"),
          summaryMd: String(form.get("summary") || `${ticket.key} review recorded.`),
        });
      } else if (ticket.state === "VALIDATING") {
        await createValidation(projectId, ticket.id, {
          executionId: latestCompletedExecution?.id,
          repoIds: ticket.repoTargets.map((target) => target.repoId),
          verdict: String(form.get("verdict") || "passed"),
          commandProfile: String(form.get("commandProfile") || "ci"),
          commands: String(form.get("commands") || "").split("\n").map((line) => line.trim()).filter(Boolean),
          summaryMd: String(form.get("summary") || `${ticket.key} validation recorded.`),
        });
      } else if (ticket.state === "READY_TO_MERGE") {
        await mergeTicket(projectId, ticket.id, {
          strategy: "squash",
          status: "completed",
          approvedByKind: ticket.mergeStatus.requiresHumanApproval ? "human" : "system",
          approvedByRef: String(form.get("approvedByRef") || "operator"),
          summaryMd: String(form.get("summary") || `${ticket.key} merge recorded.`),
        });
      } else {
        await transitionTicket(projectId, ticket.id, {
          targetState: String(form.get("targetState") || "READY") as TicketState,
          reason: String(form.get("summary") || `Move ${ticket.key}`),
        });
      }
      await onRefresh(ticket.id);
      formElement.reset();
    });
  }

  return (
    <form className="action-form" onSubmit={handleSubmit}>
      <ActionFields ticket={ticket} activeExecution={activeExecution} latestCompletedExecution={latestCompletedExecution} />
      <label>
        <span>Operator note</span>
        <textarea name="summary" rows={3} placeholder="Record why this action is happening." />
      </label>
      <button className="primary-button" type="submit" disabled={Boolean(busy) || !canSubmitPrimaryAction(ticket, activeExecution, latestCompletedExecution)}>
        {submitLabel}
      </button>
    </form>
  );
}

function ActionFields({
  ticket,
  activeExecution,
  latestCompletedExecution,
}: {
  ticket: TicketDetail;
  activeExecution?: { id: string } | undefined;
  latestCompletedExecution?: { id: string } | undefined;
}) {
  if (ticket.state === "READY" || ticket.state === "REWORK") {
    return (
      <label>
        <span>Execution role</span>
        <select name="role" defaultValue={ticket.assignedRole || "developer"}>
          {roles.map((role) => (
            <option key={role} value={role}>
              {prettyRole(role)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (ticket.state === "WORKING") {
    return (
      <label>
        <span>{activeExecution ? "Execution outcome" : "No active execution"}</span>
        <select name="outcome" defaultValue="completed" disabled={!activeExecution}>
          <option value="completed">Completed</option>
          <option value="needs_continue">Needs continue</option>
          <option value="blocked">Blocked</option>
          <option value="failed">Failed</option>
        </select>
      </label>
    );
  }
  if (ticket.state === "REVIEWING") {
    return (
      <label>
        <span>{latestCompletedExecution ? "Review verdict" : "Waiting for completed execution"}</span>
        <select name="verdict" defaultValue="passed" disabled={!latestCompletedExecution}>
          <option value="passed">Passed</option>
          <option value="rework">Rework</option>
          <option value="blocked">Blocked</option>
        </select>
      </label>
    );
  }
  if (ticket.state === "VALIDATING") {
    return (
      <div className="action-grid">
        <label>
          <span>Validation verdict</span>
          <select name="verdict" defaultValue="passed">
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <label>
          <span>Command profile</span>
          <input name="commandProfile" defaultValue="ci" />
        </label>
        <label className="wide-field">
          <span>Commands</span>
          <textarea name="commands" rows={2} placeholder="One command per line" />
        </label>
      </div>
    );
  }
  if (ticket.state === "READY_TO_MERGE") {
    return (
      <label>
        <span>{ticket.mergeStatus.requiresHumanApproval ? "Approval reference" : "Merge reference"}</span>
        <input name="approvedByRef" defaultValue={ticket.mergeStatus.requiresHumanApproval ? "" : "pool-auto"} placeholder="operator, initials, or ticket approval" />
      </label>
    );
  }
  return (
    <label>
      <span>Move ticket to</span>
      <select name="targetState" defaultValue="READY">
        {ticketStates.map((state) => (
          <option key={state} value={state}>
            {prettyState(state)}
          </option>
        ))}
      </select>
    </label>
  );
}

function primaryActionLabel(ticket: TicketDetail) {
  switch (ticket.state) {
    case "READY":
    case "REWORK":
      return "Start run";
    case "WORKING":
      return "Record outcome";
    case "REVIEWING":
      return "Record review";
    case "VALIDATING":
      return "Record validation";
    case "READY_TO_MERGE":
      return "Record merge";
    default:
      return "Move ticket";
  }
}

function canSubmitPrimaryAction(
  ticket: TicketDetail,
  activeExecution?: { id: string } | undefined,
  latestCompletedExecution?: { id: string } | undefined,
) {
  if (ticket.state === "WORKING") return Boolean(activeExecution);
  if (ticket.state === "REVIEWING") return Boolean(latestCompletedExecution);
  if (ticket.state === "READY_TO_MERGE") return Boolean(ticket.mergeStatus?.canMerge);
  return true;
}

function EvidenceList({ ticket }: { ticket: TicketDetail }) {
  const latestExecution = ticket.executions[0];
  const latestReview = ticket.reviews[0];
  const latestValidation = ticket.validations[0];
  return (
    <div className="evidence-list">
      <EvidenceItem label="Execution" value={latestExecution?.summaryMd || "No execution evidence yet"} meta={latestExecution?.outcome || ""} />
      <EvidenceItem label="Review" value={latestReview?.summaryMd || "No review evidence yet"} meta={latestReview?.verdict || ""} />
      <EvidenceItem
        label="Validation"
        value={latestValidation?.summaryMd || "No validation evidence yet"}
        meta={latestValidation?.commandProfile || latestValidation?.verdict || ""}
      />
    </div>
  );
}

function EvidenceItem({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <article className="evidence-item">
      <span>{label}</span>
      <strong>{value}</strong>
      {meta ? <small>{meta}</small> : null}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value || "None"}</strong>
    </div>
  );
}

function TicketComposer({
  repos,
  onSubmit,
  onCancel,
}: {
  repos: Repo[];
  onSubmit: (input: {
    title: string;
    brief: string;
    priority: string;
    state: string;
    assignedRole: string;
    repoId: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onSubmit({
        title: String(form.get("title") || ""),
        brief: String(form.get("brief") || ""),
        priority: String(form.get("priority") || "medium"),
        state: String(form.get("state") || "READY"),
        assignedRole: String(form.get("assignedRole") || "developer"),
        repoId: String(form.get("repoId") || ""),
      });
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ticket-composer" onSubmit={handleSubmit}>
      <div className="composer-heading">
        <h3>New Ticket</h3>
        <button className="icon-button" type="button" aria-label="Close composer" title="Close" onClick={onCancel}>
          <X size={18} />
        </button>
      </div>
      {error ? <div className="status is-error">{error}</div> : null}
      <div className="form-grid">
        <label>
          <span>Title</span>
          <input name="title" required maxLength={120} />
        </label>
        <label>
          <span>Repo</span>
          <select name="repoId">
            {repos.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select name="priority" defaultValue="medium">
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Role</span>
          <select name="assignedRole" defaultValue="developer">
            {roles.map((role) => (
              <option key={role} value={role}>
                {prettyRole(role)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input type="hidden" name="state" value="READY" />
      <label>
        <span>Brief</span>
        <textarea name="brief" required rows={3} />
      </label>
      <div className="composer-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Creating..." : "Create ticket"}
        </button>
      </div>
    </form>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
