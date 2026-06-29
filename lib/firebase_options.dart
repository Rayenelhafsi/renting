import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Default [FirebaseOptions] for use with your Firebase apps.
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      case TargetPlatform.windows:
        return windows;
      case TargetPlatform.linux:
        return linux;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyAzbUA836HTL9B9_frI_zsTXs-CnyGAklc',
    appId: '1:269507169080:web:2a8eda75d98bc938510fcd',
    messagingSenderId: '269507169080',
    projectId: 'tresor-home-renting',
    authDomain: 'tresor-home-renting.firebaseapp.com',
    storageBucket: 'tresor-home-renting.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyCHC9N6_rooZCXXllkNBX507eYqAcvK4sY',
    appId: '1:269507169080:android:3ea316633850ac9d510fcd',
    messagingSenderId: '269507169080',
    projectId: 'tresor-home-renting',
    storageBucket: 'tresor-home-renting.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyCwIQPvqYy99_S5AYs-d6SVzislBEYcDZw',
    appId: '1:269507169080:ios:7b596e5c2109c4f3510fcd',
    messagingSenderId: '269507169080',
    projectId: 'tresor-home-renting',
    storageBucket: 'tresor-home-renting.firebasestorage.app',
    iosBundleId: 'com.dwiraimmobilier',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'AIzaSyCwIQPvqYy99_S5AYs-d6SVzislBEYcDZw',
    appId: '1:269507169080:ios:7b596e5c2109c4f3510fcd',
    messagingSenderId: '269507169080',
    projectId: 'tresor-home-renting',
    storageBucket: 'tresor-home-renting.firebasestorage.app',
    iosBundleId: 'com.dwiraimmobilier',
  );

  static const FirebaseOptions windows = FirebaseOptions(
    apiKey: 'AIzaSyAzbUA836HTL9B9_frI_zsTXs-CnyGAklc',
    appId: '1:269507169080:web:8097a85dac53e73b510fcd',
    messagingSenderId: '269507169080',
    projectId: 'tresor-home-renting',
    authDomain: 'tresor-home-renting.firebaseapp.com',
    storageBucket: 'tresor-home-renting.firebasestorage.app',
  );

  static const FirebaseOptions linux = FirebaseOptions(
    apiKey: 'your-linux-api-key',
    appId: 'your-linux-app-id',
    messagingSenderId: 'your-linux-messaging-sender-id',
    projectId: 'your-project-id',
    storageBucket: 'your-storage-bucket',
  );
}

