const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const Database = require("better-sqlite3");
const contacts = require("./contacts");

const router = express.Router();

/*
 * ==============================
 * SQLite
 * ==============================
 *
 * Creates messages.db automatically.
 */
const db = new Database("./messages.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        direction TEXT NOT NULL
            CHECK (direction IN ('sent', 'received')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const insertMessage = db.prepare(`
    INSERT INTO messages (
        contact_id,
        message,
        direction
    )
    VALUES (?, ?, ?)
`);

const getMessages = db.prepare(`
    SELECT
        message,
        direction,
        created_at
    FROM messages
    WHERE contact_id = ?
    ORDER BY id ASC
`);

/*
 * ==============================
 * WhatsApp
 * ==============================
 */

const CHROMIUM_PATH = "/snap/bin/chromium";

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: "./auth"
    }),

    puppeteer: {
        executablePath: CHROMIUM_PATH,
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ]
    }
});

/**
 * Start WhatsApp client
 */
function start() {
    console.log("Starting WhatsApp...");

    client.initialize().catch((error) => {
        console.error(
            "WhatsApp initialization failed:"
        );

        console.error(error);
    });
}

/**
 * Find configured contact by ID
 */
function getContact(contactId) {
    return contacts.find(
        (contact) =>
            contact.id === Number(contactId)
    );
}

/**
 * Find configured contact by phone number
 */
function findContactByPhone(phno) {
    const cleanPhone =
        String(phno).replace(/\D/g, "");

    return contacts.find(
        (contact) =>
            String(contact.phno)
                .replace(/\D/g, "") === cleanPhone
    );
}

/**
 * Send WhatsApp message.
 *
 * IMPORTANT:
 *
 * We DO NOT save the message here.
 *
 * The "message_create" event below handles all
 * outgoing messages, including:
 *
 * 1. Messages sent by the Node.js API
 * 2. Messages sent from the official WhatsApp Android app
 */
async function sendMessage(contactId, text) {
    const contact = getContact(contactId);

    if (!contact) {
        throw new Error(
            `Contact not found: ${contactId}`
        );
    }

    const phone =
        String(contact.phno).replace(/\D/g, "");

    const chatId = `${phone}@c.us`;

    return await client.sendMessage(
        chatId,
        text
    );
}

/**
 * Normalize incoming WhatsApp messages.
 */
function normalizeIncomingMessage(message) {
    // Sticker
    if (message.type === "sticker") {
        return "sent a sticker";
    }

    // Image
    if (message.type === "image") {
        return "sent an image";
    }

    // Video
    if (message.type === "video") {
        return "sent a video";
    }

    // Audio / voice
    if (
        message.type === "audio" ||
        message.type === "ptt"
    ) {
        return "sent an audio";
    }

    // Document
    if (message.type === "document") {
        return "sent a document";
    }

    // Contact
    if (
        message.type === "vcard" ||
        message.type === "multi_vcard"
    ) {
        return "sent a contact";
    }

    // Location
    if (
        message.type === "location" ||
        message.type === "live_location"
    ) {
        return "sent a location";
    }

    // Other unsupported message types
    if (message.type !== "chat") {
        return "sent a message";
    }

    const text = String(message.body || "");

    /*
     * Remove emoji and other Unicode symbols.
     */
    const cleanText = text
        .replace(
            /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Modifier}]/gu,
            ""
        )
        .replace(/\s+/g, " ")
        .trim();

    /*
     * Emoji-only message
     */
    if (!cleanText) {
        return "sent a emoji";
    }

    return cleanText;
}

/**
 * Find configured contact from an incoming WhatsApp message.
 *
 * Normal WhatsApp ID:
 * 919876543210@c.us
 *
 * LID:
 * 275874356178954@lid
 */
async function findContactFromMessage(message) {
    try {
        const senderId = message.from || "";

        console.log(
            "Incoming WhatsApp ID:",
            senderId
        );

        /*
         * Normal WhatsApp account
         */
        if (senderId.endsWith("@c.us")) {
            const phno =
                senderId.replace("@c.us", "");

            return findContactByPhone(phno);
        }

        /*
         * LID account
         */
        if (senderId.endsWith("@lid")) {
            console.log(
                "LID received. Attempting contact lookup..."
            );

            try {
                const waContact =
                    await message.getContact();

                if (waContact) {
                    /*
                     * Some whatsapp-web.js versions
                     * expose the number as id.user.
                     */
                    const user =
                        waContact.id &&
                        waContact.id.user
                            ? waContact.id.user
                            : null;

                    if (user) {
                        console.log(
                            "Resolved contact number:",
                            user
                        );

                        return findContactByPhone(
                            user
                        );
                    }

                    /*
                     * Some versions expose number.
                     */
                    if (waContact.number) {
                        console.log(
                            "Resolved contact number:",
                            waContact.number
                        );

                        return findContactByPhone(
                            waContact.number
                        );
                    }
                }
            } catch (error) {
                console.log(
                    "Could not resolve LID:",
                    error.message
                );
            }

            console.log(
                "Unable to map LID to configured phone number."
            );

            return null;
        }

        return null;

    } catch (error) {
        console.log(
            "Contact lookup error:",
            error.message
        );

        return null;
    }
}

/*
 * ==============================
 * Express API
 * ==============================
 */

/**
 * GET /contacts
 */
router.get("/contacts", (req, res) => {
    try {
        if (
            !Array.isArray(contacts) ||
            contacts.length === 0
        ) {
            return res
                .type("text/plain")
                .send("No contacts found.");
        }

        const response = contacts
            .map((contact) =>
                `${contact.name}-${contact.id}`
            )
            .join(",");

        return res
            .type("text/plain")
            .send(response);

    } catch (error) {
        console.error(
            "Contacts error:",
            error.message
        );

        return res
            .type("text/plain")
            .send("Failed to load contacts.");
    }
});


router.get(
    "/send/:contactId",
    async (req, res) => {
        try {
            const contactId =
                req.params.contactId;

            const message =
                req.query.message;

            /*
             * Validate contact.
             */
            const contact =
                getContact(contactId);

            if (!contact) {
                return res
                    .type("text/plain")
                    .send(
                        `Invalid contact ID: ${contactId}`
                    );
            }

            /*
             * Validate message.
             */
            if (
                message === undefined ||
                message === null ||
                String(message).trim() === ""
            ) {
                return res
                    .type("text/plain")
                    .send(
                        "Message is required."
                    );
            }

            /*
             * Check WhatsApp connection.
             */
            if (!client.info) {
                return res
                    .type("text/plain")
                    .send(
                        "WhatsApp is not ready."
                    );
            }

            const text =
                String(message);

            console.log(
                "API sending:",
                contact.name,
                text
            );

            /*
             * Send the WhatsApp message.
             *
             * If this fails, the SQLite insert
             * below will NOT happen.
             */
            await sendMessage(
                contact.id,
                text
            );

            /*
             * WhatsApp send succeeded.
             *
             * Save directly using the known
             * contact ID.
             */
            insertMessage.run(
                contact.id,
                text,
                "sent"
            );

            console.log(
                "Saved sent message:",
                contact.name,
                text
            );

            return res
                .type("text/plain")
                .send(
                    `OK.`
                );

        } catch (error) {
            console.error(
                "Send message error:",
                error.message
            );

            return res
                .type("text/plain")
                .send(
                    `Failed to send message: ${error.message}`
                );
        }
    }
);



/**
 * GET /messages?contact_id=<contactId>
 */
router.get("/messages", (req, res) => {
    try {
        const contactId =
            req.query.contact_id;

        /*
         * Missing contact ID.
         */
        if (
            contactId === undefined ||
            contactId === null ||
            String(contactId).trim() === ""
        ) {
            return res
                .type("text/plain")
                .send(
                    "contact_id is required."
                );
        }

        /*
         * Validate contact.
         */
        const contact =
            getContact(contactId);

        if (!contact) {
            return res
                .type("text/plain")
                .send(
                    `Invalid contact ID: ${contactId}`
                );
        }

        /*
         * Get both sent and received messages.
         */
        const rows =
            getMessages.all(contact.id);

        if (rows.length === 0) {
            return res
                .type("text/plain")
                .send("No messages.");
        }

        /*
         * Format for Android TextView.
         */
        const response = rows
            .map((row) => {
                const sender =
                    row.direction === "sent"
                        ? "You"
                        : contact.name;

                return `${sender}: ${row.message}`;
            })
            .join("\n");

        return res
            .type("text/plain")
            .send(response);

    } catch (error) {
        console.error(
            "Messages error:",
            error.message
        );

        return res
            .type("text/plain")
            .send(
                "Failed to load messages."
            );
    }
});

/*
 * ==============================
 * WhatsApp Events
 * ==============================
 */

/**
 * QR code
 */
client.on("qr", (qr) => {
    console.log("");
    console.log("==============================");
    console.log("Scan WhatsApp QR code:");
    console.log("==============================");
    console.log("");

    qrcode.generate(qr, {
        small: true
    });

    console.log("");
});

/**
 * Authentication
 */
client.on("authenticated", () => {
    console.log("");
    console.log(
        "WhatsApp authenticated."
    );
});

/**
 * Ready
 */
client.on("ready", () => {
    console.log("");
    console.log("==============================");
    console.log("WhatsApp connected!");
    console.log("==============================");
    console.log("");
});

/**
 * Authentication failure
 */
client.on("auth_failure", (message) => {
    console.log("");
    console.log(
        "Authentication failed:"
    );

    console.log(message);
});

/**
 * Disconnected
 */
client.on("disconnected", (reason) => {
    console.log("");

    console.log(
        "WhatsApp disconnected:",
        reason
    );
});

/**
 * =========================================
 * OUTGOING MESSAGE
 * =========================================
 *
 * This is the important addition.
 *
 * message_create is used to capture messages
 * created by YOUR WhatsApp account.
 *
 * That includes messages sent:
 *
 * 1. From your Android WhatsApp application
 * 2. From the Node.js API
 *
 * message.fromMe === true
 */
client.on(
    "message_create",
    async (message) => {
        try {
            /*
             * Only process messages sent
             * by our own WhatsApp account.
             */
            if (!message.fromMe) {
                return;
            }

            console.log("");
            console.log(
                "======= OUTGOING MESSAGE ======="
            );

            console.log(
                "To:",
                message.to
            );

            console.log(
                "Type:",
                message.type
            );

            console.log(
                "Original:",
                JSON.stringify(message.body)
            );

            /*
             * Ignore group messages.
             *
             * This application is configured
             * around contacts in contacts.js.
             */
            if (
                !message.to ||
                !message.to.endsWith("@c.us")
            ) {
                console.log(
                    "Outgoing message is not a direct contact."
                );

                return;
            }

            /*
             * Extract phone number.
             *
             * Example:
             *
             * 919876543210@c.us
             *
             * becomes:
             *
             * 919876543210
             */
            const phone =
                message.to.replace(
                    "@c.us",
                    ""
                );

            /*
             * Find configured contact.
             */
            const contact =
                findContactByPhone(phone);

            if (!contact) {
                console.log(
                    "Outgoing contact not configured:",
                    phone
                );

                return;
            }

            /*
             * Normalize message.
             */
            const savedMessage =
                normalizeIncomingMessage(
                    message
                );

            /*
             * Save as SENT.
             *
             * This works whether the message
             * originated from Android or Node.js.
             */
            insertMessage.run(
                contact.id,
                savedMessage,
                "sent"
            );

            console.log(
                "Saved outgoing message:",
                contact.name,
                savedMessage
            );

            console.log(
                "================================"
            );

        } catch (error) {
            console.error(
                "Outgoing message error:",
                error.message
            );
        }
    }
);

/**
 * =========================================
 * INCOMING MESSAGE
 * =========================================
 *
 * This handles messages sent BY contacts
 * TO your WhatsApp account.
 */
client.on(
    "message",
    async (message) => {
        console.log("");
        console.log(
            "========== INCOMING =========="
        );

        try {
            console.log(
                "From:",
                message.from
            );

            console.log(
                "Type:",
                message.type
            );

            console.log(
                "Original:",
                JSON.stringify(message.body)
            );

            /*
             * Find configured contact.
             */
            const contact =
                await findContactFromMessage(
                    message
                );

            if (!contact) {
                console.log(
                    "Contact not configured:",
                    message.from
                );

                return;
            }

            /*
             * Normalize message.
             */
            const savedMessage =
                normalizeIncomingMessage(
                    message
                );

            console.log(
                "Saving:",
                JSON.stringify(savedMessage)
            );

            /*
             * Save incoming message.
             */
            insertMessage.run(
                contact.id,
                savedMessage,
                "received"
            );

            console.log(
                "Received message saved for:",
                contact.name
            );

        } catch (error) {
            console.log(
                "Incoming message error:",
                error.message
            );
        }

        console.log(
            "=============================="
        );
    }
);

/**
 * WhatsApp state changes
 */
client.on(
    "change_state",
    (state) => {
        console.log(
            "WhatsApp state:",
            state
        );
    }
);

/*
 * ==============================
 * Express Application
 * ==============================
 */

const app = express();

/*
 * ONLY these routes are exposed:
 *
 * GET /contacts
 * GET /send/:contactId
 * GET /messages
 */
app.use("/", router);

const PORT =
    process.env.PORT || 5689;

app.listen(PORT, () => {
    console.log(
        `Express API running on port ${PORT}`
    );
});

/*
 * Start WhatsApp.
 */
start();

/*
 * Export.
 */
module.exports = {
    app,
    router,
    client,
    start,
    sendMessage,
    getContact,
    findContactByPhone
};
