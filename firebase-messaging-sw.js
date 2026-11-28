/* Paisley push notifications (Firebase Cloud Messaging).
   Registered by js/ui/push.js with its own scope (/firebase-cloud-messaging-push-scope),
   so it never replaces or touches the site shell worker (/sw.js).
   Notifications sent with a `webpush.notification` part are shown by the SDK when the
   page is closed or in the background; clicking opens `fcmOptions.link`. */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAWoYsa1mwAi6guBU8LuDi2fN5hTj5AXkw',
  authDomain: 'paisley-89c77.firebaseapp.com',
  projectId: 'paisley-89c77',
  storageBucket: 'paisley-89c77.firebasestorage.app',
  messagingSenderId: '868570828182',
  appId: '1:868570828182:web:30569aef997646d902a1b7'
});
firebase.messaging();

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
