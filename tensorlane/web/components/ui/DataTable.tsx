"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeleton";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  width?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = "Nothing to show",
  emptyBody = "There is no data for the current filters.",
  emptyAction,
  searchable,
  search,
  onSearch,
  searchPlaceholder = "Search",
  filters,
  selectable,
  selected,
  onSelectedChange,
  bulkActions,
  onRowClick,
  pageSize = 25,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: ReactNode;
  searchable?: boolean;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  bulkActions?: ReactNode;
  onRowClick?: (row: T) => void;
  pageSize?: number;
}) {
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const selectedSet = new Set(selected ?? []);
  const visibleColumns = columns.filter((column) => !hidden.has(column.id));

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.id === sort.id);
    if (!column?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = column.sortValue?.(a);
      const bv = column.sortValue?.(b);
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const cmp = av < bv ? -1 : 1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [columns, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function toggleSort(id: string) {
    setSort((current) => {
      if (current?.id !== id) return { id, dir: "asc" };
      if (current.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  }

  function toggleAll() {
    if (!onSelectedChange) return;
    const ids = pageRows.map(rowKey);
    const allSelected = ids.every((id) => selectedSet.has(id));
    onSelectedChange(allSelected ? (selected ?? []).filter((id) => !ids.includes(id)) : Array.from(new Set([...(selected ?? []), ...ids])));
  }

  function toggleOne(id: string) {
    if (!onSelectedChange) return;
    onSelectedChange(selectedSet.has(id) ? (selected ?? []).filter((item) => item !== id) : [...(selected ?? []), id]);
  }

  return (
    <div>
      {(searchable || filters || columns.length > 2 || (selectable && selected && selected.length > 0)) && (
        <div className="toolbar">
          {searchable ? (
            <label className="field grow" style={{ marginBottom: 0 }}>
              <span className="visually-hidden" style={{ position: "absolute", left: -9999 }}>
                {searchPlaceholder}
              </span>
              <input
                value={search ?? ""}
                onChange={(event) => {
                  onSearch?.(event.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
              />
            </label>
          ) : null}
          {filters}
          <div className="column-picker">
            <button
              type="button"
              className="btn secondary"
              aria-expanded={columnsOpen}
              onClick={() => setColumnsOpen((open) => !open)}
            >
              Columns
            </button>
            {columnsOpen ? (
              <div className="column-picker-menu" role="menu" aria-label="Visible columns">
                {columns.map((column) => {
                  const checked = !hidden.has(column.id);
                  return (
                    <label key={column.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={checked && visibleColumns.length === 1}
                        onChange={() => {
                          setHidden((current) => {
                            const next = new Set(current);
                            if (next.has(column.id)) next.delete(column.id);
                            else if (next.size < columns.length - 1) next.add(column.id);
                            return next;
                          });
                        }}
                      />
                      {column.header}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
          {selectable && selected && selected.length > 0 ? bulkActions : null}
        </div>
      )}
      {error ? (
        <ErrorState title="Unable to load this table" body={error} onRetry={onRetry} />
      ) : loading ? (
        <TableSkeleton cols={visibleColumns.length + (selectable ? 1 : 0)} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {selectable ? (
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        aria-label="Select page"
                        checked={pageRows.length > 0 && pageRows.every((row) => selectedSet.has(rowKey(row)))}
                        onChange={toggleAll}
                      />
                    </th>
                  ) : null}
                  {visibleColumns.map((column) => (
                    <th key={column.id} style={column.width ? { width: column.width } : undefined}>
                      {column.sortValue ? (
                        <button type="button" className="btn ghost" style={{ padding: 0 }} onClick={() => toggleSort(column.id)}>
                          {column.header}
                          {sort?.id === column.id ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const id = rowKey(row);
                  return (
                    <tr
                      key={id}
                      data-clickable={onRowClick ? "true" : "false"}
                      data-selected={selectedSet.has(id) ? "true" : "false"}
                      onClick={() => onRowClick?.(row)}
                    >
                      {selectable ? (
                        <td
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${id}`}
                            checked={selectedSet.has(id)}
                            onChange={() => toggleOne(id)}
                          />
                        </td>
                      ) : null}
                      {visibleColumns.map((column) => (
                        <td key={column.id}>{column.cell(row)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length > pageSize ? (
            <div className="toolbar" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <span className="lede" style={{ margin: 0 }}>
                {sorted.length.toLocaleString()} rows
              </span>
              <div className="page-actions">
                <button type="button" className="btn secondary" disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                  Previous
                </button>
                <span className="lede" style={{ margin: 0 }}>
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
