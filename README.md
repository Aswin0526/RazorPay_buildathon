# ShopMate: AI Agentic Commerce Experience

ShopMate is an AI agentic commerce experience that turns natural-language, voice, and image input into grounded commerce actions. The system combines Gemini reasoning, LangGraph orchestration, MCP tools, PostgreSQL data access, and Razorpay checkout into one stateful assistant runtime.

The agent can interpret intent, retrieve verified catalog and availability data, analyze product images, maintain session state, and initiate payment workflows. Its focus is tool-using intelligence and reliable execution rather than static conversational responses.

---

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
   - LangGraph (stateful agent orchestration)
   - LangChain (prompts, tools, and SQL utilities)
  - Sentence Transformers (Intent classification)
- **Tool Protocol**: MCP / FastMCP / MCP Toolbox
- **Payments**: Razorpay Orders API
- **Database**: PostgreSQL via SQLAlchemy
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

### Agentic Runtime
- **Multimodal input**: Voice, text, and product images are normalized into agent context.
- **LangGraph orchestration**: Stateful nodes route intent, retrieval, image analysis, response generation, and commerce actions.
- **MCP tool access**: FastMCP exposes constrained read-only SQL tools, while MCP Toolbox provides the database toolset to the agent.
- **Grounded retrieval**: Product, catalog, inventory, location, and order context is retrieved from PostgreSQL instead of being invented by the model.
- **Razorpay checkout**: The agent can create payment orders and return the checkout payload required by the frontend.
- **Payment reliability**: Idempotency keys, in-flight audit records, timeout handling, and Razorpay reconciliation prevent duplicate or ambiguous checkout states.
- **Session-aware interaction**: Chat history, session timeouts, rate limiting, and structured agent state are maintained across requests.
- **Guarded data access**: MCP SQL execution is limited to approved tables and read-only `SELECT` statements.

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

# Agent and MCP Tooling
GEMINI_MODEL=gemini-3.5-flash-lite
USE_MCP_TOOLBOX=true
MCP_TOOLBOX_URL=http://127.0.0.1:5006/mcp
MCP_TOOLBOX_TOOLSET=shopmate
MCP_TOOLBOX_SQL_TOOL=execute_sql
MCP_TOOLBOX_TIMEOUT=5

# Razorpay Checkout
RZP_KEY_ID=your-razorpay-key-id
RZP_KEY_SECRET=your-razorpay-key-secret
SIMULATE_TIMEOUT=false
GATEWAY_TIMEOUT_MS=100
```

### Frontend (.env)
Create a `.env` file in the `frontend/` directory:
```env
# Vite Configuration
VITE_API_URL=http://localhost:5000
VITE_CHATBOT_URL=http://localhost:3000
```

## Complete Process Flow

This section describes the end-to-end agentic runtime: authenticated context enters the application, the LangGraph orchestrator selects tools and reasoning steps, and the frontend receives grounded data or an executable commerce action.

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

### AI Agent Process Flow

```
User Input (Voice/Text)
        │
        ▼
┌───────────────────┐
│  Intent and       │
│  Context Routing  │
│  (LangGraph       │
│  StateGraph)      │
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
   │    │ MCP Tool    │        │
   │    │ Selection   │        │
   │    │ (FastMCP)   │        │
    │    └──────┬──────┘        │
    │           │               │
    │    ┌──────▼──────┐        │
   │    │ Execute Read-Only SQL │        │
   │    │ (MCP + PostgreSQL)    │        │
    │    └──────┬──────┘        │
    │           │               │
    └───────────┴───────────────┘
                │
                ▼
    ┌─────────────────────┐
   │  Resolve Agent State │
   │  (Grounded Output)   │
    └──────────┬──────────┘
               │
               ▼
        Display to User
```

### Intent Classification
- **SMALL_TALK**: Greetings, general conversation
- **DATA_QUERY**: Product discovery, pricing, availability, and order context
- **COMMERCE_ACTION**: Checkout and payment actions requiring a tool call
- **OUT_OF_DOMAIN**: Requests outside the agent's supported context

### Payment Action Flow
- The agent validates the cart and creates a Razorpay order.
- The order is recorded as `IN_FLIGHT` before the gateway call.
- The frontend receives the Razorpay order ID and checkout key.
- Timeout recovery reconciles the receipt with Razorpay before allowing a retry.
- Payment state is persisted as `PENDING`, `FAILED_SAFE`, or `PENDING_RECONCILIATION`.

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

### Agent Capabilities Summary

- LangGraph stateful orchestration
- Gemini reasoning with structured tool calls
- FastMCP server and MCP Toolbox integration
- Read-only, allowlisted PostgreSQL retrieval
- Voice, text, and image-aware interactions
- Razorpay order creation and checkout handoff
- Idempotent payment auditing and timeout reconciliation
- Session memory, rate limiting, and grounded responses
