-- A flag the user sets while reviewing, e.g. for questions to revisit.
ALTER TABLE items ADD COLUMN marked INTEGER NOT NULL DEFAULT 0;
