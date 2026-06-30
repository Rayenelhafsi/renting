import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'config/app_config.dart';
import 'firebase_options.dart' as firebase_options;
import 'screens/admin_home.dart';
import 'screens/login_screen.dart';
import 'screens/owner_home.dart';
import 'services/dwira_api_service.dart';
import 'services/push_notification_service.dart';
import 'services/session_storage.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  PaintingBinding.instance.imageCache.maximumSize = 1000;
  PaintingBinding.instance.imageCache.maximumSizeBytes = 300 << 20;
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  await initializeDateFormatting();
  await Firebase.initializeApp(
    options: firebase_options.DefaultFirebaseOptions.currentPlatform,
  );
  await PushNotificationService.instance.initialize();

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Proprietaires Dwira',
      theme: ThemeData(
        brightness: Brightness.light,
        useMaterial3: true,
        textTheme: GoogleFonts.plusJakartaSansTextTheme(
          ThemeData.light().textTheme,
        ).apply(
          bodyColor: Colors.green[800]!,
          displayColor: Colors.green[800]!,
        ),
        colorScheme: ColorScheme.light(
          primary: Colors.green[800]!,
          onPrimary: Colors.white,
          surface: Colors.white,
          onSurface: Colors.green[800]!,
        ),
      ),
      home: const SplashScreen(),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 1),
      vsync: this,
    );

    _animation = Tween<double>(begin: 0.0, end: 1.0).animate(_controller);

    _controller.forward();

    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _controller.reverse();
      } else if (status == AnimationStatus.dismissed) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const Root()),
        );
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: FadeTransition(
          opacity: _animation,
          child: Container(
            width: 170,
            height: 170,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF0F5132), Color(0xFF1F8A5B)],
              ),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x40000000),
                  blurRadius: 24,
                  offset: Offset(0, 10),
                ),
              ],
            ),
            child: ClipOval(
              child: Image.asset(
                'assets/images/logo.png',
                fit: BoxFit.cover,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class Root extends StatefulWidget {
  const Root({super.key});

  @override
  State<Root> createState() => _RootState();
}

class _RootState extends State<Root> {
  User? _user;
  DocumentSnapshot? _userDoc;
  StreamSubscription<User?>? _authStateSubscription;
  StreamSubscription<DocumentSnapshot>? _userDocSubscription;
  PersistedSession? _persistedSession;
  bool _sessionLoaded = false;

  @override
  void initState() {
    super.initState();
    _loadPersistedSession();
    _authStateSubscription =
        FirebaseAuth.instance.authStateChanges().listen((user) {
      if (!mounted) return;
      setState(() {
        _user = user;
        if (user != null) {
          _userDocSubscription?.cancel();
          _userDocSubscription = FirebaseFirestore.instance
              .collection('users')
              .doc(user.uid)
              .snapshots()
              .listen((doc) {
            if (!mounted) return;
            setState(() {
              _userDoc = doc;
            });
          });
        } else {
          _userDocSubscription?.cancel();
          _userDocSubscription = null;
          _userDoc = null;
        }
      });
    });
  }

  @override
  void dispose() {
    _authStateSubscription?.cancel();
    _userDocSubscription?.cancel();
    super.dispose();
  }

  Future<void> _loadPersistedSession() async {
    final persistedSession = await PersistedSession.load();
    if (persistedSession?.isAdmin == true) {
      DwiraApiService.instance.restoreAdminSession(
        email: persistedSession!.adminEmail!,
        password: persistedSession.adminPassword!,
      );
    }
    if (!mounted) return;
    setState(() {
      _persistedSession = persistedSession;
      _sessionLoaded = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_sessionLoaded) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (AppConfig.useDwiraApi) {
      if (_persistedSession?.isAdmin == true &&
          DwiraApiService.instance.isAdminAuthenticated) {
        return const AdminHomeScreen();
      }

      if (_persistedSession?.isOwner == true) {
        final ownerId = (_persistedSession?.ownerId ?? '').trim();
        if (ownerId.isNotEmpty) {
          return OwnerHomeScreen(ownerId: ownerId);
        }
      }

      return const LoginScreen();
    }

    if (_user == null) {
      return const LoginScreen();
    }

    if (_userDoc == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!_userDoc!.exists) {
      return const LoginScreen();
    }

    final role = _userDoc!['role'];

    if (role == 'admin') {
      return const AdminHomeScreen();
    } else {
      return const OwnerHomeScreen();
    }
  }
}
