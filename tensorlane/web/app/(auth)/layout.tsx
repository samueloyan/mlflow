import { AuthHostChip } from "@/components/AuthHostChip";
import { Wordmark } from "@/components/Wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Wordmark tone="light" />
        <div>
          <p className="kicker">Tensorlane</p>
          <h1 style={{ fontSize: 36, lineHeight: 1.15, maxWidth: 520 }}>
            Serious infrastructure for serious AI teams.
          </h1>
          <p className="lede">
            Organizations, identity, isolation, and a tracking host your SDK points at.
            Experiments stay in tracking. Membership stays here.
          </p>
        </div>
        <AuthHostChip />
      </section>
      <section className="auth-form">{children}</section>
    </div>
  );
}
