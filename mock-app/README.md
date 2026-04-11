# Mock Application for Flowmind Testing

A multi-page web application with login validation, designed to test Flowmind's flow learning and replay capabilities.

## Pages

1. **Home Page** (`index.html`) - Landing page with login link
2. **Login Page** (`login.html`) - Login form with validation
3. **Dashboard** (`dashboard.html`) - Protected page after login
4. **Profile** (`profile.html`) - User profile with PII data
5. **Settings** (`settings.html`) - Application settings

## Features

- **Login Validation**: Button is disabled until all fields are valid
- **Email Validation**: Must be valid email format
- **Phone Validation**: Must match format (555-XXX-XXXX)
- **Credential Check**: Compares against hardcoded credentials
- **PII Data**: Contains email, phone, API tokens, credit card numbers
- **Session Management**: Basic redirect flow

## Demo Credentials

| Field | Value |
|-------|-------|
| Email | `test@flowmind.com` |
| Phone | `555-123-4567` |
| Password | `password123` |

## Running the App

### Option 1: Direct File Access

Simply open `index.html` in a browser. Some features may not work due to CORS.

### Option 2: Local Server (Recommended)

```bash
# Using Python
python3 -m http.server 3333

# Using Node.js
npx serve -l 3333

# Using PHP
php -S localhost:3333
```

Then visit: http://localhost:3333

## Testing with Flowmind

### 1. Install Dependencies

```bash
cd mock-app
pnpm install
```

### 2. Run Test Script

```bash
pnpm test
```

This will:
1. Start the mock app server on port 3333
2. Launch a headless browser
3. Execute the successful login flow
4. Execute the failed login flow (wrong password)
5. Generate reports for each run

## Flow Tests

### Success Flow
```
Navigate to login → Fill email → Fill phone → Fill password → Click submit → Verify dashboard
```

### Failure Flow
```
Navigate to login → Fill email → Fill phone → Fill wrong password → Click submit → Verify error
```

## Project Structure

```
mock-app/
├── index.html        # Home page
├── login.html        # Login form (validation logic)
├── dashboard.html   # Protected dashboard
├── profile.html      # User profile (PII data)
├── settings.html     # Settings page
├── test-flowmind.ts # Test runner script
└── README.md         # This file
```
