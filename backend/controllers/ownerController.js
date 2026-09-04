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

const base64ToBuffer = (base64String) => {
  if (!base64String || base64String === 'null' || base64String === 'undefined') return null;
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64Data, "base64");
};

const productTableMetadata = new Map();
const productTableIndexes = new Set();

const quoteIdentifier = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

const createProductTable = async (shopType, shopId, shopName) => {
  const normalizedShopName = shopName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const tableName = `${shopType}_${shopId}_${normalizedShopName}`;

  console.log(tableName);
  let createTableSQL = "";

  switch (shopType.toLowerCase()) {
    case "electronics":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          product_name TEXT NOT NULL,
          category TEXT,
          brand TEXT,
          model_number TEXT,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          warranty_years INT,
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    case "grocery":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          product_name TEXT NOT NULL,
          brand TEXT,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          expiry_date DATE,
          weight VARCHAR(20),
          is_organic BOOLEAN DEFAULT FALSE,
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    case "cosmetics":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          product_name TEXT NOT NULL,
          brand TEXT,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          skin_type VARCHAR(30),
          expiry_date DATE,
          ingredients TEXT,
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    case "clothing":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          product_name TEXT NOT NULL,
          brand TEXT,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          size VARCHAR(10),
          color VARCHAR(30),
          material VARCHAR(50),
          gender VARCHAR(10),
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    case "bookstore":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          author TEXT,
          publisher TEXT,
          isbn VARCHAR(20) UNIQUE,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          genre VARCHAR(50),
          language VARCHAR(30),
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    default:
      throw new Error(`Unsupported shop type: ${shopType}`);
  }

  await pool.query(createTableSQL);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${tableName}_created_at_idx`)}
     ON ${quoteIdentifier(tableName)} (created_at DESC)`
  );
  await pool.query("SELECT refresh_global_products_view()");
  return tableName;
};

const insertShopImages = async (client, shopId, logo, images) => {
  try {
    const logoBuffer = base64ToBuffer(logo);
    const pic1Buffer =
      images && images.pic1 ? base64ToBuffer(images.pic1) : null;
    const pic2Buffer =
      images && images.pic2 ? base64ToBuffer(images.pic2) : null;
    const pic3Buffer =
      images && images.pic3 ? base64ToBuffer(images.pic3) : null;
    const pic4Buffer =
      images && images.pic4 ? base64ToBuffer(images.pic4) : null;
    const pic5Buffer =
      images && images.pic5 ? base64ToBuffer(images.pic5) : null;

    await client.query(
      `INSERT INTO shop_images (shop_id, logo, pic1, pic2, pic3, pic4, pic5) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        shopId,
        logoBuffer,
        pic1Buffer,
        pic2Buffer,
        pic3Buffer,
        pic4Buffer,
        pic5Buffer,
      ]
    );
  } catch (error) {
    console.error("Error inserting shop images:", error);
    throw error;
  }
};

const updateShopImage = async (client, shopId, imageKey, imageData) => {
  try {
    const imageBuffer = base64ToBuffer(imageData);
    await client.query(
      `UPDATE shop_images SET ${imageKey} = $1 WHERE shop_id = $2`,
      [imageBuffer, shopId]
    );
  } catch (error) {
    console.error(`Error updating ${imageKey}:`, error);
    throw error;
  }
};

const registerOwner = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      owner_name,
      owner_email,
      owner_phone,
      owner_location,
      shop_name,
      shop_phone,
      shop_email,
      shop_website,
      shop_country,
      shop_state,
      shop_city,
      shop_pincode,
      shop_type,
      shop_gmap_link,
      shop_password,
      logo,
      images,
    } = req.body;

    if (!owner_name || !owner_email || !owner_phone || !owner_location) {
      return res.status(400).json({
        success: false,
        message:
          "Owner fields required: owner_name, owner_email, owner_phone, owner_location",
      });
    }

    const requiredShopFields = [
      { name: "shop_name", value: shop_name },
      { name: "shop_phone", value: shop_phone },
      { name: "shop_email", value: shop_email },
      { name: "shop_country", value: shop_country },
      { name: "shop_state", value: shop_state },
      { name: "shop_city", value: shop_city },
      { name: "shop_pincode", value: shop_pincode },
      { name: "shop_password", value: shop_password },
      { name: "shop_type", value: shop_type },
    ];

    const missingFields = requiredShopFields
      .filter((field) => !field.value || field.value.trim() === "")
      .map((field) => field.name);

    if (missingFields.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
        missing_fields: missingFields,
      });
    }

    // Validate logo is present
    if (!logo) {
      return res.status(400).json({
        success: false,
        message: "Shop logo is mandatory",
      });
    }

    // Validate at least one shop image is present
    const hasAtLeastOneImage =
      images &&
      (images.pic1 || images.pic2 || images.pic3 || images.pic4 || images.pic5);

    if (!hasAtLeastOneImage) {
      return res.status(400).json({
        success: false,
        message: "At least one shop image is required",
      });
    }

    if (!isValidEmail(owner_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner email format",
      });
    }

    if (!isValidEmail(shop_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop email format",
      });
    }

    if (!isValidPhone(owner_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner phone number",
      });
    }

    if (!isValidPhone(shop_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop phone number",
      });
    }

    if (!isValidPassword(shop_password)) {
      return res.status(400).json({
        success: false,
        message: "Shop password must be at least 6 characters",
      });
    }

    if (!isValidPincode(shop_pincode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop pincode",
      });
    }

    await client.query("BEGIN");

    const existingOwner = await client.query(
      "SELECT * FROM owners WHERE owner_email = $1 OR owner_phone = $2",
      [owner_email, owner_phone]
    );

    if (existingOwner.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Owner email or phone already registered",
      });
    }

    const existingShop = await client.query(
      "SELECT * FROM shops WHERE shop_email = $1",
      [shop_email]
    );

    if (existingShop.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Shop email already registered",
      });
    }

    const ownerResult = await client.query(
      `INSERT INTO owners (owner_name, owner_email, owner_phone, owner_location) 
       VALUES ($1, $2, $3, $4) RETURNING owner_id, owner_name, owner_email, owner_phone, owner_location`,
      [owner_name, owner_email, owner_phone, owner_location]
    );

    const owner = ownerResult.rows[0];

    const hashedPassword = await bcrypt.hash(shop_password, 10);

    const shopResult = await client.query(
      `INSERT INTO shops (owner_id, shop_name, shop_phone, shop_email, shop_website, 
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, shop_password, type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING shop_id, owner_id, shop_name, shop_phone, shop_email, shop_website, 
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, created_at`,
      [
        owner.owner_id,
        shop_name,
        shop_phone,
        shop_email,
        shop_website,
        shop_country,
        shop_state,
        shop_city,
        shop_pincode,
        shop_gmap_link,
        hashedPassword,
        shop_type,
      ]
    );

    const shop = shopResult.rows[0];

    await insertShopImages(client, shop.shop_id, logo, images);

    await client.query("COMMIT");

    const accessToken = generateAccessToken({
      id: owner.owner_id,
      email: owner.owner_email,
      shopId: shop.shop_id,
      type: "owner",
    });

    const refreshToken = generateRefreshToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [owner.owner_id, "owner", refreshToken, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: "Owner and shop registered successfully",
      data: {
        owner,
        shop,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Register owner error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const loginOwner = async (req, res) => {
  try {
    const { shop_email, shop_password } = req.body;

    if (!shop_email || !shop_password) {
      return res.status(400).json({
        success: false,
        message: "Shop email and password are required",
      });
    }

    const shopResult = await pool.query(
      "SELECT * FROM shops WHERE shop_email = $1",
      [shop_email]
    );

    if (shopResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const shop = shopResult.rows[0];

    const isValidPassword = await bcrypt.compare(
      shop_password,
      shop.shop_password
    );

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const ownerResult = await pool.query(
      "SELECT * FROM owners WHERE owner_id = $1",
      [shop.owner_id]
    );

    const owner = ownerResult.rows[0];

    const accessToken = generateAccessToken({
      id: owner.owner_id,
      email: owner.owner_email,
      shopId: shop.shop_id,
      type: "owner",
    });

    const refreshToken = generateRefreshToken();

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [owner.owner_id, "owner", refreshToken, expiresAt]
    );

    delete shop.shop_password;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        owner,
        shop,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
      },
    });
  } catch (error) {
    console.error("Login owner error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getOwnerProfile = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const result = await pool.query(
      "SELECT owner_id, owner_name, owner_email, owner_phone, owner_location, created_at FROM owners WHERE owner_id = $1",
      [ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get owner profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getFeedBack = async (req, res) => {
  try {
    const { shop_id } = req.body;
    console.log("inside");
    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      `SELECT feedback, ratings, created_at 
      FROM shop_feedback
      WHERE shop_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
      [shop_id]
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAvgRatings = async (req, res) => {
  try {
    const { shop_id } = req.body;
    console.log("inside Avg ratings");
    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      `
    SELECT ROUND(AVG(ratings), 2) AS average_rating
    FROM shop_feedback
    WHERE shop_id = $1;
    `,
      [shop_id]
    );

    const avgRating = result.rows[0].average_rating;
    console.log(avgRating);
    res.status(200).json({
      success: true,
      data: avgRating,
    });
  } catch (error) {
    console.error("Get feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getOnlineOrderConversionRate = async (req, res) => {
  try {
    const { shop_id } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const onlineOrdersQuery = await pool.query(
      `
        SELECT
          COUNT(*)::INT AS online_orders,
          COUNT(*) FILTER (
            WHERE (
              full_analysis -> 'payment_status' ->> 'completed' = 'true'
              OR full_analysis ->> 'outcome' = 'PAYMENT_COMPLETED'
            )
          )::INT AS paid_online_orders,
          ROUND(
            100.0 * COUNT(*) FILTER (
              WHERE (
                full_analysis -> 'payment_status' ->> 'completed' = 'true'
                OR full_analysis ->> 'outcome' = 'PAYMENT_COMPLETED'
              )
            ) / NULLIF(COUNT(*), 0),
            2
          ) AS conversion_rate
        FROM public.conversation_analyses
        WHERE shop_id = $1::text
      `,
      [String(shop_id)]
    );

    const offlineOrdersQuery = await pool.query(
      `
        SELECT COUNT(*)::INT AS offline_orders
        FROM public.orders
        WHERE shop_id = $1::text
      `,
      [String(shop_id)]
    );

    const onlineRow = onlineOrdersQuery.rows[0] || {
      online_orders: 0,
      paid_online_orders: 0,
      conversion_rate: 0,
    };

    const offlineRow = offlineOrdersQuery.rows[0] || {
      offline_orders: 0,
    };

    const onlineOrders = Number(onlineRow.online_orders || 0);
    const offlineOrders = Number(offlineRow.offline_orders || 0);
    const paidOnlineOrders = Number(onlineRow.paid_online_orders || 0);
    const conversionRate = Number(onlineRow.conversion_rate || 0);

    return res.status(200).json({
      success: true,
      data: {
        online_orders: onlineOrders,
        offline_orders: offlineOrders,
        total_orders: onlineOrders + offlineOrders,
        paid_online_orders: paidOnlineOrders,
        conversion_rate: conversionRate,
      },
    });
  } catch (error) {
    console.error("Get online order conversion rate error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const logoutOwner = async (req, res) => {
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
    console.error("Logout owner error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const registerOwnerBasic = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      owner_name,
      owner_email,
      owner_phone,
      owner_location,
      shop_name,
      shop_phone,
      shop_email,
      shop_website,
      shop_country,
      shop_state,
      shop_city,
      shop_pincode,
      shop_type,
      shop_gmap_link,
      shop_password,
    } = req.body;
    console.log("request body", req.body);

    // Remove logo and images from the main request validation
    if (!owner_name || !owner_email || !owner_phone || !owner_location) {
      const missingOwnerFields = [];
      if (!owner_name) missingOwnerFields.push("owner_name");
      if (!owner_email) missingOwnerFields.push("owner_email");
      if (!owner_phone) missingOwnerFields.push("owner_phone");
      if (!owner_location) missingOwnerFields.push("owner_location");

      return res.status(400).json({
        success: false,
        message: `Missing required owner fields: ${missingOwnerFields.join(
          ", "
        )}`,
        missing_fields: missingOwnerFields,
      });
    }

    const requiredShopFields = [
      { name: "shop_name", value: shop_name },
      { name: "shop_phone", value: shop_phone },
      { name: "shop_email", value: shop_email },
      { name: "shop_country", value: shop_country },
      { name: "shop_state", value: shop_state },
      { name: "shop_city", value: shop_city },
      { name: "shop_pincode", value: shop_pincode },
      { name: "shop_password", value: shop_password },
      { name: "shop_type", value: shop_type },
    ];

    const missingShopFields = requiredShopFields
      .filter((field) => !field.value || field.value.trim() === "")
      .map((field) => field.name);

    if (missingShopFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required shop fields: ${missingShopFields.join(
          ", "
        )}`,
        missing_fields: missingShopFields,
      });
    }

    if (!isValidEmail(owner_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner email format",
      });
    }

    if (!isValidEmail(shop_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop email format",
      });
    }

    if (!isValidPhone(owner_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner phone number",
      });
    }

    if (!isValidPhone(shop_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop phone number",
      });
    }

    if (!isValidPassword(shop_password)) {
      return res.status(400).json({
        success: false,
        message: "Shop password must be at least 6 characters",
      });
    }

    if (!isValidPincode(shop_pincode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop pincode",
      });
    }

    await client.query("BEGIN");

    const existingOwner = await client.query(
      "SELECT * FROM owners WHERE owner_email = $1 OR owner_phone = $2",
      [owner_email, owner_phone]
    );

    if (existingOwner.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Owner email or phone already registered",
      });
    }

    const existingShop = await client.query(
      "SELECT * FROM shops WHERE shop_email = $1",
      [shop_email]
    );

    if (existingShop.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Shop email already registered",
      });
    }

    const ownerResult = await client.query(
      `INSERT INTO owners (owner_name, owner_email, owner_phone, owner_location) 
       VALUES ($1, $2, $3, $4) RETURNING owner_id, owner_name, owner_email, owner_phone, owner_location`,
      [owner_name, owner_email, owner_phone, owner_location]
    );

    const owner = ownerResult.rows[0];

    const hashedPassword = await bcrypt.hash(shop_password, 10);

    const shopResult = await client.query(
      `INSERT INTO shops (owner_id, shop_name, shop_phone, shop_email, shop_website, 
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, shop_password, type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING shop_id, owner_id, shop_name, shop_phone, shop_email, shop_website, 
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, created_at`,
      [
        owner.owner_id,
        shop_name,
        shop_phone,
        shop_email,
        shop_website,
        shop_country,
        shop_state,
        shop_city,
        shop_pincode,
        shop_gmap_link,
        hashedPassword,
        shop_type,
      ]
    );
    console.log("till shop data upload no issues");
    const shop = shopResult.rows[0];

    // Create empty shop_images row (will be updated later with images)
    await client.query(
      `INSERT INTO shop_images (shop_id, logo, pic1, pic2, pic3, pic4, pic5) 
       VALUES ($1, NULL, NULL, NULL, NULL, NULL, NULL)`,
      [shop.shop_id]
    );

    // Create product table based on shop type
    console.log(
      `Creating product table for shop type: ${shop_type}, shop_id: ${shop.shop_id}, shop_name: ${shop_name}`
    );
    const productTableName = await createProductTable(
      shop_type,
      shop.shop_id,
      shop_name
    );
    console.log(`Product table created: ${productTableName}`);

    await client.query("COMMIT");

    const accessToken = generateAccessToken({
      id: owner.owner_id,
      email: owner.owner_email,
      shopId: shop.shop_id,
      type: "owner",
    });

    const refreshToken = generateRefreshToken();

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [owner.owner_id, "owner", refreshToken, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: "Shop registered successfully. Please upload logo and images.",
      data: {
        owner,
        shop,
        product_table: productTableName,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
        needs_images: true,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Register owner basic error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const uploadShopImage = async (req, res) => {
  const client = await pool.connect();

  try {
    console.log("in");
    let shop_id, image_type, image_key, image_data;
    console.log(req.file);
    if (req.file) {
      shop_id = req.body.shop_id;
      image_type = req.body.image_type;
      image_key = req.body.image_key;
      console.log(shop_id, image_type, image_key)

      const mimeType = req.file.mimetype || 'image/jpeg';
      image_data = `data:${mimeType};base64,${req.file.buffer.toString('base64')}`;
      console.log(image_data)
    } else {
      // Data came as regular form fields (base64 string)
      shop_id = req.body.shop_id;
      image_type = req.body.image_type;
      image_key = req.body.image_key;
      image_data = req.body.image_data;
    }

    const authHeader = req.headers.authorization;

    if (!shop_id || !image_type) {
      return res.status(400).json({
        success: false,
        message: "shop_id and image_type are required",
      });
    }

    // Allow null or empty string image_data for deletion
    if (image_data === undefined) {
      return res.status(400).json({
        success: false,
        message: "image_data is required",
      });
    }

    // Validate image_type
    if (!["logo", "shop"].includes(image_type)) {
      return res.status(400).json({
        success: false,
        message: "image_type must be 'logo' or 'shop'",
      });
    }

    // For shop images, validate image_key
    if (image_type === "shop" && !image_key) {
      return res.status(400).json({
        success: false,
        message: "image_key is required for shop images (pic1-pic5)",
      });
    }

    await client.query("BEGIN");

    // Determine the column name
    const columnName = image_type === "logo" ? "logo" : image_key;

    const imageBuffer = base64ToBuffer(image_data);

    await client.query(
      `UPDATE shop_images SET ${columnName} = $1 WHERE shop_id = $2`,
      [imageBuffer, shop_id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: `${image_type} uploaded successfully`,
      data: {
        shop_id,
        image_type,
        image_key: image_type === "logo" ? null : image_key,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Upload image error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};


const completeRegistration = async (req, res) => {
  const client = await pool.connect();

  try {
    const { shop_id, logo, images } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    if (!logo) {
      return res.status(400).json({
        success: false,
        message: "Shop logo is mandatory",
      });
    }

    const hasAtLeastOneImage =
      images &&
      (images.pic1 || images.pic2 || images.pic3 || images.pic4 || images.pic5);
    if (!hasAtLeastOneImage) {
      return res.status(400).json({
        success: false,
        message: "At least one shop image is required",
      });
    }

    await client.query("BEGIN");

    const logoBuffer = base64ToBuffer(logo);
    const pic1Buffer =
      images && images.pic1 ? base64ToBuffer(images.pic1) : null;
    const pic2Buffer =
      images && images.pic2 ? base64ToBuffer(images.pic2) : null;
    const pic3Buffer =
      images && images.pic3 ? base64ToBuffer(images.pic3) : null;
    const pic4Buffer =
      images && images.pic4 ? base64ToBuffer(images.pic4) : null;
    const pic5Buffer =
      images && images.pic5 ? base64ToBuffer(images.pic5) : null;

    await client.query(
      `UPDATE shop_images SET logo = $1, pic1 = $2, pic2 = $3, pic3 = $4, pic4 = $5, pic5 = $6 WHERE shop_id = $7`,
      [
        logoBuffer,
        pic1Buffer,
        pic2Buffer,
        pic3Buffer,
        pic4Buffer,
        pic5Buffer,
        shop_id,
      ]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Shop images uploaded successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Complete registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const getLogo = async (req, res) => {
  try {
    const { shop_id } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      "SELECT logo FROM shop_images WHERE shop_id = $1",
      [shop_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const logoData = result.rows[0].logo;

    if (!logoData) {
      return res.status(404).json({
        success: false,
        message: "Logo not found",
      });
    }

    const base64Image = logoData.toString("base64");
    const imageType = logoData.type || "image/jpeg";

    res.status(200).json({
      success: true,
      data: {
        logo: `data:${imageType};base64,${base64Image}`,
      },
    });
  } catch (error) {
    console.error("Get logo error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getShopImages = async (req, res) => {
  try {
    const { shop_id } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      "SELECT logo, pic1, pic2, pic3, pic4, pic5 FROM shop_images WHERE shop_id = $1",
      [shop_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const imagesData = result.rows[0];

    // Helper function to convert buffer to base64
    const bufferToBase64 = (buffer) => {
      if (!buffer) return null;
      return `data:${buffer.type || "image/jpeg"};base64,${buffer.toString(
        "base64"
      )}`;
    };

    res.status(200).json({
      success: true,
      data: {
        logo: bufferToBase64(imagesData.logo),
        pic1: bufferToBase64(imagesData.pic1),
        pic2: bufferToBase64(imagesData.pic2),
        pic3: bufferToBase64(imagesData.pic3),
        pic4: bufferToBase64(imagesData.pic4),
        pic5: bufferToBase64(imagesData.pic5),
      },
    });
  } catch (error) {
    console.error("Get shop images error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get products from shop's product table
const getProducts = async (req, res) => {
  try {
    const { table_name, shop_type, page = 1, limit = 10 } = req.body;

    if (!table_name) {
      return res.status(400).json({
        success: false,
        message: "Table name is required",
      });
    }

    const safeTableName = quoteIdentifier(table_name);
    let columns = productTableMetadata.get(table_name);

    if (!columns) {
      const columnsResult = await pool.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table_name]
      );

      if (columnsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Table not found",
        });
      }

      columns = columnsResult.rows;
      productTableMetadata.set(table_name, columns);
    }

    if (!productTableIndexes.has(table_name)) {
      await pool.query(
        `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${table_name}_created_at_idx`)}
         ON ${safeTableName} (created_at DESC)`
      );
      productTableIndexes.add(table_name);
    }

    const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 100);
    const offset = (pageNumber - 1) * pageSize;

    const [productsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM ${safeTableName}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query(`SELECT COUNT(*)::INTEGER AS total FROM ${safeTableName}`),
    ]);

    const products = productsResult.rows.map((product) => {
      const productCopy = { ...product };

      for (let i = 1; i <= 5; i++) {
        const imgKey = `image${i}`;
        if (productCopy[imgKey]) {
          try {
            const buffer = Buffer.isBuffer(productCopy[imgKey])
              ? productCopy[imgKey]
              : Buffer.from(productCopy[imgKey], "binary");
            productCopy[imgKey] = `data:image/jpeg;base64,${buffer.toString(
              "base64"
            )}`;
          } catch (e) {
            productCopy[imgKey] = null;
          }
        }
      }

      return productCopy;
    });

    res.status(200).json({
      success: true,
      data: {
        products,
        columns,
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total: countResult.rows[0].total,
          totalPages: Math.ceil(countResult.rows[0].total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const addProduct = async (req, res) => {
  try {
    const { table_name, shop_type, product_data } = req.body;
    console.log(req.body);
    console.log();
    if (!table_name || !product_data) {
      return res.status(400).json({
        success: false,
        message: "Table name and product data are required",
      });
    }

    const columnsResult = await pool.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = $1 
         AND column_name NOT IN ('id', 'created_at', 'updated_at')
       ORDER BY ordinal_position`,
      [table_name]
    );

    console.log("column names", columnsResult);

    if (columnsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    const allowedColumns = columnsResult.rows.map((col) => col.column_name);
    const insertData = {};

    allowedColumns.forEach((col) => {
      if (product_data[col] !== undefined) {
        insertData[col] = product_data[col];
      }
    });

    console.log("insert data", insertData);

    const columnNames = Object.keys(insertData);
    const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(insertData);

    const insertQuery = `
      INSERT INTO ${table_name} (${columnNames.join(", ")})
      VALUES (${placeholders})
      RETURNING *
    `;
    console.log(insertQuery);
    const result = await pool.query(insertQuery, values);

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Add product error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { table_name, shop_type, product_id, product_data } = req.body;

    if (!table_name || !product_id || !product_data) {
      return res.status(400).json({
        success: false,
        message: "Table name, product ID, and product data are required",
      });
    }

    const idColumn = "id"

    const columnsResult = await pool.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = $1 
         AND column_name NOT IN ('id', 'created_at', 'updated_at')
       ORDER BY ordinal_position`,
      [table_name]
    );

    if (columnsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }
    const allowedColumns = columnsResult.rows.map((col) => col.column_name);
    const updateData = {};

    allowedColumns.forEach((col) => {
      if (product_data[col] !== undefined) {
        updateData[col] = product_data[col];
      }
    });

    const setClause = Object.keys(updateData)
      .map((col, i) => `${col} = $${i + 1}`)
      .join(", ");
    const values = [...Object.values(updateData), product_id];

    const updateQuery = `
      UPDATE ${table_name}
      SET ${setClause}
      WHERE ${idColumn} = $${values.length}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete a product
const deleteProduct = async (req, res) => {
  try {
    const { table_name, shop_type, product_id } = req.body;

    if (!table_name || !product_id) {
      return res.status(400).json({
        success: false,
        message: "Table name and product ID are required",
      });
    }

    const idColumn = "id"

    const deleteQuery = `DELETE FROM ${table_name} WHERE ${idColumn} = $1 RETURNING *`;
    const result = await pool.query(deleteQuery, [product_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getOrders = async (req, res) => {
  const { shop_id } = req.body;

  if (!shop_id) {
    return res.status(400).json({ message: "Shop ID required" });
  }

  try {
    const ordersResult = await pool.query(
      `
      SELECT
        o.order_id,
        o.cust_id,
        o.shop_id,
        o.pickup_date,
        o.pickup_time,
        o.note,
        o.state,
        o.created_at,

        s.shop_name,
        s.type,

        c.customer_name,
        c.customer_phone,
        c.customer_email,

        json_agg(
          json_build_object(
            'product_id', oi.product_id,
            'quantity', oi.quantity
          )
        ) AS products

      FROM orders o
      JOIN shops s 
        ON o.shop_id = s.shop_id
      JOIN customers c 
        ON o.cust_id = c.customer_id
      JOIN order_items oi 
        ON o.order_id = oi.order_id

      WHERE o.shop_id = $1

      GROUP BY
        o.order_id,
        o.cust_id,
        o.shop_id,
        o.pickup_date,
        o.pickup_time,
        o.note,
        o.state,
        o.created_at,
        s.shop_name,
        s.type,
        c.customer_name,
        c.customer_phone,
        c.customer_email

      ORDER BY o.created_at DESC
      `,
      [shop_id]
    );

    const orders = ordersResult.rows;

    // Resolve product names from dynamic shop table
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

        order.products = order.products.map((p) => ({
          product_id: p.product_id,
          quantity: p.quantity,
          product_name: productMap[p.product_id] || "Unknown Product",
        }));
      } catch (err) {
        console.error(`Dynamic table error (${tableName}):`, err.message);
        order.products = order.products.map((p) => ({
          ...p,
          product_name: "Unknown Product",
        }));
      }
    }

    res.status(200).json(orders);
  } catch (err) {
    console.error("Fetch shop orders error:", err);
    res.status(500).json({ message: "Failed to fetch shop orders" });
  }
};

// const getOrders = async (req, res) => {
//   const { shop_id } = req.body;

//   if (!shop_id) {
//     return res.status(400).json({ message: "Shop ID required" });
//   }

//   try {
//     const ordersResult = await pool.query(
//       `
//       SELECT
//         o.order_id,
//         o.cust_id,
//         o.shop_id,
//         o.pickup_date,
//         o.pickup_time,
//         o.note,
//         o.state,
//         o.created_at,

//         s.shop_name,
//         s.type,

//         json_agg(
//           json_build_object(
//             'product_id', oi.product_id,
//             'quantity', oi.quantity
//           )
//         ) AS products

//       FROM orders o
//       JOIN shops s ON o.shop_id = s.shop_id
//       JOIN order_items oi ON o.order_id = oi.order_id

//       WHERE o.shop_id = $1

//       GROUP BY
//         o.order_id,
//         o.cust_id,
//         o.shop_id,
//         o.pickup_date,
//         o.pickup_time,
//         o.note,
//         o.state,
//         o.created_at,
//         s.shop_name,
//         s.type

//       ORDER BY o.created_at DESC
//       `,
//       [shop_id]
//     );

//     const orders = ordersResult.rows;

//     for (const order of orders) {
//       if (!order.products || order.products.length === 0) continue;

//       const normalizedShopName = order.shop_name
//         .trim()
//         .toLowerCase()
//         .replace(/\s+/g, "_")
//         .replace(/[^a-z0-9_]/g, "");

//       const tableName = `${order.type}_${order.shop_id}_${normalizedShopName}`
//         .toLowerCase()
//         .replace(/[^a-z0-9_]/g, "");

//       const productIds = order.products.map((p) => p.product_id);

//       try {
//         const productResult = await pool.query(
//           `
//           SELECT id, product_name
//           FROM ${tableName}
//           WHERE id = ANY($1)
//           `,
//           [productIds]
//         );

//         const productMap = {};
//         productResult.rows.forEach((p) => {
//           productMap[p.id] = p.product_name;
//         });

//         order.products = order.products.map((p) => ({
//           product_id: p.product_id,
//           quantity: p.quantity,
//           product_name: productMap[p.product_id] || "Unknown Product",
//         }));
//       } catch (err) {
//         console.error(`Dynamic table error (${tableName}):`, err.message);
//         order.products = order.products.map((p) => ({
//           ...p,
//           product_name: "Unknown Product",
//         }));
//       }
//     }

//     res.status(200).json(orders);
//   } catch (err) {
//     console.error("Fetch shop orders error:", err);
//     res.status(500).json({ message: "Failed to fetch shop orders" });
//   }
// };

const approveOrder = async (req, res) => {
  const { order_id, note } = req.body;

  if (!order_id) {
    return res.status(400).json({ message: "Order ID required" });
  }

  try {
    const result = await pool.query(
      `
      UPDATE orders
      SET
        state = 'approved',
        note = COALESCE($2, note)
      WHERE order_id = $1
      RETURNING *
      `,
      [order_id, note]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({
      message: "Order approved successfully",
      order: result.rows[0],
    });
  } catch (err) {
    console.error("Approve order error:", err);
    res.status(500).json({ message: "Failed to approve order" });
  }
};

const markDone = async (req, res) => {
  const { order_id, note } = req.body;

  if (!order_id) {
    return res.status(400).json({ message: "Order ID required" });
  }

  try {
    const result = await pool.query(
      `
      UPDATE orders
      SET
        state = 'done',
        note = COALESCE($2, note)
      WHERE order_id = $1
      RETURNING *
      `,
      [order_id, note]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({
      message: "Order marked as done",
      order: result.rows[0],
    });
  } catch (err) {
    console.error("Mark done error:", err);
    res.status(500).json({ message: "Failed to mark order as done" });
  }
};

// const markOrderDoneAndDelete = async (req, res) => {
//   const { order_id, note } = req.body;

//   if (!order_id) {
//     return res.status(400).json({ message: "Order ID required" });
//   }

//   try {
//     // STEP 1: Update state to done
//     const updateResult = await pool.query(
//       `
//       UPDATE orders
//       SET
//         state = 'done',
//         note = COALESCE($2, note)
//       WHERE order_id = $1
//       RETURNING *
//       `,
//       [order_id, note]
//     );

//     if (updateResult.rowCount === 0) {
//       return res.status(404).json({ message: "Order not found" });
//     }

//     const updatedOrder = updateResult.rows[0];

//     await pool.query(`DELETE FROM order_items WHERE order_id = $1`, [order_id]);

//     await pool.query(`DELETE FROM orders WHERE order_id = $1`, [order_id]);

//     res.status(200).json({
//       message: "Order completed and deleted",
//       order: updatedOrder,
//     });
//   } catch (err) {
//     console.error("Done & delete error:", err);
//     res.status(500).json({ message: "Failed to complete order" });
//   }
// };

const markOrderDoneAndDelete = async (req, res) => {
  const { order_id, note } = req.body;

  if (!order_id) {
    return res.status(400).json({ message: "Order ID required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `
      SELECT o.shop_id, s.shop_name, s.type
      FROM orders o
      JOIN shops s ON o.shop_id = s.shop_id
      WHERE o.order_id = $1
      `,
      [order_id]
    );

    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found" });
    }

    const { shop_id, shop_name, type } = orderResult.rows[0];

    const updatedOrderResult = await client.query(
      `
      UPDATE orders
      SET
        state = 'done',
        note = COALESCE($2, note)
      WHERE order_id = $1
      RETURNING *
      `,
      [order_id, note]
    );

    const updatedOrder = updatedOrderResult.rows[0];

    const itemsResult = await client.query(
      `
      SELECT product_id, quantity
      FROM order_items
      WHERE order_id = $1
      `,
      [order_id]
    );

    const normalizedShopName = shop_name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");

    const tableName = `${type}_${shop_id}_${normalizedShopName}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");

    for (const item of itemsResult.rows) {
      await client.query(
        `
        UPDATE ${tableName}
        SET quantity = quantity - $1
        WHERE id = $2 AND quantity >= $1
        `,
        [item.quantity, item.product_id]
      );
    }

    await client.query(`DELETE FROM order_items WHERE order_id = $1`, [
      order_id,
    ]);

    await client.query(`DELETE FROM orders WHERE order_id = $1`, [order_id]);

    await client.query("COMMIT");

    res.status(200).json({
      message: "Order completed, inventory updated, and order deleted",
      order: updatedOrder,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Done & delete error:", err);
    res.status(500).json({ message: "Failed to complete order" });
  } finally {
    client.release();
  }
};

const updateOwnerProfile = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { owner_name, owner_email, owner_phone, owner_location } = req.body;

    if (!ownerId) {
      return res.status(400).json({
        success: false,
        message: "Owner ID is required",
      });
    }

    // Validate required fields
    if (!owner_name || !owner_email || !owner_phone || !owner_location) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate email format
    if (!isValidEmail(owner_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Validate phone format
    if (!isValidPhone(owner_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    // Check if email is already used by another owner
    const existingEmail = await pool.query(
      "SELECT owner_id FROM owners WHERE owner_email = $1 AND owner_id != $2",
      [owner_email, ownerId]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered by another account",
      });
    }

    // Check if phone is already used by another owner
    const existingPhone = await pool.query(
      "SELECT owner_id FROM owners WHERE owner_phone = $1 AND owner_id != $2",
      [owner_phone, ownerId]
    );

    if (existingPhone.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Phone number is already registered by another account",
      });
    }

    // Update owner profile
    const result = await pool.query(
      `UPDATE owners 
       SET owner_name = $1, owner_email = $2, owner_phone = $3, owner_location = $4, updated_at = CURRENT_TIMESTAMP
       WHERE owner_id = $5
       RETURNING owner_id, owner_name, owner_email, owner_phone, owner_location, updated_at`,
      [owner_name, owner_email, owner_phone, owner_location, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Owner profile updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update owner profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updateShopProfile = async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const {
      shop_name,
      shop_phone,
      shop_email,
      shop_website,
      shop_country,
      shop_state,
      shop_city,
      shop_pincode,
      shop_gmap_link,
    } = req.body;

    if (!shopId) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    // Validate required fields
    if (!shop_name || !shop_phone || !shop_email ||
      !shop_country || !shop_state || !shop_city || !shop_pincode) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing",
      });
    }

    // Validate email format
    if (!isValidEmail(shop_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop email format",
      });
    }

    // Validate phone format
    if (!isValidPhone(shop_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop phone number",
      });
    }

    // Validate pincode format
    if (!isValidPincode(shop_pincode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pincode",
      });
    }

    // Check if email is already used by another shop
    const existingEmail = await pool.query(
      "SELECT shop_id FROM shops WHERE shop_email = $1 AND shop_id != $2",
      [shop_email, shopId]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered by another shop",
      });
    }

    // Check if phone is already used by another shop
    const existingPhone = await pool.query(
      "SELECT shop_id FROM shops WHERE shop_phone = $1 AND shop_id != $2",
      [shop_phone, shopId]
    );

    if (existingPhone.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Phone number is already registered by another shop",
      });
    }

    // Update shop profile
    const result = await pool.query(
      `UPDATE shops 
       SET shop_name = $1, shop_phone = $2, shop_email = $3, 
           shop_website = $4, shop_country = $5, shop_state = $6, 
           shop_city = $7, shop_pincode = $8, shop_gmap_link = $9, updated_at = CURRENT_TIMESTAMP
       WHERE shop_id = $10
       RETURNING shop_id, owner_id, shop_name, shop_phone, shop_email, 
                 shop_website, shop_country, shop_state, shop_city, 
                 shop_pincode, shop_gmap_link, type, updated_at`,
      [
        shop_name,
        shop_phone,
        shop_email,
        shop_website || '',
        shop_country,
        shop_state,
        shop_city,
        shop_pincode,
        shop_gmap_link || '',
        shopId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Shop profile updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update shop profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const bufferToBase64 = (buffer) => {
  if (!buffer) return null;
  return `data:${buffer.type || "image/jpeg"};base64,${buffer.toString("base64")}`;
};

const getShopHitCount = async (req, res) => {
  const { type, city, state, country } = req.body;

  if (!type || !city || !state || !country) {
    return res.status(400).json({ message: "Missing data" });
  }

  try {
    const result = await pool.query(
      `
      SELECT s.shop_name,
             COALESCE(SUM(sh.hit_count), 0) AS total_hits
      FROM shops s
      LEFT JOIN shop_hits sh
             ON s.shop_id = sh.shop_id
      WHERE s.type = $1
        AND s.shop_city = $2
        AND s.shop_state = $3
        AND s.shop_country = $4
      GROUP BY s.shop_id, s.shop_name
      ORDER BY total_hits DESC
      `,
      [type, city, state, country]
    );

    res.status(200).json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const WishListCount = async (req, res) => {
  try {
    const { type, city, state, country } = req.body;

    const result = await pool.query(
      `
      SELECT 
          w.product_id,
          w.product_name,
          w.type,
          COUNT(*) AS wishlist_count
      FROM wishlist w
      JOIN shops s ON w.shop_id = s.shop_id
      WHERE w.created_at >= NOW() - INTERVAL '1 month'
        AND ($1::product_status IS NULL OR w.type = $1)
        AND ($2::text IS NULL OR s.shop_city = $2)
        AND ($3::text IS NULL OR s.shop_state = $3)
        AND ($4::text IS NULL OR s.shop_country = $4)
      GROUP BY w.product_id, w.product_name, w.type
      ORDER BY wishlist_count DESC
      LIMIT 5;
      `,
      [type || null, city || null, state || null, country || null]
    );

    return res.status(200).json({
      success: true,
      data: result.rows
    });

  } catch (e) {
    console.error("Wishlist Count Error:", e);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

// Get most voted products for a shop type and location
const getMostWantedProducts = async (req, res) => {
  try {
    const { type, city, state, country } = req.body;

    if (!type || !city || !state || !country) {
      return res.status(400).json({
        success: false,
        message: "Type, city, state, and country are required"
      });
    }

    console.log(type, city, state, country)
    const result = await pool.query(
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
        COUNT(v.id)::INTEGER AS total_votes
      FROM products p
      LEFT JOIN votes v ON p.id = v.product_id
        AND v.created_at >= NOW() - INTERVAL '1 month'
      WHERE p.type = $1
        AND p.city = $2
        AND p.state = $3
        AND p.country = $4
        AND p.created_at >= NOW() - INTERVAL '1 month'
      GROUP BY p.id
      ORDER BY total_votes DESC, p.created_at DESC
      LIMIT 20
      `,
      [type, city, state, country]
    );

    // Convert pic to base64 if exists
    const products = result.rows.map(product => ({
      ...product,
      pic: product.pic ? `data:image/jpeg;base64,${product.pic.toString('base64')}` : null
    }));

    return res.status(200).json({
      success: true,
      data: products
    });

  } catch (e) {
    console.error("Get Most Wanted Products Error:", e);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};

// Get conversation analyses for a shop
const getConversationAnalyses = async (req, res) => {
  try {
    const {
      shop_id,
      search = '',
      outcome = '',
      page = 1,
      limit = 10
    } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required"
      });
    }

    const offset = (page - 1) * limit;

    // Build query with filters
    let whereConditions = ['shop_id = $1'];
    let queryParams = [shop_id];
    let paramIndex = 2;

    // Search filter on summary or customer_intent
    if (search && search.trim()) {
      whereConditions.push(`(summary ILIKE $${paramIndex} OR customer_intent ILIKE $${paramIndex})`);
      queryParams.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Outcome filter
    if (outcome && outcome.trim()) {
      whereConditions.push(`outcome = $${paramIndex}`);
      queryParams.push(outcome.trim());
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM conversation_analyses 
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    const dataQuery = `
      SELECT 
        id,
        session_id,
        user_id,
        shop_id,
        shop_name,
        city,
        state,
        product_type,
        started_at,
        ended_at,
        duration_minutes,
        turn_count,
        outcome,
        final_stage,
        summary,
        customer_intent,
        sentiment_arc,
        stage_progression,
        recommended_followup,
        products_discussed,
        key_insights,
        missed_opportunities,
        stages_reached,
        images_shared,
        sql_queries_made,
        created_at
      FROM conversation_analyses
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);
    const result = await pool.query(dataQuery, queryParams);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: {
        conversations: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages
        }
      }
    });

  } catch (error) {
    console.error("Get conversation analyses error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ─────────────────────────────────────────────
// PRODUCT DIRECTIONS
// ─────────────────────────────────────────────

const getProductDirections = async (req, res) => {
  try {
    const { product_id, shop_id } = req.body;
    if (!product_id || !shop_id) {
      return res.status(400).json({ success: false, message: 'product_id and shop_id are required' });
    }
    const result = await pool.query(
      'SELECT * FROM public.product_directions WHERE product_id = $1 AND shop_id = $2',
      [product_id, shop_id]
    );
    if (result.rows.length === 0) {
      return res.status(200).json({ success: true, data: null });
    }
    const row = result.rows[0];
    const toDataUri = (buf) => {
      if (!buf) return null;
      const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64');
      return `data:image/jpeg;base64,${b64}`;
    };
    return res.status(200).json({
      success: true,
      data: {
        id: row.id,
        product_id: row.product_id,
        direction1: row.direction1 || null,
        direction2: row.direction2 || null,
        direction3: row.direction3 || null,
        direction4: row.direction4 || null,
        direction5: row.direction5 || null,
        image1: toDataUri(row.image1),
        image2: toDataUri(row.image2),
        image3: toDataUri(row.image3),
        image4: toDataUri(row.image4),
        image5: toDataUri(row.image5),
      }
    });
  } catch (error) {
    console.error('getProductDirections error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

const addProductDirections = async (req, res) => {
  try {
    const { product_id, shop_id, directions } = req.body;
    if (!product_id || !shop_id || !directions) {
      return res.status(400).json({ success: false, message: 'product_id, shop_id, and directions are required' });
    }
    const { direction1, direction2, direction3, direction4, direction5,
      image1, image2, image3, image4, image5 } = directions;
    const result = await pool.query(
      `INSERT INTO public.product_directions
        (product_id, shop_id, direction1, image1, direction2, image2, direction3, image3, direction4, image4, direction5, image5)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        product_id, shop_id,
        direction1 || null, base64ToBuffer(image1),
        direction2 || null, base64ToBuffer(image2),
        direction3 || null, base64ToBuffer(image3),
        direction4 || null, base64ToBuffer(image4),
        direction5 || null, base64ToBuffer(image5),
      ]
    );
    return res.status(201).json({ success: true, message: 'Directions added', data: result.rows[0] });
  } catch (error) {
    console.error('addProductDirections error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

const updateProductDirections = async (req, res) => {
  try {
    const { product_id, shop_id, directions } = req.body;
    if (!product_id || !shop_id || !directions) {
      return res.status(400).json({ success: false, message: 'product_id, shop_id, and directions are required' });
    }
    const { direction1, direction2, direction3, direction4, direction5,
      image1, image2, image3, image4, image5 } = directions;
    const result = await pool.query(
      `UPDATE public.product_directions
       SET direction1=$3, image1=$4, direction2=$5, image2=$6,
           direction3=$7, image3=$8, direction4=$9, image4=$10,
           direction5=$11, image5=$12
       WHERE product_id=$1 AND shop_id=$2
       RETURNING id`,
      [
        product_id, shop_id,
        direction1 || null, base64ToBuffer(image1),
        direction2 || null, base64ToBuffer(image2),
        direction3 || null, base64ToBuffer(image3),
        direction4 || null, base64ToBuffer(image4),
        direction5 || null, base64ToBuffer(image5),
      ]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'No directions record found for product_id' });
    }
    return res.status(200).json({ success: true, message: 'Directions updated', data: result.rows[0] });
  } catch (error) {
    console.error('updateProductDirections error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

module.exports = {
  registerOwner,
  registerOwnerBasic,
  uploadShopImage,
  completeRegistration,
  getLogo,
  getShopImages,
  loginOwner,
  getOwnerProfile,
  getFeedBack,
  getAvgRatings,
  getOnlineOrderConversionRate,
  logoutOwner,
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  approveOrder,
  markDone,
  markOrderDoneAndDelete,
  updateOwnerProfile,
  updateShopProfile,
  getShopHitCount,
  WishListCount,
  getMostWantedProducts,
  getConversationAnalyses,
  getProductDirections,
  addProductDirections,
  updateProductDirections,
};
