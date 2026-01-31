// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBejhn008gZA1JjVxmaWg3GvV2coPjhtSY",
  authDomain: "bs-news-f63ae.firebaseapp.com",
  projectId: "bs-news-f63ae",
  storageBucket: "bs-news-f63ae.firebasestorage.app",
  messagingSenderId: "825912158178",
  appId: "1:825912158178:web:0b8ed7051e2ab49c0bbbbb",
  measurementId: "G-5YRK40M6N4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);