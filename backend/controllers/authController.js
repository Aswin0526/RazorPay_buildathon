const pool = require("../config/database");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/tokenUtils");

const refreshAccessToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    const result = await pool.query(
      `SELECT * FROM refresh_tokens 
       WHERE refresh_token = $1 
       AND is_revoked = FALSE 
       AND expires_at > NOW()`,
      [refresh_token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    const tokenData = result.rows[0];

    const accessToken = generateAccessToken({
      id: tokenData.user_id,
      type: tokenData.user_type,
    });

    res.status(200).json({
      success: true,
      message: "Access token refreshed successfully",
      data: {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: "15m",
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  refreshAccessToken,
};
