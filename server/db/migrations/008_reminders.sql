-- When the team last sent an overdue reminder for an invoice.
ALTER TABLE invoices ADD COLUMN reminded_at DATETIME NULL;
