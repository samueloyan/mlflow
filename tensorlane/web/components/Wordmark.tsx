export function Wordmark({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <a className="wordmark" data-tone={tone} href="/overview" aria-label="Tensorlane">
      <span className="lane" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="wordmark-text">tensorlane</span>
    </a>
  );
}
