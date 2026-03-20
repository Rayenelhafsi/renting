import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

// Écrans
import 'screens/login_screen.dart';
import 'screens/owner_home.dart';
import 'screens/admin_home.dart';

// Fichier de config Firebase (à générer avec `flutterfire configure`)
import 'firebase_options.dart' as firebase_options;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: firebase_options.DefaultFirebaseOptions.currentPlatform,
  );

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Proprietaires Dwira',
      theme: ThemeData.light().copyWith(
        useMaterial3: true,
        textTheme: ThemeData.light().textTheme.apply(
              bodyColor: Colors.green[800]!,
              displayColor: Colors.green[800]!,
              fontFamily: 'Cinzel',
            ),
        colorScheme: ColorScheme.light(
          primary: Colors.green[800]!,
          onPrimary: Colors.white,
          background: Colors.white,
          onBackground: Colors.green[800]!,
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
  bool _visible = true;

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
  late final Stream<User?> _authStateChanges;
  Stream<DocumentSnapshot>? _userDocStream;

  @override
  void initState() {
    super.initState();
    _authStateChanges = FirebaseAuth.instance.authStateChanges();
    _authStateChanges.listen((user) {
      setState(() {
        _user = user;
        if (user != null) {
          _userDocStream = FirebaseFirestore.instance
              .collection('users')
              .doc(user.uid)
              .snapshots();
          _userDocStream!.listen((doc) {
            setState(() {
              _userDoc = doc;
            });
          });
        } else {
          _userDocStream = null;
          _userDoc = null;
        }
      });
    });
  }

  @override
  Widget build(BuildContext context) {
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
