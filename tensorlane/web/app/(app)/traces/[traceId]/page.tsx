"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Drawer } from "@/components/ui/Modal";
import { ErrorState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import { formatMs } from "@/lib/format";
import { useTrackingContext } from "@/lib/useTrackingContext";
import {
  getTrace,
  getTraceArtifact,
  parseDurationMs,
  spanDurationMs,
  spanIO,
  spanType,
  tagMap,
  type TraceInfo,
  type TraceSpan,
} from "@/lib/tracking";

function TraceDetailsInner() {
  const params = useParams<{ traceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useTrackingContext();
  const traceId = decodeURIComponent(params.traceId);
  const view = searchParams.get("view") ?? "timeline";
  const [info, setInfo] = useState<TraceInfo | null>(null);
  const [spans, setSpans] = useState<TraceSpan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TraceSpan | null>(null);

  useEffect(() => {
    if (!ctx || !traceId) return;
    const tracking = ctx;
    let cancelled = false;
    async function load() {
      const result = await getTrace(tracking, traceId);
      if (cancelled) return;
      if (result.ok && result.data.trace) {
        setInfo(result.data.trace.trace_info ?? { trace_id: traceId });
        setSpans(result.data.trace.spans ?? []);
        if ((result.data.trace.spans ?? []).length === 0) {
          const artifact = await getTraceArtifact(tracking, traceId);
          if (artifact.ok) setSpans(artifact.data.spans ?? []);
        }
        return;
      }
      const artifact = await getTraceArtifact(tracking, traceId);
      if (cancelled) return;
      if (artifact.ok && (artifact.data.spans ?? []).length) {
        setInfo({ trace_id: traceId });
        setSpans(artifact.data.spans ?? []);
        return;
      }
      setError(result.ok ? "Trace not found." : result.message);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ctx, traceId]);

  const totalMs = useMemo(() => {
    if (!spans.length) return parseDurationMs(info?.execution_duration) ?? 0;
    return Math.max(...spans.map(spanDurationMs), 0);
  }, [info, spans]);

  const tree = useMemo(() => {
    const byParent = new Map<string, TraceSpan[]>();
    const roots: TraceSpan[] = [];
    for (const span of spans) {
      const parent = span.parent_span_id;
      if (!parent) roots.push(span);
      else {
        const list = byParent.get(parent) ?? [];
        list.push(span);
        byParent.set(parent, list);
      }
    }
    if (roots.length === 0) return spans.map((span) => ({ span, depth: 0 }));
    const ordered: { span: TraceSpan; depth: number }[] = [];
    function walk(span: TraceSpan, depth: number) {
      ordered.push({ span, depth });
      for (const child of byParent.get(span.span_id ?? "") ?? []) walk(child, depth + 1);
    }
    for (const root of roots) walk(root, 0);
    return ordered;
  }, [spans]);

  const minStart = useMemo(() => {
    const starts = spans.map((span) => Number(span.start_time_unix_nano ?? span.start_time ?? 0));
    return Math.min(...starts.filter(Boolean), 0);
  }, [spans]);

  if (error) {
    return (
      <div className="page">
        <ErrorState title="Unable to load this trace." body={error} />
      </div>
    );
  }

  const state = info?.state || info?.status || "UNKNOWN";
  const tone = state === "OK" || state === "SUCCESS" ? "success" : state === "ERROR" ? "danger" : "warning";
  const tokens = info?.trace_metadata?.["mlflow.trace.tokenUsage"] || tagMap(info?.tags)["mlflow.trace.tokenUsage"] || "—";
  const cost = info?.trace_metadata?.cost || tagMap(info?.tags).cost || "—";

  return (
    <div className="page">
      <PageHeader kicker="Trace" title={traceId} lede={info?.name || "Trace debugger"}>
        <StatusBadge label={state} tone={tone} />
      </PageHeader>
      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="card span-3">
          <p className="kicker">Duration</p>
          <div className="metric" style={{ fontSize: 22 }}>
            {info?.execution_duration || formatMs(totalMs)}
          </div>
        </div>
        <div className="card span-3">
          <p className="kicker">Tokens</p>
          <div className="metric" style={{ fontSize: 22 }}>
            {tokens}
          </div>
        </div>
        <div className="card span-3">
          <p className="kicker">Cost</p>
          <div className="metric" style={{ fontSize: 22 }}>
            {cost}
          </div>
        </div>
        <div className="card span-3">
          <p className="kicker">Spans</p>
          <div className="metric" style={{ fontSize: 22 }}>
            {spans.length}
          </div>
        </div>
      </div>

      <Tabs
        items={[
          { id: "timeline", label: "Timeline" },
          { id: "tree", label: "Tree" },
          { id: "waterfall", label: "Waterfall" },
          { id: "raw", label: "Raw" },
        ]}
        value={view}
        onChange={(next) => router.replace(`/traces/${encodeURIComponent(traceId)}?view=${next}`, { scroll: false })}
      />

      <div className="card">
        {spans.length === 0 ? (
          <p className="lede">No spans returned for this trace. The tracking store may still be starting.</p>
        ) : view === "raw" ? (
          <pre className="secret" style={{ maxHeight: 480, overflow: "auto" }}>
            {JSON.stringify({ info, spans }, null, 2)}
          </pre>
        ) : (
          <div className="trace-tree">
            {tree.map(({ span, depth }) => {
                const duration = spanDurationMs(span);
                const start = Number(span.start_time_unix_nano ?? span.start_time ?? 0);
                const left = totalMs ? ((start - minStart) / 1_000_000 / totalMs) * 100 : 0;
                const width = totalMs ? Math.max(2, (duration / totalMs) * 100) : 2;
                return (
                  <button
                    type="button"
                    key={span.span_id ?? span.name}
                    className="trace-span"
                    style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
                    onClick={() => setSelected(span)}
                  >
                    <span style={{ paddingLeft: depth * 16 }}>
                      {span.name} <span className="lede">({spanType(span)})</span>
                    </span>
                    {view !== "tree" ? (
                      <span className="trace-bar">
                        <i style={{ left: `${Math.max(0, left)}%`, width: `${width}%` }} />
                      </span>
                    ) : (
                      <span />
                    )}
                    <span>{formatMs(duration)}</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {selected ? (
        <Drawer title={selected.name ?? "Span"} onClose={() => setSelected(null)}>
          <dl className="kv">
            <dt>Type</dt>
            <dd>{spanType(selected)}</dd>
            <dt>Duration</dt>
            <dd>{formatMs(spanDurationMs(selected))}</dd>
            <dt>Status</dt>
            <dd>{typeof selected.status === "string" ? selected.status : selected.status?.code ?? "—"}</dd>
            <dt>Span ID</dt>
            <dd className="mono">{selected.span_id}</dd>
            <dt>Model</dt>
            <dd>
              {String(
                selected.attributes?.["mlflow.chat.model"] ??
                  selected.attributes?.model ??
                  selected.attributes?.["llm.model"] ??
                  "—",
              )}
            </dd>
            <dt>Tokens</dt>
            <dd>
              {String(
                selected.attributes?.["mlflow.trace.tokenUsage"] ??
                  selected.attributes?.["llm.token_count"] ??
                  selected.attributes?.tokens ??
                  "—",
              )}
            </dd>
            <dt>Cost</dt>
            <dd>{String(selected.attributes?.cost ?? selected.attributes?.["mlflow.span.cost"] ?? "—")}</dd>
          </dl>
          <h3 style={{ marginTop: 16 }}>Input</h3>
          <pre className="secret">{stringify(spanIO(selected).input)}</pre>
          <h3 style={{ marginTop: 16 }}>Output</h3>
          <pre className="secret">{stringify(spanIO(selected).output)}</pre>
          <h3 style={{ marginTop: 16 }}>Metadata</h3>
          <pre className="secret">{stringify(selected.attributes)}</pre>
        </Drawer>
      ) : null}
    </div>
  );
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function TraceDetailsPage() {
  return (
    <Suspense fallback={<div className="page">Loading trace…</div>}>
      <TraceDetailsInner />
    </Suspense>
  );
}
