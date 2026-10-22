-- The memo itself is now the card's question. Memos that only had a separate
-- question (e.g. image-only memos) adopt it as their text; the question column
-- is left untouched so nothing is lost.
UPDATE items SET body = question
WHERE (body IS NULL OR body = '') AND question IS NOT NULL AND question <> '';
