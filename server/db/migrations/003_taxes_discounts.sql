-- Phase 4: tax rules and discounts.

CREATE TABLE taxes (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  rate       DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_taxes_name (name),
  CONSTRAINT chk_tax_rate CHECK (rate >= 0 AND rate <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE discounts (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(160) NOT NULL,
  type          ENUM('fixed', 'percentage') NOT NULL,
  value         DECIMAL(12,2) NOT NULL,
  min_purchase  DECIMAL(12,2) NULL,
  min_quantity  INT UNSIGNED NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NULL,
  usage_limit   INT UNSIGNED NULL,
  times_used    INT UNSIGNED NOT NULL DEFAULT 0,
  applies_to    ENUM('products', 'subscription') NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_discounts_name (name),
  CONSTRAINT chk_discount_value CHECK (value > 0 AND (type = 'fixed' OR value <= 100)),
  CONSTRAINT chk_discount_dates CHECK (end_date IS NULL OR end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Only used when applies_to = 'products'.
CREATE TABLE discount_products (
  discount_id INT UNSIGNED NOT NULL,
  product_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (discount_id, product_id),
  CONSTRAINT fk_dp_discount FOREIGN KEY (discount_id) REFERENCES discounts (id) ON DELETE CASCADE,
  CONSTRAINT fk_dp_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
