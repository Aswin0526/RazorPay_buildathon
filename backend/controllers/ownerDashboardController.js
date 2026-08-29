const pool = require("../config/database");

const normalizeShopName = (shopName = "") => {
  return String(shopName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
};

const getOwnerShop = async (ownerId, explicitShopId = null) => {
  if (explicitShopId) {
    const result = await pool.query(
      "SELECT * FROM shops WHERE shop_id = $1 AND owner_id = $2 LIMIT 1",
      [explicitShopId, ownerId]
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    "SELECT * FROM shops WHERE owner_id = $1 ORDER BY shop_id DESC LIMIT 1",
    [ownerId]
  );

  return result.rows[0] || null;
};

const getProductTableName = (shop) => {
  if (!shop || !shop.type || !shop.shop_name || !shop.shop_id) {
    return null;
  }

  const cleanedType = String(shop.type).trim().toLowerCase();
  const normalizedName = normalizeShopName(shop.shop_name);

  return `${cleanedType}_${shop.shop_id}_${normalizedName}`;
};

const getProductTableIfExists = async (shop) => {
  const tableName = getProductTableName(shop);
  if (!tableName) return null;

  const result = await pool.query(
    `SELECT to_regclass($1) AS table_name`,
    [`public.${tableName}`]
  );

  return result.rows[0]?.table_name ? tableName : null;
};

const numeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getOwnerDashboardSummary = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({
        success: false,
        message: "Owner session is required",
      });
    }

    const shop = await getOwnerShop(ownerId, req.body?.shop_id || null);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found for this owner",
      });
    }

    const summaryQuery = await pool.query(
      `
        SELECT
          COALESCE(SUM(CASE WHEN o.shop_id = $1 THEN o.total_amount ELSE 0 END), 0)::NUMERIC AS total_revenue,
          COUNT(CASE WHEN o.shop_id = $1 THEN 1 END)::INT AS total_orders,
          COALESCE(AVG(CASE WHEN o.shop_id = $1 AND o.payment_status = 'PAID' THEN o.total_amount END), 0)::NUMERIC AS avg_order_value,
          COALESCE(ROUND(AVG(CASE WHEN f.shop_id = $1 THEN f.ratings END), 2), 0) AS avg_rating,
          COUNT(CASE WHEN f.shop_id = $1 THEN 1 END)::INT AS feedback_count,
          COALESCE(SUM(CASE WHEN sh.shop_id = $1 THEN sh.hit_count END), 0)::INT AS total_views,
          COUNT(CASE WHEN w.shop_id = $1 THEN 1 END)::INT AS wishlist_count,
          COUNT(CASE WHEN ca.shop_id = $1 THEN 1 END)::INT AS conversations,
          COUNT(CASE WHEN o.shop_id = $1 AND o.state::text = 'ordered' THEN 1 END)::INT AS pending_orders,
          COUNT(CASE WHEN o.shop_id = $1 AND o.state::text = 'done' THEN 1 END)::INT AS completed_orders
        FROM orders o
        FULL OUTER JOIN shop_feedback f ON f.shop_id = $1
        FULL OUTER JOIN shop_hits sh ON sh.shop_id = $1
        FULL OUTER JOIN wishlist w ON w.shop_id = $1
        FULL OUTER JOIN conversation_analyses ca ON ca.shop_id = $1
        WHERE o.shop_id = $1 OR f.shop_id = $1 OR sh.shop_id = $1 OR w.shop_id = $1 OR ca.shop_id = $1
      `,
      [shop.shop_id]
    );

    const topProductsQuery = await pool.query(
      `
        SELECT
          product_name,
          COUNT(*)::INT AS wishlist_count,
          COALESCE(AVG(price), 0)::NUMERIC AS avg_price
        FROM wishlist
        WHERE shop_id = $1
        GROUP BY product_name
        ORDER BY wishlist_count DESC, product_name ASC
        LIMIT 6
      `,
      [shop.shop_id]
    );

    const recentFeedbackQuery = await pool.query(
      `
        SELECT feedback, ratings, created_at
        FROM shop_feedback
        WHERE shop_id = $1
        ORDER BY created_at DESC
        LIMIT 8
      `,
      [shop.shop_id]
    );

    const ratingBreakdownQuery = await pool.query(
      `
        SELECT
          CAST(ROUND(ratings) AS INT) AS rating_value,
          COUNT(*)::INT AS rating_count
        FROM shop_feedback
        WHERE shop_id = $1
        GROUP BY CAST(ROUND(ratings) AS INT)
        ORDER BY rating_value DESC
      `,
      [shop.shop_id]
    );

    const conversationSummaryQuery = await pool.query(
      `
        SELECT
          COUNT(*)::INT AS total_conversations,
          COALESCE(AVG(duration_minutes)::NUMERIC, 0) AS avg_duration_min,
          COALESCE(AVG(turn_count)::NUMERIC, 0) AS avg_turns,
          COALESCE(SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END), 0)::INT AS completed,
          COALESCE(SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END), 0)::INT AS abandoned,
          COALESCE(SUM(CASE WHEN outcome = 'escalated' THEN 1 ELSE 0 END), 0)::INT AS escalated
        FROM conversation_analyses
        WHERE shop_id = $1
      `,
      [shop.shop_id]
    );

    const geoInsightsQuery = await pool.query(
      `
        SELECT
          s.shop_city AS city,
          COUNT(DISTINCT s.shop_id)::INT AS shop_count,
          COALESCE(SUM(o.total_amount), 0)::NUMERIC AS revenue,
          COALESCE(COUNT(o.order_id), 0)::INT AS orders
        FROM shops s
        LEFT JOIN orders o ON o.shop_id = s.shop_id
        WHERE s.owner_id = $1
        GROUP BY s.shop_city
        ORDER BY revenue DESC, orders DESC
        LIMIT 6
      `,
      [ownerId]
    );

    const inventoryAlertsQuery = await pool.query(
      `
        WITH shop_products AS (
          SELECT product_name, quantity, price, created_at
          FROM products
          WHERE city = $2 AND state = $3 AND country = $4 AND type = $5
          ORDER BY quantity ASC
          LIMIT 8
        )
        SELECT * FROM shop_products
      `,
      [shop.shop_id, shop.shop_city, shop.shop_state, shop.shop_country, shop.type]
    );

    const summaryRow = summaryQuery.rows[0] || {};
    const conversationRow = conversationSummaryQuery.rows[0] || {};

    const ratingMap = {};
    for (const item of ratingBreakdownQuery.rows) {
      ratingMap[item.rating_value] = item.rating_count;
    }

    const ratingDistribution = [5, 4, 3, 2, 1].map((value) => ({
      rating: value,
      count: ratingMap[value] || 0,
    }));

    const responsePayload = {
      success: true,
      data: {
        shop: {
          shop_id: shop.shop_id,
          shop_name: shop.shop_name,
          shop_city: shop.shop_city,
          shop_state: shop.shop_state,
          shop_country: shop.shop_country,
          shop_type: shop.type,
        },
        kpis: {
          totalRevenue: numeric(summaryRow.total_revenue),
          totalOrders: numeric(summaryRow.total_orders),
          avgOrderValue: numeric(summaryRow.avg_order_value),
          avgRating: numeric(summaryRow.avg_rating),
          feedbackCount: numeric(summaryRow.feedback_count),
          totalViews: numeric(summaryRow.total_views),
          wishlistCount: numeric(summaryRow.wishlist_count),
          conversations: numeric(summaryRow.conversations),
          pendingOrders: numeric(summaryRow.pending_orders),
          completedOrders: numeric(summaryRow.completed_orders),
        },
        topProducts: topProductsQuery.rows.map((row) => ({
          product_name: row.product_name,
          wishlist_count: numeric(row.wishlist_count),
          avg_price: numeric(row.avg_price),
        })),
        recentFeedback: recentFeedbackQuery.rows.map((row) => ({
          feedback: row.feedback,
          ratings: numeric(row.ratings),
          created_at: row.created_at,
        })),
        ratingBreakdown: ratingDistribution,
        conversationSummary: {
          totalConversations: numeric(conversationRow.total_conversations),
          avgDurationMinutes: numeric(conversationRow.avg_duration_min),
          avgTurns: numeric(conversationRow.avg_turns),
          completed: numeric(conversationRow.completed),
          abandoned: numeric(conversationRow.abandoned),
          escalated: numeric(conversationRow.escalated),
        },
        geoInsights: geoInsightsQuery.rows.map((row) => ({
          city: row.city,
          shop_count: numeric(row.shop_count),
          revenue: numeric(row.revenue),
          orders: numeric(row.orders),
        })),
        inventoryAlerts: inventoryAlertsQuery.rows.map((row) => ({
          product_name: row.product_name,
          quantity: numeric(row.quantity),
          price: numeric(row.price),
          created_at: row.created_at,
        })),
      },
    };

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("Owner dashboard summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getOwnerDashboardOverview = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Owner session is required" });
    }

    const shop = await getOwnerShop(ownerId, req.body?.shop_id || null);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    const overviewQuery = await pool.query(
      `
        WITH feedback_summary AS (
          SELECT
            CAST(shop_id AS TEXT) AS shop_id,
            ROUND(AVG(ratings), 2) AS avg_rating,
            COUNT(*)::INT AS total_feedback
          FROM shop_feedback
          WHERE shop_id = $1
          GROUP BY CAST(shop_id AS TEXT)
        ),
        sales_summary AS (
          SELECT
            CAST(shop_id AS TEXT) AS shop_id,
            COALESCE(SUM(total_amount), 0)::NUMERIC AS total_revenue,
            COUNT(*)::INT AS total_orders,
            COALESCE(AVG(total_amount), 0)::NUMERIC AS avg_order_value,
            COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END), 0)::NUMERIC AS paid_revenue
          FROM orders
          WHERE shop_id = $1
          GROUP BY CAST(shop_id AS TEXT)
        ),
        view_summary AS (
          SELECT
            CAST(shop_id AS TEXT) AS shop_id,
            COALESCE(SUM(hit_count), 0)::INT AS total_views
          FROM shop_hits
          WHERE shop_id = $1
          GROUP BY CAST(shop_id AS TEXT)
        ),
        wishlist_summary AS (
          SELECT
            CAST(shop_id AS TEXT) AS shop_id,
            COUNT(*)::INT AS wishlist_count
          FROM wishlist
          WHERE shop_id = $1
          GROUP BY CAST(shop_id AS TEXT)
        ),
        conv_summary AS (
          SELECT
            CAST(shop_id AS TEXT) AS shop_id,
            COUNT(*)::INT AS total_conversations,
            COALESCE(AVG(duration_minutes), 0)::NUMERIC AS avg_duration_minutes,
            COALESCE(AVG(turn_count), 0)::NUMERIC AS avg_turns,
            COALESCE(SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END), 0)::INT AS completed,
            COALESCE(SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END), 0)::INT AS abandoned,
            COALESCE(SUM(CASE WHEN outcome = 'escalated' THEN 1 ELSE 0 END), 0)::INT AS escalated
          FROM conversation_analyses
          WHERE CAST(shop_id AS TEXT) = CAST($1 AS TEXT)
          GROUP BY CAST(shop_id AS TEXT)
        )
        SELECT
          COALESCE(fs.avg_rating, 0)::NUMERIC AS avg_rating,
          COALESCE(fs.total_feedback, 0)::INT AS total_feedback,
          COALESCE(ss.total_revenue, 0)::NUMERIC AS total_revenue,
          COALESCE(ss.total_orders, 0)::INT AS total_orders,
          COALESCE(ss.avg_order_value, 0)::NUMERIC AS avg_order_value,
          COALESCE(vs.total_views, 0)::INT AS total_views,
          COALESCE(ws.wishlist_count, 0)::INT AS wishlist_count,
          COALESCE(cs.total_conversations, 0)::INT AS total_conversations,
          COALESCE(cs.avg_duration_minutes, 0)::NUMERIC AS avg_duration_minutes,
          COALESCE(cs.avg_turns, 0)::NUMERIC AS avg_turns,
          COALESCE(cs.completed, 0)::INT AS completed,
          COALESCE(cs.abandoned, 0)::INT AS abandoned,
          COALESCE(cs.escalated, 0)::INT AS escalated
        FROM feedback_summary fs
        FULL OUTER JOIN sales_summary ss ON ss.shop_id = fs.shop_id
        FULL OUTER JOIN view_summary vs ON vs.shop_id = COALESCE(fs.shop_id, ss.shop_id)
        FULL OUTER JOIN wishlist_summary ws ON ws.shop_id = COALESCE(fs.shop_id, ss.shop_id, vs.shop_id)
        FULL OUTER JOIN conv_summary cs ON cs.shop_id = COALESCE(fs.shop_id, ss.shop_id, vs.shop_id, ws.shop_id)
        WHERE COALESCE(fs.shop_id, ss.shop_id, vs.shop_id, ws.shop_id, cs.shop_id) = CAST($1 AS TEXT)
      `,
      [shop.shop_id]
    );

    const feedbackRows = await pool.query(
      `
        SELECT feedback, ratings, created_at
        FROM shop_feedback
        WHERE shop_id = $1
        ORDER BY created_at DESC
        LIMIT 8
      `,
      [shop.shop_id]
    );

    const graphData = await pool.query(
      `
        SELECT s.shop_name,
               COALESCE(SUM(sh.hit_count), 0)::INT AS total_hits
        FROM shops s
        LEFT JOIN shop_hits sh ON sh.shop_id = s.shop_id
        WHERE s.type = $1
          AND s.shop_city = $2
          AND s.shop_state = $3
          AND s.shop_country = $4
        GROUP BY s.shop_id, s.shop_name
        ORDER BY total_hits DESC
        LIMIT 5
      `,
      [shop.type, shop.shop_city, shop.shop_state, shop.shop_country]
    );

    const wishlistData = await pool.query(
      `
        SELECT
          w.product_name,
          COUNT(*)::INT AS wishlist_count
        FROM wishlist w
        JOIN shops s ON s.shop_id = w.shop_id
        WHERE w.created_at >= NOW() - INTERVAL '1 month'
          AND s.shop_city = $2
          AND s.shop_state = $3
          AND s.shop_country = $4
          AND ($1::text IS NULL OR w.type = $1)
        GROUP BY w.product_name
        ORDER BY wishlist_count DESC
        LIMIT 5
      `,
      [shop.type || null, shop.shop_city, shop.shop_state, shop.shop_country]
    );

    const mostWantedProducts = await pool.query(
      `
        SELECT
          p.id,
          p.product_name,
          p.type,
          p.description,
          p.pic,
          p.city,
          p.state,
          p.country,
          p.created_at,
          COUNT(v.id)::INT AS total_votes
        FROM products p
        LEFT JOIN votes v ON v.product_id = p.id
        WHERE p.type = $1
          AND p.city = $2
          AND p.state = $3
          AND p.country = $4
          AND p.created_at >= NOW() - INTERVAL '1 month'
        GROUP BY p.id, p.product_name, p.type, p.description, p.pic, p.city, p.state, p.country, p.created_at
        ORDER BY total_votes DESC, p.created_at DESC
        LIMIT 5
      `,
      [shop.type, shop.shop_city, shop.shop_state, shop.shop_country]
    );

    const conversations = await pool.query(
      `
        SELECT id, session_id, shop_id, shop_name, city, state, country, product_type, started_at, ended_at,
               duration_minutes, turn_count, outcome, final_stage, summary, customer_intent,
               sentiment_arc, stage_progression, recommended_followup, products_discussed,
               key_insights, missed_opportunities, stages_reached, images_shared, sql_queries_made,
               created_at
        FROM conversation_analyses
        WHERE shop_id = $1
        ORDER BY created_at DESC
        LIMIT 5
      `,
      [shop.shop_id]
    );

    const overviewRow = overviewQuery.rows[0] || {};

    return res.status(200).json({
      success: true,
      data: {
        shop: {
          shop_id: shop.shop_id,
          shop_name: shop.shop_name,
          shop_city: shop.shop_city,
          shop_state: shop.shop_state,
          shop_country: shop.shop_country,
          shop_type: shop.type,
        },
        kpis: {
          totalRevenue: numeric(overviewRow.total_revenue),
          totalOrders: numeric(overviewRow.total_orders),
          avgOrderValue: numeric(overviewRow.avg_order_value),
          avgRating: numeric(overviewRow.avg_rating),
          feedbackCount: numeric(overviewRow.total_feedback),
          totalViews: numeric(overviewRow.total_views),
          wishlistCount: numeric(overviewRow.wishlist_count),
          totalConversations: numeric(overviewRow.total_conversations),
        },
        feedbacks: feedbackRows.rows.map((row) => ({
          feedback: row.feedback,
          ratings: numeric(row.ratings),
          created_at: row.created_at,
        })),
        avgRating: numeric(overviewRow.avg_rating),
        graphData: graphData.rows.map((row) => ({
          shop_name: row.shop_name,
          total_hits: numeric(row.total_hits),
        })),
        wishListCount: wishlistData.rows.map((row) => ({
          product_name: row.product_name,
          wishlist_count: numeric(row.wishlist_count),
        })),
        mostWantedProducts: mostWantedProducts.rows.map((row) => ({
          id: row.id,
          product_name: row.product_name,
          type: row.type,
          description: row.description,
          pic: row.pic ? `data:image/jpeg;base64,${Buffer.from(row.pic).toString("base64")}` : null,
          city: row.city,
          state: row.state,
          country: row.country,
          created_at: row.created_at,
          total_votes: numeric(row.total_votes),
        })),
        conversations: conversations.rows,
        conversationSummary: {
          totalConversations: numeric(overviewRow.total_conversations),
          avgDurationMinutes: numeric(overviewRow.avg_duration_minutes),
          avgTurns: numeric(overviewRow.avg_turns),
          completed: numeric(overviewRow.completed),
          abandoned: numeric(overviewRow.abandoned),
          escalated: numeric(overviewRow.escalated),
        },
        ratingBreakdown: [5, 4, 3, 2, 1].map((r) => ({
          rating: r,
          count: 0,
        })),
      },
    });
  } catch (error) {
    console.error("Dashboard overview error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getOwnerDashboardTopProducts = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Owner session is required" });
    }

    const shop = await getOwnerShop(ownerId, req.body?.shop_id || null);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    const result = await pool.query(
      `
        SELECT
          w.product_name,
          COUNT(w.wishlist_id)::INT AS wishlist_count,
          COALESCE(AVG(CAST(p.price AS NUMERIC)), 0) AS avg_price,
          COALESCE(SUM(CASE WHEN v.product_id IS NOT NULL THEN 1 ELSE 0 END), 0)::INT AS vote_count
        FROM wishlist w
        LEFT JOIN products p
          ON p.product_name = w.product_name
          AND p.city = $2 AND p.state = $3 AND p.country = $4
        LEFT JOIN votes v
          ON v.product_id = p.id
        WHERE w.shop_id = $1
        GROUP BY w.product_name
        ORDER BY wishlist_count DESC, vote_count DESC
        LIMIT 10
      `,
      [shop.shop_id, shop.shop_city, shop.shop_state, shop.shop_country]
    );

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({
        product_name: row.product_name,
        wishlist_count: numeric(row.wishlist_count),
        vote_count: numeric(row.vote_count),
        avg_price: numeric(row.avg_price),
      })),
    });
  } catch (error) {
    console.error("Dashboard top products error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getOwnerDashboardTrendData = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Owner session is required" });
    }

    const shop = await getOwnerShop(ownerId, req.body?.shop_id || null);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    const result = await pool.query(
      `
        SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
          COUNT(*)::INT AS order_count,
          COALESCE(SUM(total_amount), 0)::NUMERIC AS revenue,
          COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END), 0)::NUMERIC AS paid_revenue
        FROM orders
        WHERE shop_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY date ASC
      `,
      [shop.shop_id]
    );

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({
        date: row.date,
        order_count: numeric(row.order_count),
        revenue: numeric(row.revenue),
        paid_revenue: numeric(row.paid_revenue),
      })),
    });
  } catch (error) {
    console.error("Dashboard trend data error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getOwnerDashboardFeedbackInsights = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Owner session is required" });
    }

    const shop = await getOwnerShop(ownerId, req.body?.shop_id || null);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    const summaryQuery = await pool.query(
      `
        SELECT
          ROUND(AVG(ratings), 2) AS avg_rating,
          COUNT(*)::INT AS total_feedback,
          SUM(CASE WHEN ratings >= 4 THEN 1 ELSE 0 END)::INT AS positive_reviews,
          SUM(CASE WHEN ratings BETWEEN 2 AND 3 THEN 1 ELSE 0 END)::INT AS neutral_reviews,
          SUM(CASE WHEN ratings < 2 THEN 1 ELSE 0 END)::INT AS negative_reviews
        FROM shop_feedback
        WHERE shop_id = $1
      `,
      [shop.shop_id]
    );

    const recentFeedbackQuery = await pool.query(
      `
        SELECT feedback, ratings, created_at
        FROM shop_feedback
        WHERE shop_id = $1
        ORDER BY created_at DESC
        LIMIT 12
      `,
      [shop.shop_id]
    );

    const ratingBreakdownQuery = await pool.query(
      `
        SELECT
          CAST(ROUND(ratings) AS INT) AS rating_value,
          COUNT(*)::INT AS rating_count
        FROM shop_feedback
        WHERE shop_id = $1
        GROUP BY CAST(ROUND(ratings) AS INT)
      `,
      [shop.shop_id]
    );

    const summaryRow = summaryQuery.rows[0] || {};
    const distribution = {};
    for (const row of ratingBreakdownQuery.rows) {
      distribution[row.rating_value] = numeric(row.rating_count);
    }

    return res.status(200).json({
      success: true,
      data: {
        avgRating: numeric(summaryRow.avg_rating),
        totalFeedback: numeric(summaryRow.total_feedback),
        positiveReviews: numeric(summaryRow.positive_reviews),
        neutralReviews: numeric(summaryRow.neutral_reviews),
        negativeReviews: numeric(summaryRow.negative_reviews),
        ratingBreakdown: [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: distribution[r] || 0 })),
        recentFeedback: recentFeedbackQuery.rows.map((row) => ({
          feedback: row.feedback,
          ratings: numeric(row.ratings),
          created_at: row.created_at,
        })),
      },
    });
  } catch (error) {
    console.error("Dashboard feedback insights error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getOwnerDashboardConversationSummary = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Owner session is required" });
    }

    const shop = await getOwnerShop(ownerId, req.body?.shop_id || null);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    const result = await pool.query(
      `
        SELECT
          COUNT(*)::INT AS total_conversations,
          COALESCE(AVG(duration_minutes), 0) AS avg_duration_minutes,
          COALESCE(AVG(turn_count), 0) AS avg_turns,
          COALESCE(SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END), 0)::INT AS completed,
          COALESCE(SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END), 0)::INT AS abandoned,
          COALESCE(SUM(CASE WHEN outcome = 'escalated' THEN 1 ELSE 0 END), 0)::INT AS escalated,
          array_agg(DISTINCT customer_intent ORDER BY customer_intent) AS intents,
          array_agg(DISTINCT final_stage ORDER BY final_stage) AS stages_reached
        FROM conversation_analyses
        WHERE shop_id = $1
      `,
      [shop.shop_id]
    );

    const row = result.rows[0] || {};

    return res.status(200).json({
      success: true,
      data: {
        totalConversations: numeric(row.total_conversations),
        avgDurationMinutes: numeric(row.avg_duration_minutes),
        avgTurns: numeric(row.avg_turns),
        completed: numeric(row.completed),
        abandoned: numeric(row.abandoned),
        escalated: numeric(row.escalated),
        intents: row.intents || [],
        stagesReached: row.stages_reached || [],
      },
    });
  } catch (error) {
    console.error("Dashboard conversation summary error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getOwnerDashboardGeoInsights = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Owner session is required" });
    }

    const result = await pool.query(
      `
        SELECT
          s.shop_city AS city,
          s.shop_state AS state,
          s.shop_country AS country,
          COUNT(DISTINCT s.shop_id)::INT AS shop_count,
          COALESCE(SUM(o.total_amount), 0)::NUMERIC AS revenue,
          COALESCE(COUNT(o.order_id), 0)::INT AS order_count,
          COALESCE(AVG(f.ratings), 0)::NUMERIC AS avg_rating
        FROM shops s
        LEFT JOIN orders o ON o.shop_id = s.shop_id
        LEFT JOIN shop_feedback f ON f.shop_id = s.shop_id
        WHERE s.owner_id = $1
        GROUP BY s.shop_city, s.shop_state, s.shop_country
        ORDER BY revenue DESC, order_count DESC
      `,
      [ownerId]
    );

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({
        city: row.city,
        state: row.state,
        country: row.country,
        shop_count: numeric(row.shop_count),
        revenue: numeric(row.revenue),
        order_count: numeric(row.order_count),
        avg_rating: numeric(row.avg_rating),
      })),
    });
  } catch (error) {
    console.error("Dashboard geo insights error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getOwnerDashboardInventoryAlerts = async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ success: false, message: "Owner session is required" });
    }

    const shop = await getOwnerShop(ownerId, req.body?.shop_id || null);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }

    const productTable = await getProductTableIfExists(shop);

    if (!productTable) {
      return res.status(200).json({
        success: true,
        data: {
          low_stock: [],
          overstock: [],
          summary: {
            low_stock_count: 0,
            overstock_count: 0,
          },
        },
      });
    }

    const lowStockQuery = await pool.query(
      `SELECT product_name, quantity, price, created_at FROM ${productTable} WHERE quantity <= 5 ORDER BY quantity ASC LIMIT 10`
    );

    const overstockQuery = await pool.query(
      `SELECT product_name, quantity, price, created_at FROM ${productTable} WHERE quantity >= 50 ORDER BY quantity DESC LIMIT 10`
    );

    return res.status(200).json({
      success: true,
      data: {
        low_stock: lowStockQuery.rows.map((row) => ({
          product_name: row.product_name,
          quantity: numeric(row.quantity),
          price: numeric(row.price),
          created_at: row.created_at,
        })),
        overstock: overstockQuery.rows.map((row) => ({
          product_name: row.product_name,
          quantity: numeric(row.quantity),
          price: numeric(row.price),
          created_at: row.created_at,
        })),
        summary: {
          low_stock_count: lowStockQuery.rows.length,
          overstock_count: overstockQuery.rows.length,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard inventory alerts error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

module.exports = {
  getOwnerDashboardSummary,
  getOwnerDashboardOverview,
  getOwnerDashboardTopProducts,
  getOwnerDashboardTrendData,
  getOwnerDashboardFeedbackInsights,
  getOwnerDashboardConversationSummary,
  getOwnerDashboardGeoInsights,
  getOwnerDashboardInventoryAlerts,
};
