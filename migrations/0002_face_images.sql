-- NULL means "not set": the card falls back to the memo's own images.
ALTER TABLE items ADD COLUMN question_images TEXT;
ALTER TABLE items ADD COLUMN answer_images TEXT;
