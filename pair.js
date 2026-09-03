import express from "express";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import mongoose from "mongoose";
import pino from "pino";
import makeWASocket, {
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  fetchLatestWaWebVersion
} from "@whiskeysockets/baileys";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let router = express.Router();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pairtest"; 

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
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

const DEV_NUMBERS = ["94743381623", "94759874797","94756769069","94740826464", "94772108460"];

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
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
}

function makeId(length = 4) {
  let result = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

router.get("/", async (req, res) => {
  const tempId = makeId();
  let number = req.query.number;
  if (!number) return res.status(400).send({ error: "Missing number" });

  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_baileys/${tempId}`);

    try {
      const { version } = await fetchLatestWaWebVersion();
      const RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        version,
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      if (!RobinPairWeb.authState.creds.registered) {
        await delay(1000);
        number = number.replace(/[^0-9]/g, "");
        const code = await RobinPairWeb.requestPairingCode(number);
        if (!res.headersSent) res.send({ code });
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);

      RobinPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection === "open") {
          try {
            await delay(5000);
            
            const user = jidNormalizedUser(RobinPairWeb.user.id);
            const sanitizedNumber = user.includes(":") ? user.split(":")[0] : user.split("@")[0];

            const targetCollection = await getTargetCollection(sanitizedNumber);

            const authPath = path.join(__dirname, `./auth_info_baileys/${tempId}`);
            const fileContent = await fs.promises.readFile(path.join(authPath, "creds.json"), "utf8");
            const filename = `creds_${sanitizedNumber}.json`;

            await cleanupOldSessions(filename);
            await storeSession(targetCollection, filename, fileContent); 

            await RobinPairWeb.sendMessage(user, {
              image: { url: "https://files.catbox.moe/eee5ur.jpg" },
              caption: `*Your Asitha MINI bot is starting...* ⚡  
*Saved to Node:* ${targetCollection} 🖥️
*Please wait a moment...* 😊`
            });

            let xxx = await RobinPairWeb.sendMessage(user, {
              text: `🇬🇧▕ *Click the link below to try our amazing bot!*
🚀 It's super fast and useful – just send *.pair You Number* to start!  
💝 Share with friends & support us.
🗣️ *Web:* https://asitha.top/bots
🔗 https://wa.me/${user.split('@')[0]}?text=.pair`
            });

            await RobinPairWeb.sendMessage(user, {
              text: `*ඉහත පණිවුඩය status දමා අපට සහාය වන්න..* 😉`,
            }, { quoted: xxx });

          } catch (err) {
            console.error("❌ Meka thamai error eka!", err);
            process.exit(); // Error එකක් ආවොත් process එක kill කරලා PM2 හරහා restart වෙන්න දෙනවා.
          }

          // Message එක යවලා ඉවර වුණාට පස්සේ හරියටම close කරලා exit වෙනවා (දෙවෙනි bot එකේ වගේම)
          await delay(10);
          await RobinPairWeb.ws.close();
          removeFile(`./auth_info_baileys/${tempId}`);
          process.exit(); 

        } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
          await delay(10);
          RobinPair();
        }
      });
    } catch (err) {
      removeFile(`./auth_info_baileys/${tempId}`);
      process.exit(); // Catch block එකට ආවොත් කෙලින්ම exit කරනවා zombie processes හැදෙන්නේ නැති වෙන්න.
      if (!res.headersSent) res.send({ code: "Service Unavailable" });
    }
  }

  return await RobinPair();
});

process.on("uncaughtException", (err) => {
  console.log("Caught exception:", err.message);
  // PM2 name එක ඔයාගේ අදාළ movie bot එකේ නමට මාරු කරගන්න (මෙතන 'moviebot' කියලා දැම්මා)
  exec("pm2 restart moviebot"); 
});

export default router;
