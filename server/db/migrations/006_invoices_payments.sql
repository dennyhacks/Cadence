-- Phase 6: invoices and payments.

-- Which billing period a subscription will be invoiced for next (period 0 starts on its start date).
ALTER TABLE subscriptions ADD COLUMN next_period_index INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_paused;

CREATE TABLE invoices (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  number          VARCHAR(20) NULL,
  subscription_id INT UNSIGNED NOT NULL,
  customer_id     INT UNSIGNED NOT NULL,
  status          ENUM('draft', 'confirmed', 'paid', 'cancelled') NOT NULL DEFAULT 'draft',
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  invoice_date    DATE NOT NULL,
  due_date        DATE NOT NULL,
  -- Customer and plan details are copied so an invoice never changes after it is issued.
  customer_name   VARCHAR(120) NOT NULL,
  customer_email  VARCHAR(255) NOT NULL,
  plan_name       VARCHAR(160) NOT NULL,
  untaxed_total   DECIMAL(12,2) NOT NULL,
  discount_total  DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_total       DECIMAL(12,2) NOT NULL,
  total           DECIMAL(12,2) NOT NULL,
  amount_paid     DECIMAL(12,2) NOT NULL DEFAULT 0,
  sent_at         DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoices_number (number),
  -- The guard against billing twice: one invoice per subscription and billing period, enforced by the database.
  UNIQUE KEY uq_invoice_period (subscription_id, period_start),
  KEY idx_invoices_customer (customer_id, status),
  KEY idx_invoices_status_due (status, due_date),
  KEY idx_invoices_invoice_date (invoice_date),
  CONSTRAINT fk_invoice_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions (id),
  CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) REFERENCES users (id),
  CONSTRAINT chk_invoice_paid CHECK (amount_paid >= 0 AND amount_paid <= total)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_lines (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id      INT UNSIGNED NOT NULL,
  kind            ENUM('product', 'plan') NOT NULL DEFAULT 'product',
  description     VARCHAR(300) NOT NULL,
  quantity        INT UNSIGNED NOT NULL,
  unit_price      DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_label       VARCHAR(255) NULL,
  tax_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount          DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_invoice_lines_invoice (invoice_id),
  CONSTRAINT fk_iline_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which discounts an invoice used, so cancelling it can give the use back.
CREATE TABLE invoice_discounts (
  invoice_id  INT UNSIGNED NOT NULL,
  discount_id INT UNSIGNED NOT NULL,
  name        VARCHAR(160) NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (invoice_id, discount_id),
  CONSTRAINT fk_idisc_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
  CONSTRAINT fk_idisc_discount FOREIGN KEY (discount_id) REFERENCES discounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id  INT UNSIGNED NOT NULL,
  method      ENUM('cash', 'card', 'bank_transfer', 'upi', 'cheque') NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  paid_on     DATE NOT NULL,
  note        VARCHAR(500) NULL,
  recorded_by INT UNSIGNED NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payments_invoice (invoice_id),
  KEY idx_payments_paid_on (paid_on),
  CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id),
  CONSTRAINT fk_payment_user FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
