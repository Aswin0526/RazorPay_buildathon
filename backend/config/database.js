const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function ensureGlobalProductsView() {
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.refresh_global_products_view()
    RETURNS void
    LANGUAGE plpgsql
    AS $$
    DECLARE
      r RECORD;
      has_product_name BOOLEAN;
      has_title BOOLEAN;
      has_brand BOOLEAN;
      has_description BOOLEAN;
      has_price BOOLEAN;
      has_quantity BOOLEAN;
      sql TEXT := '';
      select_sql TEXT;
    BEGIN
      DROP VIEW IF EXISTS public.global_products_view;

      FOR r IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND (
            table_name ILIKE 'electronics_%'
            OR table_name ILIKE 'grocery_%'
            OR table_name ILIKE 'cosmetics_%'
            OR table_name ILIKE 'clothing_%'
            OR table_name ILIKE 'bookstore_%'
          )
        ORDER BY table_name
      LOOP
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'product_name'
        ) INTO has_product_name;

        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'title'
        ) INTO has_title;

        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'brand'
        ) INTO has_brand;

        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'description'
        ) INTO has_description;

        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'price'
        ) INTO has_price;

        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'quantity'
        ) INTO has_quantity;

        select_sql := format(
          'SELECT
             CAST(regexp_replace(%L, ''^[^_]+_([0-9]+)_.+$'', ''\\1'') AS INTEGER) AS shop_id,
             s.type AS shop_type,
             CAST(p.id AS INTEGER) AS product_id,
             COALESCE(NULLIF(CAST(%s AS TEXT), ''''), NULLIF(CAST(%s AS TEXT), ''''), ''Unnamed Product'') AS product_name,
             %s AS brand,
             %s AS description,
             %s AS price,
             %s AS quantity,
             p.created_at,
             s.shop_name,
             s.shop_city,
             s.shop_state,
             s.shop_country,
             s.shop_email,
             s.shop_phone,
             s.shop_website
           FROM %I p
           JOIN shops s ON s.shop_id = CAST(regexp_replace(%L, ''^[^_]+_([0-9]+)_.+$'', ''\\1'') AS INTEGER)',
          r.table_name,
          CASE WHEN has_product_name THEN 'p.product_name' ELSE 'p.title' END,
          CASE WHEN has_product_name THEN 'p.product_name' ELSE 'p.title' END,
          CASE WHEN has_brand THEN 'p.brand' ELSE 'NULL::TEXT' END,
          CASE WHEN has_description THEN 'p.description' ELSE 'NULL::TEXT' END,
          CASE WHEN has_price THEN 'p.price' ELSE 'NULL::NUMERIC' END,
          CASE WHEN has_quantity THEN 'p.quantity' ELSE '1' END,
          r.table_name,
          r.table_name
        );

        IF sql <> '' THEN
          sql := sql || ' UNION ALL ';
        END IF;
        sql := sql || select_sql;
      END LOOP;

      IF sql = '' THEN
        EXECUTE '
          CREATE VIEW public.global_products_view AS
          SELECT
            CAST(NULL AS INTEGER) AS shop_id,
            CAST(NULL AS TEXT) AS shop_type,
            CAST(NULL AS INTEGER) AS product_id,
            CAST(NULL AS TEXT) AS product_name,
            CAST(NULL AS TEXT) AS brand,
            CAST(NULL AS TEXT) AS description,
            CAST(NULL AS NUMERIC) AS price,
            CAST(NULL AS INTEGER) AS quantity,
            CAST(NULL AS TIMESTAMP) AS created_at,
            CAST(NULL AS TEXT) AS shop_name,
            CAST(NULL AS TEXT) AS shop_city,
            CAST(NULL AS TEXT) AS shop_state,
            CAST(NULL AS TEXT) AS shop_country,
            CAST(NULL AS TEXT) AS shop_email,
            CAST(NULL AS TEXT) AS shop_phone,
            CAST(NULL AS TEXT) AS shop_website
          LIMIT 0';
        RETURN;
      END IF;

      EXECUTE 'CREATE VIEW public.global_products_view AS ' || sql;
    END;
    $$;
  `);

  await pool.query('SELECT public.refresh_global_products_view();');
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  ensureGlobalProductsView,
};
