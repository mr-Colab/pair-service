import express from "express";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import mongoose from "mongoose";
import pino from "pino";
import { toBuffer } from "qrcode";
import makeWASocket, {
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  fetchLatestWaWebVersion
} from "@whiskeysockets/baileys";
import { fileURLToPath } from "url";

// ES Modules wala __dirname saha __filename hadaganna widiha
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pairtest"; 

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected for QR'))
  .catch(err => console.error(err));

const SessionSchema = new mongoose.Schema({
    filename: { type: String, required: true, unique: true },
    filecontent: { type: String, required: true }
});

const getSessionModel = (collectionName) => {
    if (mongoose.models[collectionName]) {
        return mongoose.models[collectionName];
    }
    return mongoose.model(collectionName, SessionSchema, collectionName);
};

const DEV_NUMBERS = ["94743381623", "94759874797","94756769069","94740826464"];

const NORMAL_COLLECTIONS = [
    "sfolder1_sessions",
    "sfolder2_sessions",
    "sfolder3_sessions",
    "sfolder4_sessions",
    "sfolder5_sessions"
];

const DEV_COLLECTION = "sfolder7_sessions";

async function getTargetCollection(phoneNumber) {
  if (DEV_NUMBERS.includes(phoneNumber)) {
    return DEV_COLLECTION;
  }

  for (const collectionName of NORMAL_COLLECTIONS) {
    try {
      const Model = getSessionModel(collectionName);
      const count = await Model.countDocuments();
      if (count < 230) {
        return collectionName;
      }
    } catch (err) {
      console.error(err);
    }
  }
  return "sfolder6_sessions";
}

async function cleanupOldSessions(filename) {
    const allCollections = [...NORMAL_COLLECTIONS, DEV_COLLECTION];
    for (const collectionName of allCollections) {
        try {
            const Model = getSessionModel(collectionName);
            await Model.deleteOne({ filename: filename });
        } catch (err) {
            console.error(err);
        }
    }
}

async function getTotalBotCount() {
  const allCollections = [
    ...NORMAL_COLLECTIONS,
    DEV_COLLECTION,
    "sfolder6_sessions" // fallback ekath add karamu
  ];

  let total = 0;
  const breakdown = {};

  for (const collectionName of allCollections) {
    try {
      const Model = getSessionModel(collectionName);
      const count = await Model.countDocuments();
      breakdown[collectionName] = count;
      total += count;
    } catch (err) {
      console.error(`Error counting ${collectionName}:`, err.message);
      breakdown[collectionName] = 0;
    }
  }

  return {
    totalBots: total,
    perFolder: breakdown
  };
}

async function storeSession(collectionName, filename, fileContent) {
  try {
    const Model = getSessionModel(collectionName);
    const base64Content = Buffer.from(fileContent).toString("base64");
    
    await Model.findOneAndUpdate(
        { filename: filename },
        { filename: filename, filecontent: base64Content },
        { upsert: true, new: true }
    );
  } catch (err) {
      console.error(err);
  }
}

function removeFile(filePath) {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true });
}

function makeId(length = 4) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
}

router.get("/", async (req, res) => {
  const tempId = makeId();

  async function RobinQR() {
    const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_baileys/${tempId}`);
    try {
      //const version = [ 2, 3000, 1035194821 ]
      const { version } = await fetchLatestWaWebVersion()
      const RobinWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
        version
      });

      RobinWeb.ev.on("creds.update", saveCreds);

      RobinWeb.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
        if (qr && !res.headersSent) {
          const qrBuffer = await toBuffer(qr);
          res.setHeader("Content-Type", "image/png");
          res.end(qrBuffer);
          return;
        }

        if (connection === "open") {
          try {
            await delay(5000);

            const user = jidNormalizedUser(RobinWeb.user.id);
            const sanitizedNumber = user.includes(":") ? user.split(":")[0] : user.split("@")[0];
            
            const targetCollection = await getTargetCollection(sanitizedNumber);

            const authPath = path.join(__dirname, `./auth_info_baileys/${tempId}`);
            const fileContent = await fs.promises.readFile(path.join(authPath, "creds.json"), "utf8");
            const filename = `creds_${sanitizedNumber}.json`;

            await cleanupOldSessions(filename);
            
            await storeSession(targetCollection, filename, fileContent);

            await RobinWeb.sendMessage(user, {
              image: { url: "https://files.catbox.moe/eee5ur.jpg" },
              caption: `*Your Asitha MINI bot is starting...* ⚡  
*Saved to Node:* ${targetCollection} 🖥️
*Please wait some minutes* 😊\n*Share with friends & on status* 💖`
            });

            let xxx = await RobinWeb.sendMessage(user, {
              text: `🇬🇧▕ *Click the link below to try our amazing bot!* 🚀 Fast & useful – send *.pair YourNumber* to start!  
💝 Share & support  
🗣️ Web: https://asitha.top/bots
🔗 https://wa.me/${user.split('@')[0]}?text=.pair

🇱🇰▕ *අපේ විශේෂ Whatsapp Bot බලන්න!* 🚀 *.pair ඔයාගේ නම්බර් එක* කියලා message එකක්!  
💝 යාළුවන්ට support  
🗣️ වෙබ්: https://asitha.top/bots  
🔗 https://wa.me/${user.split('@')[0]}?text=.pair`
            });

            await RobinWeb.sendMessage(user, {
              text: `*ඉහත පණිවුඩය status දමා අපට සහාය වන්න..* 😉`,
            }, { quoted: xxx });
          
          } catch (err) {
            console.error(err.message);
          } finally {
            await delay(100);
            await RobinWeb.ws.close();
            removeFile(`./auth_info_baileys/${tempId}`);
            if (!res.headersSent) res.end(); 
          }
        } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
          await delay(10);
          RobinQR();
        }
      });

    } catch (err) {
      removeFile(`./auth_info_baileys/${tempId}`);
      if (!res.headersSent) res.send({ code: "Service Unavailable" });
    }
  }

  return await RobinQR();
});

router.get("/bot-count", async (req, res) => {
  try {
    const data = await getTotalBotCount();
    res.json({
      success: true,
      total: data.totalBots,
      folders: data.perFolder
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

process.on("uncaughtException", (err) => {
  console.log("Caught exception:", err.message);
});

export default router;
