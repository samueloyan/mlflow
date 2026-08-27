"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { formatEpoch } from "@/lib/format";
import { canWrite } from "@/lib/permissions";
import { useShell } from "@/lib/shell";
import {
  createReviewQueue,
  listReviewQueueItems,
  listReviewQueues,
  searchExperiments,
  type Experiment,
  type ReviewQueue,
  type ReviewQueueItem,
} from "@/lib/tracking";
import { useTrackingContext } from "@/lib/useTrackingContext";

type QueueRow = ReviewQueue & { pending?: number };

export default function ReviewPage() {
  const router = useRouter();
  const { role } = useShell();
  const ctx = useTrackingContext();
  const toast = useToast();
  const writable = canWrite(role);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [queues, setQueues] = useState<QueueRow[]>([]);
  const [selected, setSelected] = useState<QueueRow | null>(null);
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [experimentId, setExperimentId] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!ctx) return;
    setLoading(true);
    const listed = await searchExperiments(ctx);
    if (!listed.ok) {
      setError(listed.message);
      setLoading(false);
      return;
    }
    const nextExperiments = listed.data.experiments ?? [];
    setExperiments(nextExperiments);
    const collected: QueueRow[] = [];
    for (const experiment of nextExperiments) {
      const id = experiment.experiment_id;
      if (!id) continue;
      const result = await listReviewQueues(ctx, id);
      if (!result.ok) continue;
      for (const queue of result.data.review_queues ?? []) {
        collected.push({ ...queue, experiment_id: queue.experiment_id ?? id });
      }
    }
    const withCounts = await Promise.all(
      collected.map(async (queue) => {
        if (!queue.queue_id) return queue;
        const listedItems = await listReviewQueueItems(ctx, queue.queue_id);
        const pending = listedItems.ok
          ? (listedItems.data.items ?? []).filter((item) => (item.status ?? "PENDING") === "PENDING").length
          : 0;
        return { ...queue, pending };
      }),
    );
    setError(null);
    setQueues(withCounts);
    setExperimentId((current) => current || nextExperiments[0]?.experiment_id || "");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [ctx]);

  useEffect(() => {
    if (!ctx || !selected?.queue_id) {
      setItems([]);
      return;
    }
    void listReviewQueueItems(ctx, selected.queue_id).then((result) => {
      setItems(result.ok ? (result.data.items ?? []) : []);
    });
  }, [ctx, selected?.queue_id]);

  const experimentName = useMemo(() => {
    const map = new Map(experiments.map((row) => [row.experiment_id ?? "", row.name ?? row.experiment_id ?? ""]));
    return (id: string | undefined) => (id ? map.get(id) ?? id : "—");
  }, [experiments]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!ctx || !experimentId || !name.trim()) return;
    setSaving(true);
    const result = await createReviewQueue(ctx, { experiment_id: experimentId, name: name.trim(), queue_type: "CUSTOM" });
    setSaving(false);
    if (!result.ok) {
      toast.push(result.message, "error");
      return;
    }
    toast.push("Review queue created.", "success");
    setCreating(false);
    setName("");
    await load();
  }

  return (
    <div className="page">
      <PageHeader
        kicker="AI"
        title="Review"
        lede="Human review queues for traces in this workspace. Assign reviewers, then open a trace to complete it."
      >
        {writable ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            New queue
          </button>
        ) : null}
      </PageHeader>
      <div className="grid">
        <div className="card span-8">
          {error ? (
            <ErrorState title="Unable to load review queues" body={error} onRetry={() => void load()} />
          ) : loading ? (
            <p className="lede">Loading review queues…</p>
          ) : queues.length === 0 ? (
            <EmptyState
              title="No review queues yet"
              body="Create a queue for an experiment, then add traces from the traces page or the tracking UI."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Experiment</th>
                  <th>Type</th>
                  <th>Pending</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((queue) => (
                  <tr
                    key={queue.queue_id ?? queue.name}
                    data-clickable="true"
                    onClick={() => setSelected(queue)}
                  >
                    <td>{queue.name}</td>
                    <td>{experimentName(queue.experiment_id)}</td>
                    <td>
                      <StatusBadge label={queue.queue_type ?? "CUSTOM"} tone="neutral" />
                    </td>
                    <td>{queue.pending ?? 0}</td>
                    <td>{formatEpoch(queue.last_update_time_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card span-4">
          {selected ? (
            <>
              <p className="kicker">Queue</p>
              <h2>{selected.name}</h2>
              <p className="lede">{experimentName(selected.experiment_id)}</p>
              {items.length === 0 ? (
                <p className="lede">No items in this queue yet.</p>
              ) : (
                <ul className="plain-list">
                  {items.map((item) => (
                    <li key={`${item.queue_id}-${item.item_id}`}>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => item.item_id && router.push(`/traces/${item.item_id}`)}
                      >
                        {item.item_id}
                      </button>
                      <StatusBadge
                        label={item.status ?? "PENDING"}
                        tone={item.status === "COMPLETE" ? "success" : item.status === "DECLINED" ? "danger" : "warning"}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {selected.experiment_id ? (
                <p className="lede" style={{ marginTop: 12 }}>
                  <Link href={`/experiments/${selected.experiment_id}?tab=review`}>Open experiment</Link>
                </p>
              ) : null}
            </>
          ) : (
            <p className="lede">Select a queue to inspect items.</p>
          )}
        </div>
      </div>
      {creating ? (
        <Modal
          title="Create review queue"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button type="button" className="btn secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" form="create-review" className="btn" disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Create"}
              </button>
            </>
          }
        >
          <form id="create-review" onSubmit={(event) => void create(event)}>
            <FormField label="Experiment" htmlFor="review-experiment">
              <select
                id="review-experiment"
                value={experimentId}
                onChange={(event) => setExperimentId(event.target.value)}
                required
              >
                {experiments.map((experiment) => (
                  <option key={experiment.experiment_id} value={experiment.experiment_id}>
                    {experiment.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Name" htmlFor="review-name">
              <input id="review-name" value={name} onChange={(event) => setName(event.target.value)} required />
            </FormField>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
