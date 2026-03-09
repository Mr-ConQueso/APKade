# APKade 📱🎮

> APKade is a self-hosted platform for archiving, managing, and playing Android games directly in your web browser.

## 📖 About APKade

APKade is a self-hosted library manager and streaming platform tailored specifically for Android applications (APK files). It functions similarly to modern ROM managers (like Romm) or web emulators (like EmulatorJS). However, instead of relying on standard JavaScript emulation, APKade spins up **real Android environments in containers** and streams the audio and video output directly to you.

---

## ⚙️ How It Works

APKade operates as a seamless cloud Android runtime manager. When you click **Play** on a game, the system handles the heavy lifting on your server:

1. **Allocation:** The backend service instantly allocates an available Android container instance.
2. **Installation:** The selected APK is installed onto the instance (if it isn't already cached).
3. **Launch:** The game is executed inside the native Android environment.
4. **Streaming:** The live Android screen and audio are streamed directly to your web browser.
5. **Interaction:** Your input (touch, keyboard, or controller) is captured by the browser and sent back to the Android instance in real time.

---

## ✨ Key Features

* **APK Library Management:** Organize, browse, and manage your Android application files easily.
* **Web-Based Launcher:** Access your entire game collection from an intuitive browser interface.
* **Containerized Instances:** Run games safely and accurately in isolated Android container pools.
* **Seamless Streaming:** Experience smooth gameplay streamed directly to your client device.
* **Versatile Input Support:** Play using touch interfaces, keyboards, or standard game controllers.
* **Persistent Saves:** Maintain dedicated and persistent save data for every user.
* **Multi-User Sessions:** Support for multiple users maintaining separate profiles and playing simultaneously.

---

## 🎯 Primary Use Cases

* **Game Preservation:** Safely store and access delisted, old, or rare Android games.
* **Personal Game Library:** Build a beautifully organized, self-hosted collection of your favorite mobile titles.
* **Cloud Gaming:** Play resource-heavy Android games from any lower-end device via the web.
* **Research & Archiving:** Maintain highly playable, accurate copies of historical mobile software without keeping old hardware alive.

---

## 💡 Project Philosophy

APKade bridges the gap between classic ROM managers and modern cloud gaming platforms. It is built entirely on the principles of:
* **Self-Hosting** & Data Ownership
* **Open Infrastructure**
* **Game Preservation**
* **Browser-Based Accessibility**
