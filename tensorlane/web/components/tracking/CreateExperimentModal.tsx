"use client";

import { useState } from "react";

import { FormField } from "@/components/ui/FormField";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { createExperiment, type TrackingContext } from "@/lib/tracking";

export function CreateExperimentModal({
  ctx,
  onClose,
  onCreated,
}: {
  ctx: TrackingContext;
  onClose: () => void;
  onCreated: (experimentId: string, name: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter an experiment name.");
      return;
    }
    setError(null);
    setBusy(true);
    const result = await createExperiment(ctx, trimmed);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.push("Experiment created.", "success");
    onCreated(result.data.experiment_id ?? "", trimmed);
  }

  return (
    <Modal
      title="Create experiment"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-experiment" className="btn" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create"}
          </button>
        </>
      }
    >
      <form id="create-experiment" onSubmit={(event) => void submit(event)}>
        <FormField
          label="Name"
          description="A workspace-unique name. The SDK can still create experiments with set_experiment."
          error={error ?? undefined}
        >
          <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
        </FormField>
      </form>
    </Modal>
  );
}
