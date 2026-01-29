require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  console.log('📧 Testing email configuration...\n');
  console.log('GMAIL_USER:', process.env.GMAIL_USER || '❌ NOT SET');
  console.log('GMAIL_PASS:', process.env.GMAIL_PASS ? '✅ SET' : '❌ NOT SET');
  console.log('');

  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    console.error('❌ Missing email credentials in .env');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Ghost Post" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: '✅ Test Email from Ghost Post',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #4CAF50;">Email is working! 🎉</h1>
          <p>Your nodemailer configuration is correct.</p>
          <p>Ghost Post can now send:</p>
          <ul>
            <li>User invitation emails</li>
            <li>OTP verification codes</li>
          </ul>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is a test email from Ghost Post platform.</p>
        </div>
      `,
    });

    console.log('✅ Email sent successfully!');
    console.log('📬 Message ID:', info.messageId);
    console.log('\nCheck your inbox at:', process.env.GMAIL_USER);
  } catch (err) {
    console.error('❌ Error sending email:', err.message);
    if (err.message.includes('Invalid login')) {
      console.log('\n💡 Tip: Make sure you:');
      console.log('   1. Have 2FA enabled on your Google account');
      console.log('   2. Created an App Password (not your regular password)');
      console.log('   3. Used the App Password in GMAIL_PASS');
    }
    process.exit(1);
  }
}

testEmail();
