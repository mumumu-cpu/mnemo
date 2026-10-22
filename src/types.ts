export type Status = 0 | 1 | 2;

export type Item = {
  id: string;
  body: string;
  images: string[]; // server keys, or "local:<id>" before upload
  status: Status;
  question: string | null;
  answer: string | null;
  reviews: number;
  createdAt: number;
  updatedAt: number;
  pending?: boolean;
};

export type User = { id: string; email: string; name?: string | null; picture?: string | null };

export const STATUS = [
  { label: "未着手", color: "var(--s0)" },
  { label: "学習中", color: "var(--s1)" },
  { label: "覚えた", color: "var(--s2)" },
] as const;
