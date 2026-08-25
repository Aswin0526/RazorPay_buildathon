# ShopMate

A voice-enabled assistant to guide customers through store navigation and provide product information when store staff are unavailable, enhancing self-service and customer experience.

<img src="./flowcharts/ps.png">

---

## Architecture Diagram

<img src="./flowcharts/architecture.png" />

## Tech Stack

### Frontend
- **Framework**: React 18 + Vite
- **Routing**: React Router v6
- **Styling**: CSS Modules
- **HTTP Client**: Fetch API
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT (JSON Web Tokens)
- **Middleware**: Helmet, CORS, Morgan, Multer
- **Package Manager**: npm

### Chatbot
- **Framework**: Flask (Python)
- **AI/ML**:
  - Google Gemini 2.5 Flash (LLM)
  - LangChain (SQL query generation)
  - Sentence Transformers (Intent classification)
- **Database**: PostgreSQL (SQLAlchemy)
- **Package Manager**: pip

### Database
- **Type**: PostgreSQL

---

## Project Structure

```
ShopMate/
├── frontend/                 # React Frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── Chat.jsx     # AI Chat interface
│   │   │   ├── Voice.jsx    # Voice input component
│   │   │   ├── Map.jsx      # Store map display
│   │   │   ├── Overview.jsx # Dashboard overview
│   │   │   ├── Stock.jsx    # Inventory management
│   │   │   └── ...
│   │   ├── pages/           # Page components
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Customerdash.jsx
│   │   │   └── Shopdash.jsx
│   │   ├── styles/          # CSS files
│   │   └── App.jsx          # Main app component
│   └── package.json
│
├── backend/                  # Express.js Backend
│   ├── controllers/         # Route handlers
│   │   ├── authController.js
│   │   ├── customerController.js
│   │   └── ownerController.js
│   ├── routes/              # API routes
│   │   ├── customerRoutes.js
│   │   ├── ownerRoutes.js
│   │   └── locationRoutes.js
│   ├── middleware/         # Custom middleware
│   │   └── auth.js          # JWT authentication
│   ├── config/
│   │   └── database.js      # DB connection
│   ├── utils/
│   │   ├── tokenUtils.js
│   │   └── validation.js
│   └── server.js            # Express server entry
│
├── chatbot/                 # Flask AI Chatbot
│   ├── server.py            # Main Flask app
│   ├── chatwithsql.py       # LangChain SQL chain
│   ├── lserver.py           # Additional server
│   ├── syncdb.py            # Database sync
│   └── requirements.txt
│
└── README.md
```

---

## Features

### Customer Features
- 🔊 **Voice-enabled shopping assistant** - Ask about products using voice
- 🛒 **Product search** - Find products by name, category, brand
- 📍 **Store navigation** - Locate products within the store
- 💰 **Price information** - Get real-time pricing
- 📦 **Stock availability** - Check product availability
- 🗺️ **Interactive maps** - Visual store layout

### Shop Owner Features
- 📊 **Dashboard** - Overview of shop performance
- 📦 **Inventory management** - Add/update/remove products
- 🛒 **Order management** - View and process orders
- 📈 **Analytics** - Sales and stock reports

### AI Chatbot Capabilities
- 🎯 **Intent classification** - Understand user queries
- 💬 **Natural language processing** - Human-like responses
- 🔍 **SQL generation** - Dynamic database queries
- ⏱️ **Rate limiting** - Prevent spam/abuse
- 👤 **Session management** - Personalized interactions

---

## API Endpoints

### Authentication
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/refresh` | Refresh access token | No |

### Customers
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/customers/register` | Customer registration | No |
| POST | `/api/customers/login` | Customer login | No |
| GET | `/api/customers/profile` | Get customer profile | Yes (JWT) |
| POST | `/api/customers/profile` | Get customer profile | Yes (JWT) |
| PUT | `/api/customers/updateProfile` | Update customer profile | Yes (JWT) |
| POST | `/api/customers/logout` | Customer logout | Yes (JWT) |
| POST | `/api/customers/getShopInLoc` | Get shops in a location | Yes (JWT) |
| POST | `/api/customers/getShopDetails` | Get shop details | Yes (JWT) |
| POST | `/api/customers/addWishList` | Add product to wishlist | Yes (JWT) |
| POST | `/api/customers/getWishList` | Get wishlist items | Yes (JWT) |
| POST | `/api/customers/deleteWishList` | Remove from wishlist | Yes (JWT) |
| POST | `/api/customers/order` | Place an order | Yes (JWT) |
| POST | `/api/customers/getOrders` | Get customer orders | Yes (JWT) |
| POST | `/api/customers/addfeedback` | Submit feedback | Yes (JWT) |
| POST | `/api/customers/addShopPoint` | Add shop point/rating | Yes (JWT) |
| POST | `/api/customers/getMostNeeded` | Get most needed products | Yes (JWT) |
| POST | `/api/customers/addVote` | Vote for a product | Yes (JWT) |
| POST | `/api/customers/addProduct` | Add a product suggestion | Yes (JWT) |

### Owners (Shop Managers)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/owners/register` | Shop owner registration | No |
| POST | `/api/owners/register-basic` | Basic owner registration | No |
| POST | `/api/owners/upload-image` | Upload shop image | No |
| POST | `/api/owners/complete-registration` | Complete registration | No |
| POST | `/api/owners/get-logo` | Get shop logo | No |
| POST | `/api/owners/get-shop-images` | Get shop images | No |
| POST | `/api/owners/login` | Shop owner login | No |
| POST | `/api/owners/getfeedbacks` | Get shop feedbacks | Yes (JWT) |
| POST | `/api/owners/getAvgRatings` | Get average ratings | Yes (JWT) |
| GET | `/api/owners/profile` | Get owner profile | Yes (JWT) |
| PUT | `/api/owners/updateOwnerProfile` | Update owner profile | Yes (JWT) |
| PUT | `/api/owners/updateShopProfile` | Update shop profile | Yes (JWT) |
| POST | `/api/owners/logout` | Owner logout | Yes (JWT) |
| POST | `/api/owners/get-products` | Get all products | Yes (JWT) |
| POST | `/api/owners/add-product` | Add new product | Yes (JWT) |
| POST | `/api/owners/update-product` | Update product | Yes (JWT) |
| POST | `/api/owners/delete-product` | Delete product | Yes (JWT) |
| POST | `/api/owners/getOrders` | Get shop orders | Yes (JWT) |
| POST | `/api/owners/approve` | Approve an order | Yes (JWT) |
| POST | `/api/owners/markDone` | Mark order as done | Yes (JWT) |
| POST | `/api/owners/shop-hit-count` | Get shop visit count | Yes (JWT) |
| POST | `/api/owners/wishlist-hit-count` | Get wishlist count | Yes (JWT) |
| POST | `/api/owners/most-wanted-products` | Get most wanted products | Yes (JWT) |

### Locations
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/locations/cities` | Get all cities | No |
| GET | `/api/locations/states` | Get all states | No |
| GET | `/api/locations/countries` | Get all countries | No |
| GET | `/api/locations/shops` | Get shops (with filters) | No |

### Chatbot
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/chatbot/start-chat` | Initialize chat session | No |
| GET | `/chatbot/get-session` | Get session data | No |
| GET | `/chatbot/sessions/status` | Get sessions status | No |
| POST | `/chatbot/transcribe` | Process voice/text input | No |
| GET | `/chatbot/transcribe/status` | Get rate limit status | No |
| POST | `/chatbot/clear-chat` | Clear chat history | No |
| GET | `/chatbot/chat-history` | Get chat history | No |
| POST | `/chatbot/cleanup-sessions` | Cleanup inactive sessions | No |
| GET | `/chatbot/` | Health check | No |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.8+
- PostgreSQL database

### Installation

1. **Clone the repository**
   
```
bash
   git clone <repository-url>
   cd ShopMate
   
```

2. **Setup Backend**
   
```
bash
   cd backend
   npm install
   # Configure .env file
   npm run dev
   
```

3. **Setup Frontend**
   
```
bash
   cd frontend
   npm install
   npm run dev
   
```

4. **Setup Chatbot**
   
```
bash
   cd chatbot
   pip install -r requirements.txt
   python userver.py
   
```

---

## Environment Variables

### Backend (.env)
Create a `.env` file in the `backend/` directory:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173

# Database Configuration
DATABASE_URL=postgresql://username:password@host:port/database_name
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shopmate
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this-in-production
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Optional: Cloudinary for image uploads (if used)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Chatbot (.env)
Create a `.env` file in the `chatbot/` directory:
```env
# Database Configuration
user=postgres
password=your_password
host=localhost
port=5432
dbname=shopmate
sslmode=require

# Google Gemini AI Configuration
GEMENI_API_KEY=your-google-gemini-api-key
GEMINI_API_KEY=your-google-gemini-api-key

# Flask Configuration
FLASK_ENV=development
FLASK_DEBUG=0
FLASK_HOST=0.0.0.0
FLASK_PORT=3000

# Session Configuration
SECRET_KEY=your-flask-secret-key
SESSION_TIMEOUT=3600
RATE_LIMIT_SECONDS=3
```

### Frontend (.env)
Create a `.env` file in the `frontend/` directory:
```env
# Vite Configuration
VITE_API_URL=http://localhost:5000
VITE_CHATBOT_URL=http://localhost:3000
```

## Complete Process Flow

This section provides a comprehensive overview of the ShopMate application flow, including all pages, functionalities, and user interactions.

### User Access Flow

```
                           ┌──────────────┐
                           │   Login      │
                           │   Page       │
                           └──────┬───────┘
                                  │
                    ┌─────────────┴────────────┐
                    │                          │
              ┌─────▼─────┐              ┌─────▼────┐
              │ Customer  │              │   Shop   │
              │ Login     │              │   Owner  │
              └─────┬─────┘              │   Login  │
                    │                    └────┬─────┘
                    │                         │
          ┌─────────▼────────┐      ┌─────────▼────────┐
          │  Customer        │      │  Shop Owner      │
          │  Dashboard       │      │  Dashboard       │
          │ /customer/dash   │      │  /shop/dashboard │
          └──────────────────┘      └──────────────────┘
```
---

### Authentication Pages

#### Login Page (`/` or `/login`)
- **User Types**: Customer | Shop Owner (toggle)
- **Inputs**: Email, Password
- **Actions**:
  - Validates credentials via API (`/api/customers/login` or `/api/owners/login`)
  - Stores JWT tokens (access + refresh)
  - Redirects based on user type:
    - Customer → `/customer/dashboard`
    - Owner → `/shop/dashboard`

#### Register Page (`/register`)
- **Two Registration Types**:

**Customer Registration** (`/register/customer`)
- Fields: Name, Email, Phone, State, Country, City, Pincode, Password
- API: `/api/customers/register`
- Success → Redirect to Login

**Shop Owner Registration** (`/register/owner`)
- **Step 1 - Basic Info**: Owner details + Shop details
  - Fields: Owner Name, Email, Phone, Location, Shop Name, Phone, Email, Website, Country, State, City, Pincode, Type, Google Maps Link, Password
- **Step 2 - Image Upload** (Mandatory):
  - Shop Logo (required)
  - Shop Images (at least 1 required, max 5)
- API: `/api/owners/register-basic` → `/api/owners/complete-registration`
- Success → Redirect to Login

---

### Customer Dashboard Flow (`/customer/dashboard`)

```
Customer Dashboard
│
├─── Tab: Home (CHome)
│    │
│    ├── Filter Section
│    │   ├── Country (text input)
│    │   ├── State (text input)
│    │   ├── City (text input)
│    │   ├── Shop Type (dropdown: All/Grocery/Bookstore/Clothing/Electronics/Cosmetics)
│    │   └── Reset Button
│    │
│    └── Shop Grid
│        └── Shop Cards (Click → Shop Detail)
│
├─── Tab: WishList (Corder)
│    ├── Displays wishlisted products
│    └── Actions: Remove from wishlist
│
├─── Tab: Orders (Custorders)
│    ├── Order History List
│    └── Order Details (products, pickup time, status)
│
├─── Tab: Update (CUpdate)
│    └── Profile Update Form
│
├─── Tab: Needed (Needed)
│    ├── Most Needed Products (by votes)
│    ├── Vote for products
│    └── Add new product suggestions
│
├─── Chat Button → Chat Modal
│    │
│    ├── Step 1: Select Product Type
│    │   └── Electronics/Books/Cosmetics/Clothing/Groceries
│    │
│    ├── Step 2: Select Location
│    │   ├── City (dropdown)
│    │   ├── State (dropdown)
│    │   └── Country (dropdown)
│    │
│    ├── Step 3: Select Shop (Optional)
│    │   └── Shop Name (dropdown)
│    │
│    └── Summary → Start Chat Session → Voice Interface
│
└─── Voice Button (from Chat) → Voice Component
     ├── Speech-to-Text Input
     └── AI Response Display
```

#### Shop Detail Page (`/shop-detail`)
**Access**: From CHome shop card click

**Components**:
1. **Shop Info Section**
   - Shop Name, Type, Location, Pincode, Email, Phone, Website
   - Shop Images Gallery

2. **Ratings & Reviews Section**
   - Average Rating Display
   - Rating Breakdown (5 stars to 1 star)
   - Recent Feedback List

3. **Add Feedback Section**
   - Star Rating Input (1-5)
   - Feedback Textarea
   - Submit Button

4. **Product Catalog**
   - Search Products
   - Pagination
   - Product Table (name, price, quantity, etc.)
   - Product Images (click to preview)
   - Wishlist Button

5. **Chat/Floating Action Button**
   - Opens Chat Modal → Voice Interface
   - Starts AI Chat Session

---

### Shop Owner Dashboard Flow (`/shop/dashboard`)

```
Shop Owner Dashboard
│
├─── Tab: Overview
│    │
│    ├── Ratings & Reviews
│    │   ├── Average Rating
│    │   ├── Rating Breakdown
│    │   └── Recent Feedback Cards
│    │
│    └── Analytics
│        ├── Shop Views Chart (Bar graph - top 5 shops)
│        ├── Wishlist Chart (Top 5 products)
│        └── Most Wanted Products List (Last 1 month)
│
├─── Tab: Stock (Inventory Management)
│    │
│    ├── Search Products
│    ├── Product Table
│    │   ├── Product Details
│    │   ├── Images (click to preview)
│    │   └── Actions (Edit/Delete)
│    │
│    ├── Add Product Button → Modal
│    │   ├── Dynamic Form Fields
│    │   └── Image Upload (up to 5)
│    │
│    └── Edit Product → Modal (same as Add)
│
├─── Tab: Map
│    └── Store Layout Display
│
├─── Tab: Update (Shop Profile)
│    │
│    ├── Owner Information Update
│    ├── Shop Details Update
│    └── Image Upload (Logo + Shop Images)
│
└─── Tab: Preorder
     └── Preorder Management
```

---

### AI Chatbot Process Flow

```
User Input (Voice/Text)
        │
        ▼
┌───────────────────┐
│  Intent           │
│  Classification   │
│  (Sentence        │
│  Transformers)    │
└────────┬──────────┘
         │
    ┌────┴────┬─────────────────┬──────────────────┐
    │         │                 │                  │
    ▼         ▼                 ▼                  ▼
┌────────┐ ┌──────────┐ ┌─────────────┐ ┌─────────────────┐
│ SMALL  │ │  DATA    │ │ OUT OF      │ │  (Default)      │
│ TALK   │ │  QUERY   │ │ DOMAIN      │ │  SMALL TALK     │
└───┬────┘ └────┬─────┘ └───────┬─────┘ └─────────────────┘
    │           │               │
    │           ▼               │
    │    ┌─────────────┐        │
    │    │ SQL Query   │        │
    │    │ Generation  │        │
    │    │ (LangChain) │        │
    │    └──────┬──────┘        │
    │           │               │
    │    ┌──────▼──────┐        │
    │    │ Execute SQL │        │
    │    │ (PostgreSQL)│        │
    │    └──────┬──────┘        │
    │           │               │
    └───────────┴───────────────┘
                │
                ▼
    ┌─────────────────────┐
    │  Format Response    │
    │  (Natural Language) │
    └──────────┬──────────┘
               │
               ▼
        Display to User
```

### Intent Classification
- **SMALL_TALK**: Greetings, general conversation
- **DATA_QUERY**: Product searches, prices, stock, inventory
- **OUT_OF_DOMAIN**: Non-shop related questions

### Session Management
- Session ID generated and stored
- Chat history maintained per session
- Rate limiting (3 seconds between requests)
- Session timeout: 1 hour

---

### Database Schema Overview

```
Core Tables:
- customers          → Customer accounts
- owners             → Shop owner accounts
- shops              → Shop profiles
- shop_images       → Shop logos and images
- refresh_tokens    → JWT refresh tokens

Dynamic Product Tables (per shop):
- {type}_{shop_id}_{shop_name}  → Product inventory
  (electronics, grocery, cosmetics, clothing, bookstore)

Transaction Tables:
- orders            → Customer orders
- order_items      → Order line items
- wishlist         → Customer wishlists
- shop_feedback   → Ratings and reviews
- shop_hits        → Shop visit tracking
- votes            → Product votes
- products         → Customer-suggested products
```

---

### Key Features Summary

#### Customer Features
✅ Voice-enabled shopping assistant  
✅ Product search by name, category, brand  
✅ Store navigation and location-based search  
✅ Real-time pricing and stock availability  
✅ Wishlist management  
✅ Order placement and tracking  
✅ Ratings and feedback  
✅ Product suggestions ("Most Needed")  
✅ AI-powered chatbot for product queries  

#### Shop Owner Features
✅ Dashboard with analytics  
✅ Inventory management (CRUD operations)  
✅ Order processing (approve/complete)  
✅ Feedback management  
✅ Shop profile updates  
✅ Image management (logo + gallery)  


#### Web UI 

<img src="./flowcharts/UI1.png">
![alt text](image.png)

<img src="./flowcharts/UI2.png">

<img src="./flowcharts/UI3.png">