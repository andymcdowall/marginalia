export type ThreadStatus = "open" | "resolved" | "orphaned";
export type Comment = { id: string; created: string; body: string }; // ISO 8601 with local offset
export type Thread = { id: string; status: ThreadStatus; updated: string; comments: Comment[] };
export type SplitFile = { body: string; threads: Thread[]; warnings: string[] };
