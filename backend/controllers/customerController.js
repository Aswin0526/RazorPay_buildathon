const pool = require("../config/database");
const bcrypt = require("bcryptjs");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/tokenUtils");
const {
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidPincode,
} = require("../utils/validation");

const registerCustomer = async (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      customer_state,
      customer_country,
      customer_city,
      customer_pincode,
      customer_password,
    } = req.body;

    if (
      !customer_name ||
      !customer_phone ||
      !customer_email ||
      !customer_state ||
      !customer_country ||
      !customer_city ||
      !customer_pincode ||
      !customer_password
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (!isValidEmail(customer_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (!isValidPhone(customer_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    if (!isValidPassword(customer_password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    if (!isValidPincode(customer_pincode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pincode",
      });
    }

    // Check if email or phone already exists
    const existingUser = await pool.query(
      "SELECT * FROM customers WHERE customer_email = $1 OR customer_phone = $2",
      [customer_email, customer_phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email or phone already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(customer_password, 10);

    // Insert customer
    const result = await pool.query(
      `INSERT INTO customers (customer_name, customer_phone, customer_email, customer_state, 
       customer_country, customer_city, customer_pincode, customer_password) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING customer_id, customer_name, customer_email, customer_phone`,
      [
        customer_name,
        customer_phone,
        customer_email,
        customer_state,
        customer_country,
        customer_city,
        customer_pincode,
        hashedPassword,
      ]
    );

    const customer = result.rows[0];

    const accessToken = generateAccessToken({
      id: customer.customer_id,
      email: customer.customer_email,
      type: "customer",
    });

    const refreshToken = generateRefreshToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [customer.customer_id, "customer", refreshToken, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: "Customer registered successfully",
      data: {
        customer,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
      },
    });
  } catch (error) {
    console.error("Register customer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const loginCustomer = async (req, res) => {
  try {
    const { customer_email, customer_password } = req.body;
    console.log(customer_email, customer_password);
    // Validation
    if (!customer_email || !customer_password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find customer
    const result = await pool.query(
      "SELECT * FROM customers WHERE customer_email = $1",
      [customer_email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const customer = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(
      customer_password,
      customer.customer_password
    );

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate access and refresh tokens
    const accessToken = generateAccessToken({
      id: customer.customer_id,
      email: customer.customer_email,
      type: "customer",
    });

    const refreshToken = generateRefreshToken();

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [customer.customer_id, "customer", refreshToken, expiresAt]
    );

    delete customer.customer_password;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        customer,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
      },
    });
  } catch (error) {
    console.error("Login customer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getCustomerProfile = async (req, res) => {
  try {
    console.log("in");
    const customerId = req.user.id;

    const result = await pool.query(
      "SELECT customer_id, customer_name, customer_phone, customer_email, customer_state, customer_country, customer_city, customer_pincode, created_at FROM customers WHERE customer_id = $1",
      [customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get customer profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const logoutCustomer = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    await pool.query(
      "UPDATE refresh_tokens SET is_revoked = TRUE WHERE refresh_token = $1",
      [refresh_token]
    );

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout customer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getShopInLoc = async (req, res) => {
  try {
    const { HCountry, HState, HCity, type } = req.body;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (HCountry && HCountry.trim() !== "") {
      whereConditions.push(`s.shop_country ILIKE $${paramIndex}`);
      queryParams.push(`%${HCountry}%`);
      paramIndex++;
    }

    if (HState && HState.trim() !== "") {
      whereConditions.push(`s.shop_state ILIKE $${paramIndex}`);
      queryParams.push(`%${HState}%`);
      paramIndex++;
    }

    if (HCity && HCity.trim() !== "") {
      whereConditions.push(`s.shop_city ILIKE $${paramIndex}`);
      queryParams.push(`%${HCity}%`);
      paramIndex++;
    }

    if (type && type.trim() !== "" && type !== "All") {
      whereConditions.push(`s.type = $${paramIndex}`);
      queryParams.push(type);
      paramIndex++;
    }

    console.log(whereConditions, queryParams, paramIndex);

    if (whereConditions.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No filters provided",
      });
    }

    const whereClause = whereConditions.join(" OR ");

    const result = await pool.query(
      `
      SELECT 
        s.shop_id,
        s.shop_name,
        s.type,
        s.shop_city,
        s.shop_state,
        s.shop_country,
        s.shop_pincode,
        encode(si.logo, 'base64') AS logo
      FROM shops s
      LEFT JOIN shop_images si ON s.shop_id = si.shop_id
      WHERE ${whereClause}
      `,
      queryParams
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get shops error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getShopDetails = async (req, res) => {
  try {
    const { shop_id } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      `
      SELECT 
        s.shop_id,
        s.shop_name,
        s.type,
        s.shop_city,
        s.shop_state,
        s.shop_country,
        s.shop_pincode,
        s.shop_email,
        s.shop_phone,
        s.shop_website,
        encode(si.logo, 'base64') AS logo
      FROM shops s
      LEFT JOIN shop_images si ON s.shop_id = si.shop_id
      WHERE s.shop_id = $1
      `,
      [shop_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get shop details error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const addWishList = async (req, res) => {
  try {
    console.log("inside addWishList");
    const { cust_id, productId, shopId, type, product_name } = req.body;
    console.log(cust_id, productId, shopId, type, product_name);
    if (!cust_id || !productId || !shopId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID and Product ID are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO wishlist (cust_id, shop_id, product_id, product_name, type)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (cust_id, shop_id, product_id) DO NOTHING;
      `,
      [cust_id, shopId, productId, product_name, type]
    );

    if (result.rows.length > 0) {
      res.status(200).json({
        success: true,
        message: "Product added to wishlist successfully",
        data: { wishlist_id: result.rows[0].id },
      });
    } else {
      res.status(200).json({
        success: true,
        message: "Product already in wishlist",
      });
    }
  } catch (error) {
    console.error("Add to wishlist error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getWishList = async (req, res) => {
  try {
    console.log("inside getWishList");

    const { cust_id } = req.body;

    if (!cust_id) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const wishlistResult = await pool.query(
      `
      SELECT wishlist_id, shop_id, product_id
      FROM wishlist
      WHERE cust_id = $1
      `,
      [cust_id]
    );

    if (wishlistResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "Wishlist is empty",
      });
    }

    const finalData = [];

    for (const item of wishlistResult.rows) {
      const { shop_id, product_id, wishlist_id } = item;

      const shopResult = await pool.query(
        `SELECT shop_name, type FROM shops WHERE shop_id = $1`,
        [shop_id]
      );
      if (shopResult.rows.length === 0) continue;

      const { shop_name, type } = shopResult.rows[0];

      const tableName = `${type}_${shop_id}_${shop_name}`
        .toLowerCase()
        .replace(/\s+/g, "_");

      const productResult = await pool.query(
        `SELECT id, product_name, image1, image2, image3, image4, image5, quantity
     FROM ${tableName} WHERE id = $1`,
        [product_id]
      );
      if (productResult.rows.length === 0) continue;

      const toBase64Image = (buffer, mime = "image/png") => {
        if (!buffer) return null;
        return `data:image/jpeg;base64,${buffer.toString("base64")}`;
      };

      const row = productResult.rows[0];

      const imageType = "image/jpeg";

      finalData.push({
        wishlist_id,
        shop_id,
        shop_name,
        type,
        product_id,
        product_name: row.product_name,
        images: [
          toBase64Image(row.image1, imageType),
          toBase64Image(row.image2, imageType),
          toBase64Image(row.image3, imageType),
          toBase64Image(row.image4, imageType),
          toBase64Image(row.image5, imageType),
        ].filter(Boolean),
        quantity: row.quantity,
      });
    }

    // ✅ Send response AFTER the loop
    res.status(200).json({
      success: true,
      count: finalData.length,
      data: finalData,
    });
  } catch (error) {
    console.error("Get wishlist error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const deleteWishlist = async (req, res) => {
  const { product_id, shop_id, custId } = req.body;

  if (!product_id || !shop_id || !custId) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM wishlist
       WHERE product_id = $1
       AND shop_id = $2
       AND cust_id = $3
       RETURNING *`,
      [product_id, shop_id, custId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Wishlist item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Wishlist item deleted successfully",
    });
  } catch (error) {
    console.error("Delete wishlist error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const order = async (req, res) => {
  const { cust_id, shop_id, pickup_date, pickup_time, products } = req.body;
  if (!products || products.length === 0) {
    return res.status(400).json({ message: "No products in order" });
  }
  try {
    await pool.query("BEGIN");

    const orderResult = await pool.query(
      `INSERT INTO orders (cust_id, shop_id, pickup_date, pickup_time)
       VALUES ($1, $2, $3, $4)
       RETURNING order_id`,
      [cust_id, shop_id, pickup_date, pickup_time]
    );

    const order_id = orderResult.rows[0].order_id;

    const insertItemQuery = `INSERT INTO order_items (order_id, product_id, quantity)
       VALUES ($1, $2, $3)`;

    for (const item of products) {
      await pool.query(insertItemQuery, [
        order_id,
        item.product_id,
        item.quantity,
      ]);
    }

    await pool.query("COMMIT");

    res.status(201).json({
      message: "Order placed successfully",
      order_id,
    });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Order creation failed" });
  }
};

const getOrders = async (req, res) => {
  const { cust_id } = req.body;

  if (!cust_id) {
    return res.status(400).json({ message: "Customer ID required" });
  }

  try {
    /**
     * STEP 1: Fetch orders + order_items + shop info
     */
    const ordersResult = await pool.query(
      `
      SELECT
        o.order_id,
        o.shop_id,
        o.pickup_date,
        o.pickup_time,
        o.note,
        o.state,
        o.created_at,

        s.shop_name,
        s.type,

        json_agg(
          json_build_object(
            'product_id', oi.product_id,
            'quantity', oi.quantity
          )
        ) AS products

      FROM orders o
      JOIN shops s ON o.shop_id = s.shop_id
      JOIN order_items oi ON o.order_id = oi.order_id

      WHERE o.cust_id = $1

      GROUP BY
        o.order_id,
        o.shop_id,
        o.pickup_date,
        o.pickup_time,
        o.note,
        o.state,
        o.created_at,
        s.shop_name,
        s.type

      ORDER BY o.created_at DESC
      `,
      [cust_id]
    );

    const orders = ordersResult.rows;

    /**
     * STEP 2: Fetch product names from dynamic shop tables
     */
    for (const order of orders) {
      if (!order.products || order.products.length === 0) continue;

      const normalizedShopName = order.shop_name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

      const tableName = `${order.type}_${order.shop_id}_${normalizedShopName}`
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");

      const productIds = order.products.map((p) => p.product_id);

      try {
        const productResult = await pool.query(
          `
          SELECT id, product_name
          FROM ${tableName}
          WHERE id = ANY($1)
          `,
          [productIds]
        );

        const productMap = {};
        productResult.rows.forEach((p) => {
          productMap[p.id] = p.product_name;
        });

        /**
         * FIX APPLIED HERE:
         * product_id → match against id
         */
        order.products = order.products.map((p) => ({
          product_id: p.product_id,
          quantity: p.quantity,
          product_name: productMap[p.product_id] || "Unknown Product",
        }));
      } catch (err) {
        console.error(`Product table error (${tableName}):`, err.message);

        order.products = order.products.map((p) => ({
          product_id: p.product_id,
          quantity: p.quantity,
          product_name: "Unknown Product",
        }));
      }
    }

    res.status(200).json(orders);
  } catch (err) {
    console.error("Fetch orders error:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

const handleFeedbackSubmit = async (req, res) => {
  const { customer_id, shopId, rating, feedback } = req.body;
  console.log(customer_id, shopId, rating, feedback);
  if (!customer_id || !shopId) {
    return res.status(400).json({ message: "Login again" });
  }

  try {
    const existing = await pool.query(
      `SELECT * FROM shop_feedback WHERE customer_id = $1 AND shop_id = $2`,
      [customer_id, shopId]
    );

    let result;

    if (existing.rowCount > 0) {
      result = await pool.query(
        `
      UPDATE shop_feedback
      SET ratings = $3, feedback = $4
      WHERE customer_id = $1 AND shop_id = $2
      RETURNING *
      `,
        [customer_id, shopId, rating, feedback]
      );
    } else {
      result = await pool.query(
        `
      INSERT INTO shop_feedback (customer_id, shop_id, ratings, feedback)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
        [customer_id, shopId, rating, feedback]
      );
    }

    res.status(201).json({
      message: "Feedback submitted successfully",
      feedback: result.rows[0],
    });
  } catch (err) {
    console.error("Feedback submit error:", err);
    res.status(500).json({ message: "Failed to submit feedback" });
  }
};

const updateCustomerProfile = async (req, res) => {
  try {
    const customerId = req.user.id;
    const {
      customer_name,
      customer_phone,
      customer_email,
      customer_state,
      customer_country,
      customer_city,
      customer_pincode,
    } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    // Validate required fields
    if (!customer_name || !customer_phone || !customer_email || 
        !customer_state || !customer_country || !customer_city || !customer_pincode) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate email format
    if (!isValidEmail(customer_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Validate phone format
    if (!isValidPhone(customer_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    // Validate pincode format
    if (!isValidPincode(customer_pincode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pincode",
      });
    }

    // Check if email is already used by another customer
    const existingEmail = await pool.query(
      "SELECT customer_id FROM customers WHERE customer_email = $1 AND customer_id != $2",
      [customer_email, customerId]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered by another account",
      });
    }

    // Check if phone is already used by another customer
    const existingPhone = await pool.query(
      "SELECT customer_id FROM customers WHERE customer_phone = $1 AND customer_id != $2",
      [customer_phone, customerId]
    );

    if (existingPhone.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Phone number is already registered by another account",
      });
    }

    // Update customer profile
    const result = await pool.query(
      `UPDATE customers 
       SET customer_name = $1, customer_phone = $2, customer_email = $3, 
           customer_state = $4, customer_country = $5, customer_city = $6, 
           customer_pincode = $7, updated_at = CURRENT_TIMESTAMP
       WHERE customer_id = $8
       RETURNING customer_id, customer_name, customer_phone, customer_email, 
                 customer_state, customer_country, customer_city, customer_pincode, updated_at`,
      [
        customer_name,
        customer_phone,
        customer_email,
        customer_state,
        customer_country,
        customer_city,
        customer_pincode,
        customerId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update customer profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const handleShopPoint = async (req, res) => {
  const { shopId, shopType, shopName, custId } = req.body;

  if (!shopId || !shopType || !shopName || !custId) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    const update = await pool.query(
      `UPDATE shop_hits
      SET hit_count = hit_count + 1
      WHERE customer_id = $1 AND shop_id = $2
      RETURNING *`,
      [custId, shopId]
    );

    if (update.rowCount === 0) {
      await pool.query(
        `INSERT INTO shop_hits (customer_id, shop_id, hit_count)
        VALUES ($1, $2, 1)`,
        [custId, shopId]
      );
    }

    res.status(200).json({ message: "Success" });

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ message: "Failed to update hit count" });
  }
};

const getMostNeeded = async (req, res) => {
    const { city, state, country } = req.body;

    try {
        const query = `
            SELECT 
                p.*, 
                COUNT(v.id)::INTEGER AS total_votes
            FROM products p
            LEFT JOIN votes v ON p.id = v.product_id
            WHERE p.city = $1 
              AND p.state = $2 
              AND p.country = $3
              AND p.created_at >= NOW() - INTERVAL '1 month'
            GROUP BY p.id
            ORDER BY total_votes DESC, p.created_at DESC;
        `;
        
        const result = await pool.query(query, [city, state, country]);

        if (result.rows.length === 0) {
            return res.status(200).json({ success: false, data: [] });
        }

        // Convert bytea pic to base64
        const products = result.rows.map(product => ({
            ...product,
            pic: product.pic ? `data:image/jpeg;base64,${product.pic.toString('base64')}` : null
        }));

        res.status(200).json({
            success: true,
            data: products
        });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

const addVote = async (req, res) => {
    const { productId, customerId } = req.body;
    console.log("in", productId, customerId);

    if (!productId || !customerId) {
        return res.status(400).json({ 
            success: false, 
            message: "Product ID and Customer ID are required" 
        });
    }

    try {
        // Check if user already voted for this product
        const existingVote = await pool.query(
            `SELECT * FROM votes WHERE product_id = $1 AND cust_id = $2`,
            [productId, customerId]
        );

        if (existingVote.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: "You have already voted for this product" 
            });
        }

        // Insert the vote
        const result = await pool.query(
            `INSERT INTO votes (product_id, cust_id) VALUES ($1, $2) RETURNING *`,
            [productId, customerId]
        );

        res.status(201).json({
            success: true,
            message: "Vote added successfully",
            data: result.rows[0]
        });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

const addProduct = async (req, res) => {
    const { product_name, type, description, state, city, country } = req.body;

    if (!product_name || !state || !city || !country) {
        return res.status(400).json({ 
            success: false, 
            message: "Product name, state, city, and country are required" 
        });
    }

    try {
        // Handle pic if it's a base64 string (already uploaded)
        let picBuffer = null;
        if (req.body.pic && typeof req.body.pic === 'string' && req.body.pic.startsWith('data:')) {
            const base64Data = req.body.pic.replace(/^data:image\/\w+;base64,/, '');
            picBuffer = Buffer.from(base64Data, 'base64');
        }

        const result = await pool.query(
            `INSERT INTO products (product_name, type, description, pic, state, city, country) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING *`,
            [product_name, type, description, picBuffer, state, city, country]
        );

        // Convert pic to base64 for response if exists
        const product = result.rows[0];
        if (product.pic) {
            product.pic = `data:image/jpeg;base64,${product.pic.toString('base64')}`;
        }

        res.status(201).json({
            success: true,
            message: "Product added successfully",
            data: product
        });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};


module.exports = {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
  logoutCustomer,
  getShopInLoc,
  getShopDetails,
  addWishList,
  getWishList,
  deleteWishlist,
  order,
  getOrders,
  handleFeedbackSubmit,
  updateCustomerProfile,
  handleShopPoint,
  getMostNeeded,
  addVote,
  addProduct
};
