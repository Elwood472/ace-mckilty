"use client";

import { useActionState } from "react";
import { CsrfField } from "@/components/csrf-field";
import {
  importDumpAction,
  type ImportDataState,
} from "@/app/actions/import-data";

const initial: ImportDataState = {};

export function ImportDataForm({ csrf }: { csrf: string }) {
  const [state, action, pending] = useActionState(importDumpAction, initial);

  return (
    <form action={action} style={{ maxWidth: 36 * 16 }}>
      <CsrfField token={csrf} />
      <p>
        <label>
          <b>Import secret</b>
          <br />
          <input
            type="password"
            name="importSecret"
            autoComplete="off"
            required
            style={{ width: "100%", maxWidth: 320 }}
          />
        </label>
      </p>
      <p>
        <label>
          <b>Dump file</b> (JSON)
          <br />
          <input type="file" name="dumpFile" accept="application/json,.json" />
        </label>
      </p>
      <p>
        <label>
          <b>Or paste dump JSON</b>
          <br />
          <textarea
            name="dumpText"
            rows={8}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
            spellCheck={false}
          />
        </label>
      </p>
      <p>
        <button type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import once"}
        </button>
      </p>
      {state.error ? (
        <p style={{ color: "#800" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <div style={{ color: "#060" }}>
          <p>
            <b>Import complete.</b> You can remove the import secret now.
          </p>
          {state.imported ? (
            <p style={{ fontSize: 13 }}>
              Tables loaded:{" "}
              {Object.entries(state.imported)
                .filter(([, n]) => n > 0)
                .map(([name, n]) => `${name} (${n})`)
                .join(", ") || "none"}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
