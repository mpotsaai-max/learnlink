# LearnLink — Tutor Marketplace for Botswana

A complete full-stack web application for connecting students with tutors across Botswana. Built with Node.js, Express, and SQLite.

## Commission Structure

- **LearnLink takes 15% commission** on every booking
- Tutors receive **85%** of their listed hourly rate
- Example: Tutor charges P200/hour → receives P170, LearnLink keeps P30
- Tutors are paid within 24 hours of a completed session

## Video Calling

- All confirmed sessions get a unique Daily.co video room link
- Students and tutors join via their dashboard
- Free tier: 10,000 participant-minutes/month (~83 one-hour 1-on-1 sessions)
- After free tier: $0.004 per participant-minute

## Features

- **Student accounts** — Browse tutors, filter by subject/level/location, book sessions or subscribe monthly
- **Tutor accounts** — Create a profile, set hourly rate, set monthly packages, manage availability schedule
- **Admin panel** — Approve tutor applications, view all bookings and users
- **Booking system** — Students request, tutors confirm/decline, system generates video room
- **Schedule management** — Tutors set weekly availability, booked slots are automatically blocked
- **Monthly packages** — Tutors offer discounted monthly plans alongside hourly rates
- **Mobile responsive** — Works perfectly on phones and computers

## What's Included

```
learnlink/
├── server.js          # Express API server
├── database.js        # SQLite database setup + seed data
├── package.json       # Dependencies
├── .env               # Environment variables
├── .env.example       # Template for env vars
├── public/            # Frontend files
│   ├── index.html     # Home page + tutor listings
│   ├── login.html     # Login page
│   ├── register.html  # Sign up page
│   ├── tutor.html     # Tutor profile + booking + packages
│   ├── dashboard.html # My bookings + schedule + packages + subscriptions
│   ├── admin.html     # Admin panel
│   ├── become-tutor.html # Tutor application
│   ├── terms.html     # Terms and Conditions
│   ├── css/
│   │   └── style.css  # All styles
│   └── js/
│       └── app.js     # Auth + API client
└── database.sqlite    # Created automatically on first run
```

## Quick Start (Run Locally)

### 1. Install Node.js
Download from https://nodejs.org (get the LTS version, 18 or higher)

### 2. Open a terminal in this folder
```bash
cd learnlink
```

### 3. Install dependencies
```bash
npm install
```

### 4. Start the server
```bash
npm start
```

### 5. Open in browser
Go to http://localhost:3000

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@learnlink.bw | admin123 |
| Tutor | keletso@example.com | password123 |
| Tutor | thabo@example.com | password123 |

## Deploy to Render.com (Free Hosting)

### Step 1: Push to GitHub
1. Create a new repository on GitHub
2. Upload all files in this folder
3. Commit and push

### Step 2: Connect to Render
1. Go to https://render.com and sign up (free)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Fill in:
   - **Name:** learnlink
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Click "Create Web Service"
6. Wait 2–3 minutes for deployment
7. Your site will be live at `https://learnlink-xxx.onrender.com`

### Step 3: Set environment variables
In Render dashboard → Environment:
- `JWT_SECRET` = any long random string
- `DAILY_API_KEY` = your Daily.co API key (get one free at daily.co)

### Step 4: Get Daily.co API key (for video calls)
1. Go to https://daily.co and sign up (free, no credit card)
2. Go to Dashboard → Developers → API keys
3. Copy your API key
4. Add it as `DAILY_API_KEY` in Render environment variables
5. Redeploy

## How It Works

### For Students
1. Create a free account
2. Browse tutors by subject, level, or location
3. View tutor profile — see hourly rate AND monthly packages
4. Pick a date → see available time slots (booked ones are greyed out)
5. Book a single session OR subscribe to a monthly package
6. Tutor confirms → you get a "Join video call" button in your dashboard
7. Pay LearnLink via M-Pesa → tutor gets paid within 24 hours

### For Tutors
1. Create an account and select "Become a tutor"
2. Fill your profile: subjects, levels, price, location, bio
3. Set your weekly availability schedule (e.g., Mon 9am–5pm)
4. Create monthly packages (optional, e.g., 4 sessions for P600)
5. Wait for admin approval
6. Once approved, students can find and book you
7. Confirm bookings in your dashboard → system creates video room
8. Join video call from your dashboard at session time
9. Get paid 85% of your rate within 24 hours

### For Admin
1. Log in with admin credentials
2. Go to Admin Panel
3. Review and approve pending tutor applications
4. Monitor all bookings, users, and video room links

## Customization

### Change the brand name
Search and replace "LearnLink" in all HTML files.

### Change currency
Search and replace "P" (Pula symbol) with your currency.

### Add more subjects
Edit the `<select>` dropdowns in `index.html` and `become-tutor.html`.

### Change contact info
Edit the footer in `index.html`.

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (file-based, zero setup)
- **Auth:** JWT tokens + bcrypt password hashing
- **Video:** Daily.co API (free tier: 10,000 min/month)
- **Frontend:** Vanilla HTML/CSS/JS (no frameworks needed)

## Important Notes

- **Payments are manual** — The app tracks bookings but does NOT process online payments. Students pay LearnLink via M-Pesa, you pay tutors manually.
- **SQLite is file-based** — The database lives in `database.sqlite`. On Render's free tier, this file may reset if the service restarts. For production, switch to PostgreSQL.
- **First startup** — The server automatically creates the database, tables, admin user, and 6 sample tutors with schedules and packages.
- **Daily.co free tier** — 10,000 participant-minutes/month = ~83 one-hour 1-on-1 sessions. After that, $0.004/minute.

## Support

If something breaks, check:
1. Node.js version (must be 18+)
2. All files are in the correct folder structure
3. You ran `npm install` before `npm start`
4. Port 3000 is not already in use
5. `DAILY_API_KEY` is set if you want video rooms

---
Built for Botswana. Made with care.
