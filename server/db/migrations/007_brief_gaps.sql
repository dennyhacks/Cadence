-- Taxes the admin marks "apply automatically" are added to every new line without anyone having to tick them.
ALTER TABLE taxes ADD COLUMN apply_automatically TINYINT(1) NOT NULL DEFAULT 0 AFTER rate;

-- Customer details for invoices.
ALTER TABLE users ADD COLUMN company VARCHAR(160) NULL;
ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL;
ALTER TABLE users ADD COLUMN billing_address VARCHAR(500) NULL;

-- Copied onto each invoice when it is made, so an invoice never changes after it is issued.
ALTER TABLE invoices ADD COLUMN customer_company VARCHAR(160) NULL;
ALTER TABLE invoices ADD COLUMN customer_phone VARCHAR(30) NULL;
ALTER TABLE invoices ADD COLUMN customer_address VARCHAR(500) NULL;
