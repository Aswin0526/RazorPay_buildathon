# Customer Rating & Feedback System - ShopMate

## Overview
The ShopMate application has a comprehensive customer rating and feedback management system that allows customers to rate and review shops, and enables shop owners to view and analyze this feedback.

---

## Database Schema

### Table: `shop_feedback`
Stores all customer feedback and ratings for shops.

**Columns:**
- `customer_id` - ID of the customer providing feedback
- `shop_id` - ID of the shop being rated
- `ratings` - Numerical rating (1-5 stars)
- `feedback` - Text comment from the customer
- `created_at` - Timestamp of when feedback was submitted

**Key Features:**
- Each customer can provide feedback only once per shop
- If a customer re-submits feedback, it **updates** the existing record (upsert operation)

---

## Backend Implementation

### API Endpoints

#### 1. **Submit/Update Feedback** (Customer)
**Route:** `POST /api/customers/addfeedback`
**Controller:** [customerController.js](backend/controllers/customerController.js#L751) - `handleFeedbackSubmit()`
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "customer_id": "customer_id",
  "shopId": "shop_id",
  "rating": 4,
  "feedback": "Great shop, excellent products!"
}
```

**Logic:**
1. Check if customer already has feedback for this shop
2. If exists → **UPDATE** the rating and feedback
3. If not exists → **INSERT** new feedback record
4. Return the created/updated feedback object

**Code:**
```javascript
// Check if feedback exists
const existing = await pool.query(
  `SELECT * FROM shop_feedback WHERE customer_id = $1 AND shop_id = $2`,
  [customer_id, shopId]
);

// Update if exists, Insert if new
if (existing.rowCount > 0) {
  result = await pool.query(
    `UPDATE shop_feedback SET ratings = $3, feedback = $4 
     WHERE customer_id = $1 AND shop_id = $2 RETURNING *`,
    [customer_id, shopId, rating, feedback]
  );
} else {
  result = await pool.query(
    `INSERT INTO shop_feedback (customer_id, shop_id, ratings, feedback)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [customer_id, shopId, rating, feedback]
  );
}
```

#### 2. **Get Feedbacks** (Owner)
**Route:** `POST /api/owners/getfeedbacks`
**Controller:** [ownerController.js](backend/controllers/ownerController.js#L544) - `getFeedBack()`
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "shop_id": "shop_id"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "feedback": "Great products!",
      "ratings": 4,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Fetches:** Last 50 feedbacks ordered by most recent first

#### 3. **Get Average Ratings** (Owner)
**Route:** `POST /api/owners/getAvgRatings`
**Controller:** [ownerController.js](backend/controllers/ownerController.js#L583) - `getAvgRatings()`
**Authentication:** Required (JWT)

**Response:**
```json
{
  "success": true,
  "data": {
    "avg_rating": 4.2,
    "total_feedback": 25
  }
}
```

#### 4. **Dashboard Summary** (Owner)
**Route:** `POST /api/owners/getdashboardsummary`
**Controller:** [ownerDashboardController.js](backend/controllers/ownerDashboardController.js#L60) - `getDashboardSummary()`

**Calculates:**
- Average rating across all shop feedbacks
- Total feedback count
- Recent feedbacks (last 8)
- Rating breakdown (distribution of 5, 4, 3, 2, 1 star ratings)

**SQL Query Highlights:**
```sql
SELECT
  ROUND(AVG(ratings), 2) AS avg_rating,
  COUNT(*)::INT AS total_feedback,
  SUM(CASE WHEN ratings >= 4 THEN 1 ELSE 0 END)::INT AS positive_reviews,
  SUM(CASE WHEN ratings BETWEEN 2 AND 3 THEN 1 ELSE 0 END)::INT AS neutral_reviews,
  SUM(CASE WHEN ratings < 2 THEN 1 ELSE 0 END)::INT AS negative_reviews
FROM shop_feedback
WHERE shop_id = $1
```

---

## Frontend Implementation

### Customer-Facing Pages

#### 1. **Shop Detail Page** (`/shop-detail`)
**File:** [ShopDetail.jsx](frontend/src/pages/ShopDetail.jsx)

**Sections:**

##### A. Ratings & Reviews Display
- Shows **average rating** in large text (e.g., "4.5")
- Displays **star visualization** (⭐⭐⭐⭐☆)
- Shows **total review count** (e.g., "25 reviews")
- **Rating breakdown bar chart** showing distribution:
  - 5 stars: ████████░ 40%
  - 4 stars: ██████░░░ 25%
  - 3 stars: ████░░░░░ 15%
  - 2 stars: ██░░░░░░░ 10%
  - 1 star: █░░░░░░░░ 10%

**Code:**
```javascript
<div className="rating-overview">
  <div className="rating-big">{avgRating || 0}</div>
  {renderStars(avgRating || 0)}
  <p className="rating-total">{feedbacks.length} reviews</p>
</div>

<div className="rating-breakdown">
  {[5, 4, 3, 2, 1].map((stars) => {
    const count = feedbacks.filter(f => Math.floor(f.ratings || 0) === stars).length;
    const percentage = feedbacks.length > 0 ? Math.round((count / feedbacks.length) * 100) : 0;
    return (
      <div key={stars} className="rating-row">
        <span className="rating-stars-text">{stars} ⭐</span>
        <div className="rating-bar">
          <div className="rating-fill" style={{ width: `${percentage}%` }}></div>
        </div>
        <span className="rating-count">{count}</span>
      </div>
    );
  })}
</div>
```

##### B. Recent Feedback Display
- Shows scrollable list of recent feedbacks
- Each feedback card displays:
  - **Date** (formatted, e.g., "1/15/2024")
  - **Rating** (star visualization)
  - **Comment** (customer's text feedback)

**Code:**
```javascript
{feedbacks.length === 0 ? (
  <p className="no-feedback">No feedbacks yet</p>
) : (
  <>
    {[...feedbacks, ...feedbacks, ...feedbacks].map((feedback, index) => (
      <div key={index} className="feedback-card">
        <div className="feedback-header">
          <span className="feedback-date">
            {feedback.created_at ? new Date(feedback.created_at).toLocaleDateString() : 'N/A'}
          </span>
        </div>
        <div className="feedback-stars">
          {'⭐'.repeat(parseInt(feedback.ratings) || 0)}
        </div>
        <p className="feedback-comment">{feedback.feedback || 'No comment'}</p>
      </div>
    ))}
  </>
)}
```

##### C. Add Rating & Feedback Form
- **Interactive star rating** (1-5 stars with hover effects)
- **Textarea** for feedback comment
- **Submit button** (disabled until rating is selected)

**Code:**
```javascript
const handleStarClick = (rating) => {
  setUserRating(rating);
};

// Star input rendering
{[1, 2, 3, 4, 5].map((star) => (
  <span
    key={star}
    className={`star ${star <= (hoverRating || userRating) ? 'filled' : ''}`}
    onClick={() => handleStarClick(star)}
    onMouseEnter={() => setHoverRating(star)}
    onMouseLeave={() => setHoverRating(0)}
    style={{
      cursor: 'pointer',
      fontSize: '32px',
      color: star <= (hoverRating || userRating) ? '#FFC107' : '#E0E0E0',
    }}
  >
    ★
  </span>
))}

<textarea
  id="user-feedback"
  value={userFeedback}
  onChange={(e) => setUserFeedback(e.target.value)}
  placeholder="Share your experience with this shop..."
/>

<button
  className="submit-feedback-btn"
  onClick={handleFeedbackSubmit}
  disabled={userRating === 0}
>
  Submit Feedback
</button>
```

---

### Shop Owner Dashboard

#### 1. **Overview Tab** (`/shop/dashboard?tab=overview`)
**Files:** 
- [Shopdash.jsx](frontend/src/pages/Shopdash.jsx) (main page)
- [Overview.jsx](frontend/src/components/Overview.jsx) (component)

**Displays:**

##### A. Ratings & Reviews Section
- Large **average rating display**
- **Star visualization**
- **Review count**
- **Rating breakdown** (5-star distribution with percentage bars)
- **Online conversion rate** (analytics metric)

**Layout:**
```
┌─ Ratings & Reviews ──────┐
│ ★★★★☆ 4.2               │
│ 42 reviews               │
│                          │
│ 5⭐ ████████░ 40% (17)   │
│ 4⭐ ██████░░░ 25% (11)   │
│ 3⭐ ████░░░░░ 15% (6)    │
│ 2⭐ ██░░░░░░░ 10% (4)    │
│ 1⭐ █░░░░░░░░ 10% (4)    │
└──────────────────────────┘
```

##### B. Recent Feedback Section
- Scrollable carousel of feedback cards
- Each card shows:
  - **Date** posted
  - **Star rating** (⭐ symbols)
  - **Feedback text**
- Feedback cards automatically duplicate for seamless scrolling effect

**Code (Overview.jsx):**
```javascript
<section className="section feedback-section">
  <h2 className="section-title">Recent Feedback</h2>
  <div className="feedback-container">
    {feedbacks.length === 0 ? (
      <p className="no-feedback">No feedbacks yet</p>
    ) : (
      <>
        {[...feedbacks, ...feedbacks, ...feedbacks].map((feedback, index) => (
          <div key={index} className="feedback-card">
            <div className="feedback-header">
              <span className="feedback-date">
                {new Date(feedback.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="feedback-stars">
              {'⭐'.repeat(parseInt(feedback.ratings) || 0)}
            </div>
            <p className="feedback-comment">{feedback.feedback || 'No comment'}</p>
          </div>
        ))}
      </>
    )}
  </div>
</section>
```

#### 2. **Owner Dashboard Component** (`ownerDashboard.jsx`)
**File:** [ownerDashboard.jsx](frontend/src/components/ownerDashboard.jsx#L300)

**Displays:**
- **Recent Feedback Cards** (similar to Overview but card-based layout)
- **Most Wanted Products** section below

**Layout:**
```
┌─ Recent Feedback ────────┬─ Most Wanted Products ─┐
│ Card 1: Rating + Text    │ Product 1             │
│ Card 2: Rating + Text    │ Product 2             │
│ Card 3: Rating + Text    │ Product 3             │
└──────────────────────────┴───────────────────────┘
```

---

## Data Flow Diagram

```
CUSTOMER ACTION
    ↓
Customer Rates & Comments Shop
    ↓
POST /api/customers/addfeedback
    ↓
Backend: Check if feedback exists
    ├─ EXISTS → UPDATE shop_feedback
    └─ NEW → INSERT into shop_feedback
    ↓
Database: shop_feedback table updated
    ↓

OWNER VIEWS FEEDBACK
    ↓
GET /api/owners/getfeedbacks
  or
GET /api/owners/getdashboardsummary
    ↓
Backend: Query shop_feedback table
    ├─ Calculate avg_rating
    ├─ Get recent_feedbacks
    ├─ Count total_feedback
    └─ Build rating_breakdown
    ↓
Response: JSON with all metrics
    ↓
Frontend: Display in Overview/Dashboard
    ├─ Show rating breakdown chart
    ├─ Display recent feedback cards
    └─ Show avg rating & review count
```

---

## Key Features

### 1. **Upsert Pattern**
- Customers can update their feedback
- Only stores one feedback per customer per shop
- Prevents duplicate entries

### 2. **Rich Analytics**
- Average rating with 2 decimal places
- Rating distribution breakdown
- Positive/Neutral/Negative review counts
- Review count trending

### 3. **Real-time Display**
- Recent feedbacks ordered by newest first
- Live updates when new feedback submitted
- Instant calculation of average ratings

### 4. **User-Friendly UI**
- Interactive star rating selector with hover effects
- Visual rating bars with percentages
- Scrollable feedback carousel for smooth viewing
- No-feedback fallback messages

### 5. **Visual Feedback Indicators**
- Star ratings (⭐ symbols)
- Color-coded progress bars (yellow/orange gradient)
- Date formatting (locale-specific)
- Clear typography hierarchy

---

## Styling

### CSS Files
- [ShopDetail.css](frontend/src/styles/ShopDetail.css#L289) - Customer feedback display
- [Overview.css](frontend/src/styles/Overview.css#L88) - Owner dashboard ratings display

### Key Classes
```css
.ratings-container      /* Main ratings section */
.rating-overview        /* Average rating display */
.rating-big             /* Large rating number */
.rating-total           /* Review count */
.rating-breakdown       /* Distribution bars */
.rating-row             /* Individual rating bar */
.rating-bar             /* Bar background */
.rating-fill            /* Filled portion */
.feedback-container     /* Feedback carousel */
.feedback-card          /* Individual feedback item */
.feedback-header        /* Date and metadata */
.feedback-stars         /* Star display */
.feedback-comment       /* Comment text */
```

---

## Utility Functions

### Star Rendering (renderStars function)
Used in multiple components to display star ratings:

**Logic:**
1. Calculate full stars (Math.floor)
2. Check for half star
3. Fill remaining with empty stars

```javascript
const renderStars = (rating) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
  
  let stars = '';
  for (let i = 0; i < fullStars; i++) stars += '⭐';
  if (hasHalfStar) stars += '⭐'; // or use half star symbol
  for (let i = 0; i < emptyStars; i++) stars += '☆';
  
  return <div className="rating-stars">{stars}</div>;
};
```

---

## Summary

The ShopMate rating and feedback system provides:

✅ **Customer Side:** Easy-to-use 5-star rating interface with optional text feedback  
✅ **Data Management:** Upsert pattern prevents duplicates, stores feedback efficiently  
✅ **Owner Analytics:** Comprehensive dashboard showing ratings distribution and recent reviews  
✅ **Real-time Updates:** Instant feedback processing and display  
✅ **Responsive Design:** Works seamlessly across devices  
✅ **User Experience:** Visual indicators, smooth scrolling, clear hierarchy  

The system is production-ready with proper error handling, authentication checks, and database constraints.
