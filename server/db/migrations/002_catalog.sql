-- Phase 3: products, variants and plans.

CREATE TABLE products (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(160) NOT NULL,
  type        ENUM('service', 'goods') NOT NULL DEFAULT 'service',
  sales_price DECIMAL(12,2) NOT NULL,
  cost_price  DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes       TEXT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A variant adds a fixed amount to the product's sales price, e.g. Brand: Odoo (+560).
CREATE TABLE product_variants (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  INT UNSIGNED NOT NULL,
  attribute   VARCHAR(60) NOT NULL,
  value       VARCHAR(60) NOT NULL,
  extra_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_variant (product_id, attribute, value),
  CONSTRAINT fk_variant_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE plans (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(160) NOT NULL,
  price          DECIMAL(12,2) NOT NULL,
  billing_period ENUM('daily', 'weekly', 'monthly', 'yearly') NOT NULL,
  min_quantity   INT UNSIGNED NOT NULL DEFAULT 1,
  start_date     DATE NOT NULL,
  end_date       DATE NULL,
  -- Per plan, the admin decides what can happen to its subscriptions.
  auto_close     TINYINT(1) NOT NULL DEFAULT 0,
  closable       TINYINT(1) NOT NULL DEFAULT 0,
  pausable       TINYINT(1) NOT NULL DEFAULT 0,
  renewable      TINYINT(1) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_name (name),
  CONSTRAINT chk_plan_dates CHECK (end_date IS NULL OR end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
