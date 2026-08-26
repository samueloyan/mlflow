import { Wordmark } from "@/components/Wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Wordmark tone="light" />
        <div>
          <p className="kicker">MLflow compatible</p>
          <h1 style={{ fontSize: 36, lineHeight: 1.15, maxWidth: 520 }}>
            Serious infrastructure for serious AI teams.
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
