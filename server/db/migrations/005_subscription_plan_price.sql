-- The plan's price is charged once per billing period on top of the lines.
-- It is copied onto the subscription, so changing a plan later never rewrites an existing one.
ALTER TABLE subscriptions ADD COLUMN plan_price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER plan_id;
UPDATE subscriptions s JOIN plans p ON p.id = s.plan_id SET s.plan_price = p.price;
