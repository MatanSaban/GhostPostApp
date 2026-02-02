# Ghost Post Platform - תהליך הרישום המלא והמפורט

## תיאור כללי

תהליך הרישום ב-Ghost Post מורכב מ-**6 שלבים עיקריים** שמובילים את המשתמש החדש מרישום ראשוני ועד לכניסה מלאה לפלטפורמה עם חשבון מוכן לעבודה.

**משך זמן משוער**: 10-15 דקות  
**שלבים**: 6  
**אינטראקציות עם AI**: רבות (בשלב הראיון)  
**טכנולוגיות**: Next.js, React, Prisma, MongoDB, Gemini AI, nodemailer

---

## סקירת שלבים

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GHOST POST REGISTRATION FLOW                    │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │   1. REGISTER    │  ← User fills registration form
    │   (FORM STEP)    │     (email, password, name, consent)
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │   2. VERIFY      │  ← User enters OTP code
    │   (OTP STEP)     │     (sent to email)
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ 3. ACCOUNT SETUP │  ← User creates company account
    │   (COMPANY)      │     (company name → slug)
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ 4. INTERVIEW ⭐  │  ← AI-powered site interview
    │   (AI WIZARD)    │     (10-20 questions with AI bot)
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ 5. PLAN SELECT   │  ← User chooses subscription plan
    │   (PRICING)      │     (Basic, Pro, Enterprise)
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ 6. FINALIZE      │  ← System creates all records
    │   (TRANSACTION)  │     (User, Account, Subscription, etc.)
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │    DASHBOARD     │  ← User is logged in!
    │   (READY TO GO)  │
    └──────────────────┘
```

---

## שלב 1: טופס הרישום (Register Form)

### UI/UX

**נתיב**: `/auth/register`  
**קומפוננטה**: `app/auth/register/page.jsx`

**שדות בטופס**:

```javascript
{
  firstName: '',        // שם פרטי (required)
  lastName: '',         // שם משפחה (required)
  email: '',            // אימייל (required, unique)
  password: '',         // סיסמה (required, min 8 chars)
  confirmPassword: '', // אישור סיסמה (must match)
  phoneNumber: '',     // טלפון (optional)
  consentGiven: false  // הסכמה לתנאים (required)
}
```

**Validation Rules**:

```javascript
// Using Zod schema
const registerSchema = z
  .object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain uppercase letter")
      .regex(/[a-z]/, "Password must contain lowercase letter")
      .regex(/[0-9]/, "Password must contain number"),
    confirmPassword: z.string(),
    phoneNumber: z.string().optional(),
    consentGiven: z.boolean().refine((val) => val === true, {
      message: "You must agree to the terms",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
```

### Backend Process

**Endpoint**: `POST /api/auth/register`

**Request Body**:

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!",
  "phoneNumber": "+972501234567",
  "consentGiven": true
}
```

**Backend Flow** (`app/api/auth/register/route.js`):

```javascript
export async function POST(request) {
  const body = await request.json();

  // 1. Validate input
  const validation = registerSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: validation.error.issues,
      },
      { status: 400 },
    );
  }

  const { firstName, lastName, email, password, phoneNumber, consentGiven } =
    validation.data;

  // 2. Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    return NextResponse.json(
      {
        error: "Email already registered",
      },
      { status: 409 },
    );
  }

  // 3. Check if temp registration exists (cleanup old ones)
  const existingTemp = await prisma.tempRegistration.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingTemp) {
    // Delete old temp registration
    await prisma.tempRegistration.delete({
      where: { id: existingTemp.id },
    });
  }

  // 4. Hash password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // 5. Create TempRegistration record
  const tempReg = await prisma.tempRegistration.create({
    data: {
      email: email.toLowerCase(),
      firstName,
      lastName,
      phoneNumber,
      password: hashedPassword,
      consentGiven,
      consentDate: consentGiven ? new Date() : null,
      currentStep: "FORM",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  // 6. Generate OTP code
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.otpCode.create({
    data: {
      tempRegId: tempReg.id,
      code: otpCode,
      method: "EMAIL",
      expiresAt: otpExpiry,
      verified: false,
      attempts: 0,
    },
  });

  // 7. Send verification email
  await sendVerificationEmail({
    to: email,
    firstName,
    code: otpCode,
    expiresIn: "10 minutes",
  });

  // 8. Return success with tempRegId
  return NextResponse.json({
    success: true,
    tempRegId: tempReg.id,
    message: "Verification code sent to your email",
    email: email,
  });
}
```

**Response**:

```json
{
  "success": true,
  "tempRegId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "message": "Verification code sent to your email",
  "email": "john.doe@example.com"
}
```

### Email Template

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      body {
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 30px;
        text-align: center;
        color: white;
      }
      .code {
        font-size: 32px;
        font-weight: bold;
        letter-spacing: 8px;
        background: #f5f5f5;
        padding: 20px;
        margin: 20px 0;
        text-align: center;
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Welcome to Ghost Post! 👋</h1>
      </div>
      <div style="padding: 30px;">
        <p>Hi John,</p>
        <p>Your verification code is:</p>
        <div class="code">123456</div>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    </div>
  </body>
</html>
```

---

## שלב 2: אימות OTP (Verify Code)

### UI/UX

**נתיב**: `/auth/register?step=verify`  
**קומפוננטה**: `app/auth/register/page.jsx` (same, different state)

**UI Elements**:

- 6 תיבות לקוד (6 ספרות)
- טיימר ספירה לאחור (10:00 → 0:00)
- כפתור "Resend Code"
- הודעות שגיאה

**Client-Side Code**:

```javascript
"use client";

export function OTPVerification({ tempRegId, email }) {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Timer countdown
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleCodeChange = (index, value) => {
    if (value.length > 1) value = value[0]; // Only 1 digit
    if (!/^\d*$/.test(value)) return; // Only digits

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`).focus();
    }

    // Auto-submit when all filled
    if (newCode.every((digit) => digit !== "") && value) {
      handleSubmit(newCode.join(""));
    }
  };

  const handleSubmit = async (otpCode) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verification/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempRegId,
          code: otpCode || code.join(""),
        }),
      });

      const data = await response.json();

      if (response.ok && data.verified) {
        // Move to next step
        router.push("/auth/register?step=account-setup");
      } else {
        setError(data.error || "Invalid verification code");
        setCode(["", "", "", "", "", ""]);
        document.getElementById("otp-0").focus();
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      const response = await fetch("/api/auth/verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempRegId }),
      });

      if (response.ok) {
        setTimeLeft(600); // Reset timer
        setCode(["", "", "", "", "", ""]);
        // Show success message
      }
    } catch (err) {
      setError("Failed to resend code");
    }
  };

  return (
    <div className={styles.otpContainer}>
      <h2>Verify Your Email</h2>
      <p>
        We sent a code to <strong>{email}</strong>
      </p>

      <div className={styles.otpInputs}>
        {code.map((digit, index) => (
          <input
            key={index}
            id={`otp-${index}`}
            type="text"
            maxLength="1"
            value={digit}
            onChange={(e) => handleCodeChange(index, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digit && index > 0) {
                document.getElementById(`otp-${index - 1}`).focus();
              }
            }}
            className={styles.otpInput}
            autoFocus={index === 0}
          />
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.timer}>
        Time remaining: {Math.floor(timeLeft / 60)}:
        {String(timeLeft % 60).padStart(2, "0")}
      </div>

      <button
        onClick={handleResend}
        disabled={timeLeft > 0}
        className={styles.resendBtn}
      >
        Resend Code
      </button>

      {loading && <div className={styles.loading}>Verifying...</div>}
    </div>
  );
}
```

### Backend Process

**Endpoint**: `POST /api/auth/verification/otp`

**Request**:

```json
{
  "tempRegId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "code": "123456"
}
```

**Backend Logic**:

```javascript
export async function POST(request) {
  const { tempRegId, code } = await request.json();

  // 1. Find temp registration
  const tempReg = await prisma.tempRegistration.findUnique({
    where: { id: tempRegId },
    include: { otpCodes: { orderBy: { createdAt: "desc" } } },
  });

  if (!tempReg) {
    return NextResponse.json(
      { error: "Invalid registration" },
      { status: 404 },
    );
  }

  // 2. Check if expired
  if (tempReg.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Registration expired" },
      { status: 410 },
    );
  }

  // 3. Find latest OTP code
  const latestOtp = tempReg.otpCodes[0];

  if (!latestOtp) {
    return NextResponse.json({ error: "No OTP found" }, { status: 404 });
  }

  // 4. Check if OTP expired
  if (latestOtp.expiresAt < new Date()) {
    return NextResponse.json({ error: "Code expired" }, { status: 410 });
  }

  // 5. Check max attempts
  if (latestOtp.attempts >= 3) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  // 6. Verify code
  if (latestOtp.code !== code) {
    // Increment attempts
    await prisma.otpCode.update({
      where: { id: latestOtp.id },
      data: { attempts: { increment: 1 } },
    });

    const remainingAttempts = 3 - (latestOtp.attempts + 1);
    return NextResponse.json(
      {
        error: "Invalid code",
        remainingAttempts,
      },
      { status: 400 },
    );
  }

  // 7. Mark as verified
  await prisma.otpCode.update({
    where: { id: latestOtp.id },
    data: { verified: true },
  });

  // 8. Update temp registration
  await prisma.tempRegistration.update({
    where: { id: tempRegId },
    data: {
      emailVerified: new Date(),
      currentStep: "VERIFY",
    },
  });

  return NextResponse.json({
    success: true,
    verified: true,
    message: "Email verified successfully",
  });
}
```

---

## שלב 3: הגדרת חשבון (Account Setup)

### UI/UX

**נתיב**: `/auth/register?step=account-setup`

**שדות**:

```javascript
{
  accountName: '',  // Company name (required)
  // slug is auto-generated from accountName
}
```

**Auto-slug Generation**:

```javascript
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/-+/g, "-") // Replace multiple - with single -
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing -
}

// Example:
// "My Company Inc." → "my-company-inc"
// "Acme Corp (2024)" → "acme-corp-2024"
```

**UI Preview**:

```jsx
<div className={styles.accountSetup}>
  <h2>Create Your Company Account</h2>

  <div className={styles.formGroup}>
    <label>Company Name</label>
    <input
      type="text"
      value={accountName}
      onChange={(e) => {
        setAccountName(e.target.value);
        setAccountSlug(generateSlug(e.target.value));
      }}
      placeholder="Acme Corporation"
    />
  </div>

  <div className={styles.slugPreview}>
    <label>Your URL will be:</label>
    <div className={styles.slug}>
      app.ghostpost.com/<strong>{accountSlug || "your-company"}</strong>
    </div>
  </div>

  <button onClick={handleSubmit}>Continue to Interview</button>
</div>
```

### Backend Process

**Endpoint**: `POST /api/auth/registration/account-setup`

**Request**:

```json
{
  "tempRegId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "accountName": "Acme Corporation",
  "accountSlug": "acme-corporation"
}
```

**Backend Logic**:

```javascript
export async function POST(request) {
  const { tempRegId, accountName, accountSlug } = await request.json();

  // 1. Validate
  if (!accountName || !accountSlug) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  // 2. Find temp registration
  const tempReg = await prisma.tempRegistration.findUnique({
    where: { id: tempRegId },
  });

  if (!tempReg || !tempReg.emailVerified) {
    return NextResponse.json({ error: "Email not verified" }, { status: 403 });
  }

  // 3. Check slug uniqueness
  const existingAccount = await prisma.account.findUnique({
    where: { slug: accountSlug },
  });

  if (existingAccount) {
    return NextResponse.json(
      {
        error: "Company name already taken",
        suggestedSlug: accountSlug + "-" + Math.floor(Math.random() * 1000),
      },
      { status: 409 },
    );
  }

  // 4. Update temp registration
  await prisma.tempRegistration.update({
    where: { id: tempRegId },
    data: {
      accountName,
      accountSlug,
      currentStep: "ACCOUNT_SETUP",
    },
  });

  return NextResponse.json({
    success: true,
    accountName,
    accountSlug,
    message: "Account details saved",
  });
}
```

---

## ⭐ שלב 4: הראיון (Interview) - הסברה מפורט מאוד

זה השלב המרכזי והחשוב ביותר בתהליך ההרשמה. כאן המשתמש עובר ראיון מודרך AI שאוסף מידע על העסק, האתר והמטרות.

### ארכיטקטורת מערכת הראיון

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTERVIEW SYSTEM ARCHITECTURE                 │
└─────────────────────────────────────────────────────────────────┘

┌───────────────────┐         ┌────────────────────┐
│ InterviewQuestion │────────▶│  Flow Engine       │
│ (Admin defined)   │         │  (Conditions)      │
└───────────────────┘         └────────────────────┘
                                        │
                                        ▼
┌───────────────────┐         ┌────────────────────┐
│  UserInterview    │◀────────│  AI Service        │
│  (User session)   │         │  (Gemini 2.0)      │
└───────────────────┘         └────────────────────┘
         │                             │
         ▼                             ▼
┌───────────────────┐         ┌────────────────────┐
│ InterviewMessage  │         │  Bot Actions       │
│ (Chat history)    │         │  (Functions)       │
└───────────────────┘         └────────────────────┘
```

### מבנה מסד הנתונים

#### 1. InterviewQuestion (תבנית שאלה)

```prisma
model InterviewQuestion {
  id              String                @id @default(auto()) @map("_id") @db.ObjectId
  order           Int                   // 1, 2, 3... (שאלה ראשונה, שנייה...)
  translationKey  String                @unique // "interview.welcome"
  questionType    InterviewQuestionType // GREETING, INPUT, SELECTION...

  // Configuration
  inputConfig     Json?                 // הגדרות לפי סוג השאלה
  validation      Json?                 // כללי ולידציה

  // AI Configuration
  aiPromptHint    String?               // רמז ל-AI איך להציג את השאלה
  allowedActions  String[]              // פעולות שה-AI יכול לבצע
  autoActions     Json?                 // פעולות אוטומטיות
  saveToField     String?               // שדה לשמירה אוטומטית

  // Conditional Display
  dependsOn       String?               // תלוי בשאלה אחרת
  showCondition   Json?                 // תנאי להצגה

  isActive        Boolean               @default(true)
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
}
```

#### 2. UserInterview (Session של משתמש)

```prisma
model UserInterview {
  id            String              @id @default(auto()) @map("_id") @db.ObjectId
  userId        String              @db.ObjectId
  siteId        String?             @db.ObjectId // יווצר אחרי השלמה

  status        UserInterviewStatus @default(NOT_STARTED)
  currentStep   Int                 @default(0) // מספר השאלה הנוכחי

  // כל התשובות כ-JSON
  responses     Json                @default("{}")

  // מידע חיצוני (מcrawl, API calls)
  externalData  Json?

  // הקשר AI
  aiContext     Json?

  startedAt     DateTime            @default(now())
  completedAt   DateTime?
  updatedAt     DateTime            @updatedAt

  user          User                @relation(...)
  messages      InterviewMessage[]
}
```

#### 3. InterviewMessage (היסטוריית שיחה)

```prisma
model InterviewMessage {
  id            String          @id @default(auto()) @map("_id") @db.ObjectId
  interviewId   String          @db.ObjectId

  role          MessageRole     // USER, ASSISTANT, SYSTEM, FUNCTION
  content       String          // טקסט ההודעה

  // Function calls
  functionCall  Json?           // { name: "crawlWebsite", parameters: {...} }
  functionResult Json?          // { success: true, data: {...} }

  // UI component
  uiComponent   Json?           // { type: "input", config: {...} }

  questionId    String?         // קשור לשאלה מסוימת

  createdAt     DateTime        @default(now())

  interview     UserInterview   @relation(...)
}
```

### 12 סוגי השאלות - פירוט מלא

#### 1️⃣ GREETING - הודעת ברכה

**מטרה**: ברכת המשתמש והסבר על התהליך.

**תצורה**:

```json
{
  "id": "q001",
  "order": 1,
  "translationKey": "interview.welcome",
  "questionType": "GREETING",
  "inputConfig": {
    "buttonText": "Let's Start",
    "showProgress": false
  },
  "aiPromptHint": "Welcome the user warmly and explain the interview process briefly"
}
```

**UI Render**:

```jsx
<div className={styles.greeting}>
  <div className={styles.animation}>
    <Sparkles size={48} />
  </div>
  <h1>{t.interview.welcome.title}</h1>
  <p>{t.interview.welcome.subtitle}</p>
  <ul className={styles.benefits}>
    <li>✓ Takes only 10 minutes</li>
    <li>✓ AI will guide you through</li>
    <li>✓ Personalized recommendations</li>
  </ul>
  <button onClick={handleStart} className={styles.primaryBtn}>
    {inputConfig.buttonText}
  </button>
</div>
```

**AI Message**:

```
👋 Hi there! I'm your AI assistant, and I'm here to help you set up your
website for SEO success. This quick interview will help me understand your
business and goals so I can provide personalized recommendations.

Ready to get started?
```

---

#### 2️⃣ INPUT - שדה קלט

**מטרה**: קבלת מידע טקסטואלי מהמשתמש.

**תצורה**:

```json
{
  "id": "q002",
  "order": 2,
  "translationKey": "interview.websiteUrl",
  "questionType": "INPUT",
  "inputConfig": {
    "inputType": "url", // text, email, url, number, textarea
    "placeholder": "https://example.com",
    "fieldName": "websiteUrl",
    "icon": "globe"
  },
  "validation": {
    "required": true,
    "pattern": "^https?://",
    "minLength": 10,
    "maxLength": 255,
    "errorKey": "interview.errors.invalidUrl"
  },
  "saveToField": "websiteUrl",
  "aiPromptHint": "Ask for the user's website URL politely. Explain we'll analyze it."
}
```

**UI Render**:

```jsx
<div className={styles.inputQuestion}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      Great! What's your website URL? I'll analyze it to understand your
      business better.
    </div>
  </div>

  <div className={styles.inputWrapper}>
    <div className={styles.icon}>
      <Globe size={20} />
    </div>
    <input
      type="url"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={inputConfig.placeholder}
      className={styles.input}
      autoFocus
    />
    {error && <div className={styles.error}>{error}</div>}
  </div>

  <div className={styles.actions}>
    <button onClick={handleBack} className={styles.secondaryBtn}>
      Back
    </button>
    <button
      onClick={handleSubmit}
      disabled={!value || !!error}
      className={styles.primaryBtn}
    >
      Continue
    </button>
  </div>
</div>
```

**Validation Logic**:

```javascript
function validateInput(value, validation) {
  const errors = [];

  if (validation.required && !value) {
    errors.push("This field is required");
  }

  if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
    errors.push(t[validation.errorKey] || "Invalid format");
  }

  if (validation.minLength && value.length < validation.minLength) {
    errors.push(`Minimum ${validation.minLength} characters`);
  }

  if (validation.maxLength && value.length > validation.maxLength) {
    errors.push(`Maximum ${validation.maxLength} characters`);
  }

  if (validation.email && !isValidEmail(value)) {
    errors.push("Invalid email address");
  }

  if (validation.url && !isValidUrl(value)) {
    errors.push("Invalid URL");
  }

  return errors;
}
```

---

#### 3️⃣ INPUT_WITH_AI - קלט עם ניתוח AI

**מטרה**: קבלת קלט שמפעיל ניתוח AI מיידי.

**תצורה**:

```json
{
  "id": "q008",
  "order": 8,
  "translationKey": "interview.competitors",
  "questionType": "INPUT_WITH_AI",
  "inputConfig": {
    "inputType": "textarea",
    "placeholder": "Enter competitor URLs, one per line",
    "fieldName": "competitors",
    "rows": 5
  },
  "autoActions": [
    {
      "action": "analyzeCompetitors",
      "triggerOn": "submit",
      "parameters": {
        "competitors": "{{competitors}}"
      }
    }
  ],
  "saveToField": "competitors",
  "aiPromptHint": "Ask for competitor websites to analyze"
}
```

**UI with Loading**:

```jsx
<div className={styles.inputWithAi}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      Who are your main competitors? I'll analyze their SEO strategies and find
      opportunities for you.
    </div>
  </div>

  <textarea
    value={value}
    onChange={(e) => setValue(e.target.value)}
    placeholder={inputConfig.placeholder}
    rows={inputConfig.rows}
    className={styles.textarea}
  />

  {analyzing && (
    <div className={styles.analyzing}>
      <Loader className={styles.spinner} />
      <span>Analyzing competitors...</span>
      <div className={styles.progress}>
        <div className={styles.progressBar} style={{ width: `${progress}%` }} />
      </div>
    </div>
  )}

  {analysisResult && (
    <div className={styles.analysisResult}>
      <CheckCircle size={20} color="green" />
      <div>
        <strong>Analysis Complete!</strong>
        <p>Found {analysisResult.insights.length} insights</p>
      </div>
    </div>
  )}

  <button onClick={handleSubmit} disabled={analyzing}>
    {analyzing ? "Analyzing..." : "Continue"}
  </button>
</div>
```

**Backend Action**:

```javascript
// lib/bot-actions/handlers/analyze-competitors.js
export async function analyzeCompetitors({ competitors }, context) {
  const urls = competitors.split("\n").filter(Boolean);
  const insights = [];

  for (const url of urls) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      const $ = cheerio.load(response.data);

      insights.push({
        url,
        title: $("title").text(),
        metaDescription: $('meta[name="description"]').attr("content"),
        h1Count: $("h1").length,
        h2Count: $("h2").length,
        imageCount: $("img").length,
        hasSchema: !!$('script[type="application/ld+json"]').length,
        loadTime: response.headers["x-response-time"] || "N/A",
      });
    } catch (error) {
      insights.push({ url, error: "Failed to analyze" });
    }
  }

  // Use AI to generate strategic insights
  const aiInsights = await generateStructuredResponse({
    system: "Analyze competitor SEO data and provide actionable insights",
    prompt: `Competitor data: ${JSON.stringify(insights)}`,
    schema: z.object({
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      opportunities: z.array(z.string()),
      recommendations: z.array(z.string()),
    }),
  });

  return {
    success: true,
    data: {
      competitors: insights,
      insights: aiInsights,
    },
  };
}
```

---

#### 4️⃣ CONFIRMATION - אישור עם תצוגה מקדימה

**מטרה**: הצגת מידע לאישור משתמש.

**תצורה**:

```json
{
  "id": "q010",
  "order": 10,
  "translationKey": "interview.confirmBusinessInfo",
  "questionType": "CONFIRMATION",
  "inputConfig": {
    "confirmText": "Yes, looks good",
    "cancelText": "Let me edit",
    "dataPreview": ["businessName", "industry", "website", "targetAudience"],
    "editAction": "goBack"
  },
  "dependsOn": "q009"
}
```

**UI Render**:

```jsx
<div className={styles.confirmation}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      Let me confirm the information you've provided:
    </div>
  </div>

  <div className={styles.dataPreview}>
    <h3>Business Information</h3>
    {inputConfig.dataPreview.map((field) => (
      <div key={field} className={styles.previewItem}>
        <span className={styles.label}>{formatLabel(field)}:</span>
        <span className={styles.value}>{responses[field]}</span>
      </div>
    ))}
  </div>

  <div className={styles.actions}>
    <button onClick={handleCancel} className={styles.secondaryBtn}>
      {inputConfig.cancelText}
    </button>
    <button onClick={handleConfirm} className={styles.primaryBtn}>
      {inputConfig.confirmText}
    </button>
  </div>
</div>
```

---

#### 5️⃣ SELECTION - בחירה בודדת

**מטרה**: בחירת אפשרות אחת מתוך רשימה.

**תצורה**:

```json
{
  "id": "q003",
  "order": 3,
  "translationKey": "interview.platform",
  "questionType": "SELECTION",
  "inputConfig": {
    "selectionMode": "cards", // cards, radio, dropdown
    "fieldName": "platform",
    "options": [
      {
        "value": "wordpress",
        "label": "WordPress",
        "description": "Most popular CMS",
        "icon": "wordpress",
        "recommended": true
      },
      {
        "value": "shopify",
        "label": "Shopify",
        "description": "E-commerce platform",
        "icon": "shopify"
      },
      {
        "value": "wix",
        "label": "Wix",
        "description": "Website builder",
        "icon": "wix"
      },
      {
        "value": "custom",
        "label": "Custom / Other",
        "description": "Built from scratch",
        "icon": "code"
      }
    ]
  },
  "saveToField": "platform"
}
```

**UI - Cards Mode**:

```jsx
<div className={styles.selection}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>What platform is your website built on?</div>
  </div>

  <div className={styles.optionsGrid}>
    {inputConfig.options.map((option) => (
      <div
        key={option.value}
        className={`${styles.card} ${selected === option.value ? styles.selected : ""}`}
        onClick={() => handleSelect(option.value)}
      >
        {option.recommended && <div className={styles.badge}>Recommended</div>}
        <div className={styles.icon}>{getIcon(option.icon)}</div>
        <h4>{option.label}</h4>
        <p>{option.description}</p>
        {selected === option.value && (
          <div className={styles.checkmark}>
            <CheckCircle size={24} />
          </div>
        )}
      </div>
    ))}
  </div>

  <button
    onClick={handleSubmit}
    disabled={!selected}
    className={styles.primaryBtn}
  >
    Continue
  </button>
</div>
```

---

#### 6️⃣ MULTI_SELECTION - בחירה מרובה

**מטרה**: בחירת מספר אפשרויות.

**תצורה**:

```json
{
  "id": "q005",
  "order": 5,
  "translationKey": "interview.seoGoals",
  "questionType": "MULTI_SELECTION",
  "inputConfig": {
    "selectionMode": "checkboxes", // checkboxes, tags, chips
    "fieldName": "seoGoals",
    "minSelections": 1,
    "maxSelections": 3,
    "options": [
      {
        "value": "traffic",
        "label": "Increase Traffic",
        "icon": "trending-up"
      },
      { "value": "rankings", "label": "Improve Rankings", "icon": "arrow-up" },
      {
        "value": "conversions",
        "label": "Boost Conversions",
        "icon": "target"
      },
      { "value": "local", "label": "Local SEO", "icon": "map-pin" },
      {
        "value": "ecommerce",
        "label": "E-commerce SEO",
        "icon": "shopping-cart"
      },
      { "value": "content", "label": "Content Marketing", "icon": "file-text" }
    ]
  },
  "validation": {
    "minSelected": 1,
    "maxSelected": 3,
    "errorKey": "interview.errors.selectGoals"
  },
  "saveToField": "seoGoals"
}
```

**UI Render**:

```jsx
<div className={styles.multiSelection}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      What are your main SEO goals? (Select up to 3)
    </div>
  </div>

  <div className={styles.counter}>
    {selected.length} / {inputConfig.maxSelections} selected
  </div>

  <div className={styles.optionsGrid}>
    {inputConfig.options.map((option) => {
      const isSelected = selected.includes(option.value);
      const isDisabled =
        !isSelected && selected.length >= inputConfig.maxSelections;

      return (
        <div
          key={option.value}
          className={`
            ${styles.checkbox} 
            ${isSelected ? styles.selected : ""} 
            ${isDisabled ? styles.disabled : ""}
          `}
          onClick={() => !isDisabled && handleToggle(option.value)}
        >
          <div className={styles.checkboxIcon}>
            {isSelected ? (
              <CheckSquare size={24} color="var(--primary)" />
            ) : (
              <Square size={24} />
            )}
          </div>
          <div className={styles.icon}>{getIcon(option.icon)}</div>
          <span>{option.label}</span>
        </div>
      );
    })}
  </div>

  {error && <div className={styles.error}>{error}</div>}

  <button
    onClick={handleSubmit}
    disabled={selected.length < inputConfig.minSelections}
    className={styles.primaryBtn}
  >
    Continue
  </button>
</div>
```

---

#### 7️⃣ DYNAMIC - אפשרויות דינמיות

**מטרה**: הצגת אפשרויות שנטענות מ-API או מתשובות קודמות.

**תצורה**:

```json
{
  "id": "q007",
  "order": 7,
  "translationKey": "interview.selectKeywords",
  "questionType": "DYNAMIC",
  "inputConfig": {
    "selectionMode": "tags",
    "fieldName": "selectedKeywords",
    "optionsSource": "crawledKeywords", // From externalData
    "maxSelections": 10,
    "allowCustom": true,
    "placeholder": "Search or add custom keyword"
  },
  "dependsOn": "q002",
  "showCondition": {
    "field": "websiteUrl",
    "operator": "exists"
  },
  "saveToField": "selectedKeywords"
}
```

**Data Source** (from externalData):

```javascript
// After crawling website in previous question
externalData: {
  crawledKeywords: [
    { value: "seo tools", volume: 12000, difficulty: 45 },
    { value: "keyword research", volume: 8100, difficulty: 52 },
    { value: "content optimization", volume: 3200, difficulty: 38 },
    // ... more keywords
  ];
}
```

**UI Render**:

```jsx
<div className={styles.dynamicSelection}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      I found {keywords.length} relevant keywords for your website. Select up to
      10 to track:
    </div>
  </div>

  <div className={styles.searchBar}>
    <Search size={20} />
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder={inputConfig.placeholder}
    />
  </div>

  <div className={styles.selectedTags}>
    {selected.map((keyword) => (
      <div key={keyword} className={styles.tag}>
        {keyword}
        <X size={16} onClick={() => handleRemove(keyword)} />
      </div>
    ))}
  </div>

  <div className={styles.keywordsList}>
    {filteredKeywords.map((kw) => (
      <div
        key={kw.value}
        className={`${styles.keywordItem} ${selected.includes(kw.value) ? styles.selected : ""}`}
        onClick={() => handleToggle(kw.value)}
      >
        <div className={styles.keywordInfo}>
          <span className={styles.keyword}>{kw.value}</span>
          <div className={styles.metrics}>
            <span className={styles.volume}>
              <TrendingUp size={14} /> {kw.volume}/mo
            </span>
            <span className={styles.difficulty}>
              <Target size={14} /> Difficulty: {kw.difficulty}
            </span>
          </div>
        </div>
        {selected.includes(kw.value) && (
          <CheckCircle size={20} color="var(--primary)" />
        )}
      </div>
    ))}
  </div>

  {inputConfig.allowCustom && (
    <button onClick={handleAddCustom} className={styles.addCustomBtn}>
      + Add Custom Keyword
    </button>
  )}

  <div className={styles.counter}>
    {selected.length} / {inputConfig.maxSelections} selected
  </div>

  <button
    onClick={handleSubmit}
    disabled={selected.length === 0}
    className={styles.primaryBtn}
  >
    Continue
  </button>
</div>
```

---

#### 8️⃣ EDITABLE_DATA - נתונים לעריכה

**מטרה**: הצגת נתונים שנאספו (למשל מcrawl) ומתן אפשרות לערוך.

**תצורה**:

```json
{
  "id": "q009",
  "order": 9,
  "translationKey": "interview.reviewBusinessInfo",
  "questionType": "EDITABLE_DATA",
  "inputConfig": {
    "dataSource": "crawledData.businessInfo",
    "editableFields": [
      {
        "key": "businessName",
        "label": "Business Name",
        "type": "text",
        "required": true
      },
      {
        "key": "industry",
        "label": "Industry",
        "type": "select",
        "options": ["Technology", "Healthcare", "Finance", "Retail", "Other"]
      },
      {
        "key": "description",
        "label": "Description",
        "type": "textarea",
        "rows": 4
      },
      {
        "key": "targetAudience",
        "label": "Target Audience",
        "type": "text"
      }
    ]
  }
}
```

**UI Render**:

```jsx
<div className={styles.editableData}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      I've gathered some information about your business. Please review and edit
      if needed:
    </div>
  </div>

  <div className={styles.form}>
    {inputConfig.editableFields.map((field) => (
      <div key={field.key} className={styles.formGroup}>
        <label>
          {field.label}
          {field.required && <span className={styles.required}>*</span>}
        </label>

        {field.type === "text" && (
          <input
            type="text"
            value={formData[field.key] || ""}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className={styles.input}
          />
        )}

        {field.type === "textarea" && (
          <textarea
            value={formData[field.key] || ""}
            onChange={(e) => handleChange(field.key, e.target.value)}
            rows={field.rows}
            className={styles.textarea}
          />
        )}

        {field.type === "select" && (
          <select
            value={formData[field.key] || ""}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className={styles.select}
          >
            <option value="">Select...</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}
      </div>
    ))}
  </div>

  <div className={styles.aiSuggestion}>
    <Lightbulb size={20} />
    <span>
      Based on your website, I detected you're in the {formData.industry}{" "}
      industry
    </span>
  </div>

  <button onClick={handleSubmit} className={styles.primaryBtn}>
    Confirm & Continue
  </button>
</div>
```

---

#### 9️⃣ FILE_UPLOAD - העלאת קבצים

**תצורה**:

```json
{
  "id": "q011",
  "order": 11,
  "translationKey": "interview.uploadLogo",
  "questionType": "FILE_UPLOAD",
  "inputConfig": {
    "fieldName": "logo",
    "accept": "image/*",
    "maxSize": 5242880, // 5MB
    "multiple": false,
    "previewType": "image"
  },
  "validation": {
    "required": false,
    "maxSize": 5242880,
    "acceptedTypes": ["image/jpeg", "image/png", "image/svg+xml"]
  }
}
```

**UI Render**:

```jsx
<div className={styles.fileUpload}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      Upload your company logo (optional). This helps with branding.
    </div>
  </div>

  {!file ? (
    <div
      className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <Upload size={48} />
      <p>Drag & drop your logo here, or click to browse</p>
      <p className={styles.hint}>PNG, JPG or SVG • Max 5MB</p>
      <input
        ref={fileInputRef}
        type="file"
        accept={inputConfig.accept}
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />
    </div>
  ) : (
    <div className={styles.preview}>
      <img src={preview} alt="Logo preview" />
      <div className={styles.fileInfo}>
        <p className={styles.fileName}>{file.name}</p>
        <p className={styles.fileSize}>
          {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
      <button onClick={handleRemove} className={styles.removeBtn}>
        <X size={20} />
      </button>
    </div>
  )}

  {uploading && (
    <div className={styles.uploadProgress}>
      <div className={styles.progressBar}>
        <div
          className={styles.progress}
          style={{ width: `${uploadProgress}%` }}
        />
      </div>
      <span>{uploadProgress}%</span>
    </div>
  )}

  <div className={styles.actions}>
    <button onClick={handleSkip} className={styles.secondaryBtn}>
      Skip
    </button>
    <button
      onClick={handleSubmit}
      disabled={uploading}
      className={styles.primaryBtn}
    >
      {file ? "Continue" : "Skip for Now"}
    </button>
  </div>
</div>
```

---

#### 🔟 SLIDER - טווח מספרי

**תצורה**:

```json
{
  "id": "q012",
  "order": 12,
  "translationKey": "interview.monthlyBudget",
  "questionType": "SLIDER",
  "inputConfig": {
    "fieldName": "monthlyBudget",
    "min": 0,
    "max": 10000,
    "step": 100,
    "defaultValue": 1000,
    "unit": "$",
    "unitPosition": "prefix",
    "showMarkers": true,
    "markers": [0, 2500, 5000, 7500, 10000]
  },
  "saveToField": "monthlyBudget"
}
```

**UI Render**:

```jsx
<div className={styles.slider}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      What's your monthly SEO budget? This helps me recommend the right plan.
    </div>
  </div>

  <div className={styles.sliderContainer}>
    <div className={styles.valueDisplay}>
      {inputConfig.unit && inputConfig.unitPosition === "prefix" && (
        <span className={styles.unit}>{inputConfig.unit}</span>
      )}
      <span className={styles.value}>{value.toLocaleString()}</span>
      {inputConfig.unit && inputConfig.unitPosition === "suffix" && (
        <span className={styles.unit}>{inputConfig.unit}</span>
      )}
      <span className={styles.period}>/month</span>
    </div>

    <input
      type="range"
      min={inputConfig.min}
      max={inputConfig.max}
      step={inputConfig.step}
      value={value}
      onChange={(e) => setValue(Number(e.target.value))}
      className={styles.rangeInput}
    />

    {inputConfig.showMarkers && (
      <div className={styles.markers}>
        {inputConfig.markers.map((marker) => (
          <div key={marker} className={styles.marker}>
            <span>
              {inputConfig.unit}
              {marker.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>

  <div className={styles.recommendations}>
    <h4>Recommended Plan:</h4>
    <div className={styles.planSuggestion}>
      {value < 2000 && (
        <>
          <Zap /> Basic Plan
        </>
      )}
      {value >= 2000 && value < 5000 && (
        <>
          <Star /> Pro Plan
        </>
      )}
      {value >= 5000 && (
        <>
          <Crown /> Enterprise Plan
        </>
      )}
    </div>
  </div>

  <button onClick={handleSubmit} className={styles.primaryBtn}>
    Continue
  </button>
</div>
```

---

#### 1️⃣1️⃣ AI_SUGGESTION - הצעת AI

**תצורה**:

```json
{
  "id": "q013",
  "order": 13,
  "translationKey": "interview.suggestTitle",
  "questionType": "AI_SUGGESTION",
  "inputConfig": {
    "fieldName": "metaTitle",
    "acceptText": "Use This",
    "editText": "Customize",
    "regenerateText": "Generate Another"
  },
  "aiPromptHint": "Based on the website content and industry, suggest an SEO-optimized meta title (50-60 chars)",
  "saveToField": "metaTitle"
}
```

**UI Render**:

```jsx
<div className={styles.aiSuggestion}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      Based on your website, I suggest this SEO-optimized meta title:
    </div>
  </div>

  {loading ? (
    <div className={styles.generating}>
      <Loader className={styles.spinner} />
      <span>Generating suggestion...</span>
    </div>
  ) : (
    <>
      <div className={styles.suggestionBox}>
        <div className={styles.suggestionHeader}>
          <Sparkles size={20} />
          <span>AI Suggestion</span>
        </div>

        {editing ? (
          <textarea
            value={editedValue}
            onChange={(e) => setEditedValue(e.target.value)}
            className={styles.textarea}
            rows={3}
            autoFocus
          />
        ) : (
          <div className={styles.suggestionContent}>{suggestion}</div>
        )}

        <div className={styles.charCount}>
          {(editing ? editedValue : suggestion).length} characters
          {(editing ? editedValue : suggestion).length > 60 && (
            <span className={styles.warning}> (Recommended: 50-60)</span>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <button onClick={handleRegenerate} className={styles.secondaryBtn}>
          <RefreshCw size={16} />
          {inputConfig.regenerateText}
        </button>

        {!editing ? (
          <>
            <button
              onClick={() => setEditing(true)}
              className={styles.secondaryBtn}
            >
              <Edit size={16} />
              {inputConfig.editText}
            </button>
            <button onClick={handleAccept} className={styles.primaryBtn}>
              <Check size={16} />
              {inputConfig.acceptText}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setEditing(false);
                setEditedValue(suggestion);
              }}
              className={styles.secondaryBtn}
            >
              Cancel
            </button>
            <button onClick={handleSave} className={styles.primaryBtn}>
              Save
            </button>
          </>
        )}
      </div>
    </>
  )}
</div>
```

**Backend AI Call**:

```javascript
// In API route
const suggestion = await generateTextResponse({
  system: `You are an SEO expert. Generate meta titles that are:
    - 50-60 characters long
    - Include primary keyword
    - Compelling and click-worthy
    - Brand-focused`,
  prompt: `Website: ${responses.websiteUrl}
    Business: ${responses.businessName}
    Industry: ${responses.industry}
    Keywords: ${responses.selectedKeywords.join(", ")}
    
    Generate an SEO-optimized meta title.`,
  temperature: 0.8,
});
```

---

#### 1️⃣2️⃣ AUTO_ACTION - פעולה אוטומטית

**מטרה**: ביצוע פעולה רקע בלי קלט משתמש.

**תצורה**:

```json
{
  "id": "q004",
  "order": 4,
  "translationKey": "interview.analyzingWebsite",
  "questionType": "AUTO_ACTION",
  "autoActions": [
    {
      "action": "crawlWebsite",
      "parameters": { "url": "{{websiteUrl}}" }
    },
    {
      "action": "detectPlatform",
      "parameters": { "url": "{{websiteUrl}}" }
    },
    {
      "action": "extractKeywords",
      "parameters": { "url": "{{websiteUrl}}" }
    }
  ],
  "inputConfig": {
    "loadingMessages": [
      "Analyzing your website...",
      "Checking SEO status...",
      "Extracting keywords...",
      "Almost done..."
    ],
    "successMessage": "Analysis complete!",
    "autoAdvance": true,
    "advanceDelay": 2000
  }
}
```

**UI Render**:

```jsx
<div className={styles.autoAction}>
  <div className={styles.aiMessage}>
    <Avatar type="ai" />
    <div className={styles.bubble}>
      Great! Let me analyze your website quickly...
    </div>
  </div>

  <div className={styles.progressContainer}>
    <div className={styles.loadingAnimation}>
      <Loader className={styles.spinner} size={48} />
    </div>

    <div className={styles.actionsList}>
      {autoActions.map((action, index) => {
        const status = getActionStatus(index);
        return (
          <div key={index} className={styles.actionItem}>
            {status === "completed" && <CheckCircle size={20} color="green" />}
            {status === "running" && (
              <Loader size={20} className={styles.spinner} />
            )}
            {status === "pending" && <Circle size={20} color="#ccc" />}
            <span className={styles.actionName}>
              {getActionLabel(action.action)}
            </span>
            {status === "running" && (
              <span className={styles.actionStatus}>Running...</span>
            )}
          </div>
        );
      })}
    </div>

    <div className={styles.currentMessage}>
      {inputConfig.loadingMessages[currentMessageIndex]}
    </div>

    {allCompleted && (
      <div className={styles.success}>
        <CheckCircle size={32} color="green" />
        <p>{inputConfig.successMessage}</p>
      </div>
    )}
  </div>
</div>
```

**Backend Execution**:

```javascript
// API: POST /api/interview (handles auto-actions)
async function executeAutoActions(question, interview) {
  const results = {};

  for (const actionConfig of question.autoActions) {
    const { action, parameters } = actionConfig;

    // Replace template variables
    const resolvedParams = replaceTemplateVars(parameters, interview.responses);

    // Get handler
    const handler = getHandler(action);
    if (!handler) {
      throw new Error(`Handler not found: ${action}`);
    }

    // Execute
    const result = await handler(resolvedParams, {
      interviewId: interview.id,
      userId: interview.userId,
      interview,
    });

    results[action] = result;
  }

  // Save to externalData
  await prisma.userInterview.update({
    where: { id: interview.id },
    data: {
      externalData: {
        ...interview.externalData,
        ...results,
      },
    },
  });

  return results;
}
```

---

### Flow Engine - מנוע תנאים

**קוד מלא** (`lib/interview/flow-engine.js`):

```javascript
/**
 * Get next question to display
 */
export async function getNextQuestion(interviewId) {
  const interview = await prisma.userInterview.findUnique({
    where: { id: interviewId },
  });

  if (!interview || interview.status === "COMPLETED") {
    return null;
  }

  const questions = await prisma.interviewQuestion.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });

  const currentIndex = interview.currentStep || 0;

  // Find next valid question
  for (let i = currentIndex; i < questions.length; i++) {
    const question = questions[i];

    if (await shouldShowQuestion(question, interview.responses || {})) {
      return question;
    }
  }

  return null; // All questions completed
}

/**
 * Evaluate if question should be shown
 */
export async function shouldShowQuestion(question, responses) {
  // Check dependency
  if (question.dependsOn) {
    const dependentResponse = responses[question.dependsOn];
    if (!dependentResponse) return false;
  }

  // Check show condition
  if (question.showCondition) {
    try {
      const condition =
        typeof question.showCondition === "string"
          ? JSON.parse(question.showCondition)
          : question.showCondition;

      return evaluateCondition(condition, responses);
    } catch (e) {
      console.error("Error evaluating condition:", e);
      return true; // Default to showing
    }
  }

  return true;
}

/**
 * Evaluate complex conditions
 */
export function evaluateCondition(condition, responses) {
  if (!condition) return true;

  const { field, operator, value, conditions } = condition;
  const fieldValue = responses[field];

  switch (operator) {
    case "equals":
      return fieldValue === value;

    case "notEquals":
      return fieldValue !== value;

    case "contains":
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(value);
      }
      return String(fieldValue || "").includes(value);

    case "notContains":
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(value);
      }
      return !String(fieldValue || "").includes(value);

    case "exists":
      return (
        fieldValue !== null && fieldValue !== undefined && fieldValue !== ""
      );

    case "isEmpty":
      return (
        !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)
      );

    case "greaterThan":
      return Number(fieldValue) > Number(value);

    case "lessThan":
      return Number(fieldValue) < Number(value);

    case "greaterThanOrEqual":
      return Number(fieldValue) >= Number(value);

    case "lessThanOrEqual":
      return Number(fieldValue) <= Number(value);

    case "in":
      return Array.isArray(value) && value.includes(fieldValue);

    case "notIn":
      return !Array.isArray(value) || !value.includes(fieldValue);

    case "and":
      return (
        Array.isArray(conditions) &&
        conditions.every((c) => evaluateCondition(c, responses))
      );

    case "or":
      return (
        Array.isArray(conditions) &&
        conditions.some((c) => evaluateCondition(c, responses))
      );

    default:
      console.warn(`Unknown operator: ${operator}`);
      return true;
  }
}

/**
 * Validate response
 */
export function validateResponse(question, response) {
  if (!question.validation) return { valid: true };

  const validation = question.validation;
  const errors = [];

  // Required check
  if (validation.required) {
    if (!response || (Array.isArray(response) && response.length === 0)) {
      errors.push("This field is required");
    }
  }

  // Type-specific validation
  switch (question.questionType) {
    case "INPUT":
      if (validation.minLength && response.length < validation.minLength) {
        errors.push(`Minimum ${validation.minLength} characters required`);
      }
      if (validation.maxLength && response.length > validation.maxLength) {
        errors.push(`Maximum ${validation.maxLength} characters allowed`);
      }
      if (
        validation.pattern &&
        !new RegExp(validation.pattern).test(response)
      ) {
        errors.push("Invalid format");
      }
      break;

    case "MULTI_SELECTION":
      if (validation.minSelected && response.length < validation.minSelected) {
        errors.push(`Select at least ${validation.minSelected} options`);
      }
      if (validation.maxSelected && response.length > validation.maxSelected) {
        errors.push(`Select at most ${validation.maxSelected} options`);
      }
      break;

    case "FILE_UPLOAD":
      if (response && response.size > validation.maxSize) {
        errors.push(
          `File size must be less than ${validation.maxSize / 1024 / 1024}MB`,
        );
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate interview progress
 */
export async function getInterviewProgress(interviewId) {
  const interview = await prisma.userInterview.findUnique({
    where: { id: interviewId },
  });

  const totalQuestions = await prisma.interviewQuestion.count({
    where: { isActive: true },
  });

  const currentStep = interview.currentStep || 0;
  const percentage = Math.round((currentStep / totalQuestions) * 100);

  return {
    currentStep,
    totalSteps: totalQuestions,
    percentage,
    isComplete: interview.status === "COMPLETED",
  };
}

/**
 * Complete interview
 */
export async function completeInterview(interviewId, context) {
  const interview = await prisma.userInterview.findUnique({
    where: { id: interviewId },
  });

  // Mark as completed
  await prisma.userInterview.update({
    where: { id: interviewId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  // Generate summary
  const summary = await generateInterviewSummary(interview);

  return {
    success: true,
    summary,
  };
}
```

---

### API Endpoints - הראיון

#### GET /api/interview

קבלת מצב הראיון הנוכחי.

**Response**:

```json
{
  "interview": {
    "id": "65f6g7h8i9j0k1l2m3n4o5p6",
    "status": "IN_PROGRESS",
    "currentStep": 5,
    "totalSteps": 15,
    "percentage": 33,
    "responses": {
      "websiteUrl": "https://example.com",
      "platform": "wordpress",
      "businessName": "Acme Corp",
      "industry": "Technology",
      "seoGoals": ["traffic", "rankings"]
    },
    "externalData": {
      "crawledData": {
        "title": "Acme Corp - Tech Solutions",
        "description": "We provide...",
        "keywords": ["tech", "solutions"]
      }
    }
  },
  "nextQuestion": {
    "id": "q006",
    "questionType": "SELECTION",
    "translationKey": "interview.targetAudience",
    "inputConfig": {...}
  }
}
```

#### POST /api/interview

שליחת תשובה לשאלה.

**Request**:

```json
{
  "questionId": "q005",
  "response": ["traffic", "rankings"],
  "skipAutoAdvance": false
}
```

**Response**:

```json
{
  "success": true,
  "saved": true,
  "autoActionsExecuted": false,
  "nextQuestion": {
    "id": "q006",
    "questionType": "SELECTION",
    "translationKey": "interview.targetAudience"
  },
  "progress": {
    "currentStep": 6,
    "totalSteps": 15,
    "percentage": 40
  }
}
```

#### POST /api/interview/chat

שיחה חופשית עם ה-AI.

**Request**:

```json
{
  "message": "What keywords should I focus on?"
}
```

**Response** (Server-Sent Events):

```
data: {"type":"text","content":"Based on your "}
data: {"type":"text","content":"industry and goals, "}
data: {"type":"text","content":"I recommend focusing on:\n\n"}
data: {"type":"function_call","name":"generateKeywords","args":{...}}
data: {"type":"function_result","result":{"keywords":[...]}}
data: {"type":"text","content":"1. tech solutions\n2. ..."}
data: {"type":"done"}
```

---

## סיכום שלב הראיון

השלב הזה הוא הלב של תהליך ההרשמה:

- **12 סוגי שאלות** שונים לכיסוי כל מקרה שימוש
- **AI Bot** חכם שמלווה את המשתמש
- **Flow Engine** עם תנאים מורכבים
- **Bot Actions** לביצוע פעולות רקע
- **Progress Tracking** מדויק
- **Chat Mode** לשאלות חופשיות
- **Auto-save** של כל תשובה

---

## שלב 5: בחירת תוכנית (Plan Selection)

### UI/UX

**נתיב**: `/auth/register?step=plan`  
**קומפוננטה**: `app/auth/components/PlanSelectionStep.jsx`

**תצוגה**:

```jsx
<div className={styles.planSelection}>
  <h2>Choose Your Plan</h2>
  <p>Select the plan that best fits your needs</p>

  <div className={styles.billingToggle}>
    <button
      className={billingCycle === "MONTHLY" ? styles.active : ""}
      onClick={() => setBillingCycle("MONTHLY")}
    >
      Monthly
    </button>
    <button
      className={billingCycle === "YEARLY" ? styles.active : ""}
      onClick={() => setBillingCycle("YEARLY")}
    >
      Yearly <span className={styles.badge}>Save 17%</span>
    </button>
  </div>

  <div className={styles.plansGrid}>
    {plans.map((plan) => (
      <div
        key={plan.id}
        className={`${styles.planCard} ${plan.popular ? styles.popular : ""}`}
      >
        {plan.popular && (
          <div className={styles.popularBadge}>Most Popular</div>
        )}

        <h3>{plan.name}</h3>
        <div className={styles.price}>
          <span className={styles.currency}>$</span>
          <span className={styles.amount}>
            {billingCycle === "MONTHLY" ? plan.price : plan.yearlyPrice / 12}
          </span>
          <span className={styles.period}>/month</span>
        </div>

        {billingCycle === "YEARLY" && (
          <div className={styles.yearlyNote}>
            Billed ${plan.yearlyPrice}/year
          </div>
        )}

        <ul className={styles.features}>
          {plan.features.map((feature, idx) => (
            <li key={idx}>
              <CheckCircle size={16} />
              {feature.label}
            </li>
          ))}
        </ul>

        <div className={styles.limitations}>
          {plan.limitations.map((limit, idx) => (
            <div key={idx} className={styles.limitItem}>
              <span className={styles.limitLabel}>{limit.label}:</span>
              <span className={styles.limitValue}>
                {limit.value === null ? "Unlimited" : limit.value}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => handleSelectPlan(plan.id)}
          className={styles.selectBtn}
        >
          {plan.popular ? "Get Started" : "Select Plan"}
        </button>
      </div>
    ))}
  </div>
</div>
```

### Backend

**Endpoint**: `POST /api/auth/registration/select-plan`

**Request**:

```json
{
  "tempRegId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "planId": "plan_pro_monthly",
  "billingInterval": "MONTHLY"
}
```

---

## שלב 6: השלמה (Finalize)

זה השלב האחרון שבו המערכת יוצרת את כל הרשומות בבסיס הנתונים.

### Backend Process - Transaction מלא

**Endpoint**: `POST /api/auth/registration/finalize`

**קוד מלא**:

```javascript
export async function POST(request) {
  const { tempRegId } = await request.json();

  // 1. Get temp registration
  const tempReg = await prisma.tempRegistration.findUnique({
    where: { id: tempRegId },
    include: { otpCodes: true },
  });

  if (!tempReg || !tempReg.emailVerified) {
    return NextResponse.json(
      { error: "Invalid registration" },
      { status: 400 },
    );
  }

  // 2. Execute in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create User
    const user = await tx.user.create({
      data: {
        email: tempReg.email,
        firstName: tempReg.firstName,
        lastName: tempReg.lastName,
        phoneNumber: tempReg.phoneNumber,
        password: tempReg.password,
        emailVerified: tempReg.emailVerified,
        phoneVerified: tempReg.phoneVerified,
        consentGiven: tempReg.consentGiven,
        consentDate: tempReg.consentDate,
        registrationStep: "COMPLETED",
        isActive: true,
      },
    });

    // Create Account
    const account = await tx.account.create({
      data: {
        name: tempReg.accountName,
        slug: tempReg.accountSlug,
        billingEmail: tempReg.email,
        generalEmail: tempReg.email,
        timezone: "UTC",
        defaultLanguage: "EN",
        isActive: true,
        aiCreditsBalance: 0,
        aiCreditsUsedTotal: 0,
      },
    });

    // Create Owner Role
    const ownerRole = await tx.role.create({
      data: {
        accountId: account.id,
        key: "owner",
        name: "Owner",
        description: "Account owner with full access",
        permissions: [], // Owners bypass permission checks
        isSystemRole: true,
      },
    });

    // Create AccountMember
    await tx.accountMember.create({
      data: {
        accountId: account.id,
        userId: user.id,
        roleId: ownerRole.id,
        isOwner: true,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });

    // Create Subscription (if plan selected)
    let subscription = null;
    if (tempReg.selectedPlanId) {
      const plan = await tx.plan.findUnique({
        where: { id: tempReg.selectedPlanId },
      });

      if (plan) {
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1); // 30 days

        subscription = await tx.subscription.create({
          data: {
            accountId: account.id,
            planId: plan.id,
            status: "ACTIVE",
            billingInterval: "MONTHLY",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });

        // Add AI Credits from plan
        const aiCredits = getLimitFromPlan(plan.limitations, "aiCredits", 0);
        if (aiCredits > 0) {
          await tx.account.update({
            where: { id: account.id },
            data: { aiCreditsBalance: aiCredits },
          });

          await tx.aiCreditsLog.create({
            data: {
              accountId: account.id,
              type: "CREDIT",
              amount: aiCredits,
              balance: aiCredits,
              source: "plan_activation",
              sourceId: subscription.id,
              description: `Initial AI credits from ${plan.name} plan`,
            },
          });
        }
      }
    }

    // Create Site (if interview completed)
    let site = null;
    if (tempReg.interviewData) {
      const interviewData = tempReg.interviewData;
      site = await tx.site.create({
        data: {
          accountId: account.id,
          name: interviewData.businessName || tempReg.accountName,
          url: interviewData.websiteUrl || "",
          platform: interviewData.platform,
          isActive: true,
        },
      });

      // Create Interview record
      await tx.interview.create({
        data: {
          siteId: site.id,
          status: "COMPLETED",
          responses: interviewData.responses || [],
          completedAt: new Date(),
        },
      });
    }

    // Create Session
    const sessionToken = crypto.randomUUID();
    const sessionExpiry = new Date();
    sessionExpiry.setDate(sessionExpiry.getDate() + 30); // 30 days

    await tx.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: sessionExpiry,
      },
    });

    // Delete TempRegistration
    await tx.tempRegistration.delete({
      where: { id: tempRegId },
    });

    // Delete OTP codes
    await tx.otpCode.deleteMany({
      where: { tempRegId },
    });

    return {
      user,
      account,
      subscription,
      site,
      sessionToken,
    };
  });

  // 3. Set session cookie
  const response = NextResponse.json({
    success: true,
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
    },
    account: {
      id: result.account.id,
      name: result.account.name,
      slug: result.account.slug,
    },
    redirectTo: "/dashboard",
  });

  response.cookies.set("gp_session", result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });

  return response;
}
```

---

## סיכום כללי

תהליך הרישום ב-Ghost Post הוא מערכת מתוחכמת בת 6 שלבים:

1. **Register** - טופס רישום בסיסי
2. **Verify** - אימות OTP
3. **Account Setup** - יצירת חשבון חברה
4. **⭐ Interview** - ראיון מודרך AI (ה-CORE!)
5. **Plan Selection** - בחירת תוכנית מינוי
6. **Finalize** - יצירת כל הרשומות בDB

**הזמן הכולל**: 10-15 דקות  
**שאלות בראיון**: 10-20 (תלוי בתנאים)  
**AI Interactions**: רבות (chat mode + bot actions)  
**טכנולוגיות**: Next.js, Prisma, MongoDB, Gemini AI, nodemailer

המערכת מבטיחה אונבורדינג חלק וחכם שאוסף את כל המידע הדרוש להתחלת עבודה מוצלחת בפלטפורמה! 🚀
