importScripts('https://www.gstatic.com/firebasejs/10.11.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.11.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyCQw-WLDUe4S9zFjkZ5aOtjrF4bINOTDxo',
  authDomain: 'carechain-app-16724.firebaseapp.com',
  projectId: 'carechain-app-16724',
  storageBucket: 'carechain-app-16724.firebasestorage.app',
  messagingSenderId: '1060004660727',
  appId: '1:1060004660727:web:6731fa08353340893a9af2',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {}
  const notificationOptions = {
    body,
    icon: '/icon-192.png',
  }

  self.registration.showNotification(title || 'CareChain', notificationOptions)
})
