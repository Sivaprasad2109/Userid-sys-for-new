require('dotenv').config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

const serviceAccount = require("./firebaseConfig.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const users = {}; // Temporary OTP storage

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateUserID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ✅ Fetch Coin History
app.get("/coin-history", async (req, res) => {
  const { email } = req.query;

  try {
    const snapshot = await db.collection("coinHistory").where("email", "==", email).get();

    if (snapshot.empty) return res.json({ history: [] });

    const history = snapshot.docs.map(doc => doc.data());
    res.json({ history });
  } catch (error) {
    console.error("❌ Error fetching coin history:", error);
    res.status(500).json({ message: "Error fetching coin history" });
  }
});

// ✅ Send OTP
app.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  const otp = generateOTP();
  users[email] = { otp };

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: "OTP Verification",
    text: `Your OTP is: ${otp}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("❌ Failed to send OTP email:", error);
      return res.status(500).json({ message: "Failed to send OTP. Check email credentials." });
    } else {
      console.log(`✅ OTP email sent to ${email}:`, info.response);
      return res.status(200).json({ message: "OTP sent successfully" });
    }
  });
});

// ✅ Verify OTP + Generate userID + Log coin history (new user only)
app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (users[email]?.otp === otp) {
    try {
      const userRef = db.collection("users").doc(email);
      const doc = await userRef.get();

      if (doc.exists) {
        const data = doc.data();
        return res.json({
          message: "Email already verified",
          userID: data.userID,
          coins: data.coins
        });
      }

      // New user
      const userID = generateUserID();
      await userRef.set({
        email,
        userID,
        coins: 50,
        createdAt: new Date().toISOString()
      });

      // ✅ Log Coin History
      await db.collection("coinHistory").add({
        email,
        type: "Signup Bonus",
        coins: 50,
        date: new Date().toISOString()
      });

      return res.json({
        message: "Email verified",
        userID,
        coins: 50
      });

    } catch (error) {
      console.error("❌ Firebase error:", error);
      return res.status(500).json({ message: "Error verifying email" });
    }
  } else {
    return res.status(400).json({ message: "Invalid OTP" });
  }
});

// ✅ Get user data
app.get("/get-user-data", async (req, res) => {
  const { email } = req.query;

  try {
    const snapshot = await db.collection("users").where("email", "==", email).get();

    if (snapshot.empty) {
      return res.status(404).json({ message: "User not found" });
    }

    const userData = snapshot.docs[0].data();
    res.json({
      email: userData.email,
      userID: userData.userID,
      coins: userData.coins
    });
  } catch (err) {
    res.status(500).json({ message: "Server error fetching user" });
  }
});

// ✅ Start server
app.listen(3000, () => {
  console.log("✅ Server running at http://localhost:3000");
});
