import { useCallback, useEffect, useMemo, useState } from "react";

type CommandCenterModule =
  | "projects" | "estimating" | "controls" | "procurement" | "scheduling" | "documents"
  | "materials" | "quality" | "welding" | "nde" | "testing" | "fabrication" | "bluebeam" | "turnover";

interface CommandCenterTask {
  readonly id: string;
  readonly module: CommandCenterModule;
  readonly recordType: string;
  readonly recordId: string;
  readonly title: string;
  readonly state: string;
  readonly priority: "critical" | "high" | "medium" | "normal";
  readonly dueAt: string | null;
  readonly overdue: boolean;
  readonly action: string;
  readonly version: number;
}

interface CommandCenterModuleSummary {
  readonly module: CommandCenterModule;
  readonly label: string;
  readonly total: number;
  readonly open: number;
  readonly attention: number;
  readonly completed: number;
  readonly progressPercent: number | null;
}

interface CommandCenterSnapshot {
  readonly generatedAt: string;
  readonly project: { readonly id: string; readonly number: string; readonly name: string; readonly state: string };
  readonly metrics: {
    readonly documentsCurrent: number;
    readonly documentsTotal: number;
    readonly materialsTracked: number;
    readonly weldsComplete: number;
    readonly weldsTotal: number;
    readonly executionAccepted: number;
    readonly executionTotal: number;
    readonly openExceptions: number;
    readonly scheduleProgressPercent: number | null;
    readonly openTasks: number;
  };
  readonly tasks: readonly CommandCenterTask[];
  readonly recentActivity: readonly {
    readonly id: string;
    readonly occurredAt: string;
    readonly actorUserId: string;
    readonly action: string;
    readonly module: CommandCenterModule;
    readonly objectType: string;
    readonly objectId: string;
    readonly priorState: string | null;
    readonly newState: string | null;
  }[];
  readonly activityVisible: boolean;
  readonly modules: readonly CommandCenterModuleSummary[];
  readonly schedule: {
    readonly sourceRevisionIds: readonly string[];
    readonly activityCount: number;
    readonly completedActivities: number;
    readonly lateActivities: number;
    readonly progressPercent: number | null;
  };
}

interface CommandCenterWorkspaceProps {
  readonly projectId: string;
  readonly projectNumber: string;
  readonly request: <T>(path: string, init?: RequestInit) => Promise<T>;
  readonly working: boolean;
  readonly setWorking: (working: boolean) => void;
  readonly notify: (tone: "success" | "error", text: string) => void;
  readonly openModule: (module: CommandCenterModule) => void;
}

const quickActions: readonly { readonly module: CommandCenterModule; readonly label: string; readonly description: string }[] = [
  { module: "fabrication", label: "Fabrication", description: "Open assemblies, spools, travelers, and holds" },
  { module: "welding", label: "Weld map", description: "Open connected weld execution" },
  { module: "materials", label: "Material lookup", description: "Trace receipt, MTR, PMI, and issue" },
  { module: "quality", label: "Quality action", description: "Open inspections, NCRs, and punch" },
  { module: "bluebeam", label: "Bluebeam review", description: "Reconcile imported collaboration evidence" },
  { module: "scheduling", label: "Schedule update", description: "Review logic, progress, and late work" },
  { module: "turnover", label: "Turnover", description: "Check completion and package evidence" },
];

function label(value: string): string {
  return value.replace(/[._]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function dateLabel(value: string | null): string {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function percentage(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export function CommandCenterWorkspace({
  projectId, projectNumber, request, working, setWorking, notify, openModule,
}: CommandCenterWorkspaceProps) {
  const [snapshot, setSnapshot] = useState<CommandCenterSnapshot | null>(null);
  const [moduleFilter, setModuleFilter] = useState<"all" | CommandCenterModule>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | CommandCenterTask["priority"]>("all");

  const refresh = useCallback(async () => {
    setWorking(true);
    try {
      setSnapshot(await request<CommandCenterSnapshot>(`/v1/projects/${projectId}/command-center`));
    } catch (error) {
      setSnapshot(null);
      notify("error", error instanceof Error ? error.message : "Command center refresh failed.");
    } finally {
      setWorking(false);
    }
  }, [notify, projectId, request, setWorking]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleTasks = useMemo(() => snapshot?.tasks.filter((task) =>
    (moduleFilter === "all" || task.module === moduleFilter)
    && (priorityFilter === "all" || task.priority === priorityFilter)) ?? [], [moduleFilter, priorityFilter, snapshot?.tasks]);

  return <section className="command-center" aria-labelledby="command-center-heading">
    <div className="workspace-hero command-center-hero">
      <div><p className="section-label">Unified operations</p><h2 id="command-center-heading">Enterprise command center</h2>
        <p>Live, permission-scoped projection for {projectNumber}. Every figure is recalculated from its authoritative module record.</p></div>
      <div className="hero-actions"><span className="policy-chip">No duplicated status</span>
        <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={working}>Recalculate command center</button></div>
    </div>

    {!snapshot ? <div className="panel empty-state"><strong>No authorized command-center projection</strong>
      <p>Apply an identity with report and underlying module permissions, then recalculate.</p></div> : <>
      <section className="metrics command-metrics" aria-label="Enterprise command center summary">
        <article><span>My open tasks</span><strong>{snapshot.metrics.openTasks}</strong><small>Authorized or explicitly owned</small></article>
        <article className={snapshot.metrics.openExceptions ? "metric-warning" : ""}><span>Open exceptions</span><strong>{snapshot.metrics.openExceptions}</strong><small>NCR · punch · procurement · collaboration</small></article>
        <article><span>Welds complete</span><strong>{snapshot.metrics.weldsComplete}</strong><small>of {snapshot.metrics.weldsTotal} released</small></article>
        <article><span>Execution accepted</span><strong>{snapshot.metrics.executionAccepted}</strong><small>of {snapshot.metrics.executionTotal} NDE / PWHT / tests</small></article>
        <article><span>Materials tracked</span><strong>{snapshot.metrics.materialsTracked}</strong><small>Authorized project records</small></article>
        <article><span>Schedule progress</span><strong>{percentage(snapshot.metrics.scheduleProgressPercent)}</strong><small>{snapshot.schedule.lateActivities} late · {snapshot.schedule.activityCount} activities</small></article>
      </section>

      <div className="command-grid">
        <section className="panel command-tasks" aria-labelledby="command-tasks-heading">
          <div className="panel-heading"><div><p className="section-label">Action center</p><h3 id="command-tasks-heading">My open tasks</h3></div>
            <span className="policy-chip">{visibleTasks.length} shown</span></div>
          <div className="command-filters">
            <label>Module<select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value as typeof moduleFilter)}>
              <option value="all">All modules</option>{snapshot.modules.map((module) => <option key={module.module} value={module.module}>{module.label}</option>)}</select></label>
            <label>Priority<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}>
              <option value="all">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="normal">Normal</option></select></label>
          </div>
          <div className="command-list" aria-live="polite">
            {visibleTasks.map((task) => <button key={task.id} type="button" className="command-list-row" onClick={() => openModule(task.module)}>
              <span className={`priority-dot priority-${task.priority}`} aria-label={`${task.priority} priority`} />
              <span><strong>{task.title}</strong><small>{label(task.module)} · {label(task.state)} · {dateLabel(task.dueAt)}{task.overdue ? " · Overdue" : ""}</small></span>
              <span className="record-version">v{task.version}</span>
            </button>)}
            {visibleTasks.length === 0 ? <div className="empty-state"><strong>No matching work</strong><p>No currently authorized or owned tasks match these filters.</p></div> : null}
          </div>
        </section>

        <section className="panel command-activity" aria-labelledby="command-activity-heading">
          <div className="panel-heading"><div><p className="section-label">Immutable audit projection</p><h3 id="command-activity-heading">Recent activity</h3></div>
            <span className="policy-chip">Latest 30</span></div>
          {snapshot.activityVisible ? <div className="command-list">
            {snapshot.recentActivity.map((activity) => <button key={activity.id} type="button" className="command-list-row activity-row" onClick={() => openModule(activity.module)}>
              <span className="activity-icon" aria-hidden="true">↗</span><span><strong>{label(activity.action)}</strong>
                <small>{activity.objectType}:{activity.objectId} · {activity.actorUserId} · {dateLabel(activity.occurredAt)}</small></span>
            </button>)}
            {snapshot.recentActivity.length === 0 ? <div className="empty-state"><strong>No recorded activity</strong><p>New governed actions will appear from the immutable audit stream.</p></div> : null}
          </div> : <div className="empty-state"><strong>Audit access is separate</strong><p>This identity has no project audit-read authority; activity counts and records are withheld.</p></div>}
        </section>
      </div>

      <section className="panel module-health" aria-labelledby="module-health-heading">
        <div className="panel-heading"><div><p className="section-label">Cross-module delivery</p><h3 id="module-health-heading">Authoritative module health</h3></div>
          <small>Generated {dateLabel(snapshot.generatedAt)}</small></div>
        <div className="module-health-grid">{snapshot.modules.map((module) => <button key={module.module} type="button" onClick={() => openModule(module.module)}>
          <span><strong>{module.label}</strong><small>{module.completed} complete · {module.open} open · {module.attention} attention</small></span>
          <span className="module-progress-value">{percentage(module.progressPercent)}</span>
          <span className="progress-track" aria-label={`${module.label} ${percentage(module.progressPercent)}`}><span style={{ width: `${module.progressPercent ?? 0}%` }} /></span>
        </button>)}</div>
      </section>

      <section className="quick-actions" aria-label="Command center quick actions">{quickActions.map((action) => <button key={action.module} type="button" onClick={() => openModule(action.module)}>
        <span className="quick-action-icon" aria-hidden="true">{action.label.slice(0, 1)}</span><span><strong>{action.label}</strong><small>{action.description}</small></span><span aria-hidden="true">→</span>
      </button>)}</section>
    </>}
  </section>;
}
