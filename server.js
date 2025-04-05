const express = require("express");
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;
const serverID = "1357180868271149137";
const dataFile = "executionData.json";

app.use(express.json());

let executionsData = {};
if (fs.existsSync(dataFile)) {
  executionsData = JSON.parse(fs.readFileSync(dataFile));
}

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(executionsData, null, 2));
}

app.all("*", async (req, res) => {
  const hwid = req.headers["x-k9dl1ap"];
  const info = req.headers["x-b7mt4qz"];
  const id = req.headers["x-y8vr2ws"];

  if (!hwid || !info || !id) return res.status(400).send("Missing required headers");

  res.status(200).send("Request received, processing...");

  try {
    const infoData = Object.fromEntries(info.split(",").map(pair => pair.split("=")));
    let {
      A1xY: newOrigin,
      B2zW: user,
      C3kP: displayName,
      D4mN: createdTimestamp,
      G5nM: gameName,
      G6oN: gameID,
    } = infoData;

    const key = `${hwid}-${id}`;
    if (!executionsData[key]) {
      executionsData[key] = {
        executions: 0,
        origins: [],
        games: {},
        user,
        displayName,
        createdTimestamp,
      };
    }

    executionsData[key].executions += 1;
    if (newOrigin && !executionsData[key].origins.includes(newOrigin)) {
      executionsData[key].origins.push(newOrigin);
    }

    const gameKey = `${gameName}, ${gameID}`;
    executionsData[key].games[gameKey] = (executionsData[key].games[gameKey] || 0) + 1;

    processDiscordTasks(key, hwid, id, newOrigin, displayName, createdTimestamp, gameName, gameID);

    saveData();
  } catch (error) {
    console.error("Error processing request:", error);
  }
});

async function processDiscordTasks(key, hwid, id, newOrigin, displayName, createdTimestamp, gameName, gameID) {
  if (!client.isReady()) return;

  const guild = await client.guilds.fetch(serverID);
  if (!executionsData[key].categoryId) {
    const category = await guild.channels.create({
      name: hwid,
      type: ChannelType.GuildCategory,
    });
    executionsData[key].categoryId = category.id;
    saveData();
  }

  const category = await guild.channels.fetch(executionsData[key].categoryId);
  if (!executionsData[key].channelId) {
    const textChannel = await guild.channels.create({
      name: id,
      type: ChannelType.GuildText,
      parent: category.id,
    });
    executionsData[key].channelId = textChannel.id;
    saveData();
  }

  const textChannel = await guild.channels.fetch(executionsData[key].channelId);
  const messages = await textChannel.messages.fetch({ limit: 10 });

  const pinnedMessage = messages.find(msg => msg.pinned);
  const gameMessage = messages.find(msg => msg.content.startsWith("**Executed In:**"));

  const executionsText = `**Info:**
- **Origins:** \`${executionsData[key].origins.join("`, `")}\`
- **User:** \`${executionsData[key].user}\`
- **Display Name:** \`${displayName}\`
- **Created:** <t:${createdTimestamp}:R>
- **Executions:** \`${executionsData[key].executions}\``;

  const gameExecutionsText =
    "**Executed In:**\n" +
    Object.entries(executionsData[key].games)
      .map(([game, count]) => `\`${game}\`, \`x${count}\``)
      .join("\n");

  if (pinnedMessage) {
    await pinnedMessage.edit(executionsText);
  } else {
    const sentMessage = await textChannel.send(executionsText);
    await sentMessage.pin();
    executionsData[key].messageId = sentMessage.id;
  }

  if (gameMessage) {
    await gameMessage.edit(gameExecutionsText);
  } else {
    const sentGameMessage = await textChannel.send(gameExecutionsText);
    executionsData[key].gameMessageId = sentGameMessage.id;
  }

  saveData();
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", () => {
  console.log("Bot is ready.");
});

client.login(process.env.DISCORD_TOKEN);
