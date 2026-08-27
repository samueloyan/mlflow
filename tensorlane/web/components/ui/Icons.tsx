import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const PATHS: Record<string, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  experiments: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" />
    </>
  ),
  runs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8l6 4-6 4V8z" />
    </>
  ),
  models: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5" />
      <path d="M12 12v9" />
      <path d="M12 12L4 7.5" />
    </>
  ),
  datasets: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  traces: (
    <>
      <path d="M6 3v8" />
      <path d="M6 11h6" />
      <path d="M12 11v4h6" />
      <circle cx="6" cy="15" r="2" />
      <circle cx="18" cy="19" r="2" />
      <circle cx="12" cy="7" r="2" />
    </>
  ),
  sessions: (
    <>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </>
  ),
  review: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h4" />
    </>
  ),
  playground: (
    <>
      <path d="M12 3v10" />
      <path d="M8 9l4 4 4-4" />
      <path d="M5 17h14" />
      <path d="M7 21h10" />
    </>
  ),
  mcp: (
    <>
      <rect x="3" y="7" width="7" height="10" rx="1" />
      <rect x="14" y="7" width="7" height="10" rx="1" />
      <path d="M10 12h4" />
    </>
  ),
  evaluations: (
    <>
      <path d="M9 11l3 3 8-8" />
      <path d="M21 12a9 9 0 1 1-3.2-6.9" />
    </>
  ),
  prompts: (
    <>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </>
  ),
  deployments: (
    <>
      <rect x="3" y="4" width="18" height="8" rx="1" />
      <path d="M7 16h10" />
      <path d="M12 12v8" />
    </>
  ),
  monitoring: (
    <>
      <path d="M3 12h4l3-7 4 14 3-7h4" />
    </>
  ),
  alerts: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  reports: (
    <>
      <path d="M7 3h8l5 5v13H7z" />
      <path d="M15 3v5h5" />
      <path d="M9 13h8" />
      <path d="M9 17h5" />
    </>
  ),
  workbench: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
    </>
  ),
  workspaces: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  members: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21 20c0-2.8-2.2-5-5-5" />
    </>
  ),
  keys: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11.5 12.5L21 3" />
      <path d="M16 5l3 3" />
    </>
  ),
  integrations: (
    <>
      <circle cx="7" cy="7" r="3" />
      <circle cx="17" cy="7" r="3" />
      <circle cx="7" cy="17" r="3" />
      <circle cx="17" cy="17" r="3" />
      <path d="M10 7h4M7 10v4M17 10v4M10 17h4" />
    </>
  ),
  usage: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <rect x="7" y="10" width="3" height="6" />
      <rect x="12" y="7" width="3" height="9" />
      <rect x="17" y="12" width="3" height="4" />
    </>
  ),
  cost: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M9.5 9.5C9.5 8 10.6 7 12 7s2.5 1 2.5 2.5S13.4 12 12 12s-2.5 1-2.5 2.5S10.6 17 12 17s2.5-1 2.5-2.5" />
    </>
  ),
  billing: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </>
  ),
  audit: (
    <>
      <path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 13l2 2 4-4" />
    </>
  ),
  approvals: (
    <>
      <path d="M12 3l7 4v6c0 5-3.5 7.5-7 8-3.5-.5-7-3-7-8V7z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  security: (
    <>
      <rect x="6" y="11" width="12" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  retention: (
    <>
      <path d="M4 7h16" />
      <path d="M7 7l1-3h8l1 3" />
      <rect x="6" y="7" width="12" height="14" rx="1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M6.2 17.8l1.4-1.4M16.4 7.6l1.4-1.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  docs: (
    <>
      <path d="M7 3h8l5 5v13H7z" />
      <path d="M15 3v5h5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </>
  ),
  chevron: (
    <>
      <path d="M9 6l6 6-6 6" />
    </>
  ),
  collapse: (
    <>
      <path d="M15 6l-6 6 6 6" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="1" />
      <path d="M4 16V5a1 1 0 0 1 1-1h11" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l7-7 4 4 7-7" />
      <path d="M14 7h7v7" />
    </>
  ),
};

export function Icon({ name, size = 16, ...props }: IconProps & { name: string }) {
  return <Svg size={size} {...props}>{PATHS[name] ?? PATHS.overview}</Svg>;
}
