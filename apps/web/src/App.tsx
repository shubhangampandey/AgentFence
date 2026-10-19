import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "motion/react";

import {
  Shield,
  ArrowUpRight,
  ArrowRight,
  LayoutDashboard,
  Bot,
  SlidersHorizontal,
  Workflow,
  CheckCheck,
  FlaskConical,
  ScanLine,
  Plug,
  ChartNoAxesCombined,
  Code2,
  Settings,
  Search,
  ChevronDown,
  Plus,
  X,
  Check,
  Lock,
  LogOut,
  Menu,
  FileJson,
  RefreshCw,
  KeyRound,
  Copy,
  ChevronRight,
  Clock,
  Activity,
  Ellipsis,
  TriangleAlert,
  BookOpen,
  Fingerprint,
  Database,
  Play,
  Terminal,
  LoaderCircle,
  ShieldCheck,
  Globe,
  Download,
} from "lucide-react";
import { useApi, useAction, request, setCsrf, download, ApiError } from "./api";
import { can, type Role, ruleSchema } from "../../../packages/shared/src/index";
const DecisionGraph = lazy(() => import("./DecisionGraph"));
const Session = createContext<any>(null);
const Flash = createContext<(text: string) => void>(() => {});
const nav = [
  { path: "overview", name: "Overview", icon: LayoutDashboard },
  { path: "agents", name: "Agents", icon: Bot },
  { path: "policies", name: "Policies", icon: SlidersHorizontal },
  { path: "playground", name: "Gateway playground", icon: Workflow },
  { path: "approvals", name: "Approval center", icon: CheckCheck },
  { path: "lab", name: "Security Lab", icon: FlaskConical },
  { path: "investigations", name: "Investigations", icon: ScanLine },
  { path: "connectors", name: "Connectors", icon: Plug },
  { path: "analytics", name: "Analytics", icon: ChartNoAxesCombined },
  { path: "developer", name: "Developer", icon: Code2 },
  { path: "settings", name: "Settings", icon: Settings },
];
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const label = (value: string) => value?.toLowerCase().replaceAll("_", " ");
function allowed(permission: string) {
  const session = useContext(Session);
  return !!session && can(session.user.role as Role, permission);
}
function IconMark({ small = false }: { small?: boolean }) {
  return (
    <span className={"mark " + (small ? "small" : "")} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
function Brand() {
  return (
    <Link to="/" className="brand">
      <IconMark />
      agentfence<span className="brand-dot">®</span>
    </Link>
  );
}
function Button({
  children,
  secondary = false,
  loading = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  secondary?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={
        "button " + (secondary ? "secondary " : "") + (props.className ?? "")
      }
    >
      {loading ? <LoaderCircle className="spin" size={15} /> : null}
      {children}
    </button>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span
      className={
        "badge " +
        (status === "DENIED" || status === "FAILED" || status === "REJECTED"
          ? "hatched"
          : status === "EXECUTED" || status === "ACTIVE"
            ? "solid"
            : "")
      }
    >
      <span className="status-dot" />
      {label(status)}
    </span>
  );
}
function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="description">{description}</p>
      </div>
      {action}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      Loading workspace data…
    </div>
  );
}
function Failure({ error }: { error: unknown }) {
  return (
    <div className="error" role="alert">
      <TriangleAlert size={17} />
      {String((error as Error)?.message ?? error)}
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <ScanLine size={25} />
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = document.querySelector<HTMLDialogElement>("dialog[open]");
    const first =
      el?.querySelector<HTMLElement>("[data-autofocus]") ??
      el?.querySelector<HTMLElement>("input,textarea,select,button");
    first?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && el) {
        const focusable = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input,select,textarea,a[href]",
          ),
        );
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.dialog
        open
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </motion.dialog>
    </div>
  );
}
function Json({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}
export function App() {
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (flash) {
      const timer = setTimeout(() => setFlash(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [flash]);
  return (
    <Flash.Provider value={setFlash}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/architecture" element={<PublicDocs />} />
        <Route path="/docs" element={<PublicDocs developer />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Login registering />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="agents" element={<Agents />} />
          <Route path="policies" element={<Policies />} />
          <Route path="playground" element={<Playground />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="lab" element={<Lab />} />
          <Route path="investigations" element={<Investigations />} />
          <Route path="connectors" element={<Connectors />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="developer" element={<Developer />} />
          <Route path="settings" element={<WorkspaceSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AnimatePresence>
        {flash && (
          <motion.div
            role="status"
            className="toast"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Check size={16} />
            {flash}
          </motion.div>
        )}
      </AnimatePresence>
    </Flash.Provider>
  );
}
function Landing() {
  return (
    <div className="landing">
      <header className="public-nav">
        <Brand />
        <nav>
          <Link to="/architecture">Architecture</Link>
          <Link to="/docs">Developers</Link>
          <Link to="/login" className="button secondary">
            Sign in <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">
            <span className="status-dot" /> THE SECURITY CONTROL PLANE FOR AI
            AGENTS
          </p>
          <h1>
            Every action.
            <br />
            <span>Verified.</span>
          </h1>
          <div className="hero-bottom">
            <p>
              Your agents move fast.
              <br />
              Make sure their permissions keep up.
            </p>
            <div>
              <p>
                Put a deterministic security boundary between AI intent and
                enterprise execution. Scoped access. Human oversight. Verifiable
                evidence.
              </p>
              <Link to="/login" className="button">
                Enter the demo workspace <ArrowUpRight size={16} />
              </Link>
              <span className="caption">
                Synthetic environment. Real security decisions.
              </span>
            </div>
          </div>
        </section>
        <section className="landing-boundary">
          <div className="section-kicker">
            <span>01 / THE ENFORCEMENT BOUNDARY</span>
            <span>MODEL-INDEPENDENT BY DESIGN</span>
          </div>
          <div className="architecture-path">
            <div className="arch-node">
              <Bot />
              <b>Agent intent</b>
              <span>Untrusted input</span>
            </div>
            <span className="path-line" />
            <div className="boundary-box">
              <IconMark />
              <b>AgentFence gateway</b>
              <div className="checkpoint-list">
                {["Identity", "Capability", "Policy", "Approval"].map((s) => (
                  <span key={s}>
                    <Check size={12} />
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <span className="path-line" />
            <div className="arch-node">
              <Database />
              <b>Enterprise tools</b>
              <span>Controlled execution</span>
            </div>
          </div>
          <p className="boundary-caption">
            <Lock size={13} />
            The model can request an action. Only the gateway can authorize it.
          </p>
        </section>
        <section className="landing-features">
          <div>
            <p className="eyebrow">BUILT FOR THE BOUNDARY</p>
            <h2>
              Autonomy, with
              <br />
              accountability.
            </h2>
            <p className="description">
              Security controls that stay in charge when agents take the wheel.
            </p>
          </div>
          <div className="feature-rows">
            {[
              [
                Fingerprint,
                "Identity before intent",
                "Short-lived machine credentials and scoped, revocable capabilities.",
              ],
              [
                SlidersHorizontal,
                "Policy with a paper trail",
                "OPA evaluates structured rules. Simulate changes before you publish.",
              ],
              [
                CheckCheck,
                "A human where it matters",
                "Payload-bound approval, fresh authorization, and replay protection.",
              ],
              [
                ScanLine,
                "Evidence you can inspect",
                "Canonical hash chains with signed events and a built-in verifier.",
              ],
            ].map(([Icon, title, body]: any) => (
              <div key={title}>
                <Icon size={22} />
                <section>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </section>
                <ArrowUpRight size={18} />
              </div>
            ))}
          </div>
        </section>
        <section className="developer-band">
          <div>
            <p className="eyebrow">ONE GATEWAY. EVERY INVOCATION.</p>
            <h2>
              Integrate at the
              <br />
              point of action.
            </h2>
            <Link to="/docs" className="text-link">
              Explore the developer guide <ArrowRight size={15} />
            </Link>
          </div>
          <pre>
            <span>// A request is intent. A decision is authority.</span>
            {"\n"}const fence = new AgentFenceClient({"{"}
            {"\n"} baseUrl, apiKey{"\n"}
            {"}"});{"\n\n"}await fence.invoke({"{"}
            {"\n"} tool: "crm",{"\n"} operation: "customer.read",{"\n"}{" "}
            arguments: {"{"} customerId: "customer_001" {"}"},{"\n"}{" "}
            idempotencyKey: "lookup-001"{"\n"}
            {"}"});
          </pre>
        </section>
        <section className="final-cta">
          <h2>
            Let agents act.
            <br />
            Keep control.
          </h2>
          <Link to="/login" className="button">
            Explore AgentFence <ArrowUpRight size={16} />
          </Link>
        </section>
      </main>
      <footer>
        <Brand />
        <span>Independent of the model. Accountable for every action.</span>
        <span>Portfolio edition · Synthetic tools only</span>
      </footer>
    </div>
  );
}
function Login({ registering = false }: { registering?: boolean }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const config = useApi("/config");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function enter(path: string, data: any) {
    setBusy(path);
    setError("");
    try {
      const session = await request(path, "POST", data);
      setCsrf(session.csrfToken);
      client.clear();
      navigate("/app/overview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div>
          <p className="eyebrow">TRUST IS AN ENFORCED BOUNDARY.</p>
          <h1>
            Welcome to
            <br />
            the control plane.
          </h1>
          <p>
            See what your agents can do.
            <br />
            Decide what they should.
          </p>
        </div>
        <span className="caption">AGENTFENCE / EVERY ACTION. VERIFIED.</span>
      </div>
      <main className="login-form">
        <p className="eyebrow">NORTHSTAR LABS</p>
        <h2>{registering ? "Create your account" : "Enter your workspace"}</h2>
        <p className="description">
          {registering
            ? "Create a separate sandbox workspace. Use at least 14 characters for your password."
            : "Sign in with your registered account. Demo credentials only work for the seeded demo account."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            if (
              registering &&
              form.get("password") !== form.get("confirmPassword")
            ) {
              setError("Passwords do not match.");
              return;
            }
            form.delete("confirmPassword");
            void enter(
              registering ? "/auth/register" : "/auth/login",
              Object.fromEntries(form),
            );
          }}
        >
          {registering && (
            <label>
              Full name
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              autoComplete="username"
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={registering ? 14 : 1}
              maxLength={200}
              autoComplete={registering ? "new-password" : "current-password"}
            />
          </label>
          {registering && (
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={14}
                maxLength={200}
                autoComplete="new-password"
              />
            </label>
          )}
          <Button loading={!!busy} type="submit">
            {registering ? "Create account" : "Sign in"}{" "}
            <ArrowRight size={16} />
          </Button>
        </form>
        <p>
          {registering ? "Already registered? " : "New here? "}
          <Link
            to={registering ? "/login" : "/register"}
            onClick={() => setError("")}
          >
            {registering ? "Sign in" : "Create an account"}
          </Link>
        </p>
        {error && <Failure error={error} />}
        {!registering && config.data?.demoEnabled && (
          <div className="demo-access">
            <div className="divider-label">EXPLORE THE SYNTHETIC WORKSPACE</div>
            <Button
              secondary
              loading={busy === "/auth/demo"}
              onClick={() => enter("/auth/demo", { role: "operator" })}
            >
              <Bot size={16} />
              Enter as security operator <ArrowUpRight size={16} />
            </Button>
            <div className="demo-roles">
              <button onClick={() => enter("/auth/demo", { role: "approver" })}>
                Approver access
              </button>
              <button onClick={() => enter("/auth/demo", { role: "auditor" })}>
                Auditor access
              </button>
            </div>
            <p className="caption">
              Fictional company. Synthetic records. Deterministic enforcement.
              <br />
              Demo access is disabled in production.
            </p>
          </div>
        )}
        <Link to="/" className="back-link">
          ← Back to AgentFence
        </Link>
      </main>
    </div>
  );
}
function Layout() {
  const session = useApi("/auth/session");
  const navigate = useNavigate();
  const client = useQueryClient();
  const location = useLocation();
  const [mobile, setMobile] = useState(false);
  const [command, setCommand] = useState(false);
  const [search, setSearch] = useState("");
  const [userMenu, setUserMenu] = useState(false);
  useEffect(() => {
    const expired = () => {
      setCsrf("");
      client.clear();
      navigate("/login", { replace: true });
    };
    window.addEventListener("agentfence:session-expired", expired);
    return () =>
      window.removeEventListener("agentfence:session-expired", expired);
  }, [client, navigate]);
  useEffect(() => {
    if (session.data) setCsrf(session.data.csrfToken);
  }, [session.data]);
  const sessionUserId = session.data?.user?.userId;
  useEffect(() => {
    if (!sessionUserId) return;
    const stream = new EventSource("/api/events", { withCredentials: true });
    const refresh = () => {
      void client.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          [
            "/overview",
            "/approvals",
            "/invocations",
            "/analytics",
            "/audit",
          ].some((path) => (q.queryKey[0] as string).startsWith(path)),
      });
    };
    stream.addEventListener("workspace", refresh);
    return () => stream.close();
  }, [sessionUserId, client]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommand((x) => !x);
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => setMobile(false), [location.pathname]);
  if (session.isPending) return <Loading />;
  if (session.data === null) return <Navigate to="/login" replace />;
  if (
    session.error instanceof ApiError &&
    [401, 403].includes(session.error.status)
  )
    return <Navigate to="/login" replace />;
  if (!session.data)
    return (
      <div className="panel-body">
        <Failure error={session.error} />
        <Button secondary onClick={() => session.refetch()}>
          Retry workspace connection
        </Button>
      </div>
    );
  const user = session.data.user;
  return (
    <Session.Provider value={session.data}>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
          <div className="sidebar-brand">
            <Brand />
            <span className="edition">CONTROL PLANE</span>
          </div>
          <div className="workspace-pill">
            <span className="workspace-avatar">N</span>
            <div>
              <b>{session.data.workspace.name}</b>
              <span>Sandbox workspace</span>
            </div>
            <Lock size={13} />
          </div>
          <div className="nav-label">WORKSPACE</div>
          <nav aria-label="Workspace navigation">
            {nav.map((item, i) => (
              <NavLink
                key={item.path}
                to={"/app/" + item.path}
                className={({ isActive }) =>
                  (isActive ? "active " : "") + (i === 9 ? "nav-break" : "")
                }
              >
                <item.icon size={17} />
                <span>{item.name}</span>
                {item.path === "playground" && (
                  <span className="nav-new">↗</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sandbox-note">
              <ShieldCheck size={17} />
              <div>
                <b>Synthetic by design</b>
                <p>No production tools connected</p>
              </div>
            </div>
            <button
              className="user-control"
              onClick={() => setUserMenu(!userMenu)}
              aria-expanded={userMenu}
            >
              <span className="user-avatar">
                {user.name
                  .split(" ")
                  .map((s: string) => s[0])
                  .join("")}
              </span>
              <span>
                <b>{user.name}</b>
                <small>{label(user.role)}</small>
              </span>
              <Ellipsis size={17} />
            </button>
            {userMenu && (
              <div className="user-menu">
                <Link to="/app/settings">Workspace settings</Link>
                <button
                  onClick={async () => {
                    await request("/auth/logout", "POST", {});
                    client.clear();
                    navigate("/login");
                  }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </aside>
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="workspace-main">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="icon-button mobile-toggle"
                aria-label="Open navigation"
                onClick={() => setMobile(!mobile)}
              >
                <Menu size={19} />
              </button>
              <span>Workspace</span>
              <ChevronRight size={13} />
              <b>{nav.find((n) => location.pathname.endsWith(n.path))?.name}</b>
            </div>
            <div className="topbar-actions">
              <button
                className="search-trigger"
                aria-label="Search workspace pages"
                onClick={() => setCommand(true)}
              >
                <Search size={15} />
                <span>Jump to…</span>
                <kbd>Ctrl K</kbd>
              </button>
              <span className="environment">
                <span className="status-dot" />
                Sandbox
              </span>
              <Link to="/docs" aria-label="Documentation">
                <BookOpen size={17} />
              </Link>
            </div>
          </header>
          <main id="main">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </main>
          <footer className="workspace-footer">
            <span>
              <IconMark small />
              Every action. Verified.
            </span>
            <span>AgentFence / Synthetic portfolio environment</span>
          </footer>
        </div>
        {command && (
          <Modal title="Jump to a workspace" onClose={() => setCommand(false)}>
            <label className="command-search">
              <Search size={17} />
              <input
                aria-label="Search pages"
                data-autofocus
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pages and workflows…"
              />
            </label>
            <div className="command-results">
              {nav
                .filter((n) =>
                  n.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((n) => (
                  <button
                    key={n.path}
                    onClick={() => {
                      navigate("/app/" + n.path);
                      setCommand(false);
                      setSearch("");
                    }}
                  >
                    <n.icon size={17} />
                    {n.name}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
            </div>
          </Modal>
        )}
      </div>
    </Session.Provider>
  );
}
function InvocationTable({
  items,
  onSelect,
}: {
  items: any[];
  onSelect: (id: string) => void;
}) {
  if (!items.length)
    return (
      <Empty>
        No invocations yet. Run a request in the gateway playground.
      </Empty>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Agent / operation</th>
            <th>Decision</th>
            <th>Tool</th>
            <th>Recorded</th>
            <th>
              <span className="sr-only">Inspect</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>
                <button className="row-link" onClick={() => onSelect(row.id)}>
                  <span className="table-agent">
                    <Bot size={15} />
                    {row.agent?.name ?? row.agentId}
                  </span>
                  <code>{row.operation}</code>
                </button>
              </td>
              <td>
                <Badge status={row.status} />
              </td>
              <td>
                <span className="tool-label">{row.tool}</span>
              </td>
              <td className="muted nowrap">{date(row.createdAt)}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"Inspect " + row.operation}
                  onClick={() => onSelect(row.id)}
                >
                  <ArrowUpRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Overview() {
  const query = useApi("/overview");
  const ready = useApi("/ready");
  const [selected, setSelected] = useState("");
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} />;
  const data = query.data;
  return (
    <>
      <Heading
        eyebrow="YOUR SECURITY OPERATIONS, IN FOCUS"
        title="Control starts here."
        description="A clear view of every agent, decision, and action in your workspace."
        action={
          <Link className="button" to="/app/playground">
            Open gateway <ArrowUpRight size={16} />
          </Link>
        }
      />
      <section className="overview-banner">
        <div className="banner-symbol">
          <IconMark />
        </div>
        <div>
          <span className="eyebrow">THE ENFORCEMENT BOUNDARY</span>
          <h2>
            Agent intent meets
            <br />
            enterprise control.
          </h2>
          <p>Identity verified. Permissions scoped. Decisions recorded.</p>
        </div>
        <div className="banner-rail">
          {[
            { name: "Agent", icon: Bot },
            { name: "AgentFence", icon: Shield },
            { name: "Tool", icon: Database },
          ].map((s, i) => (
            <div key={s.name} className={i === 1 ? "rail-fence" : ""}>
              <s.icon size={22} />
              <span>{s.name}</span>
              {i < 2 && <i />}
            </div>
          ))}
          <span className="rail-caption">
            <Lock size={11} /> DETERMINISTIC BY DESIGN
          </span>
        </div>
      </section>
      <section className="metrics-grid">
        {[
          ["Registered agents", data.agents, Bot, "Scoped machine identities"],
          [
            "Gateway invocations",
            data.invocations,
            Workflow,
            "Persisted security decisions",
          ],
          ["Blocked requests", data.denials, Shield, "Denied before execution"],
          [
            "Pending approvals",
            data.pending,
            CheckCheck,
            "Awaiting human review",
          ],
        ].map(([title, count, Icon, caption]: any) => (
          <div className="metric" key={title}>
            <div>
              <span>{title}</span>
              <Icon size={17} />
            </div>
            <strong>{count.toLocaleString()}</strong>
            <small>{caption}</small>
          </div>
        ))}
      </section>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">LIVE WORKSPACE DATA</p>
              <h2>Recent invocations</h2>
            </div>
            <Link to="/app/investigations" className="text-link">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          <InvocationTable items={data.recent} onSelect={setSelected} />
        </section>
        <section className="panel posture">
          <div className="panel-header">
            <h2>System boundary</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="posture-main">
            <span className="big-ring">
              <Lock size={26} />
            </span>
            <h3>
              {ready.data ? "Enforcement online" : "Readiness unavailable"}
            </h3>
            <p>
              {ready.data
                ? "Database and policy engine responded to the readiness check."
                : "Check API, database, and OPA availability."}
            </p>
          </div>
          <div className="posture-row">
            <span>Authorization engine</span>
            <b>{ready.data?.policyEngine ? "OPA / Rego" : "Unavailable"}</b>
          </div>
          <div className="posture-row">
            <span>Default behavior</span>
            <b>Deny</b>
          </div>
          <div className="posture-row">
            <span>Connected tools</span>
            <b>Synthetic only</b>
          </div>
          <div className="posture-row">
            <span>Policy versions</span>
            <b>{data.policies}</b>
          </div>
          <Link to="/app/lab" className="text-link">
            Test the boundary <ArrowUpRight size={14} />
          </Link>
        </section>
      </div>
      <section className="quick-path">
        <div>
          <p className="eyebrow">MAKE YOUR FIRST DECISION</p>
          <h2>See the boundary in action.</h2>
        </div>
        {[
          ["01", "Authorize a lookup", "playground"],
          ["02", "Review a payment", "approvals"],
          ["03", "Inspect the evidence", "investigations"],
        ].map(([num, name, path]) => (
          <Link key={path} to={"/app/" + path}>
            <span>{num}</span>
            {name}
            <ArrowUpRight size={18} />
          </Link>
        ))}
      </section>
      <section className="panel activity-panel">
        <div className="panel-header">
          <h2>Workspace activity</h2>
          <span className="caption">SERVER-RECORDED EVENTS</span>
        </div>
        {data.events.map((e: any) => (
          <div className="activity-row" key={e.id}>
            <span className="event-square" />
            <b>{label(e.type)}</b>
            <code>#{String(e.sequence).padStart(4, "0")}</code>
            <span className="muted">{date(e.createdAt)}</span>
            {e.seeded && <span className="caption">SEED FIXTURE</span>}
          </div>
        ))}
      </section>
      {selected && <Inspector id={selected} onClose={() => setSelected("")} />}
    </>
  );
}
function Agents() {
  const query = useApi("/agents");
  const [newAgent, setNewAgent] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [secret, setSecret] = useState("");
  const create = useAction("/agents");
  const flash = useContext(Flash);
  const manage = allowed("manage");
  const form = useForm({
    resolver: zodResolver(
      z.object({
        name: z.string().min(3),
        description: z.string(),
        purpose: z.string().min(3),
      }),
    ),
  });
  return (
    <>
      <Heading
        eyebrow="IDENTITY & LEAST PRIVILEGE"
        title="Agents, with boundaries."
        description="Know who is acting. Define exactly what they can do."
        action={
          <Button
            disabled={!manage}
            title={!manage ? "Management permission required" : undefined}
            onClick={() => setNewAgent(true)}
          >
            <Plus size={16} />
            Register agent
          </Button>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <div className="agent-list">
          {query.data.map((agent: any) => (
            <section className="agent-card" key={agent.id}>
              <div className="agent-card-top">
                <span className="agent-glyph">
                  <Bot size={24} />
                </span>
                <Badge status={agent.suspended ? "SUSPENDED" : "ACTIVE"} />
                <button
                  className="icon-button"
                  aria-label={"Inspect " + agent.name}
                  onClick={() => setSelected(agent)}
                >
                  <ArrowUpRight size={18} />
                </button>
              </div>
              <h2>{agent.name}</h2>
              <p>{agent.description}</p>
              <div className="agent-meta">
                <span>
                  <Globe size={13} />
                  {agent.environment}
                </span>
                <span>{agent._count.invocations} invocations</span>
              </div>
              <div className="capability-chips">
                {agent.capabilities
                  .filter((c: any) => !c.revokedAt)
                  .map((c: any) => (
                    <span key={c.id}>
                      <Lock size={11} />
                      {c.tool} · {c.operations.length} operations
                    </span>
                  ))}
              </div>
              <button
                className="agent-detail-link"
                onClick={() => setSelected(agent)}
              >
                Inspect identity & access <ArrowRight size={15} />
              </button>
            </section>
          ))}
        </div>
      )}
      {newAgent && (
        <Modal title="Register an agent" onClose={() => setNewAgent(false)}>
          <p className="description">
            New identities start with no capabilities or machine credentials.
          </p>
          <form
            onSubmit={form.handleSubmit(async (data) => {
              await create.mutateAsync(data);
              setNewAgent(false);
              form.reset();
              flash("Agent registered with zero permissions.");
            })}
          >
            <label>
              Display name
              <input {...form.register("name")} required minLength={3} />
            </label>
            <label>
              Description
              <input {...form.register("description")} />
            </label>
            <label>
              Business purpose
              <textarea {...form.register("purpose")} required minLength={3} />
            </label>
            <Button loading={create.isPending}>Register agent</Button>
            {create.error && <Failure error={create.error} />}
          </form>
        </Modal>
      )}
      {selected && (
        <AgentDetails
          agent={query.data?.find((a: any) => a.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          onSecret={setSecret}
        />
      )}
      {secret && (
        <Modal
          title="Copy your machine credential"
          onClose={() => setSecret("")}
        >
          <div className="callout">
            <KeyRound size={20} />
            <p>
              This secret is shown once. It expires in 24 hours. Store it
              outside source control.
            </p>
          </div>
          <code className="secret">{secret}</code>
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(secret);
              flash("Credential copied.");
            }}
          >
            <Copy size={15} />
            Copy credential
          </Button>
        </Modal>
      )}
    </>
  );
}
function AgentDetails({
  agent,
  onClose,
  onSecret,
}: {
  agent: any;
  onClose: () => void;
  onSecret: (s: string) => void;
}) {
  const manage = allowed("manage");
  const update = useAction("/agents/" + agent.id, "PATCH");
  const issue = useAction("/agents/" + agent.id + "/credentials");
  const grant = useAction("/agents/" + agent.id + "/capabilities");
  const flash = useContext(Flash);
  const client = useQueryClient();
  const [showGrant, setShowGrant] = useState(false);
  const [tool, setTool] = useState("crm");
  const connectors = useApi("/connectors");
  const [error, setError] = useState("");
  async function revoke(kind: string, id: string) {
    try {
      await request("/" + kind + "/" + id, "DELETE");
      await client.invalidateQueries();
      flash("Access revoked.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={agent.name} onClose={onClose} wide>
      <p className="description">{agent.purpose}</p>
      <div className="detail-summary">
        <span>
          <b>Identity</b>
          <code>{agent.id}</code>
        </span>
        <span>
          <b>Environment</b>
          {agent.environment}
        </span>
        <span>
          <b>State</b>
          <Badge status={agent.suspended ? "SUSPENDED" : "ACTIVE"} />
        </span>
      </div>
      <div className="section-title">
        <h3>Capabilities</h3>
        <Button
          secondary
          disabled={!manage}
          onClick={() => setShowGrant(!showGrant)}
        >
          <Plus size={14} />
          Grant capability
        </Button>
      </div>
      {agent.capabilities.length === 0 ? (
        <Empty>No permissions granted.</Empty>
      ) : (
        agent.capabilities.map((c: any) => (
          <div className="capability-row" key={c.id}>
            <div>
              <b>{c.tool}</b>
              <p>
                <code>{c.operations.join(" · ")}</code>
              </p>
              <span className="caption">
                {c.classifications.join(", ")} · expires {date(c.expiresAt)} ·
                amount limit ${c.maxAmount}
              </span>
              {c.resources.length > 0 && (
                <p className="caption">Resources: {c.resources.join(", ")}</p>
              )}
            </div>
            <Button
              secondary
              disabled={!manage || !!c.revokedAt}
              onClick={() => revoke("capabilities", c.id)}
            >
              {c.revokedAt ? "Revoked" : "Revoke"}
            </Button>
          </div>
        ))
      )}
      {showGrant && (
        <form
          className="inset-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await grant.mutateAsync({
                tool,
                operations: f.getAll("operation"),
                resources: String(f.get("resources") ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                classifications: f.getAll("classification"),
                maxAmount: Number(f.get("maxAmount")),
                hours: Number(f.get("hours")),
              });
              setShowGrant(false);
              flash("Scoped capability granted.");
            } catch {
              /* Error is rendered from the mutation state. */
            }
          }}
        >
          <div className="form-grid">
            <label>
              Tool
              <select value={tool} onChange={(e) => setTool(e.target.value)}>
                <option>crm</option>
                <option>finance</option>
                <option>vault</option>
              </select>
            </label>
            <label>
              Amount ceiling (USD)
              <input
                name="maxAmount"
                type="number"
                min="0"
                max="100000"
                defaultValue="500"
                required
              />
            </label>
            <label>
              Expires in hours
              <input
                name="hours"
                type="number"
                min="1"
                max="720"
                defaultValue="24"
                required
              />
            </label>
            <label>
              Resource IDs (optional)
              <input
                name="resources"
                placeholder="customer_001, customer_002"
              />
            </label>
          </div>
          <fieldset>
            <legend>Allowed operations</legend>
            {connectors.data
              ?.find((c: any) => c.tool === tool)
              ?.operations.map((o: string) => (
                <label className="checkbox" key={o}>
                  <input type="checkbox" name="operation" value={o} />
                  <code>{o}</code>
                </label>
              ))}
          </fieldset>
          <fieldset>
            <legend>Data classifications</legend>
            {["public", "internal", "confidential"].map((c) => (
              <label className="checkbox" key={c}>
                <input
                  name="classification"
                  value={c}
                  type="checkbox"
                  defaultChecked={c === "public"}
                />
                {c}
              </label>
            ))}
          </fieldset>
          <Button loading={grant.isPending}>Grant scoped access</Button>
          {grant.error && <Failure error={grant.error} />}
        </form>
      )}
      <div className="section-title">
        <h3>Machine credentials</h3>
        <Button
          secondary
          disabled={!manage}
          loading={issue.isPending}
          onClick={async () => {
            const issued = await issue.mutateAsync({
              hours: 24,
              rotate: false,
            });
            onClose();
            onSecret(issued.key);
          }}
        >
          <KeyRound size={14} />
          Issue credential
        </Button>
      </div>
      {agent.credentials.map((c: any) => (
        <div className="credential-row" key={c.id}>
          <code>{c.prefix}••••••</code>
          <span className="caption">
            {c.revokedAt ? "REVOKED" : "EXPIRES " + date(c.expiresAt)}
          </span>
          <button
            className="text-button"
            disabled={!manage || !!c.revokedAt}
            onClick={() => revoke("credentials", c.id)}
          >
            Revoke
          </button>
        </div>
      ))}
      <div className="modal-actions">
        <Button
          secondary
          disabled={!manage}
          onClick={async () => {
            await update.mutateAsync({ suspended: !agent.suspended });
            flash(agent.suspended ? "Agent reactivated." : "Agent suspended.");
          }}
        >
          {agent.suspended ? "Reactivate agent" : "Suspend agent"}
        </Button>
        <Button
          secondary
          disabled={!manage}
          onClick={async () => {
            const issued = await issue.mutateAsync({ hours: 24, rotate: true });
            onClose();
            onSecret(issued.key);
          }}
        >
          Rotate all credentials
        </Button>
        <Link
          to={"/app/investigations?agentId=" + agent.id}
          onClick={onClose}
          className="text-link"
        >
          View activity <ArrowUpRight size={14} />
        </Link>
      </div>
      {(error || issue.error || update.error) && (
        <Failure error={error || issue.error || update.error} />
      )}
    </Modal>
  );
}
function TraceRail({ trace = [] }: { trace: any[] }) {
  return (
    <div className="decision-rail">
      {[
        "Identity",
        "Capability",
        "Policy",
        "Approval",
        "Execution",
        "Evidence",
      ].map((name) => {
        const stage = trace.findLast(
          (s) =>
            s.stage === name ||
            (name === "Approval" && s.stage === "Approval review"),
        );
        return (
          <div key={name} className={stage ? "stage " + stage.state : "stage"}>
            <span>
              {stage ? (
                stage.state === "passed" ? (
                  <Check size={15} />
                ) : stage.state === "waiting" ? (
                  <Clock size={15} />
                ) : (
                  <X size={15} />
                )
              ) : (
                <span className="stage-empty" />
              )}
            </span>
            <b>{name}</b>
            <small>{stage ? stage.durationMs + " ms" : "Not reached"}</small>
          </div>
        );
      })}
    </div>
  );
}
function Playground() {
  const agents = useApi("/agents");
  const connectors = useApi("/connectors");
  const scenarios = useApi("/scenarios");
  const execute = useAction("/playground/invoke");
  const preview = useAction("/playground/preview");
  const [agentId, setAgent] = useState("support");
  const [tool, setTool] = useState("crm");
  const [operation, setOperation] = useState("customer.read");
  const [args, setArgs] = useState('{\n  "customerId": "customer_001"\n}');
  const [intent, setIntent] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [key, setKey] = useState(crypto.randomUUID());
  const [selected, setSelected] = useState("");
  const canInvoke = allowed("invoke");
  const selectedAgent = agents.data?.find((a: any) => a.id === agentId);
  function change() {
    setResult(null);
    setKey(crypto.randomUUID());
  }
  async function submit(dry: boolean) {
    setError("");
    try {
      const input = {
        agentId,
        tool,
        operation,
        arguments: JSON.parse(args),
        idempotencyKey: key,
        ...(intent ? { intent } : {}),
      };
      const data = await (dry ? preview : execute).mutateAsync(input);
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Heading
        eyebrow="THE AUTHORITATIVE EXECUTION PATH"
        title="Intent in. Decision out."
        description="Construct a request. Inspect its scope. Watch deterministic enforcement work."
        action={
          <span className="outline-label">
            <Lock size={13} />
            SYNTHETIC EXECUTION ONLY
          </span>
        }
      />
      <div className="playground-grid">
        <section className="panel request-panel">
          <div className="panel-header">
            <h2>Construct an invocation</h2>
            <code>POST /v1/invoke</code>
          </div>
          <div className="panel-body">
            <label>
              Start from a scenario
              <select
                aria-label="Scenario"
                defaultValue=""
                onChange={(e) => {
                  const s = scenarios.data?.find(
                    (s: any) => s.id === e.target.value,
                  );
                  if (s) {
                    setAgent(s.agentId);
                    setTool(s.tool);
                    setOperation(s.operation);
                    setArgs(JSON.stringify(s.arguments, null, 2));
                    setIntent(s.intent ?? "");
                    change();
                  }
                }}
              >
                <option value="" disabled>
                  Select a saved scenario
                </option>
                {scenarios.data?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Agent identity
              <select
                value={agentId}
                onChange={(e) => {
                  setAgent(e.target.value);
                  change();
                }}
              >
                {agents.data?.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Registered tool
                <select
                  value={tool}
                  onChange={(e) => {
                    setTool(e.target.value);
                    setOperation(
                      connectors.data.find(
                        (c: any) => c.tool === e.target.value,
                      ).operations[0],
                    );
                    setArgs("{}");
                    change();
                  }}
                >
                  {connectors.data?.map((c: any) => (
                    <option key={c.tool} value={c.tool}>
                      {c.tool}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Operation
                <select
                  value={operation}
                  onChange={(e) => {
                    setOperation(e.target.value);
                    change();
                  }}
                >
                  {connectors.data
                    ?.find((c: any) => c.tool === tool)
                    ?.operations.map((o: string) => (
                      <option key={o}>{o}</option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Operation arguments{" "}
              <span className="caption">STRICT JSON SCHEMA</span>
              <textarea
                className="code-input"
                value={args}
                onChange={(e) => {
                  setArgs(e.target.value);
                  change();
                }}
                spellCheck={false}
                rows={7}
              />
            </label>
            <label>
              Agent intent <span className="caption">UNTRUSTED · OPTIONAL</span>
              <input
                value={intent}
                onChange={(e) => {
                  setIntent(e.target.value);
                  change();
                }}
                placeholder="Describe the business request"
                maxLength={1000}
              />
            </label>
            <div className="request-buttons">
              <Button
                secondary
                disabled={!canInvoke}
                loading={preview.isPending}
                onClick={() => submit(true)}
              >
                <ScanLine size={15} />
                Evaluate preview
              </Button>
              <Button
                disabled={!canInvoke || execute.isPending}
                loading={execute.isPending}
                onClick={() => submit(false)}
              >
                <Play size={14} />
                Execute request
              </Button>
            </div>
            {!canInvoke && (
              <p className="caption">
                Your role can inspect requests. Invocation permission is
                required to execute.
              </p>
            )}
            {error && <Failure error={error} />}
            <p className="request-key">
              <Lock size={11} />
              Idempotency key <code>{key.slice(0, 18)}…</code>
              <button
                className="icon-button"
                aria-label="Start new idempotent request"
                onClick={() => {
                  change();
                  setError("");
                }}
              >
                <RefreshCw size={12} />
              </button>
            </p>
          </div>
        </section>
        <div className="request-evidence">
          <section className="panel scope-panel">
            <div className="panel-header">
              <h2>Effective scope</h2>
              <Fingerprint size={18} />
            </div>
            <div className="panel-body">
              <div className="scope-identity">
                <span className="agent-glyph">
                  <Bot size={20} />
                </span>
                <div>
                  <b>{selectedAgent?.name ?? "Select an identity"}</b>
                  <code>{agentId} / sandbox</code>
                </div>
              </div>
              {selectedAgent?.capabilities
                .filter((c: any) => !c.revokedAt && c.tool === tool)
                .map((c: any) => (
                  <div className="scope-detail" key={c.id}>
                    <p>
                      <Lock size={12} />
                      {c.operations.join(", ")}
                    </p>
                    <p className="caption">
                      {c.classifications.join(" / ")} · ceiling $
                      {c.maxAmount.toLocaleString()} · expires{" "}
                      {date(c.expiresAt)}
                    </p>
                  </div>
                ))}
              <p className="caption">
                The backend resolves identity, resource classification, and
                active grants on every request.
              </p>
            </div>
          </section>
          <section className="panel result-panel">
            <div className="panel-header">
              <h2>Decision evidence</h2>
              {result ? (
                <Badge status={result.status} />
              ) : (
                <span className="caption">AWAITING REQUEST</span>
              )}
            </div>
            {!result ? (
              <div className="awaiting">
                <Workflow size={35} />
                <h3>Follow the decision.</h3>
                <p>
                  Your request trace, matched rules, and connector result will
                  appear here.
                </p>
                <span className="caption">TIMINGS COME FROM THE BACKEND</span>
              </div>
            ) : (
              <div className="panel-body">
                <TraceRail trace={result.trace} />
                <div className="result-heading">
                  <b>
                    {result.dryRun
                      ? "Preview only · no execution"
                      : result.replayed
                        ? "Idempotent replay · original result"
                        : "Policy version " + result.policyVersion}
                  </b>
                  <code>{result.decision.codes.join(", ")}</code>
                </div>
                <p>{result.decision.explanations.join(" ")}</p>
                {result.preview && (
                  <>
                    <h3>Proposed changes</h3>
                    <Json value={result.preview.changes} />
                  </>
                )}
                {result.result && (
                  <>
                    <h3>Connector result</h3>
                    <Json value={result.result} />
                  </>
                )}
                {!result.dryRun && (
                  <button
                    className="text-link"
                    onClick={() => setSelected(result.id)}
                  >
                    Inspect full evidence <ArrowUpRight size={14} />
                  </button>
                )}
                {result.status === "APPROVAL_REQUIRED" && (
                  <Link to="/app/approvals" className="text-link">
                    Open approval center <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      {selected && <Inspector id={selected} onClose={() => setSelected("")} />}
    </>
  );
}
function Approvals() {
  const query = useApi("/approvals");
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState("pending");
  const [error, setError] = useState("");
  const client = useQueryClient();
  const session = useContext(Session);
  const approve = allowed("approve");
  const flash = useContext(Flash);
  const [busy, setBusy] = useState(false);
  async function decide(action: string) {
    setBusy(true);
    setError("");
    try {
      const result = await request(
        "/approvals/" + selected.id + "/review",
        "POST",
        { action, payloadHash: selected.payloadHash },
      );
      setSelected(result);
      await client.invalidateQueries();
      flash("Backend confirmed: " + label(result.status));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="HUMAN OVERSIGHT"
        title="A second set of eyes."
        description="Review the exact proposed action. The gateway revalidates before anything executes."
      />
      <div className="approval-intro">
        <CheckCheck size={21} />
        <p>
          Approval is a bounded decision, not a permission override. Requests
          expire after 15 minutes; changed policies or records require a fresh
          request.
        </p>
      </div>
      <div className="tabs" role="tablist">
        {["pending", "reviewed", "all"].map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
            {f === "pending" && query.data && (
              <span>
                {
                  query.data.filter(
                    (r: any) => r.status === "APPROVAL_REQUIRED",
                  ).length
                }
              </span>
            )}
          </button>
        ))}
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <div className="approval-list">
          {query.data
            .filter(
              (r: any) =>
                filter === "all" ||
                (filter === "pending"
                  ? r.status === "APPROVAL_REQUIRED"
                  : r.status !== "APPROVAL_REQUIRED"),
            )
            .map((r: any) => (
              <button
                className="approval-card"
                key={r.id}
                onClick={() => {
                  setSelected(r);
                  setError("");
                }}
              >
                <span className="approval-icon">
                  <CheckCheck size={23} />
                </span>
                <div>
                  <span className="eyebrow">
                    {r.tool} / {r.operation}
                  </span>
                  <h2>
                    {r.arguments.amount
                      ? `$${r.arguments.amount.toLocaleString()} USD · Synthetic payment`
                      : r.operation}
                  </h2>
                  <p>
                    {r.agent?.name} · requested {date(r.createdAt)}
                  </p>
                </div>
                <Badge status={r.status} />
                <ArrowUpRight size={19} />
              </button>
            ))}
          {!query.data.filter(
            (r: any) =>
              filter === "all" ||
              (filter === "pending"
                ? r.status === "APPROVAL_REQUIRED"
                : r.status !== "APPROVAL_REQUIRED"),
          ).length && <Empty>No {filter} approval requests.</Empty>}
        </div>
      )}
      {selected && (
        <Modal
          title="Review protected action"
          wide
          onClose={() => setSelected(null)}
        >
          <div className="approval-review-top">
            <div>
              <p className="eyebrow">SYNTHETIC TRANSACTION</p>
              <h2>
                {selected.arguments.amount
                  ? "$" + selected.arguments.amount.toLocaleString() + " USD"
                  : selected.operation}
              </h2>
            </div>
            <Badge status={selected.status} />
          </div>
          <div className="detail-summary">
            <span>
              <b>Operation</b>
              <code>{selected.operation}</code>
            </span>
            <span>
              <b>Expires</b>
              {date(selected.approvalExpiresAt)}
            </span>
            <span>
              <b>Policy version</b>v{selected.policyVersion}
            </span>
          </div>
          <h3>Proposed change</h3>
          <div className="diff-grid">
            <div>
              <span className="eyebrow">BEFORE</span>
              <Json
                value={selected.preview?.changes?.before ?? selected.arguments}
              />
            </div>
            <div>
              <span className="eyebrow">AFTER APPROVAL</span>
              <Json
                value={selected.preview?.changes?.after ?? selected.arguments}
              />
            </div>
          </div>
          <h3>Policy justification</h3>
          <p className="description">
            {selected.decision.explanations.join(" ")}
          </p>
          <p className="caption">PAYLOAD BINDING</p>
          <code className="hash">{selected.payloadHash}</code>
          <div className="callout">
            <Lock size={18} />
            <p>
              {!approve
                ? "Your role cannot approve. Sign in as an approver to review."
                : selected.initiatedBy === session.user.userId
                  ? "You initiated this request. An independent approver is required."
                  : "Approvers and administrators may decide. Current identity, scope, policy, and record version are checked again."}
            </p>
          </div>
          <div className="modal-actions">
            <Button
              secondary
              loading={busy}
              disabled={
                !approve ||
                selected.status !== "APPROVAL_REQUIRED" ||
                selected.initiatedBy === session.user.userId
              }
              onClick={() => decide("reject")}
            >
              Reject action
            </Button>
            <Button
              loading={busy}
              disabled={
                !approve ||
                selected.status !== "APPROVAL_REQUIRED" ||
                selected.initiatedBy === session.user.userId
              }
              onClick={() => decide("approve")}
            >
              <Check size={15} />
              Approve & execute
            </Button>
          </div>
          {error && <Failure error={error} />}
        </Modal>
      )}
    </>
  );
}
function Policies() {
  const query = useApi("/policies");
  const create = useAction("/policies");
  const [selected, setSelected] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [simulation, setSimulation] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const permission = allowed("policy");
  const flash = useContext(Flash);
  const active = query.data?.find((p: any) => p.active);
  async function simulate(p: any) {
    setBusy(true);
    setError("");
    try {
      setSimulation(
        await request("/policies/" + p.id + "/simulate", "POST", {}),
      );
      await client.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="DETERMINISTIC AUTHORIZATION"
        title="Policy is the authority."
        description="Versioned rules. Deny-first semantics. Simulate the impact before you publish."
        action={
          <Button
            disabled={!permission}
            onClick={() => {
              setSelected(active);
              setEditing(true);
            }}
          >
            <Plus size={16} />
            Create policy draft
          </Button>
        }
      />
      <div className="policy-semantics">
        <span>
          <Shield size={15} />
          DEFAULT DENY
        </span>
        <ArrowRight size={14} />
        <b>Deny</b>
        <span>overrides</span>
        <b>Approval</b>
        <span>overrides</span>
        <b>Permit</b>
        <span className="caption">
          Priority controls display order, never the security precedence.
        </span>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <div className="policy-layout">
          <section className="panel">
            <div className="panel-header">
              <h2>Version library</h2>
              <span className="caption">{query.data.length} VERSIONS</span>
            </div>
            {query.data.map((p: any) => (
              <button
                key={p.id}
                className={
                  "policy-version " + (selected?.id === p.id ? "selected" : "")
                }
                onClick={() => {
                  setSelected(p);
                  setSimulation(null);
                  setError("");
                }}
              >
                <span className="version-num">v{p.version}</span>
                <div>
                  <b>{p.name}</b>
                  <p>
                    {p.rules.length} rules · {date(p.createdAt)}
                  </p>
                </div>
                <Badge
                  status={
                    p.active ? "ACTIVE" : p.validated ? "VALIDATED" : "DRAFT"
                  }
                />
              </button>
            ))}
          </section>
          <section className="panel policy-detail">
            <div className="panel-header">
              <div>
                <p className="eyebrow">
                  {(selected ?? active)?.active
                    ? "ENFORCED POLICY"
                    : "POLICY VERSION"}
                </p>
                <h2>{(selected ?? active)?.name}</h2>
              </div>
              <span className="outline-label">
                v{(selected ?? active)?.version}
              </span>
            </div>
            <div className="panel-body">
              <p className="description">{(selected ?? active)?.description}</p>
              {(selected ?? active)?.rules
                .slice()
                .sort((a: any, b: any) => b.priority - a.priority)
                .map((r: any) => (
                  <div className="rule-row" key={r.id}>
                    <span className={"rule-effect " + r.effect.toLowerCase()}>
                      {r.effect === "DENY" ? (
                        <X size={15} />
                      ) : r.effect === "APPROVAL" ? (
                        <Clock size={15} />
                      ) : (
                        <Check size={15} />
                      )}
                    </span>
                    <div>
                      <b>{r.name}</b>
                      <code>
                        {r.tool} / {r.operation}
                        {r.minAmount > 0 ? " · min $" + r.minAmount : ""}
                        {r.maxAmount < 100000000
                          ? " · max $" + r.maxAmount
                          : ""}
                        {r.classification !== "*"
                          ? " · " + r.classification
                          : ""}
                      </code>
                      <p>{r.explanation}</p>
                    </div>
                    <span className="caption">{r.effect}</span>
                  </div>
                ))}
              <div className="modal-actions">
                <Button
                  secondary
                  disabled={!permission}
                  loading={busy}
                  onClick={() => simulate(selected ?? active)}
                >
                  <Workflow size={15} />
                  Simulate impact
                </Button>
                <Button
                  secondary
                  disabled={!permission}
                  onClick={() => {
                    setSelected(selected ?? active);
                    setEditing(true);
                  }}
                >
                  Copy as new draft
                </Button>
                {selected && !selected.active && (
                  <Button
                    disabled={!permission || !selected.validated}
                    title={
                      !selected.validated
                        ? "Run a successful simulation first"
                        : undefined
                    }
                    onClick={async () => {
                      try {
                        await request(
                          "/policies/" + selected.id + "/publish",
                          "POST",
                          {},
                        );
                        await client.invalidateQueries();
                        setSelected(null);
                        flash(
                          "Policy published. Future requests use the new version.",
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Publish v{selected.version}
                  </Button>
                )}
              </div>
              {error && <Failure error={error} />}
            </div>
          </section>
        </div>
      )}
      {simulation && (
        <section className="panel simulation">
          <div className="panel-header">
            <div>
              <p className="eyebrow">REAL OPA EVALUATIONS</p>
              <h2>
                Policy impact · v{simulation.activeVersion} → v
                {simulation.candidateVersion}
              </h2>
            </div>
            <span className="outline-label">
              {simulation.results.filter((r: any) => r.changed).length} CHANGED
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Active</th>
                  <th>Candidate</th>
                  <th>Impact</th>
                </tr>
              </thead>
              <tbody>
                {simulation.results.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <code>{r.operation}</code>
                      <small>{r.id}</small>
                    </td>
                    <td>{r.before}</td>
                    <td>{r.after}</td>
                    <td>
                      {r.riskyExpansion ? (
                        <b>Permission expansion</b>
                      ) : r.changed ? (
                        "Decision changed"
                      ) : (
                        "Unchanged"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {simulation.conflicts.length > 0 && (
            <div className="callout">
              <TriangleAlert size={18} />
              <p>
                {simulation.conflicts.length} overlapping rule pairs. Deny
                overrides approval overrides permit. Inspect matching conditions
                before publication.
              </p>
            </div>
          )}
        </section>
      )}
      {editing && (
        <PolicyEditor
          initial={selected ?? active}
          busy={create.isPending}
          error={create.error}
          onClose={() => setEditing(false)}
          onSave={async (data) => {
            try {
              const draft = await create.mutateAsync(data);
              setSelected(draft);
              setEditing(false);
              setSimulation(null);
              flash("Draft saved. Run the impact simulator before publishing.");
            } catch {
              /* Error is rendered from the mutation state. */
            }
          }}
        />
      )}
    </>
  );
}
function PolicyEditor({
  initial,
  onClose,
  onSave,
  busy,
  error,
}: {
  initial: any;
  onClose: () => void;
  onSave: (data: any) => void;
  busy: boolean;
  error: unknown;
}) {
  const [name, setName] = useState(initial?.name + " · revision");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [rules, setRules] = useState<any[]>(initial?.rules ?? []);
  const [localError, setLocalError] = useState("");
  const change = (i: number, key: string, value: any) =>
    setRules(rules.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
  return (
    <Modal wide title="Visual policy editor" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setLocalError("");
            const validated = rules.map((r) => ruleSchema.parse(r));
            onSave({ name, description, rules: validated });
          } catch (e) {
            setLocalError((e as Error).message);
          }
        }}
      >
        <div className="form-grid">
          <label>
            Policy name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={3}
              maxLength={120}
            />
          </label>
          <label>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
            />
          </label>
        </div>
        <p className="caption">
          Deny-first precedence is fixed. Rules are structured data, never
          executable code. Hours are UTC.
        </p>
        {rules.map((r, i) => (
          <fieldset className="rule-editor" key={r.id}>
            <legend>{r.id}</legend>
            <div className="rule-editor-heading">
              <input
                aria-label="Rule name"
                value={r.name}
                onChange={(e) => change(i, "name", e.target.value)}
                required
              />
              <button
                className="icon-button"
                type="button"
                aria-label={"Remove " + r.name}
                onClick={() => setRules(rules.filter((_, n) => i !== n))}
              >
                <X size={16} />
              </button>
            </div>
            <div className="form-grid three">
              <label>
                Effect
                <select
                  value={r.effect}
                  onChange={(e) => change(i, "effect", e.target.value)}
                >
                  {["PERMIT", "DENY", "APPROVAL"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Tool
                <select
                  value={r.tool}
                  onChange={(e) => change(i, "tool", e.target.value)}
                >
                  {["*", "crm", "finance", "vault"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Operation
                <input
                  value={r.operation}
                  onChange={(e) => change(i, "operation", e.target.value)}
                  required
                />
              </label>
              <label>
                Agent ID or *
                <input
                  value={r.agentId}
                  onChange={(e) => change(i, "agentId", e.target.value)}
                  required
                />
              </label>
              <label>
                Environment
                <input
                  value={r.environment}
                  onChange={(e) => change(i, "environment", e.target.value)}
                  required
                />
              </label>
              <label>
                Classification
                <select
                  value={r.classification}
                  onChange={(e) => change(i, "classification", e.target.value)}
                >
                  {["*", "public", "internal", "confidential"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              {[
                ["minAmount", "Min amount", 0, 100000000],
                ["maxAmount", "Max amount", 0, 100000000],
                ["startHour", "Start hour UTC", 0, 23],
                ["endHour", "End hour UTC", 1, 24],
                ["priority", "Display priority", 0, 1000],
              ].map(([key, title, min, max]) => (
                <label key={key}>
                  {title}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={r[key]}
                    onChange={(e) =>
                      change(i, String(key), Number(e.target.value))
                    }
                    required
                  />
                </label>
              ))}
            </div>
            <label>
              Explanation
              <input
                value={r.explanation}
                onChange={(e) => change(i, "explanation", e.target.value)}
                required
                maxLength={500}
              />
            </label>
          </fieldset>
        ))}
        <div className="modal-actions">
          <Button
            type="button"
            secondary
            onClick={() =>
              setRules([
                ...rules,
                ruleSchema.parse({
                  id: "rule-" + crypto.randomUUID().slice(0, 8),
                  name: "New scoped rule",
                  effect: "DENY",
                  tool: "crm",
                  operation: "customer.export",
                  explanation: "Describe the deterministic control.",
                }),
              ])
            }
          >
            <Plus size={14} />
            Add rule
          </Button>
          <Button loading={busy} disabled={rules.length === 0}>
            Save draft
          </Button>
        </div>
        {!!(localError || error) && <Failure error={localError || error} />}
      </form>
    </Modal>
  );
}
function Inspector({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useApi("/invocations/" + id);
  const aiConfig = useApi<{ geminiEnabled: boolean }>("/config");
  const [graph, setGraph] = useState(false);
  const [explanation, setExplanation] = useState<any>(null);
  const explain = useAction("/explain");
  return (
    <Modal wide title="Invocation evidence" onClose={onClose}>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <>
          <div className="inspector-title">
            <div>
              <p className="eyebrow">{query.data.agent?.name}</p>
              <h2>{query.data.operation}</h2>
              <code>{query.data.id}</code>
            </div>
            <Badge status={query.data.status} />
          </div>
          <TraceRail trace={query.data.trace} />
          <div className="detail-summary">
            <span>
              <b>Recorded</b>
              {date(query.data.createdAt)}
            </span>
            <span>
              <b>Policy</b>v{query.data.policyVersion}
            </span>
            <span>
              <b>Correlation ID</b>
              <code>{query.data.correlationId.slice(0, 18)}…</code>
            </span>
          </div>
          <h3>Deterministic explanation</h3>
          <p className="description">
            {query.data.decision.explanations.join(" ") ||
              query.data.decision.codes.join(", ")}
          </p>
          <div className="modal-actions">
            <Button secondary onClick={() => setGraph(!graph)}>
              <Workflow size={14} />
              {graph ? "Hide" : "Show"} decision graph
            </Button>
            <Button
              secondary
              onClick={() => download("agentfence-" + id + ".json", query.data)}
            >
              <Download size={14} />
              Export redacted evidence
            </Button>
            <Button
              secondary
              loading={explain.isPending}
              onClick={() =>
                explain.mutate(
                  { invocationId: id, consent: false },
                  { onSuccess: setExplanation },
                )
              }
            >
              Explain decision
            </Button>
            {aiConfig.data?.geminiEnabled && (
              <Button
                secondary
                loading={explain.isPending}
                onClick={() =>
                  explain.mutate(
                    { invocationId: id, consent: true },
                    { onSuccess: setExplanation },
                  )
                }
              >
                I consent — explain with Gemini
              </Button>
            )}
          </div>
          {aiConfig.data?.geminiEnabled && (
            <p className="description">
              The Gemini option shares this decision's redacted evidence with
              Google to explain the recorded outcome.
            </p>
          )}
          {explain.error && <Failure error={explain.error} />}
          {graph && (
            <Suspense fallback={<Loading />}>
              <DecisionGraph trace={query.data.trace} />
            </Suspense>
          )}
          {explanation && (
            <div className="callout">
              <BookOpen size={18} />
              <p>
                {explanation.text}
                <small>Source: {explanation.source}</small>
                {explanation.aiUnavailable && (
                  <small>
                    Gemini is unavailable. Showing the recorded explanation.
                  </small>
                )}
              </p>
            </div>
          )}
          <div className="diff-grid">
            <section>
              <h3>Redacted request</h3>
              <Json value={query.data.arguments} />
            </section>
            <section>
              <h3>Result / proposed change</h3>
              <Json value={query.data.result ?? query.data.preview} />
            </section>
          </div>
          <h3>Audit trail</h3>
          {query.data.events.map((e: any) => (
            <div className="audit-detail" key={e.id}>
              <b>
                #{e.sequence} · {label(e.type)}
              </b>
              <span>{date(e.createdAt)}</span>
              <code className="hash">{e.hash}</code>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
function Investigations() {
  const loc = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [tool, setTool] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const [verified, setVerified] = useState<any>(null);
  const [error, setError] = useState("");
  const agentId = new URLSearchParams(loc.search).get("agentId");
  const params = new URLSearchParams({
    page: String(page),
    search,
    ...(status ? { status } : {}),
    ...(tool ? { tool } : {}),
    ...(agentId ? { agentId } : {}),
  });
  const query = useApi("/invocations?" + params);
  async function verify() {
    try {
      setVerified(await request("/audit/verify"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Heading
        eyebrow="SECURITY INVESTIGATIONS"
        title="Every decision leaves evidence."
        description="Trace an invocation from identity to execution. Inspect the record. Verify the chain."
        action={
          <Button secondary onClick={verify}>
            <ShieldCheck size={16} />
            Verify audit chain
          </Button>
        }
      />
      {verified && (
        <div className="verification">
          <ShieldCheck size={22} />
          <div>
            <b>
              {verified.valid
                ? "Audit chain verified"
                : "Integrity failure detected"}
            </b>
            <p>
              {verified.checked} events checked
              {verified.brokenAt ? " · mismatch at #" + verified.brokenAt : ""}.
              HMAC signatures and canonical hash links verified against the
              stored head.
            </p>
          </div>
        </div>
      )}
      <div className="filter-bar">
        <label className="inline-search">
          <Search size={16} />
          <input
            aria-label="Search invocations"
            placeholder="Search operation or invocation ID…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label="Decision filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All decisions</option>
          {[
            "EXECUTED",
            "DENIED",
            "APPROVAL_REQUIRED",
            "REJECTED",
            "EXPIRED",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Tool filter"
          value={tool}
          onChange={(e) => {
            setTool(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All tools</option>
          <option>crm</option>
          <option>finance</option>
          <option>vault</option>
        </select>
        <Button
          secondary
          onClick={async () => {
            try {
              download("agentfence-audit.json", await request("/audit/export"));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <FileJson size={15} />
          Export audit
        </Button>
      </div>
      {agentId && (
        <p className="caption">
          FILTERED TO AGENT {agentId} ·{" "}
          <Link to="/app/investigations">Clear filter</Link>
        </p>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <section className="panel">
          <InvocationTable items={query.data.items} onSelect={setSelected} />
          <div className="pagination">
            <span>{query.data.total} recorded invocations</span>
            <Button
              secondary
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              secondary
              disabled={page * 25 >= query.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </section>
      )}
      {error && <Failure error={error} />}
      {selected && <Inspector id={selected} onClose={() => setSelected("")} />}
    </>
  );
}
function Lab() {
  const query = useApi("/lab");
  const action = useAction("/lab");
  const permission = allowed("lab");
  const [selected, setSelected] = useState<any>(null);
  const run = selected ?? query.data?.[0];
  const results = run?.results?.results ?? [];
  return (
    <>
      <Heading
        eyebrow="CONTROLLED ADVERSARIAL EVALUATION"
        title="Test the boundary."
        description="Repeatable synthetic attacks against the real gateway, in an isolated workspace."
        action={
          <Button
            disabled={!permission}
            loading={action.isPending}
            onClick={async () => {
              try {
                setSelected(await action.mutateAsync({}));
              } catch {
                /* Error is rendered from the mutation state. */
              }
            }}
          >
            <FlaskConical size={16} />
            Run security evaluation
          </Button>
        }
      />
      <section className="lab-banner">
        <div>
          <span className="eyebrow">SECURITY LAB / SEED REVISION 1</span>
          <h2>
            Trust a control
            <br />
            you can reproduce.
          </h2>
          <p>
            No third-party certification. These are bounded regression
            experiments with inspectable evidence.
          </p>
        </div>
        <div className="lab-graphic">
          <Shield size={85} strokeWidth={0.7} />
          <span>
            INDEPENDENT
            <br />
            OF THE MODEL
          </span>
        </div>
      </section>
      {action.isPending && (
        <div className="callout">
          <LoaderCircle className="spin" size={20} />
          <p>
            Seeding an isolated workspace and executing real gateway scenarios.
            Results will appear after the backend finishes.
          </p>
        </div>
      )}
      {action.error && <Failure error={action.error} />}
      <div className="metrics-grid three">
        {[
          ["Scenarios evaluated", results.length],
          ["Controls passed", results.filter((r: any) => r.passed).length],
          ["Findings", results.filter((r: any) => !r.passed).length],
        ].map(([name, value]) => (
          <div className="metric" key={name}>
            <span>{name}</span>
            <strong>{run ? value : "—"}</strong>
            <small>
              {run
                ? "Recorded " + date(run.createdAt)
                : "No evaluation has run"}
            </small>
          </div>
        ))}
      </div>
      {run ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Experiment results</h2>
            <Button
              secondary
              onClick={() =>
                download("agentfence-lab-" + run.id + ".json", run)
              }
            >
              <Download size={14} />
              Export run
            </Button>
          </div>
          {results.map((r: any) => (
            <details className="lab-result" key={r.id}>
              <summary>
                <span className="test-icon">
                  {r.passed ? <Check size={15} /> : <X size={15} />}
                </span>
                <div>
                  <b>{r.category}</b>
                  <code>{r.id}</code>
                </div>
                <span className="caption">{r.passed ? "PASS" : "FAIL"}</span>
                <ChevronDown size={15} />
              </summary>
              <div className="lab-result-content">
                <p>
                  Expected: <b>{r.expected}</b> · Actual: <b>{r.actual}</b>
                </p>
                {r.evidence && <Json value={r.evidence} />}
              </div>
            </details>
          ))}
        </section>
      ) : (
        <Empty>Run an evaluation to generate findings and evidence.</Empty>
      )}
      {query.data?.length > 1 && (
        <div className="panel history">
          <h3>Evaluation history</h3>
          {query.data.map((r: any) => (
            <button
              className="history-row"
              key={r.id}
              onClick={() => setSelected(r)}
            >
              <code>{r.id.slice(0, 12)}</code>
              <span>{date(r.createdAt)}</span>
              <ArrowUpRight size={15} />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
function Connectors() {
  const query = useApi("/connectors");
  const [selected, setSelected] = useState<any>(null);
  return (
    <>
      <Heading
        eyebrow="THE CONTROLLED EXECUTION SURFACE"
        title="Tools, behind the fence."
        description="Three persistent synthetic systems. One authorization boundary. No arbitrary destinations."
      />
      <div className="connector-list">
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <Failure error={query.error} />
        ) : (
          query.data.map((c: any, i: number) => (
            <section className="connector-card" key={c.tool}>
              <div className="connector-number">0{i + 1}</div>
              <div className="connector-main">
                <div className="connector-title">
                  <span className="agent-glyph">
                    {i === 0 ? (
                      <Database size={23} />
                    ) : i === 1 ? (
                      <Activity size={23} />
                    ) : (
                      <FileJson size={23} />
                    )}
                  </span>
                  <Badge status="SYNTHETIC" />
                </div>
                <h2>{c.name}</h2>
                <p>
                  {i === 0
                    ? "Customer records, scoped search, company updates, and support notes."
                    : i === 1
                      ? "Invoice lookup, bounded synthetic payments, and transaction history."
                      : "Classification-aware document access and protected extraction boundaries."}
                </p>
                <div className="connector-records">
                  {c.records.map((r: any) => (
                    <span key={r.kind}>
                      <b>{r._count}</b>
                      {r.kind} records
                    </span>
                  ))}
                </div>
                <div className="connector-actions">
                  <button className="text-link" onClick={() => setSelected(c)}>
                    Inspect contract <ArrowUpRight size={14} />
                  </button>
                  <Link className="text-link" to="/app/playground">
                    Try in gateway <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </section>
          ))
        )}
      </div>
      <div className="callout">
        <Lock size={20} />
        <p>
          Connectors are internal backend modules. There are no direct execution
          endpoints, arbitrary URLs, shell commands, or unrestricted SQL
          operations.
        </p>
      </div>
      {selected && (
        <Modal
          title={selected.name + " · contract"}
          onClose={() => setSelected(null)}
        >
          <p className="description">
            All operations are schema-validated, capability-scoped,
            policy-evaluated, and executed in a bounded database transaction.
          </p>
          <Json value={selected} />
        </Modal>
      )}
    </>
  );
}
function Analytics() {
  const query = useApi("/analytics");
  if (query.isPending) return <Loading />;
  if (query.error) return <Failure error={query.error} />;
  const d = query.data;
  const sorted = [...d.latencies].sort((a: number, b: number) => a - b);
  const percentile = (p: number) =>
    sorted.length
      ? sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * p))
        ].toFixed(2) + " ms"
      : "Unavailable";
  return (
    <>
      <Heading
        eyebrow="MEASURED, NEVER INVENTED"
        title="Read the signal."
        description="Security outcomes computed from your stored workspace invocations."
      />
      <div className="metrics-grid three">
        {[
          ["Recorded invocations", d.total],
          ["Recorded trace p50", percentile(0.5)],
          ["Recorded trace p95", percentile(0.95)],
        ].map(([name, value]) => (
          <div className="metric" key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
            <small>Across {d.total} stored requests</small>
          </div>
        ))}
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Authorization outcomes</h2>
            <span className="caption">ALL RECORDED REQUESTS</span>
          </div>
          <div className="bar-chart">
            {d.outcomes.length ? (
              d.outcomes.map((o: any) => (
                <div key={o.status}>
                  <div className="bar-label">
                    <Badge status={o.status} />
                    <b>{o.count}</b>
                  </div>
                  <div className="bar-track">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: (o.count / d.total) * 100 + "%" }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <Empty>No recorded outcomes yet.</Empty>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Invocations by tool</h2>
            <Plug size={18} />
          </div>
          <div className="tool-volume">
            {d.byTool.map((c: any) => (
              <div key={c.tool}>
                <span>{c.tool}</span>
                <div className="volume-dots">
                  {Array.from({ length: 20 }, (_, i) => (
                    <i
                      className={
                        i < Math.ceil((c.count / Math.max(d.total, 1)) * 20)
                          ? "filled"
                          : ""
                      }
                      key={i}
                    />
                  ))}
                </div>
                <b>{c.count}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="callout">
        <ChartNoAxesCombined size={20} />
        <p>
          Trace latency is the sum of backend stage durations, not a controlled
          benchmark. Sample size includes stored approvals and denials. Run{" "}
          <code>pnpm benchmark</code> for reproducible p50/p95/p99 measurements,
          methodology, and environment details.
        </p>
      </div>
    </>
  );
}
const sdkExample = `import { AgentFenceClient } from '@agentfence/sdk';\n\nconst fence = new AgentFenceClient({\n  baseUrl: process.env.AGENTFENCE_URL!,\n  apiKey: process.env.AGENTFENCE_AGENT_KEY!\n});\n\nconst result = await fence.invoke({\n  tool: 'crm',\n  operation: 'customer.read',\n  arguments: { customerId: 'customer_001' },\n  idempotencyKey: 'customer-lookup-001'\n});\n\nif (result.status === 'APPROVAL_REQUIRED') {\n  // A separate human reviews the persisted request.\n  console.log(result.id);\n}`;
function Developer() {
  const flash = useContext(Flash);
  return (
    <>
      <Heading
        eyebrow="DEVELOPER WORKSPACE"
        title="One boundary. A clear contract."
        description="Connect an agent to the gateway with a short-lived, scoped machine credential."
      />
      <div className="developer-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>TypeScript SDK</h2>
            <Button
              secondary
              onClick={async () => {
                await navigator.clipboard.writeText(sdkExample);
                flash("SDK example copied.");
              }}
            >
              <Copy size={14} />
              Copy example
            </Button>
          </div>
          <pre className="sdk-code">{sdkExample}</pre>
        </section>
        <div>
          <section className="panel">
            <div className="panel-header">
              <h2>Integration checklist</h2>
              <Terminal size={18} />
            </div>
            <ol className="integration-steps">
              <li>
                <b>Register an agent</b>
                <span>New identities have zero capabilities.</span>
              </li>
              <li>
                <b>Grant the smallest scope</b>
                <span>
                  Tool, operation, resource, classification, and expiration.
                </span>
              </li>
              <li>
                <b>Issue a credential</b>
                <span>Copy the secret once. Keep it server-side.</span>
              </li>
              <li>
                <b>Invoke the gateway</b>
                <span>
                  Use a unique idempotency key for each intended action.
                </span>
              </li>
              <li>
                <b>Inspect the evidence</b>
                <span>
                  Handle denials and approval requirements explicitly.
                </span>
              </li>
            </ol>
          </section>
          <div className="callout">
            <Lock size={19} />
            <p>
              The SDK sends machine credentials to{" "}
              <code>POST /api/v1/invoke</code>. Cookie-authenticated playground
              requests use the same gateway service.
            </p>
          </div>
        </div>
      </div>
      <div className="api-contracts">
        {[
          ["Authentication", "Authorization: Bearer <scoped-key>"],
          ["Correlation", "X-Request-ID returned by the gateway"],
          ["Idempotency", "Same key + payload returns the original invocation"],
          ["Policy unavailable", "DENIED · POLICY_ENGINE_UNAVAILABLE"],
          ["Approval required", "HTTP 202 · APPROVAL_REQUIRED"],
          ["Authorization denied", "HTTP 403 · DENIED"],
        ].map(([a, b]) => (
          <div key={a}>
            <span>{a}</span>
            <code>{b}</code>
          </div>
        ))}
      </div>
      <Link to="/docs" className="text-link">
        Read the public integration guide <ArrowUpRight size={15} />
      </Link>
    </>
  );
}
function WorkspaceSettings() {
  const query = useApi("/settings");
  const session = useContext(Session);
  const edit = allowed("members");
  const update = useAction("/settings", "PATCH");
  const client = useQueryClient();
  const flash = useContext(Flash);
  const [error, setError] = useState("");
  return (
    <>
      <Heading
        eyebrow="WORKSPACE & ACCESS"
        title="The controls behind the control plane."
        description="Workspace identity, role boundaries, and optional assistance configuration."
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} />
      ) : (
        <>
          <section className="settings-section">
            <div>
              <h2>Workspace profile</h2>
              <p>All access and evidence are bound to this workspace.</p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await update.mutateAsync({ name: f.get("name") });
                  flash("Workspace name updated.");
                } catch {
                  /* Error is rendered from the mutation state. */
                }
              }}
            >
              <label>
                Workspace name
                <input
                  name="name"
                  defaultValue={query.data.workspace.name}
                  required
                  minLength={3}
                  disabled={!edit}
                />
              </label>
              <div className="detail-summary">
                <span>
                  <b>Workspace ID</b>
                  <code>{query.data.workspace.id}</code>
                </span>
                <span>
                  <b>Environment</b>
                  {query.data.workspace.environment}
                </span>
              </div>
              <Button loading={update.isPending} disabled={!edit}>
                Save workspace
              </Button>
              {!edit && (
                <p className="caption">
                  Owner or administrator permission required.
                </p>
              )}
              {update.error && <Failure error={update.error} />}
            </form>
          </section>
          <section className="settings-section">
            <div>
              <h2>People & permissions</h2>
              <p>
                Approvers have no policy or agent administration privileges.
              </p>
            </div>
            <div className="member-list">
              {query.data.members.map((m: any) => (
                <div key={m.id}>
                  <span className="user-avatar">
                    {m.user.name
                      .split(" ")
                      .map((s: string) => s[0])
                      .join("")}
                  </span>
                  <section>
                    <b>{m.user.name}</b>
                    <small>{m.user.email}</small>
                  </section>
                  <select
                    aria-label={"Role for " + m.user.name}
                    value={m.role}
                    disabled={
                      !edit ||
                      m.role === "OWNER" ||
                      m.userId === session.user.userId
                    }
                    onChange={async (e) => {
                      try {
                        await request("/members/" + m.id, "PATCH", {
                          role: e.target.value,
                        });
                        await client.invalidateQueries();
                        flash("Role updated.");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {[
                      "OWNER",
                      "ADMIN",
                      "SECURITY_OPERATOR",
                      "APPROVER",
                      "AUDITOR",
                      "VIEWER",
                    ].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
              ))}
              {error && <Failure error={error} />}
            </div>
          </section>
          <section className="settings-section">
            <div>
              <h2>AI assistance</h2>
              <p>Optional explanations. Never an authorization dependency.</p>
            </div>
            <div className="assistance-status">
              <Badge
                status={query.data.gemini.enabled ? "ENABLED" : "UNAVAILABLE"}
              />
              <h3>
                {query.data.gemini.enabled
                  ? "Gemini is configured"
                  : "Deterministic explanations are active"}
              </h3>
              <p>
                Gemini is configured through server environment variables. Open
                an invocation and choose “I consent — explain with Gemini” to
                share its redacted evidence for an optional explanation.
              </p>
              <code>GEMINI_ENABLED={String(query.data.gemini.enabled)}</code>
            </div>
          </section>
          <section className="settings-section">
            <div>
              <h2>Change password</h2>
              <p>Changing your password expires all your sessions.</p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await request(
                    "/auth/password",
                    "POST",
                    Object.fromEntries(f),
                  );
                  window.location.assign("/login");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <label>
                Current password
                <input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={14}
                  autoComplete="new-password"
                />
              </label>
              <Button>Change password & sign out</Button>
              {error && <Failure error={error} />}
            </form>
          </section>
        </>
      )}
    </>
  );
}
function PublicDocs({ developer = false }: { developer?: boolean }) {
  return (
    <div className="landing docs-page">
      <header className="public-nav">
        <Brand />
        <nav>
          <Link to={developer ? "/architecture" : "/docs"}>
            {developer ? "Architecture" : "Developer guide"}
          </Link>
          <Link to="/app/overview" className="button secondary">
            Open workspace <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>
      <main className="docs-content">
        <p className="eyebrow">
          {developer
            ? "INTEGRATE WITH AGENTFENCE"
            : "ARCHITECTURE / THE TRUST BOUNDARY"}
        </p>
        <h1>
          {developer
            ? "Built for the point\nof execution."
            : "The model is never\nthe authority."}
        </h1>
        <p className="description">
          AgentFence separates agent intent from deterministic authorization.
          Only allowlisted synthetic connectors execute, after identity,
          capability, policy, and approval checks.
        </p>
        {developer ? (
          <>
            <h2>Invoke from TypeScript</h2>
            <pre className="sdk-code">{sdkExample}</pre>
            <h2>Response states</h2>
            <p>
              EXECUTED confirms a committed synthetic operation. DENIED confirms
              that authorization blocked it. APPROVAL_REQUIRED persists the
              exact payload for an independent human review. Expected denials
              are typed SDK results. Invalid credentials and malformed requests
              raise SDK errors.
            </p>
            <h2>Safe retries</h2>
            <p>
              Use the same idempotency key and exact payload when retrying a
              request after a network error. A changed payload with the same key
              is rejected with HTTP 409. The SDK retries only transient
              transport and server failures using that same key.
            </p>
            <h2>Local setup</h2>
            <pre className="json">
              pnpm install{"\n"}pnpm setup{"\n"}pnpm infra:local{"\n"}# In
              another terminal{"\n"}pnpm db:generate{"\n"}pnpm db:migrate{"\n"}
              pnpm db:seed{"\n"}pnpm dev
            </pre>
          </>
        ) : (
          <>
            <div className="docs-flow">
              {[
                "Authenticate identity",
                "Verify capability",
                "Validate arguments",
                "Evaluate OPA policy",
                "Review if required",
                "Revalidate & execute",
                "Append signed evidence",
              ].map((s, i) => (
                <div key={s}>
                  <span>0{i + 1}</span>
                  <b>{s}</b>
                  {i < 6 && <ArrowRight size={17} />}
                </div>
              ))}
            </div>
            <h2>A single enforcement boundary</h2>
            <p>
              Machine API requests and human playground requests use the same
              backend gateway. There are no public connector execution routes.
              Workspace context comes from authentication, never request
              arguments.
            </p>
            <h2>Transactional synthetic execution</h2>
            <p>
              The gateway locks the workspace row, checks idempotency, evaluates
              policy, executes the connector, and records an invocation with
              signed audit evidence in one PostgreSQL transaction. This
              serializes workspace mutations and avoids duplicate synthetic side
              effects.
            </p>
            <h2>Human approval is not authorization</h2>
            <p>
              A review binds to an immutable stored payload hash. An independent
              approver cannot change arguments. The backend checks current
              identity, capability, resource version, approval expiry, and
              policy again. Policy publication requires a new preview.
            </p>
            <h2>Evidence, with explicit limits</h2>
            <p>
              Canonical SHA-256 links and HMAC signatures detect changes
              relative to the current stored chain head. They do not protect
              against total application and signing-key compromise or full
              database snapshot rollback. External checkpoints are a future
              hardening step.
            </p>
            <h2>Portfolio deployment</h2>
            <p>
              All CRM customers, invoices, transactions, and documents are
              fictional. No connector can access real money, external business
              systems, arbitrary networks, or shell commands.
            </p>
          </>
        )}
        <Link to="/login" className="button">
          Explore the workspace <ArrowUpRight size={16} />
        </Link>
      </main>
    </div>
  );
}
