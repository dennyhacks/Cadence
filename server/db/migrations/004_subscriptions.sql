-- Phase 5: quotation templates and subscriptions.

CREATE TABLE quotation_templates (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(160) NOT NULL,
  plan_id       INT UNSIGNED NOT NULL,
  validity_days INT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_templates_name (name),
  CONSTRAINT fk_template_plan FOREIGN KEY (plan_id) REFERENCES plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A variant is kept as plain text (Brand / Odoo) so editing a product's variants never breaks a template.
CREATE TABLE template_lines (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id       INT UNSIGNED NOT NULL,
  product_id        INT UNSIGNED NOT NULL,
  variant_attribute VARCHAR(60) NULL,
  variant_value     VARCHAR(60) NULL,
  quantity          INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_template_lines_template (template_id),
  CONSTRAINT fk_tline_template FOREIGN KEY (template_id) REFERENCES quotation_templates (id) ON DELETE CASCADE,
  CONSTRAINT fk_tline_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE template_line_taxes (
  line_id INT UNSIGNED NOT NULL,
  tax_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (line_id, tax_id),
  CONSTRAINT fk_tlt_line FOREIGN KEY (line_id) REFERENCES template_lines (id) ON DELETE CASCADE,
  CONSTRAINT fk_tlt_tax FOREIGN KEY (tax_id) REFERENCES taxes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscriptions (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  number            VARCHAR(20) NULL,
  customer_id       INT UNSIGNED NOT NULL,
  plan_id           INT UNSIGNED NOT NULL,
  template_id       INT UNSIGNED NULL,
  status            ENUM('draft', 'quotation', 'confirmed', 'active', 'closed') NOT NULL DEFAULT 'draft',
  is_paused         TINYINT(1) NOT NULL DEFAULT 0,
  start_date        DATE NOT NULL,
  expiry_date       DATE NULL,
  payment_terms     ENUM('immediate', 'net_15', 'net_30', 'net_45') NOT NULL DEFAULT 'immediate',
  validity_days     INT UNSIGNED NOT NULL DEFAULT 30,
  quote_valid_until DATE NULL,
  created_by        INT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscriptions_number (number),
  KEY idx_subscriptions_customer (customer_id, status),
  KEY idx_subscriptions_status (status, expiry_date),
  KEY idx_subscriptions_plan (plan_id),
  CONSTRAINT fk_sub_customer FOREIGN KEY (customer_id) REFERENCES users (id),
  CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES plans (id),
  CONSTRAINT fk_sub_template FOREIGN KEY (template_id) REFERENCES quotation_templates (id) ON DELETE SET NULL,
  CONSTRAINT fk_sub_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_sub_dates CHECK (expiry_date IS NULL OR expiry_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The unit price and variant are copied onto the line, so later price changes never rewrite history.
CREATE TABLE subscription_lines (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscription_id INT UNSIGNED NOT NULL,
  product_id      INT UNSIGNED NOT NULL,
  variant_label   VARCHAR(130) NULL,
  quantity        INT UNSIGNED NOT NULL,
  unit_price      DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sub_lines_sub (subscription_id),
  CONSTRAINT fk_sline_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE CASCADE,
  CONSTRAINT fk_sline_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscription_line_taxes (
  line_id INT UNSIGNED NOT NULL,
  tax_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (line_id, tax_id),
  CONSTRAINT fk_slt_line FOREIGN KEY (line_id) REFERENCES subscription_lines (id) ON DELETE CASCADE,
  CONSTRAINT fk_slt_tax FOREIGN KEY (tax_id) REFERENCES taxes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
