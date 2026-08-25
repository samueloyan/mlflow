import { Wordmark } from "@/components/Wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Wordmark />
        <div>
          <p className="kicker">MLflow compatible</p>
          <h1 style={{ fontSize: 48, lineHeight: 1.05, maxWidth: 520 }}>
            The control plane for serious AI work.
          </h1>
          <p className="lede">
            Organizations, identity, isolation, and a tracking host the MLflow SDK already
            understands. Experiments stay in the workbench. Membership stays here.
          </p>
        </div>
        <p className="userchip">api.tensorlane.ai</p>
      </section>
      <section className="auth-form">{children}</section>
    </div>
  );
}
