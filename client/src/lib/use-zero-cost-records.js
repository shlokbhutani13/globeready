import { useEffect, useState } from "react";
import { createZeroCostDataStore } from "./zero-cost-data";

const emptyPlanner = { have: [], custom: [] };

// Live copies of the student's key dates, contacts and checklist progress (free beta only).
export function useZeroCostRecords({ firestore, uid, enabled, onError }) {
  const [state, setState] = useState({ dates: [], contacts: [], cases: [], planner: { journey: emptyPlanner, travel: emptyPlanner } });
  useEffect(() => {
    if (!enabled || !uid || !firestore) { setState({ dates: [], contacts: [], cases: [], planner: { journey: emptyPlanner, travel: emptyPlanner } }); return undefined; }
    const store = createZeroCostDataStore({ firestore, uid });
    const stops = [
      store.subscribeRecords("trackedDates", (dates) => setState((current) => ({ ...current, dates })), onError),
      store.subscribeRecords("contacts", (contacts) => setState((current) => ({ ...current, contacts })), onError),
      store.subscribeRecords("cases", (cases) => setState((current) => ({ ...current, cases })), onError),
      store.subscribeRecords("planner", (records) => setState((current) => ({
        ...current,
        planner: Object.fromEntries(["journey", "travel"].map((id) => {
          const record = records.find((entry) => entry.id === id);
          return [id, { have: Array.isArray(record?.have) ? record.have : [], custom: Array.isArray(record?.custom) ? record.custom : [] }];
        })),
      })), onError),
    ];
    return () => stops.forEach((stop) => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, uid, firestore]);
  return state;
}
