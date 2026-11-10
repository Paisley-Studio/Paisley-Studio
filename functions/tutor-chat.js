/* =========================================================
   Paisley Studio — tutor <-> student messages (trigger)
   -----------------------------------------------------------
   tutorChats/{studentId}_{tutorId}/messages/{mid} is written by the
   tutor portal (Messages) and the student portals (Messages), see
   js/classroom/tutor-chat.js and firestore.rules.

     onTutorChatMessageCreated   a new message rings the other side's
                                 bell (type tutor_message, category
                                 "messages"). The notification id comes
                                 from the message id, so a retried
                                 trigger never rings twice.
   No email: a chat can be busy, and the bell plus the Messages bubble
   are enough.
========================================================= */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { notifyOnce } = require("./work-shared");

const LOCATION = "us-central1";

function preview(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > 140 ? t.slice(0, 137) + "..." : (t || "Sent you a message");
}

exports.onTutorChatMessageCreated = onDocumentCreated(
  { document: "tutorChats/{chatId}/messages/{mid}", region: LOCATION },
  async (event) => {
    const m = (event.data && event.data.data()) || {};
    const { chatId, mid } = event.params;
    const chat = (await admin.firestore().collection("tutorChats").doc(chatId).get()).data() || {};
    if (!chat.studentId || !chat.tutorId) return;
    const topic = m.topic ? `${m.topic}: ` : "";
    if (m.senderRole === "student") {
      await notifyOnce(`tchat_${mid}`, chat.tutorId, "tutor", {
        type: "tutor_message",
        title: `Message from ${chat.studentName || m.senderName || "a student"}`,
        message: preview(m.text),
        relatedEntity: "tutorChats", relatedEntityId: chat.studentId
      });
    } else {
      // From the tutor (or the Studio Desk writing in the conversation).
      await notifyOnce(`tchat_${mid}`, chat.studentId, "student", {
        type: "tutor_message",
        title: `Message from ${m.senderRole === "admin" ? (m.senderName || "the Studio Desk") : (chat.tutorName || m.senderName || "your tutor")}`,
        message: topic + preview(m.text),
        relatedEntity: "tutorChats", relatedEntityId: chat.tutorId
      });
    }
  }
);
