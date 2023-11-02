const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const dotenv = require("dotenv");

// load dotenv
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const PORT = process.env.PORT || 3000;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "secret_key";
const NODEBB_API_ROOT = process.env.NODEBB_API_ROOT || "http://localhost:8000";
const NODEBB_GITHUB_EVENT_TOPIC = process.env.NODEBB_GITHUB_EVENT_TOPIC || "-1";
const NODEBB_API_SECRET = process.env.NODEBB_SECRET || "secret_key";

// express server
const app = express();
app.use(express.json());

function getToday() {
  var date = new Date();
  var year = date.getFullYear();
  var month = ("0" + (1 + date.getMonth())).slice(-2);
  var day = ("0" + date.getDate()).slice(-2);
  return year + "-" + month + "-" + day;
}

function verifyGitHubWebhookSignature(req) {
  // https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
  const signature = crypto
    .createHmac("sha256", GITHUB_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");
  let trusted = Buffer.from(`sha256=${signature}`, "ascii");
  let untrusted = Buffer.from(req.headers["x-hub-signature-256"], "ascii");
  return crypto.timingSafeEqual(trusted, untrusted);
}

async function sendPayloadToNodebbAPI(payload) {
  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${NODEBB_API_SECRET}`,
  };

  const sender = payload.sender || {};
  const content = `
    담당: ${sender.login}
    시간: ${new Date().toISOString()}
  `;

  const data = {
    cid: NODEBB_GITHUB_EVENT_TOPIC,
    title: `${getToday()} 개발 일지 - ${sender.login}`,
    content: content + "\n\n```\n" + JSON.stringify(payload, null, 4) + "\n```",
  };

  const url = `${NODEBB_API_ROOT}/api/v3/topics`;
  const res = await axios.post(url, data, { headers });
  return res;
}

app.post("/webhook/github", async (req, res) => {
  const body = JSON.stringify(req.body);

  // Verify GitHub webhook token
  try {
    if (!verifyGitHubWebhookSignature(req)) {
      return res.status(403).json("Invalid signature");
    }
  } catch (e) {
    return res.status(500).json("Invalid signature");
  }

  // to nodebb
  try {
    nodebb_res = await sendPayloadToNodebbAPI(req.body);

    // return to github
    if (nodebb_res.status >= 200 && nodebb_res.status < 300) {
      res.status(200).json({});
    } else {
      console.log(nodebb_res);
      res.status(500).json("nodebb error");
    }
  } catch (e) {
    console.error(e);
    res.status(500).json(e.toString());
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({});
});

app.use((req, res, next) => {
  res.status(404).json({});
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
